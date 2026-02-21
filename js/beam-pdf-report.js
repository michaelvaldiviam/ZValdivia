import * as THREE from 'three';
import { state } from './state.js';
import { getRingVertex } from './geometry.js';

/**
 * Reporte PDF: 1 pagina por nivel K visible (1 viga representativa por nivel).
 *
 * Requisitos del usuario:
 * - Vista principal ortogonal horizontal mostrando la cara exterior (la que pasa por la arista).
 * - Lineas traseras en discontinua.
 * - Vista isometrica pequena.
 * - Vista lateral ortogonal horizontal con lineas traseras discont.
 * - Etiquetas en extremos: nombre de conectores (k#) a los que conecta.
 * - Graduacion desde el extremo izquierdo = 0 hacia la derecha, en mm sin decimales.
 */
export class BeamPDFReporter {
  // Detecta si las keys (k#, X:#) que vienen en beamInfo ya están en "niveles visibles"
  // (cuando hay corte activo algunas rutinas generan keys ya re-indexadas desde 0).
  static _initKeySpace(structureGroup) {
    this._keysAreVisible = null;
    const cutActive = !!state.cutActive;
    const cutLevel = Number.isFinite(state.cutLevel) ? state.cutLevel : 0;
    if (!cutActive || !structureGroup || typeof structureGroup.traverse !== "function") {
      this._keysAreVisible = false;
      return;
    }
    let minK = Infinity;
    let sawAny = false;
    structureGroup.traverse((obj) => {
      const info = (obj && obj.userData && obj.userData.beamInfo) ? obj.userData.beamInfo : null;
      if (!info) return;
      const keys = [info.aKey, info.bKey];
      for (const key of keys) {
        if (typeof key !== "string") continue;
        let m = /^k(\d+)_i\d+$/i.exec(key);
        if (m) { sawAny = true; minK = Math.min(minK, Number(m[1])); continue; }
        m = /^X:(\d+):\d+$/i.exec(key);
        if (m) { sawAny = true; minK = Math.min(minK, Number(m[1])); continue; }
      }
    });
    if (!sawAny) { this._keysAreVisible = false; return; }
    // Heurística:
    // - Si con corte activo el mínimo k observado es 0 (o < cutLevel), las keys ya están en espacio visible.
    // - Si el mínimo k observado es >= cutLevel, las keys parecen ser originales.
    this._keysAreVisible = (minK <= 0 || minK < cutLevel);
  }

  static _kFromKeyToVisible(kFromKey) {
    const cutActive = !!state.cutActive;
    const cutLevel = Number.isFinite(state.cutLevel) ? state.cutLevel : 0;
    if (!cutActive) return kFromKey;
    const keysVisible = (this._keysAreVisible === true);
    return keysVisible ? kFromKey : (kFromKey - cutLevel);
  }

static async generateBeamsReport(structureGroup, sceneManager = null) {
    // Inicializa detección de keyspace (visible vs original) para mostrar conectividad coherente.
    BeamPDFReporter._initKeySpace(structureGroup);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const beams = this._pickRepresentativeBeams(structureGroup);
    if (beams.length === 0) {
      throw new Error('No hay vigas en la estructura');
    }

    this._addCover(doc);

    // Conteo real de instancias de vigas (evita heuristicas N vs 2N).
    const beamCountMap = BeamPDFReporter._countBeamInstances(structureGroup);

    for (let i = 0; i < beams.length; i++) {
      doc.addPage();
      await this._addBeamPage(doc, beams[i], i + 1, sceneManager, beamCountMap);
    }

    // Paginas adicionales para vigas extra (diagonales/aristas extra y tramos a conectores X)
    const extraBeams = this._pickExtraBeams(structureGroup, beams);
    for (let j = 0; j < extraBeams.length; j++) {
      doc.addPage();
      await this._addBeamPage(doc, extraBeams[j], beams.length + j + 1, sceneManager, beamCountMap);
    }

    const filename = `Vigas_ZValdivia_N${state.N}_a${state.aDeg.toFixed(2)}.pdf`;
    doc.save(filename);
  }

  /**
   * Cuenta instancias reales de vigas presentes en la estructura visible.
   * Retorna Map con key "<kind>:<touchesX>:<kLo>-<kHi>:L<lemma(мм)>" -> count.
   *
   * Nota: deduplicamos por endpoints (aKey/bKey) porque, al generar diagonales e
   * intersecciones, la app puede terminar con meshes distintos que representan
   * la MISMA viga (mismos extremos) y eso inflaba el conteo y/o generaba páginas
   * duplicadas en el PDF.
   */
  static _countBeamInstances(structureGroup) {
    // Retorna Map<typeKey, count>
    const map = new Map();
    if (!structureGroup || typeof structureGroup.traverse !== 'function') return map;

    // Dedup global por viga (endpoints+kind). Evita contar meshes duplicados.
    const seenUnique = new Set();

    structureGroup.traverse((obj) => {
      const info = (obj && obj.userData && obj.userData.beamInfo) ? obj.userData.beamInfo : null;
      if (!info) return;

      const uniqueKey = BeamPDFReporter._beamUniqueKey(info, obj);
      if (!uniqueKey || seenUnique.has(uniqueKey)) return;
      seenUnique.add(uniqueKey);

      const key = BeamPDFReporter._beamCountKey(info, obj);
      if (!key) return;

      map.set(key, (map.get(key) || 0) + 1);
    });

    return map;
  }

  static _beamUniqueKey(info, obj) {
    const kind = (info && info.kind) ? String(info.kind) : 'edge';
    const aKey = (info && typeof info.aKey === 'string') ? info.aKey : '';
    const bKey = (info && typeof info.bKey === 'string') ? info.bKey : '';
    // Preferir endpoints: es lo único que define identidad de “la viga”
    if (aKey && bKey) {
      const A = aKey < bKey ? aKey : bKey;
      const B = aKey < bKey ? bKey : aKey;
      return `${kind}|${A}|${B}`;
    }
    // Fallback: id (si existe)
    const id = info && info.id ? String(info.id) : '';
    if (id) return `${kind}|id|${id}`;
    // Último fallback: uuid del mesh
    const uuid = obj && obj.uuid ? String(obj.uuid) : '';
    return uuid ? `${kind}|uuid|${uuid}` : null;
  }

