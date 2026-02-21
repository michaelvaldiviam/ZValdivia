import * as THREE from 'three';
import { state } from './state.js';
import { getRingVertex } from './geometry.js';

/**
 * Analiza la topologia del zonohedro polar (vertices, aristas, caras) y
 * construye un "nodo representativo" por cada nivel K visible.
 *
 * Nota de diseno:
 * - Se trabaja en "coordenadas visibles": si hay corte, se traslada todo para
 *   que el plano de corte quede en z = 0 (tal como lo ve el usuario).
 * - Las normales de cara se orientan hacia el interior (inward).
 * - El "vector directriz" de un nodo es la suma normalizada de las normales inward
 *   de las caras incidentes al vertice (con deduplicacion por direccion).
 */
export class NodeAnalyzer {
  static buildVertexId(k, i) {
    // Polos: todos los indices i colapsan al mismo vertice (radio 0)
    if (k === 0 || k === state.N) return `K${k}_I0`;

    // Normalizar i dentro de [0, N-1]
    const ii = ((i % state.N) + state.N) % state.N;
    return `K${k}_I${ii}`;
  }

  

/**
 * ID de presentacion para el PDF:
 * - Sin corte: K coincide con el indice real (polo inferior K=0, polo superior K=N)
 * - Con corte: el suelo visible pasa a ser K=0 (Kvisible = Koriginal - cutLevel)
 */
static buildDisplayId(k, i, kVisible, minK, N, cutActive) {
  // Para el PDF de conectores, el nombre depende SOLO del nivel visible.
  // Ej: k0, k1, k2 ... (si hay corte, el suelo visible es k0).
  return `k${kVisible}`;
}


static _toVisibleK(kOriginal) {
  const cutActive = !!state.cutActive;
  const cutLevel = Number.isFinite(state.cutLevel) ? state.cutLevel : 0;
  return cutActive ? (kOriginal - cutLevel) : kOriginal;
}

static _toVisibleXId(faceId) {
  const parts = String(faceId).split(':');
  const kO = parseInt(parts[0], 10);
  const i = parseInt(parts[1], 10);
  const kV = this._toVisibleK(kO);
  return `X:${kV}:${i}`;
}

static parseVertexId(id) {
    // Conector de interseccion: X:k:i
    if (typeof id === 'string' && id.startsWith('X:')) {
      const m2 = /^X:(\d+):(\d+)$/.exec(id);
      if (!m2) return { type: 'X', faceId: id.substring(2) };
      return { type: 'X', faceId: `${parseInt(m2[1], 10)}:${parseInt(m2[2], 10)}` };
    }

    const m = /^K(\d+)_I(\d+)$/.exec(id);
    if (!m) return null;
    return { k: parseInt(m[1], 10), i: parseInt(m[2], 10) };
  }

  static getVisibleZShift() {
    return (state.cutActive ? state.cutLevel * state.h1 : 0);
  }

  static getVertexPositionVisible(k, i) {
    const ii = (k === 0 || k === state.N) ? 0 : i;
    const v = getRingVertex(k, ii);
    const zShift = this.getVisibleZShift();
    return new THREE.Vector3(v.x, v.y, v.z - zShift);
  }

  static getXPositionVisible(faceId) {
    // Centro del rombo (promedio de sus 4 vertices B,R,T,L) en coords visibles
    // faceId = "k:i" donde k es el nivel del rombo (k original) y i el indice del rombo.
    const parts = String(faceId).split(':');
    const k = parseInt(parts[0], 10);
    const i = parseInt(parts[1], 10);
    if (!isFinite(k) || !isFinite(i)) return new THREE.Vector3(0, 0, 0);

    // Reconstruir indices L/R segun la misma regla del rombo
    let idxL, idxR;
    if (k % 2 === 1) {
      idxL = i;
      idxR = (i + 1) % state.N;
    } else {
      idxL = (i - 1 + state.N) % state.N;
      idxR = i;
    }
    const vBottom = this.getVertexPositionVisible(k - 1, i);
    const vRight = this.getVertexPositionVisible(k, idxR);
    const vTop = this.getVertexPositionVisible(k + 1, i);
    const vLeft = this.getVertexPositionVisible(k, idxL);

    return new THREE.Vector3(
      (vBottom.x + vRight.x + vTop.x + vLeft.x) / 4,
      (vBottom.y + vRight.y + vTop.y + vLeft.y) / 4,
      (vBottom.z + vRight.z + vTop.z + vLeft.z) / 4,
    );
  }

