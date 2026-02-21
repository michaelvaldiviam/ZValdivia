import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { state } from './state.js';               // Correccion de ruta
import {
  createPolygons,
  createHelices,
  createRhombi,
  createRhombiEdges,
  createAxisAndPoints,
  createCutCap
} from './geometry.js';
import { setRhombiData, clearRhombiData } from './state.js';
import { StructureGenerator } from './structure-generator.js';
import { StructureOBJExporter } from './export.js';

/**
 * Configuracion de la escena Three.js con optimizaciones de performance
 */
export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.isRebuilding = false;
    this.rebuildRequested = false;
    this._overlayUpdater = null;
    this.lazyBuildQueue = [];
    this.lazyBuildInProgress = false;
    // Render-on-demand: solo re-renderizar cuando hay cambios
    this._needsRender = true;
    this._rafId = null;
    
    this.setupRenderer();
    this.setupScene();
    this.setupCamera();
    this.setupControls();
    this.setupLights();
    this.setupGroups();
    this.setupPicking();
    this.setupHelpers();
    this.setupMaterials();
    this.setupGeometries();
  }

  setupPicking() {
    this.raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
  }

  setOverlayUpdater(fn) {
    this._overlayUpdater = (typeof fn === "function") ? fn : null;
  }


  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance' // Optimizacion para GPU
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  setupScene() {
    this.scene = new THREE.Scene();
    // Background gradient mas claro
    const c2 = document.createElement('canvas');
    c2.width = 512;
    c2.height = 512;
    const ctx = c2.getContext('2d');
    const grad = ctx.createRadialGradient(256, 256, 0, 256, 256, 512);
    grad.addColorStop(0, '#252630');
    grad.addColorStop(1, '#0a0a0d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
    this._bgTexture = new THREE.CanvasTexture(c2);
    this.scene.background = this._bgTexture;
  }

  setupCamera() {
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );
    this.camera.up.set(0, 0, 1);
  }

  setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    // Marcar escena como dirty cuando el usuario interactúa con la cámara
    this.controls.addEventListener('change', () => { this._needsRender = true; });
    this.controls.addEventListener('start', () => { this._needsRender = true; });
  }

  setupLights() {
    // Luz ambiental mas intensa
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(this.ambientLight);

    // Luz direccional principal mas intensa
    this.mainLight = new THREE.DirectionalLight(0xffffff, 1.4);
    this.mainLight.position.set(10, -10, 20);
    this.scene.add(this.mainLight);

    // Luz de relleno (rim light) mas intensa
    this.rimLight = new THREE.PointLight(0x3b82f6, 1.3);
    this.rimLight.position.set(-20, 10, 12);
    this.scene.add(this.rimLight);

    // Luz de acento mas intensa
    this.fillLight = new THREE.PointLight(0xffaaee, 0.6);
    this.fillLight.position.set(20, 20, 5);
    this.scene.add(this.fillLight);

    // Luz adicional desde abajo para iluminar mas
    this.bottomLight = new THREE.PointLight(0xffffff, 0.8);
    this.bottomLight.position.set(0, 0, -10);
    this.scene.add(this.bottomLight);

    // Luz hemisferica general
    this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    this.scene.add(this.hemisphereLight);

    // Luces adicionales para modo color (inicialmente apagadas)
    this.colorModeLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
    this.colorModeLight1.position.set(-10, 10, 15);
    this.colorModeLight1.visible = false;
    this.scene.add(this.colorModeLight1);

    this.colorModeLight2 = new THREE.PointLight(0xffffff, 0.8);
    this.colorModeLight2.position.set(0, -15, 10);
    this.colorModeLight2.visible = false;
    this.scene.add(this.colorModeLight2);

    this.colorModeLight3 = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
    this.colorModeLight3.visible = false;
    this.scene.add(this.colorModeLight3);
  }

  updateLighting() {
    if (state.colorByLevel) {
      // Activar iluminacion mejorada para modo color
      this.ambientLight.intensity = 0.9;
      this.mainLight.intensity = 1.6;
      this.rimLight.intensity = 1.5;
      this.fillLight.intensity = 0.8;
      this.bottomLight.intensity = 1.0;
      this.hemisphereLight.intensity = 0.8;
      this.colorModeLight1.visible = true;
      this.colorModeLight2.visible = true;
      this.colorModeLight3.visible = true;
    } else {
      // Iluminacion mejorada para modo normal
      this.ambientLight.intensity = 0.7;
      this.mainLight.intensity = 1.4;
      this.rimLight.intensity = 1.3;
      this.fillLight.intensity = 0.6;
      this.bottomLight.intensity = 0.8;
      this.hemisphereLight.intensity = 0.6;
      this.colorModeLight1.visible = false;
      this.colorModeLight2.visible = false;
      this.colorModeLight3.visible = false;
    }
  }

  setupGroups() {
    this.mainGroup = new THREE.Group();
    this.polygonsGroup = new THREE.Group();
    this.helixGroup = new THREE.Group();
    this.rhombiGroup = new THREE.Group();
    this.edgesGroup = new THREE.Group();
    this.axisGroup = new THREE.Group();
    this.capGroup = new THREE.Group();

    // Estructura para conectores (cilindros + vigas)
    this.structureGroup = new THREE.Group();

    this.mainGroup.add(this.polygonsGroup);
    this.mainGroup.add(this.helixGroup);
    this.mainGroup.add(this.rhombiGroup);
    this.mainGroup.add(this.edgesGroup);
    this.mainGroup.add(this.axisGroup);
    this.mainGroup.add(this.capGroup);
    this.mainGroup.add(this.structureGroup);

    this.scene.add(this.mainGroup);

    this.structureGenerator = new StructureGenerator(this.structureGroup);
    this._structureSignature = null;
  }

  setupHelpers() {
    const gridHelper = new THREE.GridHelper(80, 80, 0x444444, 0x1a1a1a);
    gridHelper.rotation.x = Math.PI / 2;
    this.scene.add(gridHelper);
  }

  setupMaterials() {
    this.matPolyLine = new THREE.LineBasicMaterial({
      color: 0x00d084,
      opacity: 0.35,
      transparent: true
    });

    this.matPolyFill = new THREE.MeshBasicMaterial({
      color: 0x00d084,
      side: THREE.DoubleSide,
      opacity: 0.08,
      transparent: true
    });

    this.matHelixCCW = new THREE.LineBasicMaterial({ color: 0xffd700 });
    this.matHelixCW = new THREE.LineBasicMaterial({ color: 0x00bfff });

    this.matRhombus = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.25,
      roughness: 0.08,
      transmission: 0.75,
      thickness: 1.3,
      ior: 1.45,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      side: THREE.DoubleSide,
      flatShading: true,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.06,
    });

    this.matPoint = new THREE.MeshBasicMaterial({ color: 0xff4444 });

    // Material para las aristas de los rombos/triangulos
    this.matEdge = new THREE.LineBasicMaterial({
      color: 0xffffff,
      opacity: 0.6,
      transparent: true,
      linewidth: 1
    });

    // Material para la tapa de corte
    this.matCap = new THREE.MeshPhysicalMaterial({
      color: 0xff5722,
      metalness: 0.6,
      roughness: 0.2,
      side: THREE.DoubleSide,
      flatShading: true,
      opacity: 0.9,
      transparent: true,
    });
  }

  setupGeometries() {
    this.geomPoint = new THREE.SphereGeometry(0.08, 10, 10);
  }

  /**
   *   OPTIMIZACION: Metodo para solicitar reconstruccion (con throttling)
   */
  requestRebuild() {
    if (this.isRebuilding) {
      this.rebuildRequested = true;
      return;
    }
    
    this.executeRebuild();
  }

  /**
   *   OPTIMIZACION #2: Metodo que ejecuta la reconstruccion con lazy loading
   */
  executeRebuild() {
    this.isRebuilding = true;
    this.rebuildRequested = false;
    
    // Usar requestAnimationFrame para no bloquear el thread principal
    requestAnimationFrame(() => {
      const { N } = state;
      
      // Si N es grande (>25), usar lazy loading progresivo
      if (N > 25 && state.rhombiVisible) {
        this.rebuildSceneLazy();
      } else {
        this.rebuildScene();
      }
      
      this.isRebuilding = false;
      this._needsRender = true;
      
      // Si hubo otra solicitud mientras reconstruiamos, ejecutarla
      if (this.rebuildRequested) {
        this.executeRebuild();
      }
    });
  }

  /**
   *   OPTIMIZACION #2: LAZY LOADING PROGRESIVO
   * Construye la geometria en chunks para mantener UI responsive
   */
  rebuildSceneLazy() {
    // Primero limpiamos y construimos lo basico (rapido)
    this.clearGroups({ includeStructure: false });
    clearRhombiData();

    const { N, cutActive, cutLevel, h1 } = state;

    // Ajustar posicion vertical del grupo principal
    if (cutActive) {
      this.mainGroup.position.z = -cutLevel * h1;
    } else {
      this.mainGroup.position.z = 0;
    }

    // Construir elementos ligeros inmediatamente
    if (state.polysVisible) {
      createPolygons(this.polygonsGroup, this.matPolyLine, this.matPolyFill);
    }

    if (state.axisVisible) {
      createAxisAndPoints(this.axisGroup, this.geomPoint, this.matPoint);
    }

    // Mantener/actualizar estructura (independiente de caras/lineas)
    this.maybeUpdateStructure();

    // Actualizar iluminacion
    this.updateLighting();

    // Construir elementos pesados progresivamente
    this.lazyBuildQueue = [];
    
    if (state.linesVisible) {
      this.lazyBuildQueue.push(() => {
        createHelices(this.helixGroup, this.matHelixCCW, this.matHelixCW);
        createRhombiEdges(this.edgesGroup, this.matEdge);
      });
    }

    if (state.rhombiVisible) {
      this.lazyBuildQueue.push(() => {
        const data = createRhombi(this.rhombiGroup, this.matRhombus);
        setRhombiData(data);
      });
    }

    if (cutActive && state.rhombiVisible) {
      this.lazyBuildQueue.push(() => {
        createCutCap(this.capGroup, this.matCap);
      });
    }

    // Iniciar construccion lazy
    if (!this.lazyBuildInProgress) {
      this.processLazyBuildQueue();
    }
  }

  /**
   * Procesa la cola de construccion lazy (1 chunk por frame)
   */
  processLazyBuildQueue() {
    if (this.lazyBuildQueue.length === 0) {
      this.lazyBuildInProgress = false;
      return;
    }

    this.lazyBuildInProgress = true;
    const buildTask = this.lazyBuildQueue.shift();
    
    requestAnimationFrame(() => {
      buildTask();
      this._needsRender = true;
      this.processLazyBuildQueue();
    });
  }

  /**
   * Reconstruccion normal (sincrona) para N pequenos
   */
  rebuildScene() {
    this.clearGroups({ includeStructure: false });
    clearRhombiData();

    const { N, cutActive, cutLevel, h1 } = state;

    // Ajustar posicion vertical del grupo principal
    if (cutActive) {
      this.mainGroup.position.z = -cutLevel * h1;
    } else {
      this.mainGroup.position.z = 0;
    }

    // 1) Polygons
    if (state.polysVisible) {
      createPolygons(this.polygonsGroup, this.matPolyLine, this.matPolyFill);
    }

    // 2) Helices y aristas de rombos
    if (state.linesVisible) {
      createHelices(this.helixGroup, this.matHelixCCW, this.matHelixCW);
      createRhombiEdges(this.edgesGroup, this.matEdge);
    }

    // 3) Rhombi (solo caras)
    if (state.rhombiVisible) {
      const data = createRhombi(this.rhombiGroup, this.matRhombus);
      setRhombiData(data);
    }

    // 4) Tapa de corte (solo si esta activo el corte)
    if (cutActive && state.rhombiVisible) {
      createCutCap(this.capGroup, this.matCap);
    }

    // 5) Axis and points
    if (state.axisVisible) {
      createAxisAndPoints(this.axisGroup, this.geomPoint, this.matPoint);
    }

    // 6) Mantener/actualizar estructura (independiente de caras/lineas)
    this.maybeUpdateStructure();

    // 7) Actualizar iluminacion segun el modo
    this.updateLighting();
  }

    /**
   * Limpia los grupos de geometria base.
   *    Por defecto NO toca la estructura, para que no desaparezca al activar/desactivar caras/lineas/poligonos.
   */
  clearGroups({ includeStructure = false } = {}) {
    this.clearGroup(this.polygonsGroup);
    this.clearGroup(this.helixGroup);
    this.clearGroup(this.rhombiGroup);
    this.clearGroup(this.edgesGroup);
    this.clearGroup(this.axisGroup);
    this.clearGroup(this.capGroup);

    if (includeStructure) {
      this.clearGroup(this.structureGroup);
    }
  }

  /**
   * Firma estable para decidir si la estructura debe regenerarse
   */
  getStructureSignature(params) {
    const p = params || null;
    const s = state;
    return JSON.stringify({
      // Geometria del zonohedro (lo que cambia posiciones)
      N: s.N,
      Dmax: s.Dmax,
      aDeg: s.aDeg,
      cutActive: !!s.cutActive,
      cutLevel: s.cutLevel,
      // Parametros de estructura
      p,

      // Topologia editable
      extra: s.structureExtraBeams || [],
      del: s.structureDeletedBeams || [],
      xFaces: s.structureIntersectionFaces || {},
      xOv: s.structureIntersectionConnectorOverrides || {},

      // Overrides por nivel (edicion interactiva de conectores)
      co: s.structureConnectorOverrides || {},
      bo: s.structureBeamOverrides || {},
    });
  }

  /**
   * Raycast para seleccionar un conector cilindrico.
   * @param {number} clientX
   * @param {number} clientY
   * @returns {null | { mesh:THREE.Object3D, kOriginal:number, kVisible:number, i:number, isPoleLow:boolean, isPoleTop:boolean }}
   */
  pickConnector(clientX, clientY) {
    if (!this.renderer || !this.camera || !this.structureGroup) return null;
    if (!this.structureGroup.visible || this.structureGroup.children.length === 0) return null;

    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    this._ndc.set(x * 2 - 1, -(y * 2 - 1));

    this.raycaster.setFromCamera(this._ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.structureGroup.children, true);
    for (const h of hits) {
      const obj = h.object;
      if (obj && obj.userData && obj.userData.isConnector && obj.userData.connectorInfo) {
        const info = obj.userData.connectorInfo;
        return {
          mesh: obj,
          kOriginal: info.kOriginal,
          kVisible: info.kVisible,
          i: info.i,
          isIntersection: !!info.isIntersection,
          faceK: info.faceK,
          faceI: info.faceI,
          isPoleLow: info.kOriginal === 0,
          isPoleTop: info.kOriginal === state.N,
        };
      }
    }
    return null;
  }

  /**
   * Raycast para seleccionar una viga (beam).
   * @param {number} clientX
   * @param {number} clientY
   * @returns {null | { mesh:THREE.Object3D, kLevelOriginal:number, kVisible:number, widthMm:number, heightMm:number }}
   */
  pickBeam(clientX, clientY) {
    if (!this.renderer || !this.camera || !this.structureGroup) return null;
    if (!this.structureGroup.visible || this.structureGroup.children.length === 0) return null;

    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    this._ndc.set(x * 2 - 1, -(y * 2 - 1));

    this.raycaster.setFromCamera(this._ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.structureGroup.children, true);
    for (const h of hits) {
      const obj = h.object;
      if (obj && obj.userData && obj.userData.beamInfo) {
        const bi = obj.userData.beamInfo;
        const kLevelOriginal = Math.max((bi.a && bi.a.k != null ? bi.a.k : 0), (bi.b && bi.b.k != null ? bi.b.k : 0));
        const kVisible = (bi.kVisible != null) ? bi.kVisible : this._kVisible(kLevelOriginal);
        const widthMm = (bi.widthMm != null) ? Number(bi.widthMm) : null;
        const heightMm = (bi.heightMm != null) ? Number(bi.heightMm) : null;
        return {
          mesh: obj,
          kLevelOriginal,
          kVisible,
          widthMm: isFinite(widthMm) ? widthMm : null,
          heightMm: isFinite(heightMm) ? heightMm : null,
        };
      }
    }
    return null;
  }


  /**
   * Si el usuario tiene la estructura activada, la mantiene / regenera cuando cambia la geometria.
   */
  maybeUpdateStructure() {
    if (!state.structureVisible) return;
    if (!state.structureParams) return;

    const sig = this.getStructureSignature(state.structureParams);
    if (this._structureSignature !== sig || this.structureGroup.children.length === 0) {
      this.generateConnectorStructure(state.structureParams, { _fromAutoUpdate: true });
      this._structureSignature = sig;
    }
  }


  /**
   * Genera la estructura de vigas + conectores en la escena.
   * Se auto-actualiza cuando cambia N / corte / Dmax (mientras este activada).
   */
  generateConnectorStructure(params, { _fromAutoUpdate = false } = {}) {
    if (!this.structureGenerator) {
      this.structureGenerator = new StructureGenerator(this.structureGroup);
    }

    // Guardar params para auto-actualizacion
    state.structureParams = { ...params };
    this._structureSignature = this.getStructureSignature(state.structureParams);

    this.structureGenerator.clear();
    const genResult = this.structureGenerator.generate(params);
    state.lastStructureWarnings = (genResult && genResult.warnings) ? genResult.warnings : [];
    // Respetar toggle visible
    this.structureGroup.visible = !!state.structureVisible;
    this._needsRender = true;
  }

  /**
   * Activa/Desactiva visualmente la estructura (sin borrarla)
   */
  setStructureVisible(visible) {
    state.structureVisible = !!visible;
    this.structureGroup.visible = !!visible;
    this._needsRender = true;
  }

  /**
   * Exporta un OBJ con SOLO la estructura (vigas + conectores cilindricos)
   */
  exportConnectorStructureOBJ() {
    if (!this.structureGroup || this.structureGroup.children.length === 0) {
      throw new Error('No hay estructura generada');
    }
    StructureOBJExporter.exportStructureToOBJ(this.structureGroup);
  }

  /**
   * Resalta visualmente un conector seleccionado.
   * Implementacion: agrega un outline (EdgesGeometry) temporal al mesh.
   * @param {THREE.Object3D|null} mesh
   */
  setSelectedConnector(mesh) {
    // Limpiar outline anterior
    if (this._selectedConnectorMesh && this._selectedConnectorMesh.userData) {
      const prev = this._selectedConnectorMesh;
      const ol = prev.userData._zvOutline;
      if (ol && ol.parent) {
        try { ol.parent.remove(ol); } catch (e) {}
      }
      if (ol && ol.geometry) {
        try { ol.geometry.dispose(); } catch (e) {}
      }
      if (ol && ol.material) {
        try { ol.material.dispose(); } catch (e) {}
      }
      prev.userData._zvOutline = null;
    }

    this._selectedConnectorMesh = null;
    if (!mesh) return;

    // Crear outline si hay geometria
    if (mesh.geometry) {
      try {
        const edges = new THREE.EdgesGeometry(mesh.geometry);
        // Nota: NO escalamos el outline. Las vigas/conectores pueden estar modelados en coordenadas
        // absolutas (world-like) dentro de la geometria; escalar el outline alrededor del origen local
        // provoca un desplazamiento visual (se ve "al lado"). Para asegurar visibilidad, desactivamos
        // depthTest/depthWrite y usamos renderOrder alto.
        const mat = new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
          depthWrite: false,
        });
        const outline = new THREE.LineSegments(edges, mat);
        outline.name = 'zvConnectorOutline';
        outline.renderOrder = 9999;
        outline.frustumCulled = false;
        mesh.add(outline);
        mesh.userData._zvOutline = outline;
      } catch (e) {
        console.warn('No se pudo crear outline del conector', e);
      }
    }

    this._selectedConnectorMesh = mesh;
    this._needsRender = true;
  }


  /**
   * Resalta visualmente una viga seleccionada.
   * Implementacion: outline (EdgesGeometry) temporal al mesh.
   * @param {THREE.Object3D|null} mesh
   */
  setSelectedBeam(mesh) {
    // Limpiar outline anterior
    if (this._selectedBeamMesh && this._selectedBeamMesh.userData) {
      const prev = this._selectedBeamMesh;
      const ol = prev.userData._zvBeamOutline;
      if (ol && ol.parent) {
        try { ol.parent.remove(ol); } catch (e) {}
      }
      if (ol && ol.geometry) {
        try { ol.geometry.dispose(); } catch (e) {}
      }
      if (ol && ol.material) {
        try { ol.material.dispose(); } catch (e) {}
      }
      prev.userData._zvBeamOutline = null;
    }

    this._selectedBeamMesh = null;
    if (!mesh) return;

    if (mesh.geometry) {
      try {
        const edges = new THREE.EdgesGeometry(mesh.geometry);
        // Igual que en conectores: no escalar para evitar "offset" cuando la geometria esta en coords absolutas.
        const mat = new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.85,
          depthTest: false,
          depthWrite: false,
        });
        const outline = new THREE.LineSegments(edges, mat);
        outline.name = 'zvBeamOutline';
        outline.renderOrder = 9998;
        outline.frustumCulled = false;
        mesh.add(outline);
        mesh.userData._zvBeamOutline = outline;
      } catch (e) {
        console.warn('No se pudo crear outline de la viga', e);
      }
    }

    this._selectedBeamMesh = mesh;
    this._needsRender = true;
  }

  _kVisible(kOriginal) {
    const { cutActive, cutLevel } = state;
    return cutActive ? Math.max(0, kOriginal - cutLevel) : kOriginal;
  }

  /**
   * Calcula presets de "traslado hacia interior" (offset axial) para un conector seleccionado.
   * Objetivo: que la cara exterior del cilindro (tapa exterior) quede a ras con la "punta" de la viga
   * cuyo bisel es mas pronunciado en ese conector (angulo arista-directriz mas agudo).
   *
   * Retorna valores en milimetros.
   * @param {{mesh:THREE.Object3D,kOriginal:number,kVisible:number}|null} hit
   * @returns {{edgeMm:number, halfMm:number}|null}
   */
  getConnectorOffsetPresetsMm(hit) {
    try {
      if (!hit || !hit.mesh || !this.structureGroup) return null;
      if (!this.structureGroup.visible || this.structureGroup.children.length === 0) return null;

      // Directriz (inward) desde la orientacion del cilindro: +Y rotado
      const axisY = new THREE.Vector3(0, 1, 0);
      const d = axisY.clone().applyQuaternion(hit.mesh.quaternion).normalize();

      // Params actuales del conector (para reconstruir la posicion del nodo)
      const p = this._getConnectorParamsForK(hit.kOriginal);
      if (!p) return null;
      const depth = p.depth;
      const offset = p.offset;

      // Nodo en la superficie del zonohedro (pos) = centro - d*(depth/2 + offset)
      const nodePos = hit.mesh.position.clone().addScaledVector(d, -(depth / 2 + offset));

      // Indice del conector (si existe)
      const hitI = (hit.mesh.userData && hit.mesh.userData.connectorInfo) ? hit.mesh.userData.connectorInfo.i : null;
      const hitIsPole = (hit.kOriginal === 0 || hit.kOriginal === state.N);

      // Buscar vigas incidentes a este conector.
      // Elegimos la viga con bisel mas "agudo" (angulo menor) en este conector.
      // Guardamos proyecciones sobre la directriz para poder definir presets de offset.
      let best = null; // { angDeg, sEdge, sInner, tCenter }

      this.structureGroup.traverse((obj) => {
        if (!obj || !obj.userData || !obj.userData.beamInfo || !Array.isArray(obj.userData.objVertices)) return;
        const bi = obj.userData.beamInfo;
        const verts = obj.userData.objVertices;
        if (!bi.a || !bi.b) return;

        // match extremo A/B (si hay indice i, lo usamos; en polos aceptamos cualquiera)
        const isA = (bi.a.k === hit.kOriginal) && (hitIsPole || hitI == null || bi.a.i === hitI);
        const isB = (bi.b.k === hit.kOriginal) && (hitIsPole || hitI == null || bi.b.i === hitI);
        if (!isA && !isB) return;

        const angDeg = isA ? Number(bi.angAdeg) : Number(bi.angBdeg);
        if (!isFinite(angDeg)) return;

        // Elegir vertices del extremo que estan en la cara EXTERIOR (ancho externo, donde pasa la arista del zonohedro)
        let idxList = null;
        if (bi.faces && bi.faces.outer && Array.isArray(bi.faces.outer)) {
          // outer contiene 4 indices: 2 del extremo A (<4) y 2 del extremo B (>=4)
          idxList = bi.faces.outer.filter((ii) => isA ? (ii >= 0 && ii <= 3) : (ii >= 4 && ii <= 7));
        }
        if (!idxList || idxList.length < 2) {
          idxList = isA ? [0, 1] : [4, 5]; // fallback coherente con layout habitual
        }

        // sEdge = max proyeccion sobre la directriz (tapa exterior del cilindro a ras con la punta en ancho externo)
        let tMax = -Infinity;
        let tMin = Infinity;
        for (const idx of idxList) {
          const v = verts[idx];
          if (!v) continue;
          const pv = (v && v.isVector3) ? v : new THREE.Vector3(v[0], v[1], v[2]);
          const t = pv.clone().sub(nodePos).dot(d);
          if (t > tMax) tMax = t;
          if (t < tMin) tMin = t;
        }
        if (!isFinite(tMax) || !isFinite(tMin)) return;

        const sEdge = Math.max(0, tMax);
        const sInner = Math.max(0, Math.min(tMax, tMin));

        // Centro de la testa (cruce de diagonales). En un quad es el promedio de sus 4 vertices.
        const testaIdx = isA ? [0, 1, 2, 3] : [4, 5, 6, 7];
        let c = new THREE.Vector3(0, 0, 0);
        let cN = 0;
        for (const ii of testaIdx) {
          const vv = verts[ii];
          if (!vv) continue;
          const pv = (vv && vv.isVector3) ? vv : new THREE.Vector3(vv[0], vv[1], vv[2]);
          c.add(pv);
          cN++;
        }
        if (cN === 0) return;
        c.multiplyScalar(1 / cN);
        const tCenter = c.clone().sub(nodePos).dot(d);

        if (!best || angDeg < best.angDeg - 1e-6) {
          best = { angDeg, sEdge, sInner, tCenter };
        }
      });

      if (!best) return null;

      // Preset "Al borde": offset tal que la tapa exterior quede a ras con la punta (ancho externo)
      const edgeMm = Math.max(0, Math.round(best.sEdge * 1000));

      // Preset "Centro de testa": tapa exterior en el centro de la testa (cruce de diagonales), proyectado en la directriz.
      const midMm = Math.max(0, Math.round(Math.max(0, best.tCenter) * 1000));

      return { edgeMm, midMm };

    } catch (e) {
      console.warn('getConnectorOffsetPresetsMm fallo', e);
      return null;
    }
  }

  /**
   * Replica de la logica de parametros por nivel (igual al generador) para uso en UI/presets.
   * Retorna unidades en metros.
   */
  _getConnectorParamsForK(kOriginal) {
    try {
      if (!state.structureParams) return null;
      const baseCylDepthMm = Number(state.structureParams.cylDepthMm) || 1;
      const overrides = (state.structureConnectorOverrides && typeof state.structureConnectorOverrides === 'object')
        ? state.structureConnectorOverrides
        : {};
      const ov = overrides[String(kOriginal)] || overrides[kOriginal];
      const pMm = (ov && ov.cylDepthMm != null) ? Number(ov.cylDepthMm) : baseCylDepthMm;
      const offMm = (ov && ov.offsetMm != null && isFinite(Number(ov.offsetMm))) ? Math.max(0, Number(ov.offsetMm)) : 0;
      const depth = Math.max(0.001, (isFinite(pMm) && pMm > 0 ? pMm : baseCylDepthMm) / 1000);
      const offset = Math.max(0, offMm / 1000);
      return { depth, offset };
    } catch (e) {
      return null;
    }
  }

  /**
   * Metodo mejorado para limpiar grupos y liberar memoria
   */
  clearGroup(group) {
    while (group.children.length > 0) {
      const child = group.children[0];
      
      // Liberar geometrias
      if (child.geometry) {
        child.geometry.dispose();
      }
      
      // Liberar materiales (solo si no son compartidos)
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(mat => {
            if (mat !== this.matRhombus && 
                mat !== this.matPolyLine && 
                mat !== this.matPolyFill &&
                mat !== this.matHelixCCW &&
                mat !== this.matHelixCW &&
                mat !== this.matEdge &&
                mat !== this.matPoint &&
                mat !== this.matCap) {
              mat.dispose();
            }
          });
        } else {
          if (child.material !== this.matRhombus && 
              child.material !== this.matPolyLine && 
              child.material !== this.matPolyFill &&
              child.material !== this.matHelixCCW &&
              child.material !== this.matHelixCW &&
              child.material !== this.matEdge &&
              child.material !== this.matPoint &&
              child.material !== this.matCap) {
            child.material.dispose();
          }
        }
      }
      
      // Remover del grupo
      group.remove(child);
    }
  }

  fitCamera() {
    const { cutActive, cutLevel, h1, Htotal, Dmax } = state;
    
    let centerZ;
    if (cutActive) {
      const visibleHeight = Htotal - (cutLevel * h1);
      centerZ = visibleHeight / 2;
    } else {
      centerZ = Htotal / 2;
    }

    this.controls.target.set(0, 0, centerZ);
    this.camera.position.set(
      Dmax * 2.2,
      -Dmax * 2.2,
      centerZ + Dmax * 0.6
    );
    this.controls.update();
    this._needsRender = true;
  }

  resetCamera() {
    this.controls.reset();
    this.fitCamera();
  }

  handleResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this._needsRender = true;
  }

  /**
   * Marca la escena como "sucia" para que se renderice en el próximo frame.
   * Llamar cada vez que cambie geometría, estado visual o cámara.
   */
  markDirty() {
    this._needsRender = true;
  }

  render() {
    this._rafId = requestAnimationFrame(() => this.render());

    // Rotación automática siempre marca dirty
    if (state.isRotating) {
      this.mainGroup.rotation.z += state.rotationSpeed * 0.01;
      this._needsRender = true;
    }

    // controls.update() devuelve true si la cámara se movió (damping en curso)
    const cameraChanged = this.controls.update();
    if (cameraChanged) this._needsRender = true;

    if (this._needsRender) {
      if (this._overlayUpdater) {
        try { this._overlayUpdater(); } catch (e) {}
      }
      this.renderer.render(this.scene, this.camera);
      this._needsRender = false;
    }
  }
}