  static _beamTypeKey(info, mesh) {
    const pair = BeamPDFReporter._normalizeConnPair(info);
    if (!pair || !Number.isFinite(pair.kLo) || !Number.isFinite(pair.kHi)) return null;

    const kind = (info && info.kind) ? String(info.kind) : 'edge';
    const aKey = (info && typeof info.aKey === 'string') ? info.aKey : '';
    const bKey = (info && typeof info.bKey === 'string') ? info.bKey : '';
    const touchesX = (aKey.startsWith('X:') || bKey.startsWith('X:')) ? 1 : 0;

    // IMPORTANTÍSIMO: con diagonales/intersecciones pueden existir tramos con el mismo
    // (kLo-kHi) pero longitudes distintas (ej. k0<->k1 normal vs un tramo corto hacia X).
    // Si solo usamos niveles, se mezclan y luego aparecen páginas “duplicadas” o conteos raros.
    let lenMm = null;
    if (mesh) {
      const lenM = BeamPDFReporter._beamLengthWorld(mesh);
      if (Number.isFinite(lenM)) lenMm = Math.round(lenM * 1000);
    }
    const L = (lenMm != null) ? `:L${lenMm}` : '';

    return `${kind}:${touchesX}:${pair.kLo}-${pair.kHi}${L}`;
  }

  
// -----------------------------
// Helpers: niveles visibles + etiquetas de conectores
// -----------------------------

static _toVisibleK(kOriginal) {
  return BeamPDFReporter._kFromKeyToVisible(kOriginal);
}
static _parseConnectorKey(key) {
  if (typeof key !== 'string') return null;
  if (key === 'pole_low') return { type: 'pole', pole: 'low', k: 0, i: null };
  if (key === 'pole_top') return { type: 'pole', pole: 'top', k: state.N, i: null };

  let m = /^k(\d+)_i(\d+)$/i.exec(key);
  if (m) return { type: 'k', k: Number(m[1]), i: Number(m[2]) };

  m = /^X:(\d+):(\d+)$/i.exec(key);
  if (m) return { type: 'X', k: Number(m[1]), i: Number(m[2]) };

  return null;
}

static _formatConnectorKeyVisible(key) {
  const parsed = BeamPDFReporter._parseConnectorKey(key);
  if (!parsed) return 'k?';
  if (parsed.type === 'pole') {
    // Etiqueta estable (no depende de corte). Mantener como en la app.
    return (parsed.pole === 'low') ? 'pole_low' : 'pole_top';
  }
  const kVis = BeamPDFReporter._toVisibleK(parsed.k);
  if (parsed.type === 'X') return `X:${kVis}:${parsed.i}`;
  return `k${kVis}`;
}

static _endpointPairVisible(info) {
  const aKey = (info && typeof info.aKey === 'string') ? info.aKey : '';
  const bKey = (info && typeof info.bKey === 'string') ? info.bKey : '';
  const aV = BeamPDFReporter._formatConnectorKeyVisible(aKey);
  const bV = BeamPDFReporter._formatConnectorKeyVisible(bKey);
  // Orden estable para deduplicación
  return (aV <= bV) ? { a: aV, b: bV } : { a: bV, b: aV };
}

static _beamCountKey(info, mesh) {
  // Key robusta para conteos y agrupaciones en PDF.
  // - Para vigas base (kind=edge sin tocar X): agrupar por niveles visibles + longitud.
  // - Para extras (diagonales / tramos hacia X / cualquier kind != edge): además incluir endpoints visibles
  //   para separar casos “mismo tipo” pero conectores distintos (ej. aparece conector X nuevo).
  const pair = BeamPDFReporter._normalizeConnPair(info);
  if (!pair || !Number.isFinite(pair.kLo) || !Number.isFinite(pair.kHi)) return null;

  const kind = (info && info.kind) ? String(info.kind) : 'edge';
  const aKey = (info && typeof info.aKey === 'string') ? info.aKey : '';
  const bKey = (info && typeof info.bKey === 'string') ? info.bKey : '';
  const touchesX = (aKey.startsWith('X:') || bKey.startsWith('X:')) ? 1 : 0;

  const kLoVis = BeamPDFReporter._toVisibleK(pair.kLo);
  const kHiVis = BeamPDFReporter._toVisibleK(pair.kHi);

  let lenMm = null;
  if (mesh) {
    const lenM = BeamPDFReporter._beamLengthWorld(mesh);
    if (Number.isFinite(lenM)) lenMm = Math.round(lenM * 1000);
  }
  const L = (lenMm != null) ? `:L${lenMm}` : '';

  const isExtra = (kind !== 'edge') || touchesX === 1;

  if (!isExtra) {
    return `${kind}:${touchesX}:${kLoVis}-${kHiVis}${L}`;
  }

  const ep = BeamPDFReporter._endpointPairVisible(info);
  return `${kind}:${touchesX}:${kLoVis}-${kHiVis}${L}:${ep.a}<->${ep.b}`;
}

static _pickRepresentativeBeams(structureGroup) {
    const children = (structureGroup && structureGroup.children) ? structureGroup.children : [];
    const beamMeshes = children.filter(o => {
      if (!o || typeof o.name !== 'string' || !o.name.startsWith('beam_k')) return false;
      const kind = (o.userData && o.userData.beamInfo && o.userData.beamInfo.kind) ? o.userData.beamInfo.kind : 'edge';
      // Representantes SOLO de vigas base (aristas originales). Extras/diagonales se reportan aparte.
      return kind === 'edge';
    });

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
      .map(([k, v]) => {
        const info = (v && v.mesh && v.mesh.userData && v.mesh.userData.beamInfo) ? v.mesh.userData.beamInfo : {};
        const pair = this._normalizeConnPair(info);
        return { kVisible: k, mesh: v.mesh, _pair: pair };
      })
      .sort((A, B) => {
        const a = A._pair, b = B._pair;
        if (a && b) {
          if (a.kLo !== b.kLo) return a.kLo - b.kLo;
          if (a.kHi !== b.kHi) return a.kHi - b.kHi;
        } else if (a && !b) {
          return -1;
        } else if (!a && b) {
          return 1;
        }
        return A.kVisible - B.kVisible;
      })
      .map(({ kVisible, mesh }) => ({ kVisible, mesh }));
  }


static _pickExtraBeams(structureGroup, alreadyPicked) {
  const children = (structureGroup && structureGroup.children) ? structureGroup.children : [];
  const pickedSet = new Set();
  if (Array.isArray(alreadyPicked)) {
    for (const it of alreadyPicked) {
      const m = it && it.mesh;
      const id = m && m.userData && m.userData.beamInfo ? m.userData.beamInfo.id : null;
      if (id) pickedSet.add(id);
    }
  }

  // Agrupar extras por “tipo” para evitar páginas repetidas.
  // key = _beamTypeKey(kind,levels,longitud)
  const byType = new Map();
  for (const obj of children) {
    if (!obj || !obj.userData || !obj.userData.beamInfo) continue;
    if (!obj.userData.isBeam) continue;
    const info = obj.userData.beamInfo;
    const id = info.id || null;
    if (id && pickedSet.has(id)) continue;

    const kind = info.kind || 'edge';
    const aKey = info.aKey || '';
    const bKey = info.bKey || '';
    const touchesX = (typeof aKey === 'string' && aKey.indexOf('X:') === 0) || (typeof bKey === 'string' && bKey.indexOf('X:') === 0);

    // Considerar como "extra" todo lo que NO sea una arista base, o que toque un conector de interseccion.
    if (kind !== 'edge' || touchesX) {
      const typeKey = BeamPDFReporter._beamCountKey(info, obj);
      if (!typeKey) continue;

      // Elegimos un representante estable: el más largo (mejor vista en PDF)
      const len = this._beamLengthWorld(obj);
      const prev = byType.get(typeKey);
      if (!prev || (Number.isFinite(len) && len > prev.len)) {
        byType.set(typeKey, {
          mesh: obj,
          len,
          kVisible: (Number.isFinite(info.kVisible) ? info.kVisible : this._parseK(obj.name)),
          _typeKey: typeKey
        });
      }
      if (id) pickedSet.add(id);
    }
  }

  const extra = [...byType.values()].map(v => ({ mesh: v.mesh, kVisible: v.kVisible, _typeKey: v._typeKey }));

  // Orden estable: primero por (kLo,kHi) y luego por longitud
  extra.sort((A, B) => {
    const ia = A && A.mesh && A.mesh.userData ? A.mesh.userData.beamInfo : null;
    const ib = B && B.mesh && B.mesh.userData ? B.mesh.userData.beamInfo : null;
    const pa = ia ? BeamPDFReporter._normalizeConnPair(ia) : null;
    const pb = ib ? BeamPDFReporter._normalizeConnPair(ib) : null;
    if (pa && pb) {
      if (pa.kLo !== pb.kLo) return pa.kLo - pb.kLo;
      if (pa.kHi !== pb.kHi) return pa.kHi - pb.kHi;
    }
    const la = BeamPDFReporter._beamLengthWorld(A.mesh);
    const lb = BeamPDFReporter._beamLengthWorld(B.mesh);
    if (Number.isFinite(la) && Number.isFinite(lb) && la !== lb) return la - lb;
    return 0;
  });

  return extra;
}

  static _parseK(name) {
    const m = /beam_k(\d+)_/i.exec(name);
    return m ? Number(m[1]) : NaN;
  }

  static _parseKFromConnName(name) {
    if (typeof name !== 'string') return NaN;
    const m = /^k(\d+)$/i.exec(name.trim());
    return m ? Number(m[1]) : NaN;
  }

  // Parseo robusto desde keys internas (beamInfo.aKey/bKey)
  // - k#_i# => k
  // - pole_low / pole_top
  // - X:k:i => k (nivel del rombo)
  static _parseKFromKey(key) {
    if (typeof key !== 'string') return NaN;
    if (key === 'pole_low') return 0;
    if (key === 'pole_top') return state.N;
    let m = /^k(\d+)_i(\d+)$/i.exec(key);
    if (m) return Number(m[1]);
    m = /^X:(\d+):(\d+)$/i.exec(key);
    if (m) return Number(m[1]);
    return NaN;
  }

  /**
   * Normaliza el par de conectores para que quede (kLo <-> kHi).
   * Retorna tambien que extremo (a/b) corresponde a cada lado.
   */
  static _normalizeConnPair(info) {
    // Preferir claves internas (soportan polos y conectores X)
    const aKey = info ? info.aKey : null;
    const bKey = info ? info.bKey : null;
    let kA = this._parseKFromKey(aKey);
    let kB = this._parseKFromKey(bKey);

    // Fallback: nombres legacy "k#"
    if (!Number.isFinite(kA) || !Number.isFinite(kB)) {
      const aName = info && info.a ? info.a.name : null;
      const bName = info && info.b ? info.b.name : null;
      kA = this._parseKFromConnName(aName);
      kB = this._parseKFromConnName(bName);
    }

    if (!Number.isFinite(kA) || !Number.isFinite(kB)) return null;
    if (kA <= kB) {
      return { kLo: kA, kHi: kB, nameLo: `k${kA}`, nameHi: `k${kB}`, keyLo: 'a', keyHi: 'b' };
    }
    return { kLo: kB, kHi: kA, nameLo: `k${kB}`, nameHi: `k${kA}`, keyLo: 'b', keyHi: 'a' };
  }