  static getModelCenterVisible() {
    const visibleLevels = state.cutActive ? (state.N - state.cutLevel) : state.N;
    // Centro geometrico aproximado dentro del solido (suficiente para orientar normales)
    return new THREE.Vector3(0, 0, (visibleLevels * state.h1) / 2);
  }

  static getVertexPosByIdVisible(vid) {
    const parsed = this.parseVertexId(vid);
    if (!parsed) return new THREE.Vector3(0, 0, 0);
    if (parsed.type === 'X') return this.getXPositionVisible(parsed.faceId);
    return this.getVertexPositionVisible(parsed.k, parsed.i);
  }

  /**
   * Construye todas las caras (en terminos de IDs de vertices).
   * Incluye:
   * - Caras laterales (rombos) y, en el nivel de corte, triangulos laterales.
   * - Cara del plano de corte (poligono) si esta activo.
   */
  static buildFaces() {
    const faces = [];
    const { N, cutActive, cutLevel } = state;
    const startK = cutActive ? cutLevel : 1;

    // --- Diagonales como modificacion topologica ---
    // Reusamos el estado ya existente de la app (structureExtraBeams + structureIntersectionFaces)
    // para "triangular" los rombos. Asi la conectividad del PDF (y de cualquier analisis)
    // refleja vigas/diagonales agregadas por el usuario SIN depender de toggles visuales.
    const extra = Array.isArray(state.structureExtraBeams) ? state.structureExtraBeams : [];
    const intersectionFaces = (state.structureIntersectionFaces && typeof state.structureIntersectionFaces === 'object')
      ? state.structureIntersectionFaces
      : {};

    // Set de diagonales existentes: key "u__v|kind"
    const diagSet = new Set();
    const edgeKey = (a, b) => (a < b ? `${a}__${b}` : `${b}__${a}`);
    for (let ii = 0; ii < extra.length; ii++) {
      const it = extra[ii];
      if (!it || !it.a || !it.b) continue;
      const ka = Number(it.a.k), ia = Number(it.a.i);
      const kb = Number(it.b.k), ib = Number(it.b.i);
      if (!isFinite(ka) || !isFinite(ia) || !isFinite(kb) || !isFinite(ib)) continue;
      const kind = it.kind || 'extra';
      if (kind !== 'diagH' && kind !== 'diagV') continue;
      const aId = this.buildVertexId(ka, ia);
      const bId = this.buildVertexId(kb, ib);
      if (aId === bId) continue;
      diagSet.add(edgeKey(aId, bId) + `|${kind}`);
    }
    const hasDiag = (aId, bId, kind) => diagSet.has(edgeKey(aId, bId) + `|${kind}`);

    // Caras laterales (segun createRhombi en geometry.js)
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

        if (cutActive && k === cutLevel) {
          // Triangulo lateral (no incluye vBottom porque esta cortado)
          const a = this.buildVertexId(k, idxL);
          const b = this.buildVertexId(k, idxR);
          const c = this.buildVertexId(k + 1, i);
          faces.push({ type: 'side-tri', level: k, vertices: [a, b, c] });
        } else {
          const vBottom = this.buildVertexId(k - 1, i);
          const vRight = this.buildVertexId(k, idxR);
          const vTop = this.buildVertexId(k + 1, i);
          const vLeft = this.buildVertexId(k, idxL);

          // ---- Aplicar diagonales a este rombo (si existen) ----
          // Convencion de rombo (en orden): [B, R, T, L]
          const faceId = `${k}:${i}`;
          const hasH = hasDiag(vLeft, vRight, 'diagH');
          const hasV = hasDiag(vBottom, vTop, 'diagV');

          if (hasH && hasV && intersectionFaces[faceId]) {
            // Dos diagonales -> conector central X + 4 triangulos
            const xId = `X:${faceId}`;
            // Guardamos X como "vertice" especial: se representara en posicion (promedio) por getVertexPositionVisibleSpecial
            faces.push({ type: 'side-triX', level: k, vertices: [vBottom, vRight, xId], xOf: faceId });
            faces.push({ type: 'side-triX', level: k, vertices: [vRight, vTop, xId], xOf: faceId });
            faces.push({ type: 'side-triX', level: k, vertices: [vTop, vLeft, xId], xOf: faceId });
            faces.push({ type: 'side-triX', level: k, vertices: [vLeft, vBottom, xId], xOf: faceId });
          } else if (hasH) {
            // Diagonal L-R => 2 triangulos: (L,B,R) + (L,R,T)
            faces.push({ type: 'side-tri', level: k, vertices: [vLeft, vBottom, vRight] });
            faces.push({ type: 'side-tri', level: k, vertices: [vLeft, vRight, vTop] });
          } else if (hasV) {
            // Diagonal B-T => 2 triangulos: (B,R,T) + (B,T,L)
            faces.push({ type: 'side-tri', level: k, vertices: [vBottom, vRight, vTop] });
            faces.push({ type: 'side-tri', level: k, vertices: [vBottom, vTop, vLeft] });
          } else {
            faces.push({ type: 'side-quad', level: k, vertices: [vBottom, vRight, vTop, vLeft] });
          }
        }
      }
    }

    // Cara del plano de corte (poligono)
    if (cutActive) {
      const ring = [];
      for (let i = 0; i < N; i++) ring.push(this.buildVertexId(cutLevel, i));
      faces.push({ type: 'cut-cap', level: cutLevel, vertices: ring });
    }

    return faces;
  }

  static computeFaceNormalInward(face, centerVisible) {
    const verts = face.vertices;

    // Para N-gono (cut-cap) usamos 3 puntos: centro + (v0,v1)
    if (face.type === 'cut-cap') {
      const z = 0; // visible coords: corte esta en z=0
      const center = new THREE.Vector3(0, 0, z);
      const v0 = this.getVertexPositionVisible(state.cutLevel, 0);
      const v1 = this.getVertexPositionVisible(state.cutLevel, 1);
      const e1 = new THREE.Vector3().subVectors(v0, center);
      const e2 = new THREE.Vector3().subVectors(v1, center);
      const n = new THREE.Vector3().crossVectors(e1, e2).normalize();

      // Orientar inward usando centro del solido
      const centroid = new THREE.Vector3();
      for (let i = 0; i < verts.length; i++) {
        centroid.add(this.getVertexPosByIdVisible(verts[i]));
      }
      centroid.multiplyScalar(1 / verts.length);

      const toCentroid = new THREE.Vector3().subVectors(centroid, centerVisible);
      if (n.dot(toCentroid) > 0) n.negate(); // si apunta hacia afuera, invertir
      return n;
    }

    // Tri / Quad: usar los primeros 3 vertices segun orden de construccion
    const p = [];
    for (let t = 0; t < Math.min(3, verts.length); t++) {
      p.push(this.getVertexPosByIdVisible(verts[t]));
    }
    const e1 = new THREE.Vector3().subVectors(p[1], p[0]);
    const e2 = new THREE.Vector3().subVectors(p[2], p[0]);
    const n = new THREE.Vector3().crossVectors(e1, e2).normalize();

    // Orientar inward
    const centroid = new THREE.Vector3();
    for (let t = 0; t < verts.length; t++) {
      centroid.add(this.getVertexPosByIdVisible(verts[t]));
    }
    centroid.multiplyScalar(1 / verts.length);

    const toCentroid = new THREE.Vector3().subVectors(centroid, centerVisible);
    if (n.dot(toCentroid) > 0) n.negate();
    return n;
  }

  static dedupeNormals(normals, decimals = 4) {
    const map = new Map();
    for (const n of normals) {
      const key = `${n.x.toFixed(decimals)},${n.y.toFixed(decimals)},${n.z.toFixed(decimals)}`;
      if (!map.has(key)) map.set(key, n.clone());
    }
    return [...map.values()];
  }

  /**
   * Construye aristas unicas (undirected) desde las caras.
   * Devuelve:
   * - edges: Map(edgeKey -> {a,b, faces:[faceIndex...]})
   * - vertexToNeighbors: Map(vid -> Set(vid))
   * - vertexToFaces: Map(vid -> Set(faceIndex))
   */
  static buildConnectivity(faces) {
    const edges = new Map();
    const vertexToNeighbors = new Map();
    const vertexToFaces = new Map();

    const addNeighbor = (u, v) => {
      if (!vertexToNeighbors.has(u)) vertexToNeighbors.set(u, new Set());
      vertexToNeighbors.get(u).add(v);
    };
    const addFaceToVertex = (u, fidx) => {
      if (!vertexToFaces.has(u)) vertexToFaces.set(u, new Set());
      vertexToFaces.get(u).add(fidx);
    };

    const edgeKey = (a, b) => (a < b ? `${a}__${b}` : `${b}__${a}`);

    faces.forEach((face, fidx) => {
      // registrar incidencia
      face.vertices.forEach(v => addFaceToVertex(v, fidx));

      // crear aristas por contorno
      const vs = face.vertices;
      const L = vs.length;
      for (let j = 0; j < L; j++) {
        const a = vs[j];
        const b = vs[(j + 1) % L];
        const key = edgeKey(a, b);

        if (!edges.has(key)) edges.set(key, { a: (a < b ? a : b), b: (a < b ? b : a), faces: [] });
        edges.get(key).faces.push(fidx);

        addNeighbor(a, b);
        addNeighbor(b, a);
      }
    });

    return { edges, vertexToNeighbors, vertexToFaces };
  }

