import * as THREE from 'three';
import { state } from './state.js';

/**
 * Reporte PDF: 1 página por nivel K visible (1 viga representativa por nivel).
 *
 * Requisitos del usuario:
 * - Vista principal ortogonal horizontal mostrando la cara exterior (la que pasa por la arista).
 * - Líneas traseras en discontinua.
 * - Vista isométrica pequeña.
 * - Vista lateral ortogonal horizontal con líneas traseras discont.
 * - Etiquetas en extremos: nombre de conectores (k#) a los que conecta.
 * - Graduación desde el extremo izquierdo = 0 hacia la derecha, en mm sin decimales.
 */
export class BeamPDFReporter {
  static async generateBeamsReport(structureGroup) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const beams = this._pickRepresentativeBeams(structureGroup);
    if (beams.length === 0) {
      throw new Error('No hay vigas en la estructura');
    }

    this._addCover(doc);

    for (let i = 0; i < beams.length; i++) {
      doc.addPage();
      this._addBeamPage(doc, beams[i], i + 1);
    }

    const filename = `Vigas_ZValdivia_N${state.N}_a${state.aDeg.toFixed(2)}.pdf`;
    doc.save(filename);
  }

  static _pickRepresentativeBeams(structureGroup) {
    const children = (structureGroup && structureGroup.children) ? structureGroup.children : [];
    const beamMeshes = children.filter(o => o && typeof o.name === 'string' && o.name.startsWith('beam_k'));

    // Agrupar por kVisible y escoger la viga con mayor longitud (mejor para reporte)
    const byK = new Map();
    for (const m of beamMeshes) {
      const k = this._parseK(m.name);
      if (!Number.isFinite(k)) continue;

      const len = this._beamLengthWorld(m);
      const prev = byK.get(k);
      if (!prev || len > prev.len) byK.set(k, { mesh: m, len });
    }

    return [...byK.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([k, v]) => ({ kVisible: k, mesh: v.mesh }));
  }

  static _parseK(name) {
    const m = /beam_k(\d+)_/i.exec(name);
    return m ? Number(m[1]) : NaN;
  }

  static _beamLengthWorld(mesh) {
    const info = mesh?.userData?.beamInfo;
    if (info?.a?.pos && info?.b?.pos) return info.a.pos.distanceTo(info.b.pos);
    // Fallback: bbox
    if (mesh?.geometry) {
      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox;
      if (bb) return bb.max.distanceTo(bb.min);
    }
    return 0;
  }

  static _addCover(doc) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('ZValdivia — Reporte de Vigas (Estructura)', 105, 30, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);

    const kVis = state.cutActive ? (state.N - state.cutLevel + 1) : (state.N + 1);
    const floorDiameter = state.cutActive ? state.floorDiameter : state.Dmax;
    const visibleHeight = state.cutActive ? (state.Htotal - state.cutLevel * state.h1) : state.Htotal;

    const lines = [
      `N = ${state.N}`,
      `K visibles = ${kVis}`,
      `Dmax = ${state.Dmax.toFixed(3)} m`,
      `Diámetro del piso = ${floorDiameter.toFixed(3)} m`,
      `Altura total visible = ${visibleHeight.toFixed(3)} m`,
      `Ángulo a = ${state.aDeg.toFixed(2)}°`,
      state.cutActive ? `Corte activo: suelo en K(original)=${state.cutLevel} (vista: z=0)` : 'Corte inactivo',
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
    doc.text('Chile', 24, y);
  }

  static _addBeamPage(doc, item, pageIndex) {
    const margin = 14;
    const x0 = margin;
    const y0 = margin;

    const mesh = item.mesh;
    const info = mesh?.userData?.beamInfo || {};

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`Viga k${item.kVisible}`, x0, y0);

    // Conectividad
    const connA = info?.a?.name || 'k?';
    const connB = info?.b?.name || 'k?';

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Conecta: ${connA} <-> ${connB}`, x0, y0 + 6);

    // Dimensiones
    const widthMm = Number.isFinite(info.widthMm) ? info.widthMm : null;
    const heightMm = Number.isFinite(info.heightMm) ? info.heightMm : null;
    const lenMm = Math.round(this._beamLengthWorld(mesh) * 1000);
    const dimLine = `L = ${lenMm} mm${widthMm != null ? `, Ancho = ${widthMm} mm` : ''}${heightMm != null ? `, Alto = ${heightMm} mm` : ''}`;
    doc.text(dimLine, x0, y0 + 12);

    // Obtener vértices (world)
    const vertsW = this._getBeamVerticesWorld(mesh);
    if (!vertsW) {
      doc.setFontSize(11);
      doc.text('⚠️ No se pudo leer la geometría de la viga.', x0, y0 + 26);
      return;
    }

    // Base local (x=e, y=w, z=t)
    const basis = this._computeBeamBasis(vertsW);
    if (!basis) {
      doc.setFontSize(11);
      doc.text('⚠️ No se pudo calcular el sistema local de la viga.', x0, y0 + 26);
      return;
    }

    // Determinar izquierda/derecha según el eje e
    const e = basis.e;
    const leftRight = this._orderEndpointsByE(info, e);
    const leftLabel = leftRight.leftName;
    const rightLabel = leftRight.rightName;

    // Ang(d): ángulo entre arista y vector directriz en cada extremo (deg)
    const aAng = Number.isFinite(info.angAdeg) ? info.angAdeg : null;
    const bAng = Number.isFinite(info.angBdeg) ? info.angBdeg : null;
    const leftAng = leftRight.leftKey === 'a' ? aAng : bAng;
    const rightAng = leftRight.rightKey === 'a' ? aAng : bAng;

    // Layout de vistas
    const mainBox = { x: 14, y: 34, w: 132, h: 72 };
    const isoBox = { x: 152, y: 34, w: 44, h: 44 };
    const sideBox = { x: 14, y: 118, w: 182, h: 62 };

    // Vista principal: planta (Largo x Ancho) con biseles visibles (líneas ocultas en discontinua)
    this._drawBeamPlanBevel(doc, vertsW, basis, {
      box: mainBox,
      title: 'Vista ortogonal — Planta (ancho externo)',
      leftLabel,
      rightLabel,
      leftAng,
      rightAng,
    });

    // Vista isométrica (sin ocultas)
    this._drawBeamIsometric(doc, vertsW, basis, isoBox, { leftLabel, rightLabel });

    // Vista lateral: e vs t
    this._drawBeamView(doc, vertsW, basis, {
      viewDir: basis.w.clone(),
      uAxis: basis.e,
      vAxis: basis.t.clone().multiplyScalar(-1),
      box: sideBox,
      title: 'Vista lateral — Largo vs Alto',
      showDashedHidden: true,
      leftLabel,
      rightLabel,
      leftAng,
      rightAng,
    });
  }

  static _getBeamVerticesWorld(mesh) {
    const uv = mesh?.userData?.objVertices;
    if (Array.isArray(uv) && uv.length === 8) return uv.map(v => v.clone());

    // Fallback: leer posiciones de BufferGeometry (8 vértices)
    const pos = mesh?.geometry?.getAttribute?.('position');
    if (!pos || pos.count < 8) return null;
    const out = [];
    for (let i = 0; i < 8; i++) {
      out.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
    }
    return out;
  }

  static _computeBeamBasis(vertsW) {
    // Centroides de caras inicio (0..3) y fin (4..7)
    const cA = new THREE.Vector3();
    const cB = new THREE.Vector3();
    for (let i = 0; i < 4; i++) cA.add(vertsW[i]);
    for (let i = 4; i < 8; i++) cB.add(vertsW[i]);
    cA.multiplyScalar(1 / 4);
    cB.multiplyScalar(1 / 4);

    const e = new THREE.Vector3().subVectors(cB, cA);
    if (e.lengthSq() < 1e-12) return null;
    e.normalize();

    // --- Base local robusta (para vigas con twist/bisel) ---
    // 1) Vector “alto” aproximado: inner(2,3,6,7) - outer(0,1,4,5)
    const cOuter = new THREE.Vector3();
    const cInner = new THREE.Vector3();
    [0, 1, 4, 5].forEach(i => cOuter.add(vertsW[i]));
    [2, 3, 6, 7].forEach(i => cInner.add(vertsW[i]));
    cOuter.multiplyScalar(1 / 4);
    cInner.multiplyScalar(1 / 4);
    const tRaw = new THREE.Vector3().subVectors(cInner, cOuter);
    if (tRaw.lengthSq() < 1e-12) return null;

    // 2) Vector “ancho” aproximado: promedio de las aristas de ancho de la cara exterior
    // (0->1) y (4->5). Esto evita que el ancho se “contamine” por el alto cuando hay bisel.
    const wRaw = new THREE.Vector3()
      .add(new THREE.Vector3().subVectors(vertsW[1], vertsW[0]))
      .add(new THREE.Vector3().subVectors(vertsW[5], vertsW[4]));
    if (wRaw.lengthSq() < 1e-12) return null;

    // Ortonormalización suave: w ⟂ e
    const w = wRaw.sub(e.clone().multiplyScalar(wRaw.dot(e)));
    if (w.lengthSq() < 1e-12) return null;
    w.normalize();

    // t ⟂ e y ⟂ w
    const t = tRaw
      .sub(e.clone().multiplyScalar(tRaw.dot(e)))
      .sub(w.clone().multiplyScalar(tRaw.dot(w)));
    if (t.lengthSq() < 1e-12) return null;
    t.normalize();

    // Re-derivar w para asegurar mano derecha exacta
    const wOrtho = new THREE.Vector3().crossVectors(e, t);
    if (wOrtho.lengthSq() < 1e-12) return null;
    wOrtho.normalize();

    // Mantener la orientación de ancho coherente con w (evita flips visuales)
    if (wOrtho.dot(w) < 0) wOrtho.multiplyScalar(-1);

    return { e, w: wOrtho, t };
  }

  static _orderEndpointsByE(info, eAxis) {
    const aPos = info?.a?.pos;
    const bPos = info?.b?.pos;
    const aName = info?.a?.name || 'k?';
    const bName = info?.b?.name || 'k?';
    if (!aPos || !bPos) return { leftName: aName, rightName: bName, leftKey: 'a', rightKey: 'b' };

    const d = bPos.clone().sub(aPos);
    // Si b está hacia +e => a izquierda, b derecha
    if (d.dot(eAxis) >= 0) return { leftName: aName, rightName: bName, leftKey: 'a', rightKey: 'b' };
    return { leftName: bName, rightName: aName, leftKey: 'b', rightKey: 'a' };
  }

  
  static _clipSegmentToUInterval(a, b, u0, u1) {
    // Clip 2D segment (a.u,a.v) -> (b.u,b.v) to u in [u0,u1]. Returns [p0,p1] or null.
    const du = b.u - a.u;
    if (Math.abs(du) < 1e-12) {
      // vertical in u
      if (a.u < u0 - 1e-12 || a.u > u1 + 1e-12) return null;
      return [a, b];
    }
    let t0 = (u0 - a.u) / du;
    let t1 = (u1 - a.u) / du;
    if (t0 > t1) [t0, t1] = [t1, t0];
    const te = Math.max(0, t0);
    const tl = Math.min(1, t1);
    if (te > tl) return null;
    const p0 = { u: a.u + du * te, v: a.v + (b.v - a.v) * te };
    const p1 = { u: a.u + du * tl, v: a.v + (b.v - a.v) * tl };
    return [p0, p1];
  }
static _edges() {
    return [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
  }

  /**
   * Vista en planta (u=eje de viga, v=ancho), mostrando bisel por líneas de corte:
   * - Contorno visible: cara exterior (t=min)
   * - Línea oculta (discontinua): intersección del bisel con la cara interior (t=max)
   *
   * Esta vista coincide con la referencia del usuario: el “ancho” queda en planta
   * y el bisel se ve como líneas internas (ocultas) cerca de los extremos.
   */
  static _drawBeamPlanBevel(doc, vertsW, basis, opts) {
    const { box, title, leftLabel, rightLabel, leftAng, rightAng } = opts;

    // Margen interno del área de dibujo (mm en coordenadas del PDF)
    const pad = 7;

    const e = basis.e, w = basis.w, t = basis.t;

    // Proyección local para planta:
    //   u = e (largo),
    //   v = w (ancho),
    //   z = t (hacia adentro)
    const P = vertsW.map(v3 => ({ u: v3.dot(e), v: v3.dot(w), z: v3.dot(t) }));

    // Caras: exterior (pasa por la arista) e interior (hacia adentro)
    // Nota: índices acordes a la viga (0..3 extremo A, 4..7 extremo B)
    const outerIdx = [0, 1, 5, 4];
    const innerIdx = [3, 2, 6, 7];

    // Bounds para escala
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const idx of [...outerIdx, ...innerIdx]) {
      const p = P[idx];
      minU = Math.min(minU, p.u); maxU = Math.max(maxU, p.u);
      minV = Math.min(minV, p.v); maxV = Math.max(maxV, p.v);
    }
    const spanU = Math.max(1e-9, maxU - minU);
    const spanV = Math.max(1e-9, maxV - minV);

    // Largo real (mm, sin decimales) para decidir si aplicamos "vista rota"
    const lengthMm = Math.round(spanU * 1000);

    // Título
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(title, box.x, box.y - 3);

    // --- Break dinámico (vista rota) ---
    // El ángulo del bisel afecta cuánto "corre" la testa en u. Estimamos ese avance usando
    // la dispersión de u en los 4 vértices de cada extremo.
    const endA_uMax = Math.max(P[0].u, P[1].u, P[2].u, P[3].u);
    const endB_uMin = Math.min(P[4].u, P[5].u, P[6].u, P[7].u);
    const needLeft  = Math.max(0, endA_uMax - minU);
    const needRight = Math.max(0, maxU - endB_uMin);

    let broken = lengthMm > 900; // umbral
    const minKeepWorld = 0.10;   // 100 mm
    const extraWorld = 0.020;    // 20 mm
    let keepWorld = Math.max(minKeepWorld, needLeft + extraWorld, needRight + extraWorld);

    // No permitir que los extremos se coman todo
    keepWorld = Math.min(keepWorld, spanU * 0.42);
    if (keepWorld * 2 >= spanU * 0.92) broken = false;

    // Escalas
    const scaleByV = (box.h - 2 * pad) / spanV;
    const scaleByU = (box.w - 2 * pad) / spanU;
    const gapPaper = 14; // mm, espacio del "..."

    let scale;
    if (!broken) {
      scale = Math.min(scaleByV, scaleByU);
    } else {
      // Forzar que los extremos (en escala real) quepan sin aplastarse
      const scaleByEnds = (box.w - 2 * pad - gapPaper) / (2 * keepWorld);
      scale = Math.min(scaleByV, scaleByEnds);
    }

    const xLeft0 = box.x + pad;
    const xRight0 = box.x + box.w - pad;

    // Definimos cortes en u (mundo)
    const leftCutU = minU + keepWorld;
    const rightCutU = maxU - keepWorld;

    // Mapeo u->x con "break"
    const xLeftEnd = !broken ? (xLeft0 + spanU * scale) : (xLeft0 + (leftCutU - minU) * scale);
    const xRightStart = !broken ? xLeft0 : (xRight0 - (maxU - rightCutU) * scale);

    function mapX(u) {
      if (!broken) return xLeft0 + (u - minU) * scale;
      if (u <= leftCutU + 1e-12) return xLeft0 + (u - minU) * scale;
      if (u >= rightCutU - 1e-12) return xRightStart + (u - rightCutU) * scale;
      return null; // zona omitida
    }
    function mapY(v) {
      return box.y + pad + (v - minV) * scale;
    }

    // Dibuja un segmento (con clipping si hay break)
    const clipSeg = BeamPDFReporter._clipSegmentToUInterval;
    function drawSeg(a, b, dashed) {
      doc.setLineDashPattern(dashed ? [3, 3] : [], 0);

      if (!broken) {
        doc.line(mapX(a.u), mapY(a.v), mapX(b.u), mapY(b.v));
        return;
      }

      // Clip contra intervalo izquierdo y derecho
      const left = clipSeg(a, b, minU, leftCutU);
      if (left) doc.line(mapX(left[0].u), mapY(left[0].v), mapX(left[1].u), mapY(left[1].v));

      const right = clipSeg(a, b, rightCutU, maxU);
      if (right) doc.line(mapX(right[0].u), mapY(right[0].v), mapX(right[1].u), mapY(right[1].v));
    }

    // Estilo
    doc.setDrawColor(20);
    doc.setLineWidth(0.6);

    // Contorno visible: cara exterior (0-1-5-4)
    drawSeg(P[0], P[1], false);
    drawSeg(P[1], P[5], false);
    drawSeg(P[5], P[4], false);
    drawSeg(P[4], P[0], false);

    // Líneas ocultas (discontinuas) que expresan el bisel en planta:
    // izquierda: (2–3), derecha: (6–7)
    doc.setDrawColor(60);
    doc.setLineWidth(0.35);
    drawSeg(P[2], P[3], true);
    drawSeg(P[6], P[7], true);
    doc.setLineDashPattern([], 0);

    // Ellipsis centrado en la viga (no en la caja)
    if (broken) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      const midX = (xLeftEnd + xRightStart) / 2;
      const midY = box.y + pad + (spanV * scale) / 2;
      doc.text('...', midX, midY, { align: 'center' });
    }

    // Etiquetas de conectores + Ang(d) en extremos
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(String(leftLabel || ''), box.x, box.y - 1, { align: 'left' });
    doc.text(String(rightLabel || ''), box.x + box.w, box.y - 1, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (Number.isFinite(leftAng)) doc.text(`Ang(d) ${leftAng.toFixed(1)}°`, box.x, box.y + 3, { align: 'left' });
    if (Number.isFinite(rightAng)) doc.text(`Ang(d) ${rightAng.toFixed(1)}°`, box.x + box.w, box.y + 3, { align: 'right' });
  }

  
  static _drawBeamView(doc, vertsW, basis, opts) {
    const { viewDir, uAxis, vAxis, box, title, showDashedHidden, leftLabel, rightLabel, leftAng, rightAng } = opts;
    const edges = this._edges();

    // Proyección a 2D: u (horizontal), v (vertical); depth para decidir ocultas
    const pts = vertsW.map(p => ({
      u: p.dot(uAxis),
      v: p.dot(vAxis),
      d: p.dot(viewDir),
    }));

    // Bounds
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    let minD = Infinity, maxD = -Infinity;
    for (const p of pts) {
      minU = Math.min(minU, p.u); maxU = Math.max(maxU, p.u);
      minV = Math.min(minV, p.v); maxV = Math.max(maxV, p.v);
      minD = Math.min(minD, p.d); maxD = Math.max(maxD, p.d);
    }
    const dMid = 0.5 * (minD + maxD);
    const spanU = Math.max(1e-9, maxU - minU);
    const spanV = Math.max(1e-9, maxV - minV);

    // Título
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(title, box.x, box.y - 3);

    // Labels + Ang(d)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    if (leftLabel) doc.text(String(leftLabel), box.x, box.y - 1, { align: 'left' });
    if (rightLabel) doc.text(String(rightLabel), box.x + box.w, box.y - 1, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (Number.isFinite(leftAng)) doc.text(`Ang(d) ${leftAng.toFixed(1)}°`, box.x, box.y + 3, { align: 'left' });
    if (Number.isFinite(rightAng)) doc.text(`Ang(d) ${rightAng.toFixed(1)}°`, box.x + box.w, box.y + 3, { align: 'right' });

    // --- Break (acortar cuerpo) ---
        // --- Break dinámico según bisel (vista) ---
    const endA_uMax = Math.max(pts[0].u, pts[1].u, pts[2].u, pts[3].u);
    const endB_uMin = Math.min(pts[4].u, pts[5].u, pts[6].u, pts[7].u);
    const needLeft  = Math.max(0, endA_uMax - minU);
    const needRight = Math.max(0, maxU - endB_uMin);

    const pad = 7;
    const lengthMm = spanU * 1000;
    let broken = lengthMm > 900;

    const minKeepWorld = 0.10; // 100mm
    const extraWorld = 0.020;  // 20mm
    let keepWorldDesired = Math.max(minKeepWorld, needLeft + extraWorld, needRight + extraWorld);
    keepWorldDesired = Math.min(keepWorldDesired, spanU * 0.42);

    if (keepWorldDesired * 2 >= spanU * 0.92) broken = false;

    // Escala base por alto (v), pero permitimos reducirla para que se aprecien los biseles.
    let scaleByV = (box.h - 2 * pad) / spanV;

    const gapPaper = 14;
    const xLeft0 = box.x + pad;
    const xRight0 = box.x + box.w - pad;

    let scale;
    if (!broken) {
      scale = Math.min(scaleByV, (box.w - 2 * pad) / spanU);
    } else {
      const scaleByEnds = (box.w - 2 * pad - gapPaper) / (2 * keepWorldDesired);
      scale = Math.min(scaleByV, scaleByEnds);

      const maxKeepWorld = Math.max(1e-9, (box.w - 2 * pad - gapPaper) / (2 * scale));
      keepWorldDesired = Math.min(keepWorldDesired, maxKeepWorld);

      if (keepWorldDesired * 2 >= spanU * 0.92) broken = false;
      if (!broken) scale = Math.min(scaleByV, (box.w - 2 * pad) / spanU);
    }

    const keepWorld = broken ? keepWorldDesired : spanU;
    const leftCutU = minU + keepWorld;
    const rightCutU = maxU - keepWorld;

    const xLeftEnd = !broken ? (xLeft0 + spanU * scale) : (xLeft0 + (leftCutU - minU) * scale);
    const xRightStart = !broken ? xLeftEnd : (xRight0 - (maxU - rightCutU) * scale);

    const mapU = (u) => {
      if (!broken) return xLeft0 + (u - minU) * scale;
      if (u <= leftCutU + 1e-12) return xLeft0 + (u - minU) * scale;
      if (u >= rightCutU - 1e-12) return xRightStart + (u - rightCutU) * scale;
      return null;
    };
    const mapV = (v) => box.y + pad + (maxV - v) * scale;

    const drawSegmentMapped = (p0, p1, dashed) => {
      const x0 = mapU(p0.u), x1 = mapU(p1.u);
      if (x0 == null || x1 == null) return;
      const y0 = mapV(p0.v), y1 = mapV(p1.v);
      if (doc.setLineDashPattern) {
        if (dashed) doc.setLineDashPattern([2.0, 1.8], 0);
        else doc.setLineDashPattern([], 0);
      }
      doc.line(x0, y0, x1, y1);
    };

    const drawSegment = (a, b, dashed) => {
      if (!broken) {
        drawSegmentMapped(a, b, dashed);
        return;
      }
      const left = this._clipSegmentToUInterval(a, b, minU, leftCutU);
      if (left) drawSegmentMapped(left[0], left[1], dashed);
      const right = this._clipSegmentToUInterval(a, b, rightCutU, maxU);
      if (right) drawSegmentMapped(right[0], right[1], dashed);
    };
for (const [i0, i1] of edges) {
      const a = pts[i0];
      const b = pts[i1];
      const isHidden = showDashedHidden && ((a.d + b.d) * 0.5) < dMid;
      drawSegment(a, b, isHidden);
    }

    // Ellipsis en el medio (solo si break)
    if (broken) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      const midX = (xLeftEnd + xRightStart) / 2;
      const midY = box.y + box.h / 2;
      doc.text('...', midX, midY, { align: 'center' });
    }
  }

static _drawBeamIsometric(doc, vertsW, basis, box, opts = {}) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Isométrica', box.x, box.y - 3);

    // Mantener solo el recuadro en isométrica
    doc.setDrawColor(120);
    doc.setLineWidth(0.2);
    doc.rect(box.x, box.y, box.w, box.h);

    // Etiqueta conectividad
    const isoLabel = (opts.leftLabel && opts.rightLabel) ? `${opts.leftLabel} <-> ${opts.rightLabel}` : '';
    if (isoLabel) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(isoLabel, box.x + box.w / 2, box.y + box.h + 4, { align: 'center' });
    }

    // Coordenadas locales: x = largo (e), y = ancho (w), z = alto hacia exterior (-t)
    const e = basis.e, w = basis.w, t = basis.t;
    const ptsL = vertsW.map(p => ({
      x: p.dot(e),
      y: p.dot(w),
      z: -p.dot(t),
    }));

    // Proyección isométrica determinista (dibujo técnico):
    // X = (x - y)*cos30, Y = z + (x + y)*sin30
    const COS30 = 0.8660254037844386;
    const SIN30 = 0.5;
    const pts2 = ptsL.map(p => ({ x: (p.x - p.y) * COS30, y: p.z + (p.x + p.y) * SIN30 }));

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts2) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const spanX = Math.max(1e-9, maxX - minX);
    const spanY = Math.max(1e-9, maxY - minY);

    const pad = 4;
    const scale = Math.min((box.w - 2 * pad) / spanX, (box.h - 2 * pad) / spanY);
    const map = (p) => ({
      X: box.x + pad + (p.x - minX) * scale,
      Y: box.y + pad + (maxY - p.y) * scale,
    });

    doc.setLineWidth(0.3);
    doc.setDrawColor(40);
    if (doc.setLineDashPattern) doc.setLineDashPattern([], 0);
    for (const [i0, i1] of this._edges()) {
      const a = map(pts2[i0]);
      const b = map(pts2[i1]);
      doc.line(a.X, a.Y, b.X, b.Y);
    }
  }

  static _tickStepMm(lengthMm) {
    if (lengthMm <= 400) return 25;
    if (lengthMm <= 900) return 50;
    if (lengthMm <= 2500) return 100;
    return 200;
  }
}