  /**
   * Fuerza que el eje e apunte de (kLo) -> (kHi) para que el reporte siempre
   * muestre izquierda = nivel mas abajo, derecha = nivel mas arriba.
   * Mantiene base coherente (e y w se invierten juntos).
   */
  static _ensureBasisDirectionByLevels(basis, info, pair) {
    if (!basis || !info || !info.a || !info.b || !info.a.pos || !info.b.pos || !pair) return basis;

    const uA = info.a.pos.dot(basis.e);
    const uB = info.b.pos.dot(basis.e);
    // Si el extremo "lo" (mas abajo) queda a la derecha, invertimos.
    const loIsA = pair.keyLo === 'a';
    const loU = loIsA ? uA : uB;
    const hiU = loIsA ? uB : uA;

    if (loU > hiU) {
      basis.e.multiplyScalar(-1);
      if (basis.w) basis.w.multiplyScalar(-1);
    }
    return basis;
  }

  static _beamLengthWorld(mesh) {
    const info = (mesh && mesh.userData && mesh.userData.beamInfo) ? mesh.userData.beamInfo : null;
    if (info && info.a && info.b && info.a.pos && info.b.pos) return info.a.pos.distanceTo(info.b.pos);
    // Fallback: bbox
    if (mesh && mesh.geometry) {
      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox;
      if (bb) return bb.max.distanceTo(bb.min);
    }
    return 0;
  }

  static _addCover(doc) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('ZValdivia - Reporte de Vigas (Estructura)', 105, 30, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);

    // K visibles segun logica de la app:
    // - Con corte activo: N - cutLevel (ej: N=11, cut=4 => 7)
    // - Sin corte: K visibles = N (no N+1)
    const kVis = state.cutActive ? (state.N - state.cutLevel) : (state.N);
    const floorDiameter = state.cutActive ? state.floorDiameter : state.Dmax;
    const visibleHeight = state.cutActive ? (state.Htotal - state.cutLevel * state.h1) : state.Htotal;

    const lines = [
      `N = ${state.N}`,
      `K visibles = ${kVis}`,
      `Dmax = ${state.Dmax.toFixed(3)} m`,
      `Diametro del piso = ${floorDiameter.toFixed(3)} m`,
      `Altura total visible = ${visibleHeight.toFixed(3)} m`,
      `Angulo a = ${state.aDeg.toFixed(2)}°`,
      // Mostrar solo niveles visibles (K). Con corte activo, el suelo visible se considera K=0.
      state.cutActive ? 'Corte activo: suelo en K=0 (vista: z=0)' : 'Corte inactivo',
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
    doc.text('Creado por app ZValdivia', 20, y);
    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text('Autor: Michael Valdivia', 24, y); y += 7;
    doc.text('michaelvaldiviamunoz@gmail.com', 24, y); y += 7;
    doc.text('Chile', 24, y);
  }

  static _beamCountsByLevel() {
    const N = Number(state.N) || 0;
    const kVis = state.cutActive ? (state.N - state.cutLevel) : (state.N);
    const lines = [];

    if (kVis <= 0 || N <= 0) {
      return { lines: ['(No disponible)'], total: 0, kVis };
    }

    const firstLabel = state.cutActive ? 'k0 (suelo)' : 'k0 (polo)';
    const lastLabel = `k${kVis - 1} (polo)`;

    // Nivel inferior visible
    lines.push(`${firstLabel}: ${N}`);

    // Niveles intermedios visibles
    if (kVis > 2) {
      lines.push(`k1 .. k${kVis - 2}: ${2 * N} c/u (total ${2 * N * (kVis - 2)})`);
    }

    // Nivel superior visible (polo)
    if (kVis > 1) {
      lines.push(`${lastLabel}: ${N}`);
    }

    const total = (kVis === 1)
      ? N
      : (2 * N) + (kVis > 2 ? (2 * N * (kVis - 2)) : 0);
    lines.push(`Total vigas visibles: ${total}`);
    return { lines, total, kVis };
  }