/**
 * Conectividad basada en la ESTRUCTURA REAL (vigas) que se ve en el 3D.
 * Esto hace el PDF de conectores "infalible": refleja exactamente lo que
 * existe en structureGroup (incluye diagonales/extras y respeta eliminaciones).
 *
 * Retorna:
 * - vertexToNeighbors: Map(keyVisible -> Set(keyVisible))
 * - meta: { keysAreVisible: boolean, kShift: number } donde:
 *    - si keysAreVisible=true, las keys en beamInfo ya vienen en k visible
 *      y kShift = state.cutLevel para convertir a k original (kOrig = kVis + kShift)
 *    - si keysAreVisible=false, las keys en beamInfo vienen en k original
 *      y kShift = 0
 */
static buildConnectivityFromStructure(structureGroup) {
  const vertexToNeighbors = new Map();
  const addNeighbor = (u, v) => {
    if (!vertexToNeighbors.has(u)) vertexToNeighbors.set(u, new Set());
    vertexToNeighbors.get(u).add(v);
  };

  const cutActive = !!state.cutActive;
  const cutLevel = (typeof state.cutLevel === 'number') ? state.cutLevel : 0;

  // Detectar si beamInfo keys están en espacio visible u original.
  // Heurística robusta:
  // - si hay corte y el mínimo k encontrado en keys tipo k#_i# es 0 => keys visibles
  // - si hay corte y el mínimo k encontrado es >= cutLevel => keys originales
  // - si no hay corte => no importa, tratar como originales
  let minK = Infinity;
  if (structureGroup && structureGroup.children) {
    for (const obj of structureGroup.children) {
      const bi = obj && obj.userData && obj.userData.beamInfo;
      if (!bi) continue;
      const keys = [bi.aKey, bi.bKey];
      for (const key of keys) {
        const m = /^k(\d+)_i(\d+)$/.exec(key || '');
        if (m) {
          const k = parseInt(m[1], 10);
          if (Number.isFinite(k)) minK = Math.min(minK, k);
        }
      }
    }
  }
  // IMPORTANT:
  // - En esta app, StructureGenerator guarda keys de vertices en K ORIGINAL (ej: k4_i3), incluso con corte.
  // - Algunas variantes antiguas guardaban keys ya en K visible.
  // Por eso detectamos si ya vienen visibles (minK==0 con corte), y SIEMPRE usamos kShift=cutLevel
  // para poder convertir kVisible <-> kOriginal cuando se necesite.
  const keysAreVisible = cutActive && Number.isFinite(minK) && minK === 0;
  const kShift = cutLevel;

  // Visible levels (para mapear polos)
  const visibleLevels = cutActive ? (state.N - cutLevel) : state.N;

  const normalizeKeyVisible = (key) => {
    if (typeof key !== 'string') return String(key);

    // Polos (StructureGenerator usa 'pole_low' y 'pole_top')
    if (key === 'pole_low') {
      // Solo existe si NO hay corte
      return cutActive ? 'pole_low' : 'k0_i0';
    }
    if (key === 'pole_top') {
      // Polo superior siempre mapea al último nivel visible
      return `k${visibleLevels}_i0`;
    }
    // X:k:i
    if (key.startsWith('X:')) {
      const m = /^X:(\d+):(\d+)$/.exec(key);
      if (!m) return key; // fallback
      const k = parseInt(m[1], 10);
      const i = parseInt(m[2], 10);
      const kVis = cutActive ? (keysAreVisible ? k : (k - kShift)) : k;
      return `X:${kVis}:${i}`;
    }
    // k#_i#
    const m = /^k(\d+)_i(\d+)$/.exec(key);
    if (!m) return key;
    const k = parseInt(m[1], 10);
    const i = parseInt(m[2], 10);
    const kVis = cutActive ? (keysAreVisible ? k : (k - kShift)) : k;
    return `k${kVis}_i${i}`;
  };

  // Construir adyacencia desde beamInfo (verdad del 3D)
  if (structureGroup && structureGroup.children) {
    for (const obj of structureGroup.children) {
      const bi = obj && obj.userData && obj.userData.beamInfo;
      if (!bi) continue;

      // Excluir explícitamente beams marcados como borrados (si existe flag)
      if (obj.userData && (obj.userData.deleted === true || obj.userData.isDeleted === true)) continue;

      const a = normalizeKeyVisible(bi.aKey);
      const b = normalizeKeyVisible(bi.bKey);
      if (!a || !b || a === b) continue;

      addNeighbor(a, b);
      addNeighbor(b, a);
    }
  }

  return { vertexToNeighbors, meta: { keysAreVisible, kShift, visibleLevels } };
}

