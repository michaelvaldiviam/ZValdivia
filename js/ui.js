import { state, updateStateCalculations, rhombiData, hasEditState, resetEditState } from './state.js';
import { logger } from './logger.js';

// ── Mixins ─────────────────────────────────────────────────────────────────
import { applyNotificationMixin }     from './ui/notification-mixin.js';
import { applyInputSyncMixin }        from './ui/input-sync-mixin.js';
import { applyPanelMixin }            from './ui/panel-mixin.js';
import { applyConnectorEditorMixin }  from './ui/connector-editor-mixin.js';
import { applyBeamEditorMixin }       from './ui/beam-editor-mixin.js';
import { applyDiagonalMixin }         from './ui/diagonal-mixin.js';

/**
 * UIManager — orquesta la interfaz de usuario.
 *
 * La lógica de cada dominio vive en su propio mixin (js/ui/):
 *   NotificationMixin     – mensajes y advertencias al usuario
 *   InputSyncMixin        – debounce/throttle de sliders e inputs
 *   PanelMixin            – paneles, altura, corte, badges, estado
 *   ConnectorEditorMixin  – tooltip y modal de conectores
 *   BeamEditorMixin       – tooltip, modal y visor de vigas
 *   DiagonalMixin         – vigas extra, diagonales y selección múltiple
 *
 * Este archivo contiene únicamente: constructor, getDOMElements,
 * setupCollapsibleGroups, setupEventListeners, los toggles de visibilidad,
 * handleGenerateStructure, updateAllButtons e initialize.
 */
export class UIManager {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.debounceTimer = null;
    this.throttleTimer = null;
    this.isUpdating = false;
    this._throttleTimers = Object.create(null);
    this._notificationStyleInjected = false;
    // Timers separados para evitar condición de carrera entre debounce y throttle
    this._cutDebounceTimer = null;
    this._floorDebounceTimer = null;
    // AbortControllers para los keydown listeners de los modales (cleanup correcto)
    this._beamModalAbortCtrl = null;
    this._connectorModalAbortCtrl = null;

    this.getDOMElements();
    this.setupEventListeners();
    this._initConnectorEditModal();

