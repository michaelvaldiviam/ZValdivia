import { state } from './state.js';
import { NodeAnalyzer } from './node-analyzer.js';

/**
 * Reporte PDF: 1 página por nodo (un vértice representativo por nivel K visible),
 * incluyendo:
 * - Nombre del nodo + nivel K visible
 * - Tabla de aristas salientes con conectividad
 * - Ángulos azimutales y separaciones (en el plano perpendicular al vector directriz)
 * - (Opcional) diagrama de proyección para orientar el conector
 *
 * Requiere jsPDF cargado (window.jspdf).
 */
export class NodePDFReporter {
  static shortTargetLabel(e) {
    // En el PDF de conectores, el nombre es SOLO el nivel visible: k0, k1, ...
    if (e && Number.isFinite(e.toVisibleKIndex)) return `k${e.toVisibleKIndex}`;
    const id = (e && e.toDisplayId) ? String(e.toDisplayId) : String(e?.to ?? '');
    return id;
  }
  static mm(v, decimals = 3) {
    return (typeof v === 'number' ? v.toFixed(decimals) : String(v));
  }

  static async generateNodeReport() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const data = NodeAnalyzer.computeRepresentativeNodes();

    // Portada simple
    this.addCover(doc, data);

    for (let idx = 0; idx < data.nodes.length; idx++) {
      doc.addPage();
      this.addNodePage(doc, data, data.nodes[idx], idx + 1);
    }