/**
 * Dado un key visible (k#_i# o X:#:#), retorna k original para obtener
 * posiciones correctas del modelo (y luego aplica zShift visible).
 */
static keyVisibleToOriginalK(keyVisible, meta) {
  const cutActive = !!state.cutActive;
  const kShift = (meta && typeof meta.kShift === 'number') ? meta.kShift : 0;

  if (typeof keyVisible !== 'string') return null;
  if (keyVisible.startsWith('X:')) {
    const m = /^X:(\d+):(\d+)$/.exec(keyVisible);
    if (!m) return null;
    const kVis = parseInt(m[1], 10);
    return cutActive ? (kVis + kShift) : kVis;
  }
  const m = /^k(\d+)_i(\d+)$/.exec(keyVisible);
  if (!m) return null;
  const kVis = parseInt(m[1], 10);
  return cutActive ? (kVis + kShift) : kVis;
}

static keyVisibleToIndexI(keyVisible) {
  if (typeof keyVisible !== 'string') return null;
  if (keyVisible.startsWith('X:')) {
    const m = /^X:(\d+):(\d+)$/.exec(keyVisible);
    if (!m) return null;
    return parseInt(m[2], 10);
  }
  const m = /^k(\d+)_i(\d+)$/.exec(keyVisible);
  if (!m) return null;
  return parseInt(m[2], 10);
}

