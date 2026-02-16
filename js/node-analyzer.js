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

static parseVertexId(id) {
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

  static getModelCenterVisible() {
    const visibleLevels = state.cutActive ? (state.N - state.cutLevel) : state.N;
    // Centro geometrico aproximado dentro del solido (suficiente para orientar normales)
    return new THREE.Vector3(0, 0, (visibleLevels * state.h1) / 2);
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
          faces.push({ type: 'side-quad', level: k, vertices: [vBottom, vRight, vTop, vLeft] });
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
        const { k, i: ii } = this.parseVertexId(verts[i]);
        centroid.add(this.getVertexPositionVisible(k, ii));
      }
      centroid.multiplyScalar(1 / verts.length);

      const toCentroid = new THREE.Vector3().subVectors(centroid, centerVisible);
      if (n.dot(toCentroid) > 0) n.negate(); // si apunta hacia afuera, invertir
      return n;
    }

    // Tri / Quad: usar los primeros 3 vertices segun orden de construccion
    const p = [];
    for (let t = 0; t < Math.min(3, verts.length); t++) {
      const { k, i } = this.parseVertexId(verts[t]);
      p.push(this.getVertexPositionVisible(k, i));
    }
    const e1 = new THREE.Vector3().subVectors(p[1], p[0]);
    const e2 = new THREE.Vector3().subVectors(p[2], p[0]);
    const n = new THREE.Vector3().crossVectors(e1, e2).normalize();

    // Orientar inward
    const centroid = new THREE.Vector3();
    for (let t = 0; t < verts.length; t++) {
      const { k, i } = this.parseVertexId(verts[t]);
      centroid.add(this.getVertexPositionVisible(k, i));
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
   * Computa nodos representativos: un vertice por nivel K visible (i=0),
   * con conectividad, normales, vector directriz y angulos.
   */
  static computeRepresentativeNodes() {
    const { N, cutActive, cutLevel } = state;
    const minK = cutActive ? cutLevel : 0;
    const centerVisible = this.getModelCenterVisible();

    const faces = this.buildFaces();
    const faceNormalsInward = faces.map(f => this.computeFaceNormalInward(f, centerVisible));
    const { edges, vertexToNeighbors, vertexToFaces } = this.buildConnectivity(faces);

    // helper: normales de caras que "forman" una arista (las caras que contienen ambos vertices)
    const edgeFacesNormals = (u, v) => {
      const key = (u < v ? `${u}__${v}` : `${v}__${u}`);
      const e = edges.get(key);
      if (!e) return [];
      return e.faces.map(fi => faceNormalsInward[fi].clone());
    };

    const nodes = [];

    for (let k = minK; k <= N; k++) {
      const i = 0;
      const id = this.buildVertexId(k, i);
      const pos = this.getVertexPositionVisible(k, i);

            const visibleKIndex = (k - minK); // 0..niveles visibles (incluye polos)

      // Caras incidentes al vertice
      const incidentFaceIdx = vertexToFaces.get(id) ? [...vertexToFaces.get(id)] : [];
      const incidentNormals = incidentFaceIdx.map(fi => faceNormalsInward[fi].clone());

      // Deduplicar por direccion (importante en cut-cap, donde un vertice aparece en multiples triangulos)
      const uniqueIncidentNormals = this.dedupeNormals(incidentNormals);

      // Vector directriz (inward)
      const directive = new THREE.Vector3(0, 0, 0);
      uniqueIncidentNormals.forEach(n => directive.add(n));
      if (directive.lengthSq() < 1e-12) {
        // Fallback: hacia el eje del solido
        directive.set(-pos.x, -pos.y, 0);
      }
      directive.normalize();

      // Rotacion para nivelar: directriz -> +Z (inward).
      // Ademas fijamos el "roll" usando el eje vertical global para que lo que esta "arriba"
      // en el zonohedro se vea arriba en el PDF (orientacion determinista).
      const qLevel = new THREE.Quaternion().setFromUnitVectors(directive, new THREE.Vector3(0, 0, 1));

      // Referencia de "arriba" en el marco nivelado: proyeccion del +Z global al plano   directriz.
      // Si la proyeccion es degenerada (polo), usamos +X global como respaldo.
      const worldUp = new THREE.Vector3(0, 0, 1);
      let upLeveled = worldUp.clone().applyQuaternion(qLevel);
      upLeveled.z = 0;
      if (upLeveled.lengthSq() < 1e-12) {
        upLeveled = new THREE.Vector3(1, 0, 0).applyQuaternion(qLevel);
        upLeveled.z = 0;
      }
      upLeveled.normalize();

      // Roll: alinear esa referencia a -Y para que 'arriba' en el PDF (y decreciente) coincida con 'arriba' del zonohedro.
      const qRoll = new THREE.Quaternion().setFromUnitVectors(upLeveled, new THREE.Vector3(0, -1, 0));
      const qFinal = qRoll.clone().multiply(qLevel);

      // Vecinos / aristas salientes
      const neighbors = vertexToNeighbors.get(id) ? [...vertexToNeighbors.get(id)] : [];
      const edgesOut = neighbors.map(nid => {
        const { k: k2, i: i2 } = this.parseVertexId(nid);
        const toVisibleKIndex = (k2 - minK);
        const toDisplayId = NodeAnalyzer.buildDisplayId(k2, i2, toVisibleKIndex, minK, N, state.cutActive);
        const p2 = this.getVertexPositionVisible(k2, i2);
        const v = new THREE.Vector3().subVectors(p2, pos);
        const len = v.length();
        const vUnit = (len > 0 ? v.clone().multiplyScalar(1 / len) : new THREE.Vector3(0, 0, 0));

        // Angulo entre la arista (saliente) y el vector directriz (inward).
        // Se calcula en el espacio 3D visible, antes de nivelar.
        let angleToDirectiveDeg = null;
        {
          const dot = THREE.MathUtils.clamp(vUnit.dot(directive), -1, 1);
          // Si len==0 o directriz degenerada, dejamos null.
          if (isFinite(dot)) angleToDirectiveDeg = (Math.acos(dot) * 180) / Math.PI;
        }

        // aplicar nivelacion
        const vLeveled = vUnit.clone().applyQuaternion(qFinal);

        // proyeccion en plano perpendicular al directriz (XY tras nivelar)
        const vProj = new THREE.Vector3(vLeveled.x, vLeveled.y, 0);
        const projLen = vProj.length();
        let az = null;
        if (projLen > 1e-9) {
          vProj.multiplyScalar(1 / projLen);

          //   Exterior del nodo: vista desde afuera (opuesto al directriz).
          // Para representar el cambio de observador (+Z   -Z) sin invertir el "arriba",
          // aplicamos un espejo en X (cambia la lateralidad pero conserva arriba/abajo).
          vProj.x *= -1;

          az = (Math.atan2(vProj.y, vProj.x) * 180 / Math.PI);
          if (az < 0) az += 360;
        }

        const normalsForEdge = edgeFacesNormals(id, nid);

        return {
          to: nid,
          toK: k2,
          toI: i2,
          toVisibleKIndex,
          toDisplayId,
          length: len,
          vector: { x: vUnit.x, y: vUnit.y, z: vUnit.z },
          angleToDirectiveDeg,
          faceNormalsInward: normalsForEdge.map(nn => ({ x: nn.x, y: nn.y, z: nn.z })),
          azimuthDeg: az,
        };
      });

      // Calcular separaciones angulares (solo para aristas con azimuth valido)
      const withAz = edgesOut
        .map((e, idx) => ({ ...e, _idx: idx }))
        .filter(e => typeof e.azimuthDeg === 'number');

      withAz.sort((a, b) => a.azimuthDeg - b.azimuthDeg);
      const separations = new Array(edgesOut.length).fill(null);

      for (let t = 0; t < withAz.length; t++) {
        const cur = withAz[t];
        const nxt = withAz[(t + 1) % withAz.length];
        let sep = nxt.azimuthDeg - cur.azimuthDeg;
        if (t === withAz.length - 1) sep = (nxt.azimuthDeg + 360) - cur.azimuthDeg;
        separations[cur._idx] = sep;
      }

      edgesOut.forEach((e, idx) => {
        e.separationToNextDeg = separations[idx];
      });

      nodes.push({
        id,
        displayId: NodeAnalyzer.buildDisplayId(k, i, visibleKIndex, minK, N, state.cutActive),
        k,
        i,
        visibleKIndex,
        position: { x: pos.x, y: pos.y, z: pos.z },
        directiveInward: { x: directive.x, y: directive.y, z: directive.z },
        incidentFaceNormalsInward: uniqueIncidentNormals.map(n => ({ x: n.x, y: n.y, z: n.z })),
        edges: edgesOut
      });
    }

    return {
      params: {
        N: state.N,
        Dmax: state.Dmax,
        aDeg: state.aDeg,
        h1: state.h1,
        cutActive: state.cutActive,
        cutLevel: state.cutLevel,
        visibleLevels: state.cutActive ? (state.N - state.cutLevel) : state.N,
        floorDiameter: state.floorDiameter,
        Htotal: state.Htotal,
        visibleHeight: state.cutActive ? (state.h1 * (state.N - state.cutLevel)) : state.Htotal,
      },
      nodes
    };
  }
}