  static async _addBeamPage(doc, item, pageIndex, sceneManager, beamCountMap) {
    const margin = 14;
    const x0 = margin;
    const y0 = margin;

    // Titulo de la app (arriba a la derecha)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('ZValdivia 3D', 210 - margin, y0, { align: 'right' });

    const mesh = item.mesh;
    const info = (mesh && mesh.userData && mesh.userData.beamInfo) ? mesh.userData.beamInfo : {};

    // Normalizar conectores para que el reporte sea consistente:
    // izquierda = nivel mas abajo (kLo), derecha = nivel mas arriba (kHi)
    const pair = this._normalizeConnPair(info);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    // Cantidad REAL de instancias de este tipo de viga en la estructura visible.
    // Importante:
    // - Se deduplica por endpoints para evitar inflar conteos cuando existen meshes duplicados.
    // - El tipo incluye la longitud (mm) para NO mezclar tramos cortos (ej. hacia X/intersección)
    //   con la viga “larga” normal del mismo par de niveles.
    let unitsCount = 1;
    if (pair && Number.isFinite(pair.kLo) && Number.isFinite(pair.kHi) && beamCountMap instanceof Map) {
      const key = BeamPDFReporter._beamCountKey(info, mesh);
      const real = key ? beamCountMap.get(key) : null;
      if (Number.isFinite(real) && real > 0) unitsCount = real;
    }

    doc.text(`Viga k${item.kVisible} (${unitsCount} unidades)`, x0, y0);
    doc.setFontSize(11);

    
// Conectividad:
// - Vigas base: mostrar solo niveles visibles (k# <-> k#).
// - Vigas extra (diagonales / tramos hacia X): mostrar conectores completos (k#_i# / X:K:I) en niveles visibles.
let connA = 'k?';
let connB = 'k?';
const kind = (info && info.kind) ? String(info.kind) : 'edge';
const aKey = (info && typeof info.aKey === 'string') ? info.aKey : '';
const bKey = (info && typeof info.bKey === 'string') ? info.bKey : '';
const touchesX = (aKey.startsWith('X:') || bKey.startsWith('X:')) ? 1 : 0;
const isExtra = (kind !== 'edge') || touchesX === 1;

if (isExtra) {
  connA = BeamPDFReporter._formatConnectorKeyVisible(aKey);
  connB = BeamPDFReporter._formatConnectorKeyVisible(bKey);
} else if (pair && Number.isFinite(pair.kLo) && Number.isFinite(pair.kHi)) {
  const kLoVis = BeamPDFReporter._toVisibleK(pair.kLo);
  const kHiVis = BeamPDFReporter._toVisibleK(pair.kHi);
  connA = `k${kLoVis}`;
  connB = `k${kHiVis}`;
} else {
  connA = (info && info.a && info.a.name) ? info.a.name : 'k?';
  connB = (info && info.b && info.b.name) ? info.b.name : 'k?';
}


    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    // Etiqueta de conectividad (incluye IDs de conectores si existen)
    doc.text(`Conecta: ${connA} <-> ${connB}`, x0, y0 + 12);

    // Dimensiones
    const widthMm = Number.isFinite(info.widthMm) ? info.widthMm : null;
    const heightMm = Number.isFinite(info.heightMm) ? info.heightMm : null;
    const lenMm = Math.round(this._beamLengthWorld(mesh) * 1000);
    const dimLine = `L = ${lenMm} mm${widthMm != null ? `, Ancho = ${widthMm} mm` : ''}${heightMm != null ? `, Alto = ${heightMm} mm` : ''}`;
    doc.text(dimLine, x0, y0 + 18);

    // Obtener vertices (world)
    const vertsW = this._getBeamVerticesWorld(mesh);
    if (!vertsW) {
      doc.setFontSize(11);
      doc.text('   No se pudo leer la geometria de la viga.', x0, y0 + 26);
      return;
    }

    // Base local (x=e, y=w, z=t)
    // Importante:
    //   w = eje de ANCHO (valor que el usuario ingresa)
    //   t = eje de ALTO  (valor que el usuario ingresa)
    // Esto debe mantenerse estable para no afectar la vista lateral (Largo vs Alto).
    const basis = this._computeBeamBasis(vertsW, info, { widthMm, heightMm });
    if (!basis) {
      doc.setFontSize(11);
      doc.text('   No se pudo calcular el sistema local de la viga.', x0, y0 + 26);
      return;
    }

    // Forzar orientacion izquierda->derecha por niveles (kLo -> kHi)
    this._ensureBasisDirectionByLevels(basis, info, pair);

    // Punto de referencia sobre la arista del zonohedro (cara exterior).
    // Normalmente es el punto medio entre conectores A/B.
    const edgeMid = (info && info.a && info.b && info.a.pos && info.b.pos)
      ? info.a.pos.clone().add(info.b.pos).multiplyScalar(0.5)
      : null;

    // Etiquetas en los dibujos: DEBEN ser consistentes con la conectividad mostrada bajo el titulo.
    // - Niveles visibles siempre.
    // - Para vigas extra (diagonales / tramos hacia X): mostrar conectores completos (k#_i# / X:K:I) en niveles visibles.
    const dispA = isExtra ? BeamPDFReporter._formatConnectorKeyVisible(aKey) : (pair && Number.isFinite(pair.kLo) ? `k${BeamPDFReporter._toVisibleK(pair.kLo)}` : connA);
    const dispB = isExtra ? BeamPDFReporter._formatConnectorKeyVisible(bKey) : (pair && Number.isFinite(pair.kHi) ? `k${BeamPDFReporter._toVisibleK(pair.kHi)}` : connB);

    // izquierda = extremo de menor nivel (kLo), derecha = mayor (kHi)
    // Nota: para vigas base del zonohedro (kind='edge'), dispA/dispB YA están ordenados como (kLo)->(kHi).
    // Para vigas extra (diagonales/tramos a X), mantenemos el orden real A/B para que el nombre del conector sea el correcto.
    let leftLabel;
    let rightLabel;
    if (!isExtra && pair && Number.isFinite(pair.kLo) && Number.isFinite(pair.kHi) && pair.kLo !== pair.kHi) {
      leftLabel = dispA;   // k menor (visible)
      rightLabel = dispB;  // k mayor (visible)
    } else {
      leftLabel = pair ? (pair.keyLo === 'a' ? dispA : dispB) : dispA;
      rightLabel = pair ? (pair.keyHi === 'a' ? dispA : dispB) : dispB;
    }

    // Ang(d): angulo en cada extremo segun el conector que quede a la izquierda/derecha
    const aAng = Number.isFinite(info.angAdeg) ? info.angAdeg : null;
    const bAng = Number.isFinite(info.angBdeg) ? info.angBdeg : null;
    const leftAng = pair ? (pair.keyLo === 'a' ? aAng : bAng) : aAng;
    const rightAng = pair ? (pair.keyHi === 'a' ? aAng : bAng) : bAng;// Layout de vistas
    const mainBox = { x: 14, y: 42, w: 132, h: 72 };
    const isoBox = { x: 152, y: 42, w: 44, h: 44 };
    const zomeBox = { x: 152, y: 92, w: 44, h: 36 };
    const sideBox = { x: 14, y: 132, w: 182, h: 60 };

    // Vista principal: planta (Largo x Ancho) con biseles visibles (lineas ocultas en discontinua)
    this._drawBeamPlanBevel(doc, vertsW, basis, {
      box: mainBox,
      title: 'Vista ortogonal - Planta (ancho externo)',
      leftLabel,
      rightLabel,
      leftAng,
      rightAng,
      // Dimensiones declaradas (ayudan a identificar el eje de "ancho" aun si el orden de vertices varia)
      widthMm,
      heightMm,
      // Punto de referencia en la arista del zonohedro para identificar cara exterior
      edgeMidWorld: edgeMid,
    });

    // Vista isometrica (sin ocultas)
    this._drawBeamIsometric(doc, vertsW, basis, isoBox, { leftLabel, rightLabel, edgeMidWorld: edgeMid });

    // Titulo miniatura ubicacion
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Ubicacion de la viga', zomeBox.x, zomeBox.y - 1);


    // Vista vertical del zome (igual al PDF de rombos) + flecha indicando el nivel
    if (sceneManager && sceneManager.scene && sceneManager.renderer) {
      await this._drawZomeVerticalView(doc, sceneManager, zomeBox, item, vertsW);
    } else {
      // Fallback: solo etiqueta si no hay escena disponible
      doc.setFontSize(9);
      doc.text(`Nivel: k${item.kVisible}`, zomeBox.x, zomeBox.y + 4);
    }

    // Vista lateral: Largo vs Alto
    // Requisito: la linea superior debe corresponder a la cara exterior
    // (la que pasa por la arista del zonohedro). Para eso forzamos el signo
    // del eje vertical (t) segun el punto medio de la arista.
    let vAxisSide = basis.t.clone();
    if (edgeMid) {
      let mn = Infinity, mx = -Infinity;
      for (const v of vertsW) {
        const s = v.dot(vAxisSide);
        if (s < mn) mn = s;
        if (s > mx) mx = s;
      }
      const sEdge = edgeMid.dot(vAxisSide);
      // Si la arista esta mas cerca del minimo, esa es la cara exterior.
      // Queremos que esa cara quede "arriba" en papel => v grande.
      if (Math.abs(sEdge - mn) < Math.abs(sEdge - mx)) {
        vAxisSide.multiplyScalar(-1);
      }
    }

    this._drawBeamView(doc, vertsW, basis, {
      viewDir: basis.w.clone(),
      uAxis: basis.e,
      vAxis: vAxisSide,
      box: sideBox,
      title: 'Vista lateral - Largo vs Alto',
      showDashedHidden: true,
      leftLabel,
      rightLabel,
      leftAng,
      rightAng,
    });
  }

  static _getBeamVerticesWorld(mesh) {
    const uv = (mesh && mesh.userData) ? mesh.userData.objVertices : null;
    if (Array.isArray(uv) && uv.length === 8) return uv.map(v => v.clone());

    // Fallback: leer posiciones de BufferGeometry (8 vertices)
    const pos = (mesh && mesh.geometry && typeof mesh.geometry.getAttribute === 'function')
      ? mesh.geometry.getAttribute('position')
      : null;
    if (!pos || pos.count < 8) return null;
    const out = [];
    for (let i = 0; i < 8; i++) {
      out.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
    }
    return out;
  }

    static _computeBeamBasis(vertsW, info = null, dims = null) {
    if (!vertsW || vertsW.length < 4) return null;

    // ---------------------------------------------
    // SISTEMA CANONICO (infalible incluso si ancho==alto)
    //  X = eje de la arista/viga (largo)
    //  Y = ancho (en la cara que contiene la arista del zonohedro)
    //  Z = normal de esa cara (alto), orientada de modo que el interior quede con Z negativo
    // ---------------------------------------------

    // Extremos de la arista del zonohedro (en mundo)
    const A = (info && info.a && info.a.pos && info.a.pos.isVector3) ? info.a.pos.clone() : null;
    const B = (info && info.b && info.b.pos && info.b.pos.isVector3) ? info.b.pos.clone() : null;

    // Eje largo (X)
    let e = null;
    if (info && info.edgeDir && info.edgeDir.isVector3) {
      e = info.edgeDir.clone();
      if (e.lengthSq() < 1e-12) e = null;
    }
    if (!e && A && B) {
      e = new THREE.Vector3().subVectors(B, A);
    }
    if (!e) {
      // Fallback: par de vertices mas alejados
      let bestI = 0, bestJ = 1, bestD2 = -1;
      for (let i = 0; i < vertsW.length; i++) {
        for (let j = i + 1; j < vertsW.length; j++) {
          const d2 = vertsW[i].distanceToSquared(vertsW[j]);
          if (d2 > bestD2) { bestD2 = d2; bestI = i; bestJ = j; }
        }
      }
      e = new THREE.Vector3().subVectors(vertsW[bestJ], vertsW[bestI]);
    }
    if (e.lengthSq() < 1e-12) return null;
    e.normalize();

    // Centroide de la viga
    const c = new THREE.Vector3();
    for (const v of vertsW) c.add(v);
    c.multiplyScalar(1 / vertsW.length);

    // Helper: distancia^2 punto->recta AB (eje e)
    const dist2ToLineAB = (p) => {
      const base = A ? A : c;
      const d = new THREE.Vector3().subVectors(p, base);
      const proj = e.clone().multiplyScalar(d.dot(e));
      return d.sub(proj).lengthSq();
    };

    // ---------------------------------------------
    // 1) Detectar la cara que contiene la arista
//    Si el generador entrega la cara exterior (LxW) en info.faces.outer, la usamos directamente.
let faceIdx = null;
if (info && info.faces && Array.isArray(info.faces.outer) && info.faces.outer.length === 4) {
  faceIdx = info.faces.outer.slice();
} else if (vertsW.length >= 8) {
  const idx = [...Array(vertsW.length).keys()];
  idx.sort((i, j) => dist2ToLineAB(vertsW[i]) - dist2ToLineAB(vertsW[j]));
  faceIdx = idx.slice(0, 4);
} else {
  faceIdx = [0, 1, 2, 3].slice(0, Math.min(4, vertsW.length));
}

const facePts = faceIdx.map(i => vertsW[i]);

    // Centro de la cara exterior
    const faceCenter = new THREE.Vector3();
    for (const p of facePts) faceCenter.add(p);
    faceCenter.multiplyScalar(1 / facePts.length);

    // ---------------------------------------------
    // 2) Normal robusta de esa cara (Z)
    //    Elegimos 3 puntos no colineales de la cara (maxima estabilidad)
    // ---------------------------------------------
    const p0 = facePts[0];
    let p1 = facePts[1];
    let bestD2 = -1;
    for (const p of facePts) {
      const d2 = p0.distanceToSquared(p);
      if (d2 > bestD2) { bestD2 = d2; p1 = p; }
    }

    // p2: el que maximiza la distancia a la recta p0->p1
    const v01 = new THREE.Vector3().subVectors(p1, p0);
    const v01n = v01.clone();
    if (v01n.lengthSq() < 1e-12) v01n.set(1, 0, 0);
    v01n.normalize();

    let p2 = null;
    let bestDLine = -1;
    for (const p of facePts) {
      const d = new THREE.Vector3().subVectors(p, p0);
      const proj = v01n.clone().multiplyScalar(d.dot(v01n));
      const dLine = d.sub(proj).lengthSq();
      if (dLine > bestDLine) { bestDLine = dLine; p2 = p; }
    }
    if (!p2) p2 = facePts[2] || facePts[1];

    let z = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(p1, p0),
      new THREE.Vector3().subVectors(p2, p0)
    );