static getPositionByKeyVisible(keyVisible, meta) {
  if (typeof keyVisible !== 'string') return null;
  if (keyVisible.startsWith('X:')) {
    // X position: requiere faceId en espacio ORIGINAL, pero aquí usamos (kOrig:i)
    const kOrig = this.keyVisibleToOriginalK(keyVisible, meta);
    const i = this.keyVisibleToIndexI(keyVisible);
    if (kOrig == null || i == null) return null;
    return this.getXPositionVisible(`${kOrig}:${i}`);
  }
  const kOrig = this.keyVisibleToOriginalK(keyVisible, meta);
  const i = this.keyVisibleToIndexI(keyVisible);
  if (kOrig == null || i == null) return null;
  return this.getVertexPositionVisible(kOrig, i);
}


  /**
   * Computa nodos representativos: un vertice por nivel K visible (i=0),
   * con conectividad, normales, vector directriz y angulos.
   */
  
static computeRepresentativeNodes(structureGroup) {
  const { N, cutActive, cutLevel } = state;
  const minKOrig = cutActive ? cutLevel : 0;

  // Conectividad basada en estructura real (3D)
  const { vertexToNeighbors, meta } = this.buildConnectivityFromStructure(structureGroup);

  // Calcular grados y baseline (moda) por nivel visible
  const levelToKeys = new Map(); // kVis -> [keyVisible]
  const degree = new Map(); // keyVisible -> deg
  for (const [u, neigh] of vertexToNeighbors.entries()) {
    if (!u || typeof u !== 'string') continue;
    if (u.startsWith('k')) {
      const m = /^k(\d+)_i(\d+)$/.exec(u);
      if (!m) continue;
      const kVis = parseInt(m[1], 10);
      if (!levelToKeys.has(kVis)) levelToKeys.set(kVis, []);
      levelToKeys.get(kVis).push(u);
    }
    degree.set(u, neigh.size);
  }

  const levelBaseline = new Map(); // kVis -> baselineDeg
  const mode = (arr) => {
    const counts = new Map();
    for (const x of arr) counts.set(x, (counts.get(x) || 0) + 1);
    let best = null, bestC = -1;
    for (const [k,c] of counts.entries()) {
      if (c > bestC) { bestC = c; best = k; }
    }
    return best;
  };

  for (const [kVis, keys] of levelToKeys.entries()) {
    const degs = keys.map(k => degree.get(k) || 0);
    const b = mode(degs);
    levelBaseline.set(kVis, (b == null ? 0 : b));
  }

  // Construye nodo a partir de un keyVisible y sus vecinos reales
  const buildNodeFromKey = (keyVisible) => {
    const kVisMatch = /^k(\d+)_i(\d+)$/.exec(keyVisible || '');
    const isX = (typeof keyVisible === 'string' && keyVisible.startsWith('X:'));
    let kVis = null;
    if (kVisMatch) kVis = parseInt(kVisMatch[1], 10);
    else if (isX) {
      const mx = /^X:(\d+):(\d+)$/.exec(keyVisible);
      if (mx) kVis = parseInt(mx[1], 10);
    }

    const pos = this.getPositionByKeyVisible(keyVisible, meta);
    const neigh = vertexToNeighbors.get(keyVisible) ? [...vertexToNeighbors.get(keyVisible)] : [];
    const outgoing = [];
    for (const v of neigh) {
      const pv = this.getPositionByKeyVisible(v, meta);
      if (!pv || !pos) continue;
      const dir = pv.clone().sub(pos).normalize();
      outgoing.push({ to: v, dir });
    }

    // Angulos azimutales (en planta) ordenados
    const az = outgoing.map(o => {
      const a = Math.atan2(o.dir.y, o.dir.x);
      return (a < 0 ? a + Math.PI * 2 : a);
    }).sort((a,b)=>a-b);

    return {
      keyVisible,
      kVisible: (kVis == null ? null : kVis),
      pos,
      degree: outgoing.length,
      baseline: (kVis == null ? null : levelBaseline.get(kVis) ?? null),
      outgoing,
      azimuths: az
    };
  };

  // Elegir 1 nodo representativo por nivel visible: el primero con grado == baseline, si existe.
  const repNodes = [];
  const maxKVis = cutActive ? (N - minKOrig) : N;
  for (let kVis = 0; kVis <= maxKVis; kVis++) {
    const keys = levelToKeys.get(kVis) || [];
    if (keys.length === 0) continue;
    const baseline = levelBaseline.get(kVis) ?? 0;
    const chosen = keys.find(k => (degree.get(k) || 0) === baseline) || keys[0];
    repNodes.push(buildNodeFromKey(chosen));
  }

  return { repNodes, vertexToNeighbors, degree, levelBaseline, meta };
}


  // ------------------------------------------------------------
  // Construir UN nodo (conector) especifico por key externa k#_i#
  // (Usado por el anexo de "conectores modificados" en el PDF)
  // ------------------------------------------------------------
  