    const filename = `Nodos_Conector_ZValdivia_N${state.N}_a${state.aDeg.toFixed(2)}.pdf`;
    doc.save(filename);
    console.log('✅ PDF de nodos generado');
  }

  static addCover(doc, data) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('ZValdivia — Reporte de Nodos (Conectores)', 105, 30, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);

    const z = data.params;
    const kVis = z.visibleLevels; // cantidad de niveles K visibles (incluye polo superior)
    const lines = [
      `N = ${z.N}`,
      `K visibles = ${kVis}`,
      `Dmax = ${this.mm(z.Dmax, 3)} m`,
      `Diámetro del piso = ${this.mm(z.floorDiameter || 0, 3)} m`,
      `Altura total visible = ${this.mm(z.visibleHeight, 3)} m`,
      `Ángulo a = ${this.mm(z.aDeg, 2)}°`,
      z.cutActive ? `Corte activo: suelo en K(original)=${z.cutLevel} (vista: z=0)` : 'Corte inactivo',
    ];

    let y = 55;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Datos del zonohedro', 20, y);
    y += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    lines.forEach(t => {
      doc.text(t, 24, y);
      y += 7;
    });

    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Creador', 20, y);
    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text('Michael Valdivia', 24, y); y += 7;
    doc.text('michaelvaldiviamunoz@gmail.com', 24, y); y += 7;
    doc.text('Chile', 24, y); y += 7;

    // Nota: Portada sin texto explicativo adicional (solo variables y autor).

    let _y = y; // preserve variable for consistency
    // (no extra lines rendering) 
    return; 

  }

  static addNodePage(doc, data, node, pageIndex) {
    const margin = 14;
    const W = 210, H = 297;
    const x0 = margin, y0 = margin;

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`Conector ${node.displayId || node.id}`, x0, y0);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const kLabel = `Nivel: k${node.visibleKIndex}`;
    const extra = data.params.cutActive ? ` (original K=${node.k})` : '';
    doc.text(`${kLabel}${extra}`, x0, y0 + 6);

    // Cantidad de conectores
    // - En niveles normales: por simetría hay N conectores por nivel.
    // - Polo superior (k=N): 1 conector.
    // - Polo inferior (k=0): 1 conector SOLO si NO hay corte activo (si hay corte, el “suelo” reemplaza ese extremo).
    let qty = data.params.N;
    if (node.k === data.params.N) qty = 1;
    else if (node.k === 0) qty = data.params.cutActive ? data.params.N : 1;

    doc.setFontSize(10);
    doc.text(`Cantidad conector: ${qty}`, x0, y0 + 14);

    // Reservamos espacio superior (sin imprimir directriz/normales)
    const normals = node.incidentFaceNormalsInward || [];
    let ny = y0 + 20;

    // Diagrama (proyección) — caja superior derecha
    const diagramX = 120, diagramY = y0 + 18;

    // Tamaño adaptativo (evita apretar demasiado cuando hay mucho texto)
    let diagramSize = 64;
    const edgeCount = (node.edges || []).length;
    if (edgeCount > 10 || normals.length > 4) diagramSize = 56;
    if (edgeCount > 14) diagramSize = 50;

    this.drawEdgeDiagram(doc, node, diagramX, diagramY, diagramSize);

    // Tabla de aristas — comienza debajo de lo que termine más abajo (normales o diagrama)
    const diagramBottom = diagramY + diagramSize;
    const tableTop = Math.max(ny + 8, diagramBottom + 6);
    this.drawEdgesTable(doc, node, x0, tableTop, W - 2 * margin);
  }

  static drawEdgeDiagram(doc, node, x, y, size) {
    const cx = x + size / 2;
    const cy = y + size / 2;
    const R = size * 0.40;

    doc.setDrawColor(40);
    doc.setLineWidth(0.3);

    // Sin marco (evita “recuadro” alrededor del conector)
    // Círculo guía
    doc.circle(cx, cy, R, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Proyección (exterior)', cx, y - 2, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    const edges = node.edges || [];
    const n = edges.length;

    // Prepara ángulos (azimuth) y ordena para una lectura consistente.
    const fallbackAngles = [];
    for (let i = 0; i < n; i++) fallbackAngles.push((360 * i) / Math.max(1, n));

    const items = edges.map((e, i) => {
      const ang = (typeof e.azimuthDeg === 'number') ? e.azimuthDeg : fallbackAngles[i];
      return { e, ang };
    }).sort((a, b) => a.ang - b.ang);

    // 1) Dibuja rayos + etiquetas de conectividad
    for (let i = 0; i < items.length; i++) {
      const { e, ang } = items[i];
      const rad = (ang * Math.PI) / 180;

      const x2 = cx + R * Math.cos(rad);
      const y2 = cy + R * Math.sin(rad);

      doc.line(cx, cy, x2, y2);

      const label = this.shortTargetLabel(e);
      const lx = cx + (R + 6) * Math.cos(rad);
      const ly = cy + (R + 6) * Math.sin(rad);

      doc.text(label, lx, ly, { align: 'center' });
    }

    // 2) Ángulos Δ entre aristas: dibujar el valor en el medio de cada par consecutivo
    // (en el mismo orden azimutal usado para separaciónToNextDeg)
    if (items.length >= 2) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);

      const rText = R * 0.62; // dentro del círculo para evitar chocar con etiquetas

      for (let i = 0; i < items.length; i++) {
        const cur = items[i];
        const nxt = items[(i + 1) % items.length];

        let a1 = cur.ang;
        let a2 = nxt.ang;
        if (i === items.length - 1) a2 += 360; // wrap

        const mid = (a1 + a2) / 2;
        const midRad = (mid * Math.PI) / 180;

        // Preferir el valor ya calculado (consistente con tabla)
        let sep = null;
        if (typeof cur.e.separationToNextDeg === 'number') sep = cur.e.separationToNextDeg;
        else sep = (a2 - a1);

        const text = `${sep.toFixed(1)}°`;

        const tx = cx + rText * Math.cos(midRad);
        const ty = cy + rText * Math.sin(midRad);

        // “halo” blanco para legibilidad sobre líneas
        doc.setFillColor(255);
        doc.circle(tx, ty, 2.7, 'F');
        doc.setTextColor(0);
        doc.text(text, tx, ty + 0.7, { align: 'center' });
      }
    }

    // Centro del nodo
    doc.setFillColor(0);
    doc.setTextColor(0);
    doc.circle(cx, cy, 1.2, 'F');
  }


  static drawEdgesTable(doc, node, x, y, width) {
    const col = {
      idx: x,
      to: x + 14,
      k: x + 44,
      az: x + 64,
      sep: x + 84,
      angd: x + 104,
    };

    const rowH = 5.5;
    const maxRows = 28; // compacto: entra en A4
    const edges = node.edges || [];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Aristas salientes (conectividad y ángulos)', x, y);

    y += 6;
    doc.setFontSize(8);

    // Header row
    doc.text('#', col.idx, y);
    doc.text('Conecta a', col.to, y);
    doc.text('Nivel dest', col.k, y);
    doc.text('Az[°]', col.az, y);
    doc.text('Δ[°]', col.sep, y);
    doc.text('Ang(d)[°]', col.angd, y);

    doc.setLineWidth(0.2);
    doc.line(x, y + 1.5, x + width, y + 1.5);

    doc.setFont('helvetica', 'normal');
    let yy = y + 6;

    for (let i = 0; i < Math.min(edges.length, maxRows); i++) {
      const e = edges[i];
      const az = (typeof e.azimuthDeg === 'number') ? this.mm(e.azimuthDeg, 1) : '—';
      const sep = (typeof e.separationToNextDeg === 'number') ? this.mm(e.separationToNextDeg, 1) : '—';

      doc.text(String(i + 1), col.idx, yy);
      doc.text(String(e.toDisplayId ?? e.to), col.to, yy);
      const kdest = Number.isFinite(e.toVisibleKIndex) ? `k${e.toVisibleKIndex}` : String(e.toK ?? '—');
      doc.text(kdest, col.k, yy);
      doc.text(String(az), col.az, yy);
      doc.text(String(sep), col.sep, yy);
      const angd = (typeof e.angleToDirectiveDeg === 'number') ? this.mm(e.angleToDirectiveDeg, 1) : '—';
      doc.text(String(angd), col.angd, yy);

      yy += rowH;

      // Línea suave cada 5 filas
      if ((i + 1) % 5 === 0) {
        doc.setDrawColor(220);
        doc.line(x, yy - 3.5, x + width, yy - 3.5);
        doc.setDrawColor(40);
      }
    }

    // (Sin nota al pie)
  }
}