    // Asegurar z   e (por seguridad numerica)
    z.sub(e.clone().multiplyScalar(z.dot(e)));
    if (z.lengthSq() < 1e-12) {
      // Fallback suave: PCA transversal en el plano   e
      // (solo para evitar null; en la practica A/B + cara valida evita caer aqui)
      const pts2 = vertsW.map(p => {
        const u = p.dot(e);
        const pp = p.clone().sub(e.clone().multiplyScalar(u));
        return pp;
      });
      // tomar 2 direcciones con mayor varianza usando la mayor distancia par a par
      let i0 = 0, j0 = 1, dmax = -1;
      for (let i = 0; i < pts2.length; i++) {
        for (let j = i + 1; j < pts2.length; j++) {
          const d2 = pts2[i].distanceToSquared(pts2[j]);
          if (d2 > dmax) { dmax = d2; i0 = i; j0 = j; }
        }
      }
      const yTmp = new THREE.Vector3().subVectors(pts2[j0], pts2[i0]);
      if (yTmp.lengthSq() < 1e-12) return null;
      yTmp.normalize();
      z = new THREE.Vector3().crossVectors(e, yTmp);
      if (z.lengthSq() < 1e-12) return null;
    }

    z.normalize();

    // ---------------------------------------------
    // 3) Orientar Z para que el interior quede con Z negativo
    //    vin = (centro viga) - (centro cara exterior) apunta hacia adentro
    //    Queremos dot(vin, z) < 0  => interior en -z
    // ---------------------------------------------
    const vin = new THREE.Vector3().subVectors(c, faceCenter);
    if (vin.dot(z) > 0) z.multiplyScalar(-1);

    // ---------------------------------------------
    // 4) Eje Y: dentro de la cara exterior y perpendicular a X
    // ---------------------------------------------
    const w = new THREE.Vector3().crossVectors(z, e);
    if (w.lengthSq() < 1e-12) return null;
    w.normalize();

    // Re-ortonormalizar X para evitar deriva numerica
    const e2 = new THREE.Vector3().crossVectors(w, z);
    if (e2.lengthSq() < 1e-12) return null;
    e2.normalize();