    // Iniciar panel principal colapsado
    this.setMainPanelCollapsed(true);
  }

  getDOMElements() {
    // Main controls panel
    this.mainControls = document.getElementById('mainControls');
    this.advancedPanel = document.getElementById('advancedPanel');
    this.toggleAdvancedBtn = document.getElementById('toggleAdvancedBtn');
    this.closeAdvancedBtn = document.getElementById('closeAdvancedBtn');
    this.toggleInfoBtn = document.getElementById('toggleInfoBtn');
    this.quickInfo = document.getElementById('quickInfo');

    // Inputs - Main parameters
    this.dmaxNum = document.getElementById('dmaxNum');
    this.dmaxRange = document.getElementById('dmaxRange');
    this.dmaxControl = document.getElementById('dmaxControl');
    
    //   NUEVO: Controles de diametro del piso
    this.floorDiameterNum = document.getElementById('floorDiameterNum');
    this.floorDiameterRange = document.getElementById('floorDiameterRange');
    this.floorDiameterControl = document.getElementById('floorDiameterControl');

    this.nNum = document.getElementById('nNum');
    this.nRange = document.getElementById('nRange');
    this.aNum = document.getElementById('aNum');
    this.aRange = document.getElementById('aRange');

    // Buttons - Advanced panel
    this.facesBtn = document.getElementById('facesBtn');
    this.togglePolysBtn = document.getElementById('togglePolysBtn');
    this.toggleLinesBtn = document.getElementById('toggleLinesBtn');
    this.fitBtn = document.getElementById('fitBtn');
    this.beamWireframeBtn = document.getElementById('beamWireframeBtn');
    this.colorByLevelBtn = document.getElementById('colorByLevelBtn');
    this.toggleAxisBtn = document.getElementById('toggleAxisBtn');
    this.rotationBtn = document.getElementById('rotationBtn');

    // Estructura para conectores
    this.connCylDiameterMm = document.getElementById('connCylDiameterMm');
    this.connCylDepthMm = document.getElementById('connCylDepthMm');
    // Viga: "Alto" (crece hacia el interior) y "Ancho" (pasa por la arista)
    this.beamHeightMm = document.getElementById('beamHeightMm');
    this.beamWidthMm = document.getElementById('beamWidthMm');
    this.platThicknessMm = document.getElementById('platThicknessMm');
    this.platLengthMm = document.getElementById('platLengthMm');
    this.platWidthMm = document.getElementById('platWidthMm');
    this.generateStructureBtn = document.getElementById('generateStructureBtn');
    this.toggleStructureVisible = document.getElementById('toggleStructureVisible');
    this.exportStructureObjBtn = document.getElementById('exportStructureObjBtn');

    // Diagonales / aristas extra
    this.toggleDiagonalModeBtn = document.getElementById('toggleDiagonalModeBtn');
    this.clearExtraBeamsBtn = document.getElementById('clearExtraBeamsBtn');

    // Selección múltiple de vigas
    this.multiSelectBeamsBtn = document.getElementById('multiSelectBeamsBtn');
    this.multiSelectBeamsBtnLabel = document.getElementById('multiSelectBeamsBtnLabel');

    // Cut plane control
    this.cutBtn = document.getElementById('cutBtn');
    this.cutControls = document.getElementById('cutControls');
    this.cutLevelNum = document.getElementById('cutLevelNum');
    this.cutLevelRange = document.getElementById('cutLevelRange');

    // Rotation control
    this.rotationSpeed = document.getElementById('rotationSpeed');

    // Info displays
    this.infoH = document.getElementById('infoH');
    this.infoH1 = document.getElementById('infoH1');
    this.infoFaces = document.getElementById('infoFaces');
    this.infoDiameter = document.getElementById('infoDiameter');
    this.diameterLabel = document.getElementById('diameterLabel');
    this.infoRhombusSide = document.getElementById('infoRhombusSide');
    this.infoTriangleBase = document.getElementById('infoTriangleBase');
    this.triangleBaseInfo = document.getElementById('triangleBaseInfo');
    
    // Badges
    this.badgeN = document.getElementById('badgeN');
    this.badgeAngle = document.getElementById('badgeAngle');
    this.badgeDiameter = document.getElementById('badgeDiameter');
    this.badgeLevels = document.getElementById('badgeLevels');
    this.badgeLevelsValue = document.getElementById('badgeLevelsValue');
    this.badgeHeight = document.getElementById('badgeHeight');
    this.badgeHeightValue = document.getElementById('badgeHeightValue');

    // Panel collapse controls
    this.toggleMainPanelBtn = document.getElementById('toggleMainPanelBtn');
    this.paramsSection = document.getElementById('paramsSection');

    // Height indicator
    this.heightIndicator = document.getElementById('heightIndicator');
    this.heightIndicatorInput = document.getElementById('heightIndicatorInput');
    this.heightIndicatorButton = document.getElementById('heightIndicatorButton');
    this.heightIndicatorTimer = null;

    // Configurar grupos colapsables
    this.setupCollapsibleGroups();

    // Estado UI para modo diagonales
    this._diagModeActive = false;
    this._diagFirstHit = null;
    this._diagModalEl = null;

    // Estado UI para selección múltiple de vigas
    this._multiSelectModeActive = false;
    this._multiSelectedBeams = [];    // Array de { mesh, edgeKey, outlineMesh }
    this._multiSelectFloatEl = null;
    this._multiSelectToastEl = null;

  }

  setupCollapsibleGroups() {
    // Configurar todos los grupos colapsables
    const groupHeaders = document.querySelectorAll('.group-header');
    groupHeaders.forEach(header => {
      header.addEventListener('click', () => {
        const group = header.parentElement;
        group.classList.toggle('collapsed');
      });
    });

    // Por defecto, todos los grupos empiezan colapsados
    document.querySelectorAll('.option-group').forEach(g => g.classList.add('collapsed'));
  }


  setupEventListeners() {
    // Advanced panel controls
    if (this.toggleAdvancedBtn) 
      this.toggleAdvancedBtn.addEventListener('click', () => this.openAdvancedPanel());
    if (this.closeAdvancedBtn) 
      this.closeAdvancedBtn.addEventListener('click', () => this.closeAdvancedPanel());

    // Info panel toggle (solo movil)
    if (this.toggleInfoBtn) 
      this.toggleInfoBtn.addEventListener('click', () => this.toggleInfo());

    // Estructura para conectores
    if (this.generateStructureBtn) {
      this.generateStructureBtn.addEventListener('click', () => this.handleGenerateStructure());
    }

    // Modo diagonales (aristas extra)
    if (this.toggleDiagonalModeBtn) {
      this.toggleDiagonalModeBtn.addEventListener('click', () => this._toggleDiagonalMode());
    }
    if (this.clearExtraBeamsBtn) {
      this.clearExtraBeamsBtn.addEventListener('click', () => this._clearExtraBeams());
    }

    // Selección múltiple de vigas
    if (this.multiSelectBeamsBtn) {
      this.multiSelectBeamsBtn.addEventListener('click', () => this._toggleMultiSelectBeamsMode());
    }

    if (this.toggleStructureVisible) {
      this.toggleStructureVisible.addEventListener('change', (e) => {
        const isOn = !!e.target.checked;
        try {
          this.sceneManager.setStructureVisible(isOn);
        } catch (err) {
          logger.error(err);
        }
      });
    }

    if (this.exportStructureObjBtn) {
      this.exportStructureObjBtn.addEventListener('click', () => this.handleExportStructureOBJ());
    }

    // Main panel collapse toggle
    if (this.toggleMainPanelBtn)
      this.toggleMainPanelBtn.addEventListener('click', () => this.toggleMainPanel());

    // Input controls - con debouncing y throttling
    if (this.dmaxNum) 
      this.dmaxNum.addEventListener('input', () => this.debouncedSyncInputs('num', 'dmax'));
    if (this.dmaxRange) 
      this.dmaxRange.addEventListener('input', () => this.throttledSyncInputs('range', 'dmax'));

    //   NUEVO: Listeners para diametro del piso
    if (this.floorDiameterNum) 
      this.floorDiameterNum.addEventListener('input', () => this.debouncedSyncFloorDiameter('num'));
    if (this.floorDiameterRange) 
      this.floorDiameterRange.addEventListener('input', () => this.throttledSyncFloorDiameter('range'));

    // N es el mas critico - throttling mas agresivo
    if (this.nNum) {
      this.nNum.addEventListener('input', () => {
        this.debouncedSyncInputs('num', 'n');
      });
    }
    if (this.nRange) {
      this.nRange.addEventListener('input', () => {
        this.throttledSyncInputs('range', 'n');
      });
    }

    if (this.aNum) {
      this.aNum.addEventListener('input', () => {
        this.debouncedSyncInputs('num', 'a');
        this.showHeightIndicator();
      });
    }
    if (this.aRange) {
      this.aRange.addEventListener('input', () => {
        this.throttledSyncInputs('range', 'a');
        this.showHeightIndicator();
      });
      // NO ocultar automaticamente - dejar que el timer lo haga
    }

    // Cut plane controls
    if (this.cutLevelNum) {
      this.cutLevelNum.addEventListener('input', () => {
        this.debouncedSyncCutInputs('num');
      });
    }
    if (this.cutLevelRange) {
      this.cutLevelRange.addEventListener('input', () => {
        this.throttledSyncCutInputs('range');
      });
    }

    // Button controls
    if (this.facesBtn) 
      this.facesBtn.addEventListener('click', () => this.toggleFaces());
    if (this.togglePolysBtn) 
      this.togglePolysBtn.addEventListener('click', () => this.togglePolygons());
    if (this.toggleLinesBtn) 
      this.toggleLinesBtn.addEventListener('click', () => this.toggleLines());
    if (this.fitBtn) 
      this.fitBtn.addEventListener('click', () => this.sceneManager.fitCamera());

    // ── Vigas en arista (wireframe) ────────────────────────────────────────
    if (this.beamWireframeBtn) {
      this.beamWireframeBtn.addEventListener('click', () => this._toggleBeamWireframe());
    }

    // Height indicator interactivity
    if (this.heightIndicatorInput) {
      this.heightIndicatorInput.addEventListener('focus', () => this.onHeightInputFocus());
      this.heightIndicatorInput.addEventListener('blur', () => this.onHeightInputBlur());
      this.heightIndicatorInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.applyHeightChange();
        }
      });
    }
    if (this.heightIndicatorButton) {
      this.heightIndicatorButton.addEventListener('click', () => this.applyHeightChange());
    }
    if (this.colorByLevelBtn) 
      this.colorByLevelBtn.addEventListener('click', () => this.toggleColorByLevel());
    if (this.toggleAxisBtn) 
      this.toggleAxisBtn.addEventListener('click', () => this.toggleAxis());
    if (this.rotationBtn) 
      this.rotationBtn.addEventListener('click', () => this.toggleRotation());
    if (this.cutBtn) 
      this.cutBtn.addEventListener('click', () => this.toggleCut());

    // Rotation speed control
    if (this.rotationSpeed) 
      this.rotationSpeed.addEventListener('input', (e) => this.updateRotationSpeed(e));

    // Seleccion interactiva de conectores y vigas (clic/tap sobre estructura)
    if (this.sceneManager && this.sceneManager.renderer && this.sceneManager.renderer.domElement) {
      const canvas = this.sceneManager.renderer.domElement;
      canvas.addEventListener('pointerdown', (ev) => {
        if (!state.structureVisible || !state.structureParams) return;

        // Prioridad: conectores (cilindros) sobre vigas (cajas)
        const hitConn = this.sceneManager.pickConnector(ev.clientX, ev.clientY);
        if (hitConn) {
          try { ev.preventDefault(); } catch (e) {}
          // Si esta activo el modo diagonales, el tap de conectores se usa para construir aristas extra.
          if (this._diagModeActive) {
            this._handleDiagonalConnectorTap(hitConn);
          } else {
            this._handleConnectorTap(hitConn);
          }
          return;
        }

        const hitBeam = (this.sceneManager && typeof this.sceneManager.pickBeam === 'function')
          ? this.sceneManager.pickBeam(ev.clientX, ev.clientY)
          : null;

        if (hitBeam) {
          try { ev.preventDefault(); } catch (e) {}
          // Modo selección múltiple: intercept antes del flujo normal
          if (this._multiSelectModeActive) {
            this._handleMultiSelectBeamTap(hitBeam);
          } else {
            this._handleBeamTap(hitBeam);
          }
          return;
        }

        // Click en vacio: limpiar selecciones (solo en modo normal)
        if (!this._multiSelectModeActive) {
          this._clearConnectorTooltipAndSelection();
          this._clearBeamTooltipAndSelection();
        }

        // Si estabamos en modo diagonales, resetear el primer conector seleccionado
        if (this._diagModeActive) {
          this._diagFirstHit = null;
        }
      }, { passive: false });

      // Registrar updater para tooltip flotante (conectores + vigas)
      if (this.sceneManager && typeof this.sceneManager.setOverlayUpdater === 'function') {
        this.sceneManager.setOverlayUpdater(() => {
          this._updateConnectorTooltipPosition();
          this._updateBeamTooltipPosition();
        });
      }
    }

    // Window resize
    window.addEventListener('resize', () => this.sceneManager.handleResize());
  }


  toggleFaces() {
    state.rhombiVisible = !state.rhombiVisible;
    if (this.facesBtn) {
      this.facesBtn.classList.toggle('active', state.rhombiVisible);
      const status = this.facesBtn.querySelector('.button-status');
      if (status) {
        status.textContent = state.rhombiVisible ? ' ' : ' ';
      }
    }
    this.sceneManager.requestRebuild();
    this.updateFacesCount();
  }

  togglePolygons() {
    state.polysVisible = !state.polysVisible;
    if (this.togglePolysBtn) {
      this.togglePolysBtn.classList.toggle('active', state.polysVisible);
      const status = this.togglePolysBtn.querySelector('.button-status');
      if (status) {
        status.textContent = state.polysVisible ? ' ' : ' ';
      }
    }
    this.sceneManager.requestRebuild();
  }

  toggleLines() {
    state.linesVisible = !state.linesVisible;
    if (this.toggleLinesBtn) {
      this.toggleLinesBtn.classList.toggle('active', state.linesVisible);
      const status = this.toggleLinesBtn.querySelector('.button-status');
      if (status) {
        status.textContent = state.linesVisible ? ' ' : ' ';
      }
    }
    this.sceneManager.requestRebuild();
  }

  toggleColorByLevel() {
    // Verificar si las caras estan activadas
    if (!state.rhombiVisible) {
      this.showNotification('Debes activar las caras primero para cambiar el skin');
      return;
    }

    state.colorByLevel = !state.colorByLevel;
    if (this.colorByLevelBtn) {
      this.colorByLevelBtn.classList.toggle('active', state.colorByLevel);
      const status = this.colorByLevelBtn.querySelector('.button-status');
      if (status) {
        status.textContent = state.colorByLevel ? ' ' : ' ';
      }
    }
    this.sceneManager.requestRebuild();
    this.updateFacesCount();
  }

  toggleAxis() {
    state.axisVisible = !state.axisVisible;
    if (this.toggleAxisBtn) {
      this.toggleAxisBtn.classList.toggle('active', state.axisVisible);
      const status = this.toggleAxisBtn.querySelector('.button-status');
      if (status) {
        status.textContent = state.axisVisible ? ' ' : ' ';
      }
    }
    this.sceneManager.requestRebuild();
  }

  toggleRotation() {
    state.isRotating = !state.isRotating;
    if (this.rotationBtn) {
      this.rotationBtn.classList.toggle('rotating', state.isRotating);
      this.rotationBtn.textContent = state.isRotating ? 'Pausar' : 'Rotar';
    }
  }

  toggleCut() {
    state.cutActive = !state.cutActive;
    if (this.cutBtn) {
      this.cutBtn.classList.toggle('active', state.cutActive);
      // Actualizar solo el texto del span, manteniendo el SVG
      const btnText = this.cutBtn.querySelector('span');
      if (btnText) {
        btnText.textContent = state.cutActive ? 'Desactivar porcion' : 'Crear porcion';
      }
    }

    //   NUEVO: Actualizar altura visible
    this.updateHeightDisplay();
    
    //   NUEVO: Actualizar controles de diametro
    this.toggleDiameterControls();
    
    //   NUEVO: Actualizar badges
    this.updateBadges();

    this.sceneManager.requestRebuild();
    this.updateFacesCount();
    this.updateGeometryInfo();
  }

  updateRotationSpeed(e) {
    const speedValue = parseFloat(e.target.value);
    state.rotationSpeed = speedValue / 100;
  }

  /**
   * Genera la estructura de vigas + conectores en la escena
   */
  handleGenerateStructure() {
    // Si modo arista estaba activo, desactivarlo y resetear botón
    if (this._beamEdgeMode) {
      this._beamEdgeMode = false;
      if (this.beamWireframeBtn) {
        this.beamWireframeBtn.classList.remove('active');
        const st = this.beamWireframeBtn.querySelector('.button-status');
        if (st) st.textContent = '○';
      }
    }

    const cylDiameterMm = Number((this.connCylDiameterMm && this.connCylDiameterMm.value) ? this.connCylDiameterMm.value : 0);
    const cylDepthMm = Number((this.connCylDepthMm && this.connCylDepthMm.value) ? this.connCylDepthMm.value : 0);
    const beamHeightMm = Number((this.beamHeightMm && this.beamHeightMm.value) ? this.beamHeightMm.value : 0);
    const beamWidthMm = Number((this.beamWidthMm && this.beamWidthMm.value) ? this.beamWidthMm.value : 0);
    const platThicknessMm = Number((this.platThicknessMm && this.platThicknessMm.value) ? this.platThicknessMm.value : 3);
    const platLengthMm = Number((this.platLengthMm && this.platLengthMm.value) ? this.platLengthMm.value : 120);
    const platWidthMm = Number((this.platWidthMm && this.platWidthMm.value) ? this.platWidthMm.value : 50);

    if (!cylDiameterMm || !cylDepthMm || !beamHeightMm || !beamWidthMm) {
      this.showNotification('Ingresa diametro/profundidad del conector y alto/ancho de la viga (mm).', 'error');
      return;
    }

    try {
      // Usar helpers de state.js para verificar y resetear ediciones
      if (hasEditState() && !confirm('Regenerar la estructura descartará todas las ediciones personalizadas (vigas eliminadas, conectores editados, etc.). ¿Continuar?')) {
        return;
      }
      resetEditState();
      this.sceneManager.generateConnectorStructure({
        cylDiameterMm,
        cylDepthMm,
        beamHeightMm,
        beamWidthMm,
        platThicknessMm: platThicknessMm > 0 ? platThicknessMm : 3,
        platLengthMm: platLengthMm > 0 ? platLengthMm : 120,
        platWidthMm: platWidthMm > 0 ? platWidthMm : 50,
      });
      this._maybeShowStructureWarnings();
      // Por defecto, dejar visible al generar
      try {
        this.sceneManager.setStructureVisible(true);
        if (this.toggleStructureVisible) this.toggleStructureVisible.checked = true;
      } catch (_) {}
      this.updateAllButtons();
      this.showNotification('Estructura generada. Se actualizara automaticamente al cambiar parametros del zonohedro mientras este activa.', 'success');
    } catch (err) {
      logger.error(err);
      this.showNotification('No se pudo generar la estructura. Revisa la consola para detalles.', 'error');
    }
  }

  /**
   * Descarga un OBJ solo de la estructura (vigas + conectores)
   */
  handleExportStructureOBJ() {
    try {
      this.sceneManager.exportConnectorStructureOBJ();
      this.showNotification('OBJ de estructura descargado.', 'success');
    } catch (err) {
      logger.error(err);
      this.showNotification('No se pudo exportar la estructura. Genera la estructura primero.', 'error');
    }
  }

    /**
   * Actualiza todos los botones segun el estado actual
   */
  updateAllButtons() {
    // Actualizar inputs
    if (this.dmaxNum) this.dmaxNum.value = state.Dmax.toFixed(3);
    if (this.dmaxRange) this.dmaxRange.value = state.Dmax.toFixed(3);
    if (this.nNum) this.nNum.value = state.N;
    if (this.nRange) this.nRange.value = state.N;
    if (this.aNum) this.aNum.value = state.aDeg.toFixed(2);
    if (this.aRange) this.aRange.value = state.aDeg.toFixed(2);

    // Estructura: restaurar parametros y toggle desde state (para enlaces compartidos / JSON)
    if (state.structureParams) {
      const p = state.structureParams;
      if (this.connCylDiameterMm && Number.isFinite(Number(p.cylDiameterMm))) this.connCylDiameterMm.value = String(Math.round(Number(p.cylDiameterMm)));
      if (this.connCylDepthMm && Number.isFinite(Number(p.cylDepthMm))) this.connCylDepthMm.value = String(Math.round(Number(p.cylDepthMm)));
      if (this.beamWidthMm && Number.isFinite(Number(p.beamWidthMm))) this.beamWidthMm.value = String(Math.round(Number(p.beamWidthMm)));
      if (this.beamHeightMm && Number.isFinite(Number(p.beamHeightMm))) this.beamHeightMm.value = String(Math.round(Number(p.beamHeightMm)));
      if (this.platThicknessMm && Number.isFinite(Number(p.platThicknessMm))) this.platThicknessMm.value = String(Number(p.platThicknessMm));
      if (this.platLengthMm && Number.isFinite(Number(p.platLengthMm))) this.platLengthMm.value = String(Number(p.platLengthMm));
      if (this.platWidthMm && Number.isFinite(Number(p.platWidthMm))) this.platWidthMm.value = String(Number(p.platWidthMm));
    }
    if (this.toggleStructureVisible) {
      this.toggleStructureVisible.checked = !!state.structureVisible;
    }

    // Diagonales: habilitar solo si hay estructura real en escena
    const canDiag = this._structureIsGenerated();
    if (this.toggleDiagonalModeBtn) {
      this.toggleDiagonalModeBtn.disabled = !canDiag;
      this.toggleDiagonalModeBtn.classList.toggle('zv-disabled', !canDiag);
      if (!canDiag && this._diagModeActive) {
        this._diagModeActive = false;
        this.toggleDiagonalModeBtn.classList.remove('active');
        this._diagFirstHit = null;
      }
    }
    if (this.clearExtraBeamsBtn) {
      this.clearExtraBeamsBtn.disabled = !canDiag;
      this.clearExtraBeamsBtn.classList.toggle('zv-disabled', !canDiag);
    }
    if (this.multiSelectBeamsBtn) {
      this.multiSelectBeamsBtn.disabled = !canDiag;
      this.multiSelectBeamsBtn.classList.toggle('zv-disabled', !canDiag);
      // Si la estructura desaparece mientras el modo está activo, salir limpiamente
      if (!canDiag && this._multiSelectModeActive) {
        this._exitMultiSelectBeamsMode(false);
      }
    }

    // Faces
    if (this.facesBtn) {
      this.facesBtn.classList.toggle('active', state.rhombiVisible);
      const status = this.facesBtn.querySelector('.button-status');
      if (status) {
        status.textContent = state.rhombiVisible ? ' ' : ' ';
      }
    }

    // Polygons
    if (this.togglePolysBtn) {
      this.togglePolysBtn.classList.toggle('active', state.polysVisible);
      const status = this.togglePolysBtn.querySelector('.button-status');
      if (status) {
        status.textContent = state.polysVisible ? ' ' : ' ';
      }
    }

    // Lines
    if (this.toggleLinesBtn) {
      this.toggleLinesBtn.classList.toggle('active', state.linesVisible);
      const status = this.toggleLinesBtn.querySelector('.button-status');
      if (status) {
        status.textContent = state.linesVisible ? ' ' : ' ';
      }
    }

    // Axis
    if (this.toggleAxisBtn) {
      this.toggleAxisBtn.classList.toggle('active', state.axisVisible);
      const status = this.toggleAxisBtn.querySelector('.button-status');
      if (status) {
        status.textContent = state.axisVisible ? ' ' : ' ';
      }
    }

    // Color by level
    if (this.colorByLevelBtn) {
      this.colorByLevelBtn.classList.toggle('active', state.colorByLevel);
      const status = this.colorByLevelBtn.querySelector('.button-status');
      if (status) {
        status.textContent = state.colorByLevel ? ' ' : ' ';
      }
    }

    // Cut button
    if (this.cutBtn) {
      this.cutBtn.classList.toggle('active', state.cutActive);
      const btnText = this.cutBtn.querySelector('span');
      if (btnText) {
        btnText.textContent = state.cutActive ? 'Desactivar porcion' : 'Crear porcion';
      }
    }

    // Toggle diameter controls
    this.toggleDiameterControls();
    this.updateCutLevelDisplay();
    this.updateGeometryInfo();
    this.updateBadges();
  }

  initialize() {
    // Cerrar panel avanzado al inicio
    this.closeAdvancedPanel();

    // En movil, ocultar info por defecto
    if (window.innerWidth <= 640 && this.quickInfo) {
      this.quickInfo.classList.add('collapsed');
    }

    this.updateState();
    this.updateAllButtons();
    this.updateGeometryInfo(); // Inicializar valores geometricos
    this.sceneManager.requestRebuild();
    this.sceneManager.fitCamera();
    this.updateFacesCount();

    // Registrar hook: después de cualquier regeneración de estructura,
    // reaplicar el modo "Vigas en arista" si estaba activo.
    this.sceneManager._onAfterGenerate = () => {
      if (!this._beamEdgeMode) return;
      const gen = this.sceneManager.structureGenerator;
      if (!gen) return;
      // Reconstruir EdgesGeometry (la estructura fue borrada y recreada)
      gen.buildBeamEdgeLines(true);
      // Ocultar sólidos, mostrar aristas
      for (const obj of this.sceneManager.structureGroup.children) {
        if (!obj || !obj.userData) continue;
        if (obj.userData.isBeam)     obj.visible = false;
        if (obj.userData.isBeamEdge) obj.visible = true;
      }
    };

  }

}

// ── Apply mixins ──────────────────────────────────────────────────────────
applyNotificationMixin(UIManager.prototype);
applyInputSyncMixin(UIManager.prototype);
applyPanelMixin(UIManager.prototype);
applyConnectorEditorMixin(UIManager.prototype);
applyBeamEditorMixin(UIManager.prototype);
applyDiagonalMixin(UIManager.prototype);
