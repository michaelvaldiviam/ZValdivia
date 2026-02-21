/**
 * Reporte PDF: 1 página por conector (incluye conectores de intersección).
 * Toma conectores y vigas desde structureGroup para que la conectividad refleje
 * vigas extra, eliminadas y conectores nuevos.
 */
export class ConnectorPDFReporter {
  static async generateConnectorsReport(structureGroup) {
    if (!structureGroup || !structureGroup.children) {
      throw new Error('structureGroup no disponible');
    }

    const { jsPDF } = window.jspdf;
    if (!jsPDF) throw new Error('jsPDF no disponible');

    const connectors = [];
    const beams = [];

    for (const ch of structureGroup.children) {
      if (ch && ch.userData && ch.userData.isConnector) connectors.push(ch);
      if (ch && ch.userData && ch.userData.isBeam) beams.push(ch);
    }

    if (connectors.length === 0) {
      throw new Error('No se encontraron conectores en la estructura');
    }

    connectors.sort((a, b) => {
      const ai = a.userData.connectorInfo || {};
      const bi = b.userData.connectorInfo || {};
      const ak = Number(ai.kVisible);
      const bk = Number(bi.kVisible);
      if (isFinite(ak) && isFinite(bk) && ak !== bk) return ak - bk;
      const aid = String(ai.id || a.name || '');
      const bid = String(bi.id || b.name || '');
      return aid.localeCompare(bid);
    });

    // Index beams by vertex key (aKey/bKey)
    const byKey = new Map();
    function addKey(key, beam) {
      if (!key) return;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(beam);
    }
    for (const bm of beams) {
      const bi = (bm.userData && bm.userData.beamInfo) ? bm.userData.beamInfo : {};
      addKey(bi.aKey, bm);
      addKey(bi.bKey, bm);
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 12;

    const titleFont = 14;
    const hFont = 11;
    const bodyFont = 10;

    for (let idx = 0; idx < connectors.length; idx++) {
      const c = connectors[idx];
      if (idx > 0) doc.addPage();

      const ci = c.userData && c.userData.connectorInfo ? c.userData.connectorInfo : {};
      const id = ci.id || c.name || `conector_${idx + 1}`;
      const kVis = (ci.kVisible !== undefined) ? ci.kVisible : '?';
      const diam = (ci.diameterMm !== undefined) ? ci.diameterMm : '?';
      const depth = (ci.depthMm !== undefined) ? ci.depthMm : '?';
      const offset = (ci.offsetMm !== undefined) ? ci.offsetMm : '?';

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(titleFont);
      doc.text(`Conector: ${id}`, margin, margin);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(hFont);
      doc.text(`Nivel K visible: ${kVis}`, margin, margin + 8);
      doc.text(`Ø: ${diam} mm   Prof: ${depth} mm   Offset: ${offset} mm`, margin, margin + 14);

      const key = ConnectorPDFReporter._keyForConnector(ci);
      const related = (key && byKey.has(key)) ? byKey.get(key) : [];

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(hFont);
      doc.text(`Vigas conectadas (${related.length})`, margin, margin + 26);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(bodyFont);

      let y = margin + 34;
      const lineH = 6;

      if (!related.length) {
        doc.text('— (sin vigas conectadas)', margin, y);
      } else {
        doc.setFont('helvetica', 'bold');
        doc.text('Nombre', margin, y);
        doc.text('Extremos', margin + 70, y);
        doc.setFont('helvetica', 'normal');
        y += 6;

        const maxLines = Math.floor((pageH - y - margin) / lineH);
        const rel = related.slice().sort((x, yb) => {
          const xi = x.userData && x.userData.beamInfo ? x.userData.beamInfo : {};
          const yi = yb.userData && yb.userData.beamInfo ? yb.userData.beamInfo : {};
          return String(xi.kVisible || 0).localeCompare(String(yi.kVisible || 0));
        });

        for (let j = 0; j < rel.length && j < maxLines; j++) {
          const bm = rel[j];
          const bi = bm.userData && bm.userData.beamInfo ? bm.userData.beamInfo : {};
          const name = bm.name || bi.id || 'beam';
          const ends = `${bi.aKey || '?'} ↔ ${bi.bKey || '?'}`;
          doc.text(String(name), margin, y);
          doc.text(String(ends), margin + 70, y);
          y += lineH;
        }

        if (rel.length > maxLines) {
          doc.text(`… +${rel.length - maxLines} más`, margin, y);
        }
      }

      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text('ZValdivia — Reporte de conectores', margin, pageH - 8);
      doc.setTextColor(0);
    }

    doc.save('ZValdivia_conectores.pdf');
  }

  static _keyForConnector(ci) {
    const k = Number(ci.kOriginal);
    const i = Number(ci.i);
    if (!isFinite(k)) return null;
    if (k === 0) return 'pole_low';
    // Para el polo top, el generador usa 'pole_top'. Si kOriginal es grande (N) y i no es finito
    // igual devolvemos una key estable.
    if (ci.id && String(ci.id).indexOf('pole_top') >= 0) return 'pole_top';
    if (!isFinite(i)) return (k === 0 ? 'pole_low' : `k${k}_i0`);
    return `k${k}_i${i}`;
  }
}