    return {
      e: e2,
      w,
      t: z,           // "alto" / normal de la cara exterior
      c,
      faceCenter,     // util si quieres anclar z=0 en el futuro
      z0: faceCenter.dot(z),
    };
  }


  static _orderEndpointsByE(info, eAxis) {
    const aPos = (info && info.a) ? info.a.pos : null;
    const bPos = (info && info.b) ? info.b.pos : null;
    const aName = (info && info.a && info.a.name) ? info.a.name : 'k?';
    const bName = (info && info.b && info.b.name) ? info.b.name : 'k?';
    if (!aPos || !bPos) return { leftName: aName, rightName: bName, leftKey: 'a', rightKey: 'b' };

    const d = bPos.clone().sub(aPos);
    // Si b esta hacia +e => a izquierda, b derecha
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
   * Construye 2 ejes candidatos en el plano   e (seccion transversal),
   * usando aristas reales de la geometria de la viga.
   *
   * Evita depender del orden fijo de vertices (0-1 / 4-5), que en algunas vigas
   * puede corresponder a otra direccion y colapsar la planta.
   */
  static _computeCrossSectionAxesFromEdges(vertsW, eAxis) {
    const e = eAxis.clone().normalize();
    const edges = this._edges();
    const cand = [];
    for (const [i0, i1] of edges) {
      const v = new THREE.Vector3().subVectors(vertsW[i1], vertsW[i0]);
      // proyectar al plano perpendicular a e
      const vp = v.sub(e.clone().multiplyScalar(v.dot(e)));
      const lsq = vp.lengthSq();
      if (lsq > 1e-12) cand.push({ dir: vp.normalize(), len: Math.sqrt(lsq) });
    }
    if (cand.length === 0) return null;

    // ordenar por largo proyectado (preferimos aristas puras de seccion)
    cand.sort((a, b) => b.len - a.len);

    const a = cand[0].dir.clone();
    let b = null;
    for (let i = 1; i < cand.length; i++) {
      const d = Math.abs(cand[i].dir.dot(a));
      if (d < 0.80) { // no casi-paralelo
        b = cand[i].dir.clone();
        break;
      }
    }
    if (!b) {
      // fallback: eje cualquiera perpendicular a e y a
      b = new THREE.Vector3().crossVectors(e, a);
      if (b.lengthSq() < 1e-12) b = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), a);
    }

    // ortonormalizar b respecto a a
    b.sub(a.clone().multiplyScalar(b.dot(a)));
    if (b.lengthSq() < 1e-12) {
      b = new THREE.Vector3().crossVectors(e, a);
      if (b.lengthSq() < 1e-12) return null;
    }
    b.normalize();

    // asegurar consistencia de mano derecha (a,b,e)
    const right = new THREE.Vector3().crossVectors(a, b);
    if (right.dot(e) < 0) b.multiplyScalar(-1);

    return { a, b };
  }

  /**
   * Decide cual eje transversal corresponde al "ancho" (planta) usando:
   * - widthMm/heightMm si existen (preferimos el eje cuyo span se acerque a width)
   * - o, si no existen, el menor span como ancho (tipico: ancho < alto)
   */
  static _pickWidthAxisForPlan(vertsW, eAxis, widthMm, heightMm) {
    const axes = this._computeCrossSectionAxesFromEdges(vertsW, eAxis);
    if (!axes) return null;

    const spanAlong = (axis) => {
      let mn = Infinity, mx = -Infinity;
      for (const v of vertsW) {
        const s = v.dot(axis);
        mn = Math.min(mn, s);
        mx = Math.max(mx, s);
      }
      return Math.max(0, mx - mn);
    };

    const a = axes.a.clone();
    const b = axes.b.clone();
    const spanA = spanAlong(a);
    const spanB = spanAlong(b);

    const wT = Number.isFinite(widthMm) ? (widthMm / 1000) : null;
    const hT = Number.isFinite(heightMm) ? (heightMm / 1000) : null;

    if (wT != null) {
      const dA = Math.abs(spanA - wT);
      const dB = Math.abs(spanB - wT);
      return (dA <= dB) ? a : b;
    }
    if (hT != null) {
      const dA = Math.abs(spanA - hT);
      const dB = Math.abs(spanB - hT);
      return (dA <= dB) ? b : a;
    }
    return (spanA <= spanB) ? a : b;
  }

  /**
   * Vista en planta (u=eje de viga, v=ancho), mostrando bisel por lineas de corte:
   * - Contorno visible: cara exterior (t=min)
   * - Linea oculta (discontinua): interseccion del bisel con la cara interior (t=max)
   *
   * Esta vista coincide con la referencia del usuario: el "ancho" queda en planta
   * y el bisel se ve como lineas internas (ocultas) cerca de los extremos.
   */
  static _drawBeamPlanBevel(doc, vertsW, basis, opts) {
    const { box, title, leftLabel, rightLabel, leftAng, rightAng } = opts;

    // Margen interno del area de dibujo (mm en coordenadas del PDF)
    const pad = 7;

    const e = basis.e;

    // --- Planta canonica ---
    // La base ya viene fijada de manera determinista:
    //   e = largo (arista)
    //   w = ancho (en la cara que contiene la arista)
    //   t = alto  (normal de esa cara), orientada para que el interior quede con z < 0
    let wPlan = (basis && basis.w) ? basis.w.clone() : null;
    if (!wPlan) {
      // Fallback extremadamente raro
      wPlan = new THREE.Vector3(0, 1, 0);
      wPlan.sub(e.clone().multiplyScalar(wPlan.dot(e)));
      if (wPlan.lengthSq() < 1e-12) wPlan = new THREE.Vector3(1, 0, 0).cross(e);
    }
    wPlan.normalize();

     // Re-ortonormaliza base de planta (robusto): asegura w ⟂ e y t ⟂ {e,w}
     wPlan.sub(e.clone().multiplyScalar(wPlan.dot(e)));
     if (wPlan.lengthSq() < 1e-12) wPlan = new THREE.Vector3(1, 0, 0).cross(e);
     wPlan.normalize();

     // Eje de profundidad (alto) de planta: normal de la cara exterior (re-ortonormalizada)
     let t = (basis && basis.t) ? basis.t.clone() : new THREE.Vector3().crossVectors(wPlan, e);
     // Quitar componentes sobre e y wPlan
     t.sub(e.clone().multiplyScalar(t.dot(e)));
     t.sub(wPlan.clone().multiplyScalar(t.dot(wPlan)));
     if (t.lengthSq() < 1e-12) t = new THREE.Vector3().crossVectors(wPlan, e);
     t.normalize();

     // Cierra la base: wPlan = t × e (evita drift numérico y desalineaciones en planta)
     wPlan = new THREE.Vector3().crossVectors(t, e).normalize();


    // Eje de profundidad (alto) de planta: normal de la cara exterior
     // (t ya calculado arriba, re-ortonormalizado)
// Proyeccion local para planta:
    //   u = e (largo),
    //   v = w (ancho),
    //   z = t (hacia adentro)
    const P = vertsW.map(v3 => ({ u: v3.dot(e), v: v3.dot(wPlan), z: v3.dot(t) }));

    // --- Seleccion dinamica de caras y extremos (NO depender del orden 0..7) ---
    // exterior/interior:
    // La cara exterior es la que pasa por la arista del zonohedro (conectores A/B).
    // Usamos edgeMidWorld (si existe) para decidir que lado de z corresponde a "exterior",
    // y evitamos invertir por signo del eje t.
    const idxAll = [0, 1, 2, 3, 4, 5, 6, 7];

    let outerIdx = null;
    let innerIdx = null;
	    if (opts && opts.edgeMidWorld && opts.edgeMidWorld.isVector3) {
      const zRef = opts.edgeMidWorld.dot(t);
      const byDist = idxAll.slice().sort((i, j) =>
        Math.abs(P[i].z - zRef) - Math.abs(P[j].z - zRef)
      );
      outerIdx = byDist.slice(0, 4);
      innerIdx = byDist.slice(4, 8);
    } else {
	      // Fallback: por profundidad z
	      // Convencion canonica: cara exterior => z mas alto; interior => z negativo.
	      const sortedByZ = idxAll.slice().sort((i, j) => P[i].z - P[j].z); // asc
	      innerIdx = sortedByZ.slice(0, 4);
	      outerIdx = sortedByZ.slice(4, 8);
    }

    // extremos: por u (eje largo)
    const sortedByU = idxAll.slice().sort((i, j) => P[i].u - P[j].u);
    const endAIdx = sortedByU.slice(0, 4); // extremo izquierdo (u menor)
    const endBIdx = sortedByU.slice(4, 8); // extremo derecho (u mayor)

    const intersect = (A, B) => A.filter(i => B.includes(i));
    let leftDash = intersect(innerIdx, endAIdx);
    let rightDash = intersect(innerIdx, endBIdx);

	    const pick2MostInner = (endIdx) => {
	      // Convencion canonica: interior => z mas NEGATIVO.
	      const s = endIdx.slice().sort((i, j) => P[i].z - P[j].z); // mas negativo primero
	      return s.slice(0, 2);
	    };
    if (leftDash.length !== 2) leftDash = pick2MostInner(endAIdx);
    if (rightDash.length !== 2) rightDash = pick2MostInner(endBIdx);

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

    // Titulo
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    // Un poco mas arriba para evitar que choque con las etiquetas (kX y Ang(d))
    doc.text(title, box.x, box.y - 6);

    // --- Vista rota (planta): tamano estable en papel ---
    // Regla: primero asegurar buen tamano (llenar altura disponible) manteniendo proporcion,
    // y luego omitir el cuerpo mostrando extremos + "...".
    // El largo visible de cada extremo en el PDF debe ser >= 2x el recorrido horizontal del bisel.

    // --- Escala y "vista rota" ancladas a los EXTREMOS ---
    // Cuando spanV es muy pequeno, scaleByV se dispara y el recorte puede comerse las lineas
    // discontinuas del bisel. Para evitarlo:
    //   1) medimos el recorrido horizontal real del bisel en cada extremo (en u)
    //   2) fijamos keepWorld = 2x ese recorrido (regla solicitada)
    //   3) limitamos la escala por el ancho disponible para que esos extremos quepan
    const scaleByV = (box.h - 2 * pad) / spanV;

    // Recorrido horizontal del bisel en cada extremo (mundo): rango de u dentro del extremo
    const endA_uMin = Math.min(...endAIdx.map(i => P[i].u));
    const endA_uMax = Math.max(...endAIdx.map(i => P[i].u));
    const endB_uMin = Math.min(...endBIdx.map(i => P[i].u));
    const endB_uMax = Math.max(...endBIdx.map(i => P[i].u));
    const bevelRunLeftW  = Math.max(1e-9, endA_uMax - endA_uMin);
    const bevelRunRightW = Math.max(1e-9, endB_uMax - endB_uMin);

    // Regla: largo de extremo = 2x recorrido horizontal del bisel (+ minimo absoluto)
    const minKeepWorldAbs = 0.08; // 80mm
    let keepWorld = Math.max(minKeepWorldAbs, 2 * bevelRunLeftW, 2 * bevelRunRightW);
    let broken = (spanU > (2 * keepWorld + 1e-9));
    if (!broken) keepWorld = spanU * 0.5;

    // Limitar escala por ancho para que los extremos no se recorten (prioriza extremos)
    const gapPaper = 6;
    const availW = Math.max(1, box.w - 2 * pad - gapPaper);
    const scaleByW = broken
      ? (availW / Math.max(1e-9, 2 * keepWorld))
      : (availW / Math.max(1e-9, spanU));
    let scale = Math.min(scaleByV, scaleByW);
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

    // Contorno visible: cara exterior (cuadrilatero ordenado en (u,v))
    const orderQuad = (idxArr) => {
      const cx = idxArr.reduce((s, i) => s + P[i].u, 0) / idxArr.length;
      const cy = idxArr.reduce((s, i) => s + P[i].v, 0) / idxArr.length;
      return idxArr.slice().sort((i, j) => {
        const ai = Math.atan2(P[i].v - cy, P[i].u - cx);
        const aj = Math.atan2(P[j].v - cy, P[j].u - cx);
        return ai - aj;
      });
    };
    const outOrd = orderQuad(outerIdx);
    for (let k = 0; k < outOrd.length; k++) {
      const i0 = outOrd[k];
      const i1 = outOrd[(k + 1) % outOrd.length];
      drawSeg(P[i0], P[i1], false);
    }

    // Lineas ocultas (discontinuas) que expresan el bisel en planta:
    // conectan los 2 vertices "internos" de cada extremo.
    doc.setDrawColor(60);
    doc.setLineWidth(0.35);
    drawSeg(P[leftDash[0]], P[leftDash[1]], true);
    drawSeg(P[rightDash[0]], P[rightDash[1]], true);
    doc.setLineDashPattern([], 0);

	    // No extender lineas del cuerpo: dejar el vacio central claro.
	
	    // Ellipsis SIEMPRE centrado en el vacio de la viga (zona omitida) y en el centro del ancho visible
    if (broken) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      // Centro horizontal: punto medio del espacio omitido entre extremos
      const midX = (xLeftEnd + xRightStart) / 2;
      // Centro vertical: mitad del ancho proyectado de la viga
      const midV = (minV + maxV) / 2;
      const midY = mapY(midV);
      doc.text('...', midX, midY, { align: 'center', baseline: 'middle' });
    }

    // Etiquetas de conectores + Ang(d) en extremos
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    // Bajar las etiquetas ligeramente para separar del titulo
    doc.text(String(leftLabel || ''), box.x, box.y + 0.5, { align: 'left' });
    doc.text(String(rightLabel || ''), box.x + box.w, box.y + 0.5, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (Number.isFinite(leftAng)) doc.text(`Ang(d) ${leftAng.toFixed(1)}°`, box.x, box.y + 4.5, { align: 'left' });
    if (Number.isFinite(rightAng)) doc.text(`Ang(d) ${rightAng.toFixed(1)}°`, box.x + box.w, box.y + 4.5, { align: 'right' });
  }

  
  static _drawBeamView(doc, vertsW, basis, opts) {
    const { viewDir, uAxis, vAxis, box, title, showDashedHidden, leftLabel, rightLabel, leftAng, rightAng } = opts;
    const edges = this._edges();

    // Proyeccion a 2D: u (horizontal), v (vertical); depth para decidir ocultas
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

    // Titulo
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    // Un poco mas arriba para no... 
    doc.text(title, box.x, box.y - 6);

    // Labels + Ang(d)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    if (leftLabel) doc.text(String(leftLabel), box.x, box.y + 0.5, { align: 'left' });
    if (rightLabel) doc.text(String(rightLabel), box.x + box.w, box.y + 0.5, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (Number.isFinite(leftAng)) doc.text(`Ang(d) ${leftAng.toFixed(1)}°`, box.x, box.y + 4.5, { align: 'left' });
    if (Number.isFinite(rightAng)) doc.text(`Ang(d) ${rightAng.toFixed(1)}°`, box.x + box.w, box.y + 4.5, { align: 'right' });

    // --- Vista rota (lateral): tamano estable en papel ---
    // Igual que en planta: priorizamos que los extremos se vean grandes y legibles.
    // El cuerpo se omite y se marca con "...".

    const pad = 7;
    const scaleByV = (box.h - 2 * pad) / spanV;
    let scale = scaleByV;

    // Extremos por u (sin asumir orden de indices)
    const idxAll = [0, 1, 2, 3, 4, 5, 6, 7];
    const byU = idxAll.slice().sort((i, j) => pts[i].u - pts[j].u);
    const endAIdx = byU.slice(0, 4);
    const endBIdx = byU.slice(4, 8);

    // Recorrido horizontal del bisel en cada extremo (mundo): rango de u dentro del extremo
    const endA_uMin = Math.min(...endAIdx.map(i => pts[i].u));
    const endA_uMax = Math.max(...endAIdx.map(i => pts[i].u));
    const endB_uMin = Math.min(...endBIdx.map(i => pts[i].u));
    const endB_uMax = Math.max(...endBIdx.map(i => pts[i].u));
    const bevelRunLeftW  = Math.max(1e-9, endA_uMax - endA_uMin);
    const bevelRunRightW = Math.max(1e-9, endB_uMax - endB_uMin);

    // Lateral: queremos extremos un poco mas largos para reducir el espacio en blanco
    const minKeepWorldAbs = 0.09; // 90mm
    let keepWorld = Math.max(minKeepWorldAbs, 2 * bevelRunLeftW, 2 * bevelRunRightW);
    keepWorld *= 1.15; // +15% (solo lateral)
    let broken = (spanU > (2 * keepWorld + 1e-9));
    if (!broken) keepWorld = spanU * 0.5;

    // Limitar escala por ancho para que los extremos quepan (prioriza extremos)
    const gapPaper = 6;
    const availW = Math.max(1, box.w - 2 * pad - gapPaper);
    const scaleByW = broken
      ? (availW / Math.max(1e-9, 2 * keepWorld))
      : (availW / Math.max(1e-9, spanU));
    scale = Math.min(scaleByV, scaleByW);

    const leftCutU = minU + keepWorld;
    const rightCutU = maxU - keepWorld;

    const xLeft0 = box.x + pad;
    const xRight0 = box.x + box.w - pad;

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

	    // No extender lineas del cuerpo: dejar el vacio central claro.

	    // Ellipsis SIEMPRE centrado en la caja (solo si break)
    if (broken) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
	      const midX = box.x + box.w / 2;
	      const midY = box.y + box.h / 2;
	      doc.text('...', midX, midY, { align: 'center', baseline: 'middle' });
    }
  }

