import * as THREE from 'three';
import { state } from './state.js';
import { getRingVertex } from './geometry.js';

/**
 * Genera una estructura 3D para conectores:
 * - Un cilindro en cada nodo visible (eje = vector directriz inward).
 * - Una viga rectangular por arista única (perfil BxA) con bisel en ambos extremos
 *   según el vector directriz de cada extremo.
 *
 * Unidades:
 * - Entradas en milímetros, se convierten a metros.
 */
export class StructureGenerator {
  /**
   * @param {THREE.Group} targetGroup Grupo donde se insertan los meshes.
   */
  constructor(targetGroup) {
    this.group = targetGroup;

    // Materiales (se pueden afinar después)
    this.matConnector = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      metalness: 0.15,
      roughness: 0.55,
    });
    this.matBeam = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      metalness: 0.12,
      roughness: 0.6,
    });

    this._tmpV = new THREE.Vector3();
  }

  clear() {
    while (this.group.children.length) {
      const ch = this.group.children[0];
      if (ch.geometry) ch.geometry.dispose();
      if (ch.material && ch.material.dispose) ch.material.dispose();
      this.group.remove(ch);
    }
  }

  /**
   * @param {{
   *  cylDiameterMm:number,
   *  cylDepthMm:number,
 *  beamHeightMm:number,
   *  beamWidthMm:number
   * }} params
   */
  generate(params) {
    const { N, cutActive, cutLevel } = state;

    const cylDiameter = (Number(params.cylDiameterMm) || 1) / 1000;
    const cylDepth = (Number(params.cylDepthMm) || 1) / 1000;
    // Compatibilidad: antes se llamaba beamThicknessMm
    const beamHeight = (Number(params.beamHeightMm ?? params.beamThicknessMm) || 1) / 1000;
    const beamWidth = (Number(params.beamWidthMm) || 1) / 1000;

    const cylRadius = Math.max(0.0005, cylDiameter / 2);
    const startKNode = cutActive ? cutLevel : 0;

    // 1) Construir caras visibles (triángulos/quads) en coordenadas del mundo (sin aplicar shift del mainGroup)
    const faces = this._buildVisibleFaces();

    // 2) Calcular normales inward por cara y acumular incidencia por vértice
    const { vertexMap, edgeMap } = this._buildAdjacencyFromFaces(faces);

    // 3) Directriz por vértice (suma de normales inward)
    for (const v of vertexMap.values()) {
      const sum = new THREE.Vector3();
      for (const n of v.faceNormalsInward) sum.add(n);
      if (sum.lengthSq() < 1e-12) sum.set(0, 0, 1);
      v.directrix = sum.normalize();
    }

    // 4) Cilindros por nodo visible
    const cylGeom = new THREE.CylinderGeometry(cylRadius, cylRadius, cylDepth, 20, 1, false);
    // CylinderGeometry está alineada a +Y por defecto
    const axisY = new THREE.Vector3(0, 1, 0);

    for (const [key, v] of vertexMap.entries()) {
      const { pos, k } = v;
      if (k < startKNode) continue;
      // Si hay corte, no generamos nada bajo el nivel de corte.
      if (cutActive && k < cutLevel) continue;

      const dir = v.directrix.clone().normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(axisY, dir);
      const mesh = new THREE.Mesh(cylGeom, this.matConnector.clone());
      mesh.position.copy(pos).addScaledVector(dir, cylDepth / 2);
      mesh.quaternion.copy(q);
      mesh.name = `connector_k${this._kVisible(k)}`;
      this.group.add(mesh);
    }

    // 5) Vigas por arista única
    let beamCounter = 0;
    for (const e of edgeMap.values()) {
      const a = vertexMap.get(e.aKey);
      const b = vertexMap.get(e.bKey);
      if (!a || !b) continue;

      // Sólo aristas con ambos extremos visibles
      if (cutActive && (a.k < cutLevel || b.k < cutLevel)) continue;

      const pA = a.pos;
      const pB = b.pos;
      const dir = new THREE.Vector3().subVectors(pB, pA);
      const len = dir.length();
      if (len < 1e-6) continue;
      dir.normalize();

      // Recorte para que la viga tope con la superficie exterior del cilindro en cada nodo.
      // Distancia desde el nodo, a lo largo de la arista, hasta interceptar el cilindro:
      // s = R / |e_perp|, donde e_perp es la componente de la arista perpendicular al eje del cilindro (directriz).
      const trimA = this._trimToCylinderSurface(dir, a.directrix, cylRadius, len);
      const trimB = this._trimToCylinderSurface(dir, b.directrix, cylRadius, len);
      const pA2 = pA.clone().addScaledVector(dir, trimA);
      const pB2 = pB.clone().addScaledVector(dir, -trimB);
      if (pA2.distanceTo(pB2) < Math.max(beamWidth, beamHeight) * 0.5) continue;

      // Bisel según directrices de cada extremo
      const geom = this._createBeveledBeamGeometry({
        pA: pA2,
        pB: pB2,
        edgeDir: dir,
        // Origen del cilindro (la línea eje pasa por el nodo). Necesario para
        // construir el plano tangente correcto en cada extremo.
        originA: pA,
        originB: pB,
        axisA: a.directrix,
        axisB: b.directrix,
        cylRadius: cylRadius,
        width: beamWidth,
        height: beamHeight,
      });
      if (!geom) continue;

      // geom puede traer metadata para exportación en QUADS
      const g = geom.geometry ? geom.geometry : geom;
      const m = new THREE.Mesh(g, this.matBeam.clone());
      if (geom.objQuads && geom.objVertices) {
        m.userData.objQuads = geom.objQuads;
        m.userData.objVertices = geom.objVertices;
      }

      // Metadata útil para reportes (PDF) y futuros exports
      const aName = `k${this._kVisible(a.k)}`;
      const bName = `k${this._kVisible(b.k)}`;
      m.userData.beamInfo = {
        kVisible: this._kVisible(Math.max(a.k, b.k)),
        a: { name: aName, k: a.k, pos: pA2.clone() },
        b: { name: bName, k: b.k, pos: pB2.clone() },
        // Guardar directrices y dirección de arista para reportes (Ang(d))
        aDir: a.directrix.clone(),
        bDir: b.directrix.clone(),
        edgeDir: dir.clone(),
        // Ángulo entre arista y directriz en cada extremo (en grados)
        angAdeg: THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(Math.abs(dir.clone().normalize().dot(a.directrix.clone().normalize())), -1, 1))),
        angBdeg: THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(Math.abs(dir.clone().negate().normalize().dot(b.directrix.clone().normalize())), -1, 1))),
        widthMm: Math.round(beamWidth * 1000),
        heightMm: Math.round(beamHeight * 1000),
      };

      // Nombre por nivel (usar el K mayor para aristas verticales)
      const kLevel = Math.max(a.k, b.k);
      m.name = `beam_k${this._kVisible(kLevel)}_${beamCounter++}`;
      this.group.add(m);
    }
  }

  _kVisible(kOriginal) {
    const { cutActive, cutLevel } = state;
    return cutActive ? Math.max(0, kOriginal - cutLevel) : kOriginal;
  }

  _keyForVertex(k, i) {
    // Colapsar polos (radio = 0)
    if (k === 0) return 'pole_low';
    if (k === state.N) return 'pole_top';
    return `k${k}_i${i}`;
  }

  _posForVertex(k, i) {
    // Para polos, i es irrelevante
    if (k === 0) return getRingVertex(0, 0);
    if (k === state.N) return getRingVertex(state.N, 0);
    return getRingVertex(k, i);
  }

  _buildVisibleFaces() {
    const { N, cutActive, cutLevel } = state;
    const startK = cutActive ? cutLevel : 1;
    const faces = [];

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

        const vLeft = { k, i: idxL };
        const vRight = { k, i: idxR };

        if (cutActive && k === cutLevel) {
          // Triángulo: anillo (k) con el anillo (k+1)
          const vTop = { k: k + 1, i };
          faces.push([vLeft, vRight, vTop]);
        } else {
          const vBottom = { k: k - 1, i };
          const vTop = { k: k + 1, i };
          faces.push([vBottom, vRight, vTop, vLeft]);
        }
      }
    }

    return faces;
  }

  _buildAdjacencyFromFaces(faces) {
    const vertexMap = new Map();
    const edgeMap = new Map();

    // Centro aproximado para orientar normales (inward)
    const { cutActive, cutLevel, h1, Htotal } = state;
    const z0 = cutActive ? cutLevel * h1 : 0;
    const center = new THREE.Vector3(0, 0, z0 + (Htotal - z0) * 0.5);

    const getVertex = (k, i) => {
      const key = this._keyForVertex(k, i);
      if (!vertexMap.has(key)) {
        vertexMap.set(key, {
          key,
          k,
          i,
          pos: this._posForVertex(k, i),
          faceNormalsInward: [],
          directrix: null,
        });
      }
      return vertexMap.get(key);
    };

    const edgeKey = (aKey, bKey) => (aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`);

    for (const face of faces) {
      const verts = face.map(v => getVertex(v.k, v.i));
      if (verts.length < 3) continue;
      const p0 = verts[0].pos;
      const p1 = verts[1].pos;
      const p2 = verts[2].pos;
      const n = new THREE.Vector3()
        .subVectors(p1, p0)
        .cross(new THREE.Vector3().subVectors(p2, p0));
      if (n.lengthSq() < 1e-12) continue;
      n.normalize();

      // Determinar inward (hacia el centro)
      const centroid = new THREE.Vector3();
      for (const vv of verts) centroid.add(vv.pos);
      centroid.multiplyScalar(1 / verts.length);

      const outTest = new THREE.Vector3().subVectors(centroid, center);
      if (n.dot(outTest) > 0) n.multiplyScalar(-1); // invertimos para inward

      // Asignar a vértices
      for (const vv of verts) vv.faceNormalsInward.push(n.clone());

      // Aristas
      for (let j = 0; j < verts.length; j++) {
        const va = verts[j];
        const vb = verts[(j + 1) % verts.length];
        if (va.key === vb.key) continue;
        const ek = edgeKey(va.key, vb.key);
        if (!edgeMap.has(ek)) {
          edgeMap.set(ek, {
            key: ek,
            aKey: va.key,
            bKey: vb.key,
            faceNormalsInward: [n.clone()],
          });
        } else {
          edgeMap.get(ek).faceNormalsInward.push(n.clone());
        }
      }
    }

    return { vertexMap, edgeMap };
  }

  /**
   * Devuelve cuánto se debe recortar una viga (a lo largo de la arista) para que
   * su extremo toque la superficie lateral del cilindro del nodo.
   *
   * Modelo: cilindro de radio R con eje = directriz pasando por el nodo.
   * Para la línea L(s)=nodo+e*s (e=arista unitaria), la distancia al eje es:
   *   dist = s*|e_perp|
   * donde e_perp es la componente de e perpendicular a la directriz.
   * Entonces s = R/|e_perp|.
   */
  _trimToCylinderSurface(edgeDirUnit, directrixUnit, radius, edgeLen) {
    const e = edgeDirUnit.clone().normalize();
    const d = directrixUnit.clone().normalize();
    const dot = THREE.MathUtils.clamp(e.dot(d), -1, 1);
    const perp = Math.sqrt(Math.max(1e-10, 1 - dot * dot));
    // Si la arista casi coincide con el eje del cilindro, no recortamos (caso degenerado).
    let s = radius / perp;
    // Clamp suave para evitar invertir la viga en casos extremos.
    s = Math.min(Math.max(0, s), edgeLen * 0.45);
    return s;
  }

  /**
   * Crea una viga rectangular con bisel en ambos extremos.
   * - Eje longitudinal: edgeDir
   * - "Alto" (height) crece hacia el interior, usando la directriz proyectada perpendicular al eje.
   */
  _createBeveledBeamGeometry({ pA, pB, edgeDir, originA, originB, axisA, axisB, width, height, cylRadius }) {
    const e = edgeDir.clone().normalize();
    const len = pA.distanceTo(pB);
    if (len < 1e-6) return null;

    // Fallbacks defensivos
    originA = originA || pA;
    originB = originB || pB;

    // ---- Marco local CONSISTENTE (evita vigas "torcidas") ----
    // t = dirección de "alto" (hacia adentro) ⟂ e, usando la suma de directrices para estabilidad
    const uA = axisA.clone().normalize();
    const uB = axisB.clone().normalize();
    let t = this._projectPerp(uA.clone().add(uB), e);
    if (t.lengthSq() < 1e-10) t = this._projectPerp(uA, e);
    if (t.lengthSq() < 1e-10) t = this._projectPerp(uB, e);
    if (t.lengthSq() < 1e-10) return null;
    t.normalize();

    // Asegurar que t apunte aproximadamente hacia adentro (alineado con promedio de directrices)
    const uAvg = uA.clone().add(uB);
    if (uAvg.lengthSq() > 1e-12 && t.dot(uAvg) < 0) t.multiplyScalar(-1);

    // w = ancho (en planta) perpendicular a e y t (cara exterior pasa por la arista)
    const w = new THREE.Vector3().crossVectors(e, t);
    if (w.lengthSq() < 1e-10) return null;
    w.normalize();

    const halfW = width / 2;

    // Prismas base (sin bisel) - 4 esquinas en cada extremo con el MISMO (w,t)
    const cornersA0 = [
      pA.clone().addScaledVector(w, -halfW),                               // 0 outer
      pA.clone().addScaledVector(w, +halfW),                               // 1 outer
      pA.clone().addScaledVector(w, +halfW).addScaledVector(t, height),    // 2 inner
      pA.clone().addScaledVector(w, -halfW).addScaledVector(t, height),    // 3 inner
    ];
    const cornersB0 = [
      pB.clone().addScaledVector(w, -halfW),                               // 4 outer
      pB.clone().addScaledVector(w, +halfW),                               // 5 outer
      pB.clone().addScaledVector(w, +halfW).addScaledVector(t, height),    // 6 inner
      pB.clone().addScaledVector(w, -halfW).addScaledVector(t, height),    // 7 inner
    ];

    // ---- Planos de bisel: la testa debe ser PARALELA a la directriz (u pertenece al plano) ----
    // => normal n ⟂ u. Posicionamos el plano para que sea tangente al cilindro:
    //    n · (x - origin) = R
    const R = (typeof cylRadius === 'number' && cylRadius > 0) ? cylRadius : 0;

    const dirFromA = new THREE.Vector3().subVectors(pB, pA).normalize(); // sale de A hacia B
    const dirFromB = new THREE.Vector3().subVectors(pA, pB).normalize(); // sale de B hacia A

    const radialA = dirFromA.clone().sub(uA.clone().multiplyScalar(dirFromA.dot(uA)));
    const radialB = dirFromB.clone().sub(uB.clone().multiplyScalar(dirFromB.dot(uB)));

    let nA = radialA.lengthSq() < 1e-12 ? w.clone() : radialA.normalize();
    let nB = radialB.lengthSq() < 1e-12 ? w.clone() : radialB.normalize();

    // Garantizar n ⟂ u (por estabilidad numérica)
    nA = this._projectPerp(nA, uA);
    nB = this._projectPerp(nB, uB);
    if (nA.lengthSq() < 1e-12) nA = this._projectPerp(w, uA);
    if (nB.lengthSq() < 1e-12) nB = this._projectPerp(w, uB);
    if (nA.lengthSq() < 1e-12 || nB.lengthSq() < 1e-12) return null;
    nA.normalize();
    nB.normalize();

    const planeA = { n: nA, origin: originA, d: R };
    const planeB = { n: nB, origin: originB, d: R };

    // Intersección robusta: para cada una de las 4 aristas longitudinales (Ai->Bi),
    // intersectar con el plano del extremo correspondiente.
    const intersectEdgeWithPlane = (Apt, Bpt, plane) => {
      const n = plane.n;
      const origin = plane.origin;
      const d = plane.d;
      const AB = this._tmpV.subVectors(Bpt, Apt);
      const denom = n.dot(AB);
      if (Math.abs(denom) < 1e-10) return Apt.clone(); // casi paralelo, fallback
      const tLine = (d - n.dot(new THREE.Vector3().subVectors(Apt, origin))) / denom;
      const tClamped = Math.max(0, Math.min(1, tLine));
      return Apt.clone().addScaledVector(AB, tClamped);
    };

    const startPts = [];
    const endPts = [];
    for (let i = 0; i < 4; i++) {
      startPts.push(intersectEdgeWithPlane(cornersA0[i], cornersB0[i], planeA));
      endPts.push(intersectEdgeWithPlane(cornersA0[i], cornersB0[i], planeB));
    }

    // Validación: evitar inversión (start demasiado cerca/por detrás del end)
    const axis = e; // largo
    const base = pA.clone();
    const projStart = startPts.map(p => axis.dot(new THREE.Vector3().subVectors(p, base)));
    const projEnd = endPts.map(p => axis.dot(new THREE.Vector3().subVectors(p, base)));
    const maxStart = Math.max(...projStart);
    const minEnd = Math.min(...projEnd);
    if (minEnd - maxStart < Math.max(width, height) * 0.2) return null;

    // Construir BufferGeometry (8 vértices): start (0-3) + end (4-7)
    const verts = [...startPts, ...endPts];
    const positions = new Float32Array(8 * 3);
    for (let i = 0; i < 8; i++) {
      positions[i * 3 + 0] = verts[i].x;
      positions[i * 3 + 1] = verts[i].y;
      positions[i * 3 + 2] = verts[i].z;
    }

    // 6 caras QUAD (export) - render: 12 triángulos
    const indices = [
      // start face (0,1,2,3)
      0, 1, 2, 0, 2, 3,
      // end face (4,5,6,7) (invert to keep outward normals consistent)
      4, 6, 5, 4, 7, 6,
      // sides
      0, 5, 1, 0, 4, 5,
      1, 6, 2, 1, 5, 6,
      2, 7, 3, 2, 6, 7,
      3, 4, 0, 3, 7, 4,
    ];

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    g.computeBoundingSphere();

    const objQuads = [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
      [3, 0, 4, 7],
    ];

    return {
      geometry: g,
      objVertices: verts,
      objQuads,
    };
  }

  _projectPerp(v, axis) {
    // v - axis*(v·axis)
    return v.clone().sub(axis.clone().multiplyScalar(v.dot(axis)));
  }
}