static computeNodeByConnectorKey(connectorKeyVisible, structureGroup) {
  const { vertexToNeighbors, meta } = this.buildConnectivityFromStructure(structureGroup);
  const pos = this.getPositionByKeyVisible(connectorKeyVisible, meta);
  const neigh = vertexToNeighbors.get(connectorKeyVisible) ? [...vertexToNeighbors.get(connectorKeyVisible)] : [];
  const outgoing = [];
  for (const v of neigh) {
    const pv = this.getPositionByKeyVisible(v, meta);
    if (!pv || !pos) continue;
    const dir = pv.clone().sub(pos).normalize();
    outgoing.push({ to: v, dir });
  }
  const az = outgoing.map(o => {
    const a = Math.atan2(o.dir.y, o.dir.x);
    return (a < 0 ? a + Math.PI * 2 : a);
  }).sort((a,b)=>a-b);

  // baseline por nivel: usar computeRepresentativeNodes para tener levelBaseline
  const data = this.computeRepresentativeNodes(structureGroup);
  let kVis = null;
  const mk = /^k(\d+)_i(\d+)$/.exec(connectorKeyVisible || '');
  if (mk) kVis = parseInt(mk[1], 10);
  else if (typeof connectorKeyVisible === 'string' && connectorKeyVisible.startsWith('X:')) {
    const mx = /^X:(\d+):(\d+)$/.exec(connectorKeyVisible);
    if (mx) kVis = parseInt(mx[1], 10);
  }
  const baseline = (kVis == null ? null : (data.levelBaseline.get(kVis) ?? null));

  return { keyVisible: connectorKeyVisible, pos, outgoing, azimuths: az, degree: outgoing.length, baseline, meta };
}

}