static _drawBeamIsometric(doc, vertsW, basis, box, opts = {}) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Isometrica', box.x, box.y - 3);

    // Mantener solo el recuadro en isometrica
    doc.setDrawColor(120);
    doc.setLineWidth(0.2);
    doc.rect(box.x, box.y, box.w, box.h);

    // Etiqueta conectividad
    const isoLabel = (opts.leftLabel && opts.rightLabel) ? `${opts.leftLabel} <-> ${opts.rightLabel}` : '';
    if (isoLabel) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(isoLabel, box.x + box.w / 2, box.y + box.h - 2.5, { align: 'center' });
    }

    // Coordenadas locales: x = largo (e), y = ancho (w), z = alto.
// Nota: el signo del eje "z" debe ser estable: "arriba" debe corresponder a la cara exterior
// (la que pasa por la arista del zonohedro). Para evitar inversiones, elegimos el signo
// que deja el punto medio de la arista lo mas "arriba" posible dentro del rango de la viga.
const e = basis.e, w = basis.w, t = basis.t;

// Elegir signo de Z ( t) de manera determinista
let zSign = -1; // compatibilidad con la convencion previa (z = -dot(t))
if (opts && opts.edgeMidWorld) {
  const dots = vertsW.map(p => p.dot(t));
  const mn = Math.min(...dots);
  const mx = Math.max(...dots);
  const dMid = opts.edgeMidWorld.dot(t);

  // Evaluar ambas orientaciones y quedarnos con la que deja el punto medio mas cerca de "arriba" (posicion ~ 1)
  const span = Math.max(1e-9, mx - mn);
  const posNeg = ((-dMid) - (-mx)) / span; // cuando z = -dot(t): rango [-mx, -mn], arriba = max = -mn
  const posPos = (( dMid) - ( mn)) / span; // cuando z = +dot(t): rango [mn, mx], arriba = max = mx

  // Queremos la orientacion con mayor "posicion hacia arriba"
  // posNeg en [0,1] si dMid esta dentro; posPos tambien.
  if (posPos > posNeg) zSign = +1;
}

const ptsL = vertsW.map(p => ({
  x: p.dot(e),
  y: p.dot(w),
  z: zSign * p.dot(t),
}));

    // Proyeccion isometrica determinista (dibujo tecnico):
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
  static async _drawZomeVerticalView(doc, sceneManager, box, item, vertsW) {
    // Misma vista vertical (ortografica) usada en el PDF de rombos, pero insertada aqui
    // y con una flecha que marca el nivel al que pertenece la viga.

    // Captura ortografica lateral (XZ)
    const img = await this._captureZomeOrthoXZ(sceneManager);

    // Insertar imagen (no transparente, fondo blanco)
    doc.addImage(img, 'JPEG', box.x, box.y, box.w, box.h);

    // Recuadro (dibujar DESPUES de la imagen para que no quede "lavado")
    // y con la misma intensidad/estilo del recuadro de la isometrica.
    doc.setDrawColor(120);
    doc.setLineWidth(0.2);
    doc.rect(box.x, box.y, box.w, box.h);

    // Determinar altura (Z) representativa del NIVEL de la viga.
    // Importante: como las testas son biseladas, el centro geometrico no coincide necesariamente con
    // el plano de union con el conector. Para que la flecha caiga en el nivel correcto, cuantizamos
    // cada extremo al multiplo mas cercano de h1 (altura entre niveles) y luego tomamos el punto medio.
    if (!Array.isArray(vertsW) || vertsW.length !== 8) return;

    const cA = new THREE.Vector3();
    const cB = new THREE.Vector3();
    for (let i = 0; i < 4; i++) cA.add(vertsW[i]);
    for (let i = 4; i < 8; i++) cB.add(vertsW[i]);
    cA.multiplyScalar(1 / 4);
    cB.multiplyScalar(1 / 4);

    const beamInfo = (item && item.mesh && item.mesh.userData && item.mesh.userData.beamInfo) ? item.mesh.userData.beamInfo : {};
    const h1 = Math.max(1e-9, state.h1);
    const parseKName = (s) => {
      const m = /k(\d+)/i.exec(String(s || ''));
      return m ? Number(m[1]) : NaN;
    };

    // Preferimos el nombre de conector (k#) porque ya sigue la logica visible del usuario.
    const kNameA = parseKName((beamInfo && beamInfo.a) ? beamInfo.a.name : null);
    const kNameB = parseKName((beamInfo && beamInfo.b) ? beamInfo.b.name : null);

    // Fallback por Z del nodo (pos del conector) y, si no existe, por centroides de la viga.
    const zNodeA = (beamInfo && beamInfo.a && beamInfo.a.pos) ? beamInfo.a.pos.z : null;
    const zNodeB = (beamInfo && beamInfo.b && beamInfo.b.pos) ? beamInfo.b.pos.z : null;

    const kA = Number.isFinite(kNameA) ? kNameA : (Number.isFinite(zNodeA) ? Math.round(zNodeA / h1) : Math.round(cA.z / h1));
    const kB = Number.isFinite(kNameB) ? kNameB : (Number.isFinite(zNodeB) ? Math.round(zNodeB / h1) : Math.round(cB.z / h1));

    const kLo = Math.min(kA, kB);
    const kHi = Math.max(kA, kB);

    // Si ambos extremos estan en el mismo nivel (ej: viga del piso con corte activo), apuntamos a ese nivel.
    // Si no, apuntamos al punto medio entre niveles para indicar "entre kLo y kHi".
    const zMark = (kLo === kHi) ? (kLo * h1) : (0.5 * ((kLo + kHi) * h1));
    if (!Number.isFinite(zMark)) return;

    const levelLabel = (kLo === kHi) ? `k${kLo}` : `k${kLo} <-> k${kHi}`;

    // Mapear zMark al sistema de la camara ortografica usada en la captura
    const nivelesVisibles = state.cutActive ? (state.N - state.cutLevel) : state.N;
    const alturaVisible = state.h1 * nivelesVisibles;
    const frustumSize = state.Dmax * 1.5;
    const zCenter = alturaVisible / 2;
    const zMin = zCenter - frustumSize / 2;
    const zMax = zCenter + frustumSize / 2;

    const t = (zMark - zMin) / Math.max(1e-9, (zMax - zMin));
    const tClamped = Math.max(0, Math.min(1, t));
    const y = box.y + (1 - tClamped) * box.h;

    // Flecha (derecha -> izquierda)
    const xTail = box.x + box.w - 1.5;
    const xHead = box.x + box.w * 0.62;
    doc.setDrawColor(0);
    doc.setLineWidth(0.4);
    doc.line(xTail, y, xHead, y);

    // Cabeza de flecha
    const ah = 2.2;
    doc.line(xHead, y, xHead + ah, y - ah * 0.7);
    doc.line(xHead, y, xHead + ah, y + ah * 0.7);

    // Etiqueta del nivel (k visible)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(levelLabel, box.x + box.w - 1.8, Math.max(box.y + 3.5, y - 1.2), { align: 'right' });
  }

  static async _captureZomeOrthoXZ(sceneManager) {
    const renderer = sceneManager && sceneManager.renderer;
    if (!renderer) throw new Error('renderer no disponible');

    //    IMPORTANTE: esta miniatura debe ser INDEPENDIENTE de los toggles del usuario
    // (caras/aristas/poligonos/estructura). Construimos una escena temporal solo con
    // caras solidas (gris) usando la misma logica geometrica del zonohedro.
    const tmpScene = new THREE.Scene();
    tmpScene.background = new THREE.Color(0xffffff);

    // Luces simples para sombreado solido (similar al reporte de rombos)
    // Un poco mas claro que antes (mejor legibilidad en PDF)
    tmpScene.add(new THREE.AmbientLight(0xffffff, 0.92));
    const dir = new THREE.DirectionalLight(0xffffff, 0.60);
    dir.position.set(2, -3, 4);
    tmpScene.add(dir);

    // Construir geometria de caras (rombos + tapa de corte) en coordenadas *visibles*
    const { N, h1, cutActive, cutLevel, Dmax } = state;
    const zShift = cutActive ? (-cutLevel * h1) : 0;
    const startK = cutActive ? cutLevel : 1;
    const positions = [];

    for (let k = startK; k <= N - 1; k++) {
      for (let i = 0; i < N; i++) {
        let idxL, idxR;
        if (k % 2 === 1) {
          idxL = i;
          idxR = (i + 1) % N;
        } else {
          idxL = (i - 1 + N) % N;
          idxR = i;
        }

        const vLeft = getRingVertex(k, idxL);
        const vRight = getRingVertex(k, idxR);

        if (cutActive && k === cutLevel) {
          const vTop = getRingVertex(k + 1, i);
          positions.push(
            vLeft.x, vLeft.y, vLeft.z + zShift,
            vRight.x, vRight.y, vRight.z + zShift,
            vTop.x, vTop.y, vTop.z + zShift
          );
        } else {
          const vBottom = getRingVertex(k - 1, i);
          const vTop = getRingVertex(k + 1, i);

          // Dos triangulos por rombo (misma triangulacion que createRhombi)
          positions.push(
            vBottom.x, vBottom.y, vBottom.z + zShift,
            vRight.x, vRight.y, vRight.z + zShift,
            vLeft.x, vLeft.y, vLeft.z + zShift,

            vTop.x, vTop.y, vTop.z + zShift,
            vLeft.x, vLeft.y, vLeft.z + zShift,
            vRight.x, vRight.y, vRight.z + zShift
          );
        }
      }
    }

    // Tapa del plano de corte (para que el "suelo" exista incluso si el usuario desactivo caras)
    if (cutActive) {
      const z0 = (cutLevel * h1) + zShift; // debe quedar en 0
      const center = new THREE.Vector3(0, 0, z0);
      for (let i = 0; i < N; i++) {
        const a = getRingVertex(cutLevel, i);
        const b = getRingVertex(cutLevel, (i + 1) % N);
        positions.push(
          center.x, center.y, center.z,
          a.x, a.y, a.z + zShift,
          b.x, b.y, b.z + zShift
        );
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.computeVertexNormals();

    const solidMat = new THREE.MeshLambertMaterial({
      // Mas claro (menos "gris pesado")
      color: 0xF2F2F2,
      side: THREE.DoubleSide,
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      // Empuja levemente las caras hacia atras para que las aristas se vean nitidas
      // sin z-fighting.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });

    const solidMesh = new THREE.Mesh(g, solidMat);
    tmpScene.add(solidMesh);

    // Aristas para distinguir bien los rombos/caras (similar a la vista del PDF de rombos)
    // Usamos EdgesGeometry para NO dibujar la diagonal interna de la triangulacion.
    const edgesGeom = new THREE.EdgesGeometry(g, 1);
    const edgesMat = new THREE.LineBasicMaterial({ color: 0x3a3a3a });
    const edges = new THREE.LineSegments(edgesGeom, edgesMat);
    tmpScene.add(edges);

    // Guardar tamano actual del renderer
    const originalSize = new THREE.Vector2();
    renderer.getSize(originalSize);

    // Camara ortografica cuadrada
    const aspect = 1;
    const frustumSize = Dmax * 1.5;
    const orthoCamera = new THREE.OrthographicCamera(
      (frustumSize * aspect) / -2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      frustumSize / -2,
      0.1,
      2000
    );

    // Altura visible actual (igual a PDF de rombos)
    const nivelesVisibles = cutActive ? (N - cutLevel) : N;
    const alturaVisible = h1 * nivelesVisibles;

    // Vista lateral (desde -Y), centrada al medio de la altura visible
    orthoCamera.position.set(0, -Dmax * 3, alturaVisible / 2);
    orthoCamera.lookAt(0, 0, alturaVisible / 2);
    orthoCamera.up.set(0, 0, 1);

    // Guardar clear color
    const originalClear = renderer.getClearColor(new THREE.Color());
    const originalClearAlpha = renderer.getClearAlpha();

    renderer.setClearColor(0xffffff, 1);
    const renderSize = 900;
    renderer.setSize(renderSize, renderSize);
    renderer.render(tmpScene, orthoCamera);

    const imageData = renderer.domElement.toDataURL('image/jpeg', 0.80);

    // Restaurar
    renderer.setClearColor(originalClear, originalClearAlpha);
    renderer.setSize(originalSize.x, originalSize.y);

    // Liberar geometria
    g.dispose();
    solidMat.dispose();
    edgesGeom.dispose();
    edgesMat.dispose();

    return imageData;
  }

  static _tickStepMm(lengthMm) {
    if (lengthMm <= 400) return 25;
    if (lengthMm <= 900) return 50;
    if (lengthMm <= 2500) return 100;
    return 200;
  }
}

// Compat: avoid class static fields in older browsers
BeamPDFReporter._keysAreVisible = null;