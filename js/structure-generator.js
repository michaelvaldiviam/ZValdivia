import * as THREE from 'three';
import { state } from './state.js';
import { getRingVertex } from './geometry.js';

/**
 * Genera una estructura 3D para conectores:
 * - Un cilindro en cada nodo visible (eje = vector directriz inward).
 * - Una viga rectangular por arista unica (perfil BxA) con bisel en ambos extremos
 *   segun el vector directriz de cada extremo.
 *
 * Unidades:
 * - Entradas en milimetros, se convierten a metros.
 */
export class StructureGenerator {
  /**
   * @param {THREE.Group} targetGroup Grupo donde se insertan los meshes.
   */
  constructor(targetGroup) {
    this.group = targetGroup;

    // Materiales (se pueden afinar despues)
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
      // Algunos conectores comparten geometria (cache). No debemos dispose()

      // una geometria compartida, porque deja a otros meshes apuntando a un

      // buffer liberado y la estructura puede \"desaparecer\" al mover la camara.

      if (ch.geometry && !(ch.geometry.userData && ch.geometry.userData._zvCachedGeom)) {

        ch.geometry.dispose();

      }
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

    const warnings = [];

    const baseCylDiameterMm = Number(params.cylDiameterMm) || 1;
    const baseCylDepthMm = Number(params.cylDepthMm) || 1;
    const baseCylDiameter = baseCylDiameterMm / 1000;
    const baseCylDepth = baseCylDepthMm / 1000;
    // Compatibilidad: antes se llamaba beamThicknessMm
    const beamHeight = (Number(params.beamHeightMm ?? params.beamThicknessMm) || 1) / 1000;
    const beamWidth = (Number(params.beamWidthMm) || 1) / 1000;

    const startKNode = cutActive ? cutLevel : 0;

    const overrides = (state.structureConnectorOverrides && typeof state.structureConnectorOverrides === 'object')
      ? state.structureConnectorOverrides
      : {};

    const overridesIntersection = (state.structureIntersectionConnectorOverrides && typeof state.structureIntersectionConnectorOverrides === 'object')
      ? state.structureIntersectionConnectorOverrides
      : {};

  const beamOverrides = (state.structureBeamOverrides && typeof state.structureBeamOverrides === 'object')
    ? state.structureBeamOverrides
    : {};

    const clampMm = (v, fallback) => {
      const n = Number(v);
      if (!isFinite(n) || n <= 0) return fallback;
      return n;
    };

    /**
     * Parametrizacion del conector por nivel.
     * Incluye offsetMm: traslado adicional a lo largo de la directriz (hacia el interior).
     *
     * @param {number} kOriginal
     * @returns {{diameterMm:number, depthMm:number, offsetMm:number, radius:number, depth:number, offset:number}}
     */
    const cylForK = (kOriginal, isIntersection = false) => {
      const src = isIntersection ? overridesIntersection : overrides;
      const ov = src[String(kOriginal)] || src[kOriginal];
      const dMm = ov && ov.cylDiameterMm != null ? clampMm(ov.cylDiameterMm, baseCylDiameterMm) : baseCylDiameterMm;
      const pMm = ov && ov.cylDepthMm != null ? clampMm(ov.cylDepthMm, baseCylDepthMm) : baseCylDepthMm;
      // offset puede ser 0 (permitido)
      const offMm = (ov && ov.offsetMm != null && isFinite(Number(ov.offsetMm))) ? Math.max(0, Number(ov.offsetMm)) : 0;
      const d = dMm / 1000;
      const p = pMm / 1000;
      const off = offMm / 1000;
      const r = Math.max(0.0005, d / 2);
      return { diameterMm: dMm, depthMm: pMm, offsetMm: offMm, radius: r, depth: p, offset: off };
    };

    /**
     * Parametrizacion de la viga por nivel (kOriginal del nivel de viga).
     * @param {number} kLevelOriginal
     * @returns {{width:number,height:number,widthMm:number,heightMm:number}}
     */
    const beamForK = (kLevelOriginal) => {
      const ov = beamOverrides[String(kLevelOriginal)] || beamOverrides[kLevelOriginal];
      const wMm = ov && ov.beamWidthMm != null ? clampMm(ov.beamWidthMm, Number(params.beamWidthMm) || 1) : (Number(params.beamWidthMm) || 1);
      const hMm = ov && ov.beamHeightMm != null ? clampMm(ov.beamHeightMm, Number(params.beamHeightMm ?? params.beamThicknessMm) || 1) : (Number(params.beamHeightMm ?? params.beamThicknessMm) || 1);
      return {
        widthMm: wMm,
        heightMm: hMm,
        width: wMm / 1000,
        height: hMm / 1000,
      };
    };


    // Cache de geometria por (radio, profundidad)
    const cylGeomCache = new Map();
    const getCylGeom = (radius, depth, seg = 20) => {
      const key = `${radius.toFixed(6)}_${depth.toFixed(6)}_${seg}`;
      const cached = cylGeomCache.get(key);
      if (cached) return cached;
      const g = new THREE.CylinderGeometry(radius, radius, depth, seg, 1, false);
      // Marca: geometria compartida (cache). clear() NO debe dispose() esto.
      g.userData = g.userData || {};
      g.userData._zvCachedGeom = true;
      cylGeomCache.set(key, g);
      return g;
    };

    // 1) Construir caras visibles (triangulos/quads) en coordenadas del mundo (sin aplicar shift del mainGroup)
    const faces = this._buildVisibleFaces();

    // 2) Calcular normales inward por cara y acumular incidencia por vertice
    const { vertexMap, edgeMap } = this._buildAdjacencyFromFaces(faces);

    // 2.05) Vigas eliminadas por el usuario (se excluyen de edgeMap)
    // Guardamos las eliminaciones como edgeKeys deterministicas: "<aKey>|<bKey>" (ordenadas)
    const deletedEdges = Array.isArray(state.structureDeletedBeams) ? state.structureDeletedBeams : [];
    const deletedSet = new Set(deletedEdges.filter(Boolean));

    // 2.1) Aristas/vigas extra definidas por el usuario (diagonales, etc.)
    // Se agregan al edgeMap para que usen la MISMA logica de bisel/recorte.
    const extra = Array.isArray(state.structureExtraBeams) ? state.structureExtraBeams : [];
    if (extra.length) {
      const edgeKey = (aKey, bKey) => (aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`);
      for (const it of extra) {
        if (!it || !it.a || !it.b) continue;
        const ka = Number(it.a.k);
        const ia = Number(it.a.i);
        const kb = Number(it.b.k);
        const ib = Number(it.b.i);
        if (!isFinite(ka) || !isFinite(kb) || !isFinite(ia) || !isFinite(ib)) continue;

        // Si hay corte, ignorar aristas con extremos bajo el corte
        if (state.cutActive && (ka < state.cutLevel || kb < state.cutLevel)) continue;

        const aKey = this._keyForVertex(ka, ia);
        const bKey = this._keyForVertex(kb, ib);
        if (aKey === bKey) continue;
        const ek = edgeKey(aKey, bKey);
        if (deletedSet.has(ek)) continue;
        if (!edgeMap.has(ek)) {
          edgeMap.set(ek, {
            aKey,
            bKey,
            kind: it.kind || 'extra',
          });
        }
      }
    }


    // 2.2) Si existen diagonales en AMBOS sentidos dentro del MISMO rombo (quad),
    // y el usuario habilito la interseccion para ese rombo (al crear la 2da diagonal),
    // generar un conector nuevo en la interseccion y partir ambas diagonales en 2 tramos.
    // Esto evita el cruce de vigas y agrega conectividad real.
    const intersectionFaces = state.structureIntersectionFaces || {};
    if (extra.length) {
      const extraSet = new Set();
      const edgeKey = (aKey, bKey) => (aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`);
      for (const it of extra) {
        if (!it || !it.a || !it.b) continue;
        const ka = Number(it.a.k), ia = Number(it.a.i), kb = Number(it.b.k), ib = Number(it.b.i);
        if (!isFinite(ka) || !isFinite(kb) || !isFinite(ia) || !isFinite(ib)) continue;
        // Guardar solo diagonales (para no interferir con futuras extensiones)
        const kind = it.kind || 'extra';
        if (kind !== 'diagH' && kind !== 'diagV') continue;
        const aKey = this._keyForVertex(ka, ia);
        const bKey = this._keyForVertex(kb, ib);
        if (aKey === bKey) continue;
        extraSet.add(edgeKey(aKey, bKey) + `|${kind}`);
      }

      const { cutActive, cutLevel, h1, Htotal } = state;
      const z0 = cutActive ? cutLevel * h1 : 0;
      const globalCenter = new THREE.Vector3(0, 0, z0 + (Htotal - z0) * 0.5);

      const ensureVertex = (key, data) => {
        if (!vertexMap.has(key)) vertexMap.set(key, data);
        return vertexMap.get(key);
      };

      const hasDiag = (aKey, bKey, kind) => extraSet.has(edgeKey(aKey, bKey) + `|${kind}`);

      // Recorremos SOLO quads visibles (rombos). Ignorar triangulos del corte.
      for (let fi = 0; fi < faces.length; fi++) {
        const face = faces[fi];
        if (!Array.isArray(face) || face.length !== 4) continue;

        const vB = face[0], vR = face[1], vT = face[2], vL = face[3];
        if (!vB || !vR || !vT || !vL) continue;

        const bKey = this._keyForVertex(vB.k, vB.i);
        const rKey = this._keyForVertex(vR.k, vR.i);
        const tKey = this._keyForVertex(vT.k, vT.i);
        const lKey = this._keyForVertex(vL.k, vL.i);

        // Diagonales "canonicas" del rombo segun la construccion de la cara
        const hasH = hasDiag(lKey, rKey, 'diagH');
        const hasV = hasDiag(bKey, tKey, 'diagV');

        if (!(hasH && hasV)) continue;

        // Solo crear conector central si este rombo fue marcado explicitamente
        // cuando el usuario creo la SEGUNDA diagonal.
        const kFace = Number(vR.k);
        const iFace = Number(vB.i);
        const faceId = `${kFace}:${iFace}`;
        if (!intersectionFaces[faceId]) continue;

        // Key unico para el conector de interseccion por rombo
        const cKey = `X:${kFace}:${iFace}`;

        // Posicion del centro: interseccion de diagonales => promedio de puntos medios
        const vLdata = vertexMap.get(lKey);
        const vRdata = vertexMap.get(rKey);
        const vBdata = vertexMap.get(bKey);
        const vTdata = vertexMap.get(tKey);
        const vLpos = (vLdata && vLdata.pos) ? vLdata.pos : this._posForVertex(vL.k, vL.i);
        const vRpos = (vRdata && vRdata.pos) ? vRdata.pos : this._posForVertex(vR.k, vR.i);
        const vBpos = (vBdata && vBdata.pos) ? vBdata.pos : this._posForVertex(vB.k, vB.i);
        const vTpos = (vTdata && vTdata.pos) ? vTdata.pos : this._posForVertex(vT.k, vT.i);

        const midLR = new THREE.Vector3().addVectors(vLpos, vRpos).multiplyScalar(0.5);
        const midBT = new THREE.Vector3().addVectors(vBpos, vTpos).multiplyScalar(0.5);
        const cPos = new THREE.Vector3().addVectors(midLR, midBT).multiplyScalar(0.5);

        // Normal inward del rombo para orientar la directriz del conector nuevo
        const e1 = new THREE.Vector3().subVectors(vRpos, vBpos);
        const e2 = new THREE.Vector3().subVectors(vTpos, vBpos);
        let n = new THREE.Vector3().crossVectors(e1, e2);
        if (n.lengthSq() < 1e-12) {
          // fallback: usa otra combinacion
          const e3 = new THREE.Vector3().subVectors(vLpos, vBpos);
          n = new THREE.Vector3().crossVectors(e2, e3);
        }
        n.normalize();
        // Orientar hacia adentro segun el centro global
        const faceCenter = new THREE.Vector3().addVectors(vLpos, vRpos).add(vBpos).add(vTpos).multiplyScalar(0.25);
        const toCenter = new THREE.Vector3().subVectors(globalCenter, faceCenter);
        if (n.dot(toCenter) < 0) n.multiplyScalar(-1);

        ensureVertex(cKey, {
          key: cKey,
          k: kFace,
          i: iFace,
          pos: cPos,
          faceNormalsInward: [n.clone()],
          directrix: null,
          isIntersection: true,
          faceKey: { k: kFace, i: iFace },
        });

        // Partir diagonales en 2 tramos (4 vigas)
        const addEdge = (aKey, bKey, kind) => {
          const ek = edgeKey(aKey, bKey);
          if (deletedSet.has(ek)) return;
          if (!edgeMap.has(ek)) edgeMap.set(ek, { aKey, bKey, kind });
        };

        addEdge(lKey, cKey, 'diagH');
        addEdge(cKey, rKey, 'diagH');
        addEdge(bKey, cKey, 'diagV');
        addEdge(cKey, tKey, 'diagV');

        // Eliminar las diagonales originales para evitar duplicados (quedaran los tramos con conector central)
        edgeMap.delete(edgeKey(lKey, rKey));
        edgeMap.delete(edgeKey(bKey, tKey));
      }
    }

    // 2.9) Aplicar eliminaciones al edgeMap final (cubre tambien aristas base y tramos por interseccion)
    if (deletedSet.size) {
      for (const ek of deletedSet) edgeMap.delete(ek);
    }

    // 2.95) Limpiar conectores de interseccion (X) sin vigas (por eliminaciones del usuario)
    // Si un conector X no tiene ninguna arista incidente, NO debe generarse ni aparecer en reportes.
    // Esto permite que, al eliminar todas las vigas del cruce, el nodo X desaparezca y tambien
    // se elimine de la conectividad de los conectores cercanos.
    {
      const deg = new Map();
      for (const e of edgeMap.values()) {
        deg.set(e.aKey, (deg.get(e.aKey) || 0) + 1);
        deg.set(e.bKey, (deg.get(e.bKey) || 0) + 1);
      }
      const keys = Array.from(vertexMap.keys());
      for (const key of keys) {
        const v = vertexMap.get(key);
        if (v && v.isIntersection) {
          const d = deg.get(key) || 0;
          if (d === 0) vertexMap.delete(key);
        }
      }
    }

    // 3) Directriz por vertice (suma de normales inward)
    for (const v of vertexMap.values()) {
      const sum = new THREE.Vector3();
      for (const n of v.faceNormalsInward) sum.add(n);
      if (sum.lengthSq() < 1e-12) sum.set(0, 0, 1);
      v.directrix = sum.normalize();
    }

    // 4) Cilindros por nodo visible
    // CylinderGeometry esta alineada a +Y por defecto
    const axisY = new THREE.Vector3(0, 1, 0);

    for (const [key, v] of vertexMap.entries()) {
      const { pos, k } = v;
      if (k < startKNode) continue;
      // Si hay corte, no generamos nada bajo el nivel de corte.
      if (cutActive && k < cutLevel) continue;

      const { radius: cylRadius, depth: cylDepth, offset: cylOffset, offsetMm } = cylForK(k, !!v.isIntersection);

      const dir = v.directrix.clone().normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(axisY, dir);
      const mesh = new THREE.Mesh(getCylGeom(cylRadius, cylDepth, 20), this.matConnector.clone());
      // Posicion: por defecto la tapa exterior coincide con el nodo (pos).
      // Con offset, desplazamos todo el cilindro hacia el interior a lo largo de la directriz.
      // Importante: esto NO cambia el eje del cilindro, solo su ubicacion axial.
      mesh.position.copy(pos).addScaledVector(dir, (cylDepth / 2) + cylOffset);
      mesh.quaternion.copy(q);
      mesh.name = v.isIntersection
        ? `connectorX_k${this._kVisible(k)}_f${v.i}`
        : `connector_k${this._kVisible(k)}_i${v.i}`;
      mesh.userData.isConnector = true;
      mesh.userData.connectorInfo = {
        kOriginal: k,
        kVisible: this._kVisible(k),
        i: v.i,
        id: v.isIntersection ? `X${this._kVisible(k)}-${v.i}` : `C${this._kVisible(k)}-${v.i}`,
        diameterMm: Math.round(cylRadius * 2 * 1000),
        depthMm: Math.round(cylDepth * 1000),
        offsetMm: Math.round(offsetMm),
      };
      // OBJ faces (caps + sides) with outward normals
      const cdata = this._buildCylinderObjData(cylRadius, cylDepth, 20);
      mesh.userData.objVertices = cdata.objVertices;
      mesh.userData.objFaces = cdata.objFaces;
      this.group.add(mesh);
    }

    // 5) Vigas por arista unica
    let beamCounter = 0;
    for (const e of edgeMap.values()) {
      const a = vertexMap.get(e.aKey);
      const b = vertexMap.get(e.bKey);
      if (!a || !b) continue;

      // Solo aristas con ambos extremos visibles
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
      const cylA = cylForK(a.k, !!a.isIntersection);
      const cylB = cylForK(b.k, !!b.isIntersection);
      const trimA = this._trimToCylinderSurface(dir, a.directrix, cylA.radius, len);
      const trimB = this._trimToCylinderSurface(dir, b.directrix, cylB.radius, len);
      const pA2 = pA.clone().addScaledVector(dir, trimA);
      const pB2 = pB.clone().addScaledVector(dir, -trimB);

      // Dimensiones por nivel (edicion interactiva): usar kLevelOriginal = max(kA,kB)
      const kLevelOriginal = Math.max(a.k, b.k);
      const beamDims = beamForK(kLevelOriginal);
      const beamWidthLocal = beamDims.width;
      const beamHeightLocal = beamDims.height;

      const effLen = pA2.distanceTo(pB2);
      const minLen = Math.max(beamWidthLocal, beamHeightLocal) * 0.5;
      if (effLen < minLen) {
        warnings.push({
          type: 'BEAM_TOO_SHORT',
          a: { k: a.k, i: a.i },
          b: { k: b.k, i: b.i },
          lenMm: Math.round(effLen * 1000),
          minMm: Math.round(minLen * 1000),
        });
        continue;
      }


      // Bisel segun directrices de cada extremo
      const geom = this._createBeveledBeamGeometry({
        pA: pA2,
        pB: pB2,
        edgeDir: dir,
        // Origen del cilindro (la linea eje pasa por el nodo). Necesario para
        // construir el plano tangente correcto en cada extremo.
        originA: pA,
        originB: pB,
        axisA: a.directrix,
        axisB: b.directrix,
        cylRadiusA: cylA.radius,
        cylRadiusB: cylB.radius,
        width: beamWidthLocal,
        height: beamHeightLocal,
      });
      if (!geom) continue;

      // geom puede traer metadata para exportacion en QUADS
      const g = geom.geometry ? geom.geometry : geom;
      const m = new THREE.Mesh(g, this.matBeam.clone());
      if (geom.objQuads && geom.objVertices) {
        m.userData.objQuads = geom.objQuads;
        m.userData.objVertices = geom.objVertices;
      }
      if (Array.isArray(geom.objFaces) && Array.isArray(geom.objVertices)) {
        m.userData.objFaces = geom.objFaces;
        m.userData.objVertices = geom.objVertices;
      }

      // Metadata util para reportes (PDF) y futuros exports
      const aName = `k${this._kVisible(a.k)}`;
      const bName = `k${this._kVisible(b.k)}`;
      m.userData.isBeam = true;
      m.userData.beamInfo = {
        kVisible: this._kVisible(Math.max(a.k, b.k)),
        // Keys deterministicas de vertices (incluye conectores centrales X:...)
        aKey: e.aKey,
        bKey: e.bKey,
        a: { name: aName, k: a.k, i: a.i, pos: pA2.clone() },
        b: { name: bName, k: b.k, i: b.i, pos: pB2.clone() },
        // Guardar directrices y direccion de arista para reportes (Ang(d))
        aDir: a.directrix.clone(),
        bDir: b.directrix.clone(),
        edgeDir: dir.clone(),
        id: this._beamId(a, b),
        // Angulo entre arista y directriz en cada extremo (en grados)
        angAdeg: THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(Math.abs(dir.clone().normalize().dot(a.directrix.clone().normalize())), -1, 1))),
        angBdeg: THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(Math.abs(dir.clone().negate().normalize().dot(b.directrix.clone().normalize())), -1, 1))),
        widthMm: Math.round(beamWidthLocal * 1000),
        heightMm: Math.round(beamHeightLocal * 1000),
        faces: (geom.faces ? geom.faces : null),
        kind: e.kind || 'edge',
      };

      // Nombre por nivel (usar el K mayor para aristas verticales)
      const kLevel = Math.max(a.k, b.k);
      m.name = `beam_k${this._kVisible(kLevel)}_${beamCounter++}`;
      this.group.add(m);
    }

    // Ocultar conectores "huérfanos" (sin ninguna viga conectada).
    // Esto es clave cuando el usuario elimina vigas de aristas para crear aperturas:
    // los conectores que quedan sin conexiones deben desaparecer del 3D.
    (function hideOrphanConnectors(self){
      const incident = new Map();

      // Contar incidencias reales desde las vigas existentes en la escena (fuente de verdad del 3D).
      for (let idx = 0; idx < self.group.children.length; idx++) {
        const obj = self.group.children[idx];
        if (!obj || !obj.userData || !obj.userData.isBeam) continue;
        const bi = obj.userData.beamInfo;
        if (!bi || !bi.aKey || !bi.bKey) continue;
        incident.set(bi.aKey, (incident.get(bi.aKey) || 0) + 1);
        incident.set(bi.bKey, (incident.get(bi.bKey) || 0) + 1);
      }

      const N = state.N;

      const keyForConnector = (ci) => {
        if (!ci) return null;
        // Conector de intersección (cruce de diagonales)
        if (ci.id && String(ci.id).charAt(0) === 'X') {
          return `X:${ci.kOriginal}:${ci.i}`;
        }
        // Polos (solo existen sin corte activo)
        if (ci.kOriginal === 0) return 'pole_low';
        if (ci.kOriginal === N) return 'pole_top';
        return `k${ci.kOriginal}_i${ci.i}`;
      };

      for (let idx = 0; idx < self.group.children.length; idx++) {
        const obj = self.group.children[idx];
        if (!obj || !obj.userData || !obj.userData.isConnector) continue;

        const ci = obj.userData.connectorInfo;
        const key = keyForConnector(ci);
        if (!key) continue;

        const deg = incident.get(key) || 0;

        // Mantener polos siempre visibles; el resto se oculta si deg == 0.
        if (deg === 0) {
          obj.visible = false;
          if (ci) ci._hiddenOrphan = true;
        } else {
          obj.visible = true;
          if (ci && ci._hiddenOrphan) delete ci._hiddenOrphan;
        }
      }
    })(this);
    // Permite a la UI mostrar alertas (por ejemplo, vigas demasiado cortas).
    return { warnings };
  }

  _kVisible(kOriginal) {
    const { cutActive, cutLevel } = state;
    return cutActive ? Math.max(0, kOriginal - cutLevel) : kOriginal;
  }

  _beamId(a, b) {
    // ID deterministico para una viga, independiente del orden de extremos.
    // Usa niveles visibles y el indice 'i' de cada conector en su anillo.
    const ka = this._kVisible(a.k);
    const kb = this._kVisible(b.k);

    if (ka === kb) {
      const i0 = Math.min(a.i, b.i);
      const i1 = Math.max(a.i, b.i);
      return `B${ka}-${kb}_${i0}-${i1}`;
    }

    // Ordenar por nivel visible (inferior -> superior)
    const lo = (ka < kb) ? a : b;
    const hi = (ka < kb) ? b : a;
    const klo = this._kVisible(lo.k);
    const khi = this._kVisible(hi.k);
    return `B${klo}-${khi}_${lo.i}-${hi.i}`;
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
          // Triangulo: anillo (k) con el anillo (k+1)
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

      // Asignar a vertices
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
   * Devuelve cuanto se debe recortar una viga (a lo largo de la arista) para que
   * su extremo toque la superficie lateral del cilindro del nodo.
   *
   * Modelo: cilindro de radio R con eje = directriz pasando por el nodo.
   * Para la linea L(s)=nodo+e*s (e=arista unitaria), la distancia al eje es:
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
  _buildCylinderObjData(radius, height, segments) {
    const seg = Math.max(3, segments | 0);
    const h2 = height / 2;
    const verts = [];

    // bottom ring (y=-h/2)
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      verts.push(new THREE.Vector3(radius * Math.cos(a), -h2, radius * Math.sin(a)));
    }
    // top ring (y=+h/2)
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      verts.push(new THREE.Vector3(radius * Math.cos(a), +h2, radius * Math.sin(a)));
    }

    const faces = [];

    // top cap: CCW when viewed from +Y (normal +Y)
    const top = [];
    for (let i = seg - 1; i >= 0; i--) top.push(seg + i);
    faces.push(top);

    // bottom cap: CW when viewed from +Y (normal -Y)
    const bottom = [];
    for (let i = 0; i < seg; i++) bottom.push(i);
    faces.push(bottom);

// sides: quads
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      const b0 = i;
      const b1 = j;
      const t1 = seg + j;
      const t0 = seg + i;
      faces.push([b0, t0, t1, b1]);
    }

    return { objVertices: verts, objFaces: faces };
  }

  _createBeveledBeamGeometry({ pA, pB, edgeDir, originA, originB, axisA, axisB, width, height, cylRadiusA, cylRadiusB }) {
    const e = edgeDir.clone().normalize();
    const len = pA.distanceTo(pB);
    if (len < 1e-6) return null;

    // Fallbacks defensivos
    originA = originA || pA;
    originB = originB || pB;

    // ---- Marco local CONSISTENTE (evita vigas "torcidas") ----
    // t = direccion de "alto" (hacia adentro)   e, usando la suma de directrices para estabilidad
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
    // => normal n   u. Posicionamos el plano para que sea tangente al cilindro:
    //    n   (x - origin) = R
    const RA = (typeof cylRadiusA === 'number' && cylRadiusA > 0) ? cylRadiusA : 0;
    const RB = (typeof cylRadiusB === 'number' && cylRadiusB > 0) ? cylRadiusB : 0;

    const dirFromA = new THREE.Vector3().subVectors(pB, pA).normalize(); // sale de A hacia B
    const dirFromB = new THREE.Vector3().subVectors(pA, pB).normalize(); // sale de B hacia A

    const radialA = dirFromA.clone().sub(uA.clone().multiplyScalar(dirFromA.dot(uA)));
    const radialB = dirFromB.clone().sub(uB.clone().multiplyScalar(dirFromB.dot(uB)));

    let nA = radialA.lengthSq() < 1e-12 ? w.clone() : radialA.normalize();
    let nB = radialB.lengthSq() < 1e-12 ? w.clone() : radialB.normalize();

    // Garantizar n   u (por estabilidad numerica)
    nA = this._projectPerp(nA, uA);
    nB = this._projectPerp(nB, uB);
    if (nA.lengthSq() < 1e-12) nA = this._projectPerp(w, uA);
    if (nB.lengthSq() < 1e-12) nB = this._projectPerp(w, uB);
    if (nA.lengthSq() < 1e-12 || nB.lengthSq() < 1e-12) return null;
    nA.normalize();
    nB.normalize();

    const planeA = { n: nA, origin: originA, d: RA };
    const planeB = { n: nB, origin: originB, d: RB };

    // Interseccion robusta: para cada una de las 4 aristas longitudinales (Ai->Bi),
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

    // Validacion: evitar inversion (start demasiado cerca/por detras del end)
    const axis = e; // largo
    const base = pA.clone();
    const projStart = startPts.map(p => axis.dot(new THREE.Vector3().subVectors(p, base)));
    const projEnd = endPts.map(p => axis.dot(new THREE.Vector3().subVectors(p, base)));
    const maxStart = Math.max(...projStart);
    const minEnd = Math.min(...projEnd);
    if (minEnd - maxStart < Math.max(width, height) * 0.2) return null;

    // Construir BufferGeometry (8 vertices): start (0-3) + end (4-7)
    const verts = [...startPts, ...endPts];
    const positions = new Float32Array(8 * 3);
    for (let i = 0; i < 8; i++) {
      positions[i * 3 + 0] = verts[i].x;
      positions[i * 3 + 1] = verts[i].y;
      positions[i * 3 + 2] = verts[i].z;
    }

    // 6 caras QUAD (export) - render: 12 triangulos
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

    // Caras QUAD para export OBJ (regla mano derecha, normales hacia el exterior)
    // Convencion local usada arriba:
    //   e = eje longitudinal (A->B), t = "alto" hacia adentro, w = "ancho" (cara exterior pasa por la arista)
    // Vertices:
    //   start: 0(-w,0t),1(+w,0t),2(+w,+t),3(-w,+t)
    //   end:   4(-w,0t),5(+w,0t),6(+w,+t),7(-w,+t)
    // Winding requerido:
    //   - Testa start mira hacia -e => [0,1,2,3]
    //   - Testa end   mira hacia +e => [4,7,6,5]
    //   - Cara exterior (t=0) mira hacia -t => [0,4,5,1]
    //   - Cara w=+half mira hacia +w => [1,5,6,2]
    //   - Cara interior (t=height) mira hacia +t => [2,6,7,3]
    //   - Cara w=-half mira hacia -w => [3,7,4,0]
    const objQuads = [
      [0, 1, 2, 3],
      [4, 7, 6, 5],
      [0, 4, 5, 1],
      [1, 5, 6, 2],
      [2, 6, 7, 3],
      [3, 7, 4, 0],
    ];

    const objFaces = objQuads.map(q => q.slice());
    const faces = {
      testaA: [0, 1, 2, 3],
      testaB: [4, 7, 6, 5],
      outer:  [0, 4, 5, 1],
      sideP:  [1, 5, 6, 2],
      inner:  [2, 6, 7, 3],
      sideN:  [3, 7, 4, 0],
    };

    return {
      geometry: g,
      objVertices: verts,
      objQuads,
      objFaces,
      faces,
    };
  }

  _projectPerp(v, axis) {
    // v - axis*(v axis)
    return v.clone().sub(axis.clone().multiplyScalar(v.dot(axis)));
  }
}