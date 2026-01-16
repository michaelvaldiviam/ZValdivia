import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { state } from './state.js';               // Corrección de ruta
import {
  createPolygons,
  createHelices,
  createRhombi,
  createRhombiEdges,
  createAxisAndPoints,
  createCutCap
} from './geometry.js';
import { setRhombiData, clearRhombiData } from './state.js';

/**
 * Configuración de la escena Three.js con optimizaciones de performance
 */
export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.isRebuilding = false;
    this.rebuildRequested = false;
    this.lazyBuildQueue = [];
    this.lazyBuildInProgress = false;
    
    this.setupRenderer();
    this.setupScene();
    this.setupCamera();
    this.setupControls();
    this.setupLights();
    this.setupGroups();
    this.setupHelpers();
    this.setupMaterials();
    this.setupGeometries();
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance' // Optimización para GPU
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  setupScene() {
    this.scene = new THREE.Scene();
    // Background gradient más claro
    const c2 = document.createElement('canvas');
    c2.width = 512;
    c2.height = 512;
    const ctx = c2.getContext('2d');
    const grad = ctx.createRadialGradient(256, 256, 0, 256, 256, 512);
    grad.addColorStop(0, '#252630');
    grad.addColorStop(1, '#0a0a0d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
    this.scene.background = new THREE.CanvasTexture(c2);
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
  }

  setupLights() {
    // Luz ambiental más intensa
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(this.ambientLight);

    // Luz direccional principal más intensa
    this.mainLight = new THREE.DirectionalLight(0xffffff, 1.4);
    this.mainLight.position.set(10, -10, 20);
    this.scene.add(this.mainLight);

    // Luz de relleno (rim light) más intensa
    this.rimLight = new THREE.PointLight(0x3b82f6, 1.3);
    this.rimLight.position.set(-20, 10, 12);
    this.scene.add(this.rimLight);

    // Luz de acento más intensa
    this.fillLight = new THREE.PointLight(0xffaaee, 0.6);
    this.fillLight.position.set(20, 20, 5);
    this.scene.add(this.fillLight);

    // Luz adicional desde abajo para iluminar más
    this.bottomLight = new THREE.PointLight(0xffffff, 0.8);
    this.bottomLight.position.set(0, 0, -10);
    this.scene.add(this.bottomLight);

    // Luz hemisférica general
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
      // Activar iluminación mejorada para modo color
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
      // Iluminación mejorada para modo normal
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

    this.mainGroup.add(this.polygonsGroup);
    this.mainGroup.add(this.helixGroup);
    this.mainGroup.add(this.rhombiGroup);
    this.mainGroup.add(this.edgesGroup);
    this.mainGroup.add(this.axisGroup);
    this.mainGroup.add(this.capGroup);

    this.scene.add(this.mainGroup);
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

    // Material para las aristas de los rombos/triángulos
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
   * 🔥 OPTIMIZACIÓN: Método para solicitar reconstrucción (con throttling)
   */
  requestRebuild() {
    if (this.isRebuilding) {
      this.rebuildRequested = true;
      return;
    }
    
    this.executeRebuild();
  }

  /**
   * 🔥 OPTIMIZACIÓN #2: Método que ejecuta la reconstrucción con lazy loading
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
      
      // Si hubo otra solicitud mientras reconstruíamos, ejecutarla
      if (this.rebuildRequested) {
        this.executeRebuild();
      }
    });
  }

  /**
   * 🔥 OPTIMIZACIÓN #2: LAZY LOADING PROGRESIVO
   * Construye la geometría en chunks para mantener UI responsive
   */
  rebuildSceneLazy() {
    // Primero limpiamos y construimos lo básico (rápido)
    this.clearGroups();
    clearRhombiData();

    const { N, cutActive, cutLevel, h1 } = state;

    // Ajustar posición vertical del grupo principal
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

    // Actualizar iluminación
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

    // Iniciar construcción lazy
    if (!this.lazyBuildInProgress) {
      this.processLazyBuildQueue();
    }
  }

  /**
   * Procesa la cola de construcción lazy (1 chunk por frame)
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
      this.processLazyBuildQueue();
    });
  }

  /**
   * Reconstrucción normal (síncrona) para N pequeños
   */
  rebuildScene() {
    this.clearGroups();
    clearRhombiData();

    const { N, cutActive, cutLevel, h1 } = state;

    // Ajustar posición vertical del grupo principal
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

    // 4) Tapa de corte (solo si está activo el corte)
    if (cutActive && state.rhombiVisible) {
      createCutCap(this.capGroup, this.matCap);
    }

    // 5) Axis and points
    if (state.axisVisible) {
      createAxisAndPoints(this.axisGroup, this.geomPoint, this.matPoint);
    }

    // 6) Actualizar iluminación según el modo
    this.updateLighting();
  }

  /**
   * Limpia todos los grupos correctamente
   */
  clearGroups() {
    this.clearGroup(this.polygonsGroup);
    this.clearGroup(this.helixGroup);
    this.clearGroup(this.rhombiGroup);
    this.clearGroup(this.edgesGroup);
    this.clearGroup(this.axisGroup);
    this.clearGroup(this.capGroup);
  }

  /**
   * Método mejorado para limpiar grupos y liberar memoria
   */
  clearGroup(group) {
    while (group.children.length > 0) {
      const child = group.children[0];
      
      // Liberar geometrías
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
      // Centrar en la porción visible del objeto cortado
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
  }

  resetCamera() {
    this.controls.reset();
    this.fitCamera();
  }

  handleResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    // Rotación automática en el eje Z (antihorario)
    if (state.isRotating) {
      this.mainGroup.rotation.z += state.rotationSpeed * 0.01;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.render());
  }
}
