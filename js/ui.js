import { state, updateStateCalculations, rhombiData } from './state.js';
import * as THREE from 'three';

/**
 * Maneja toda la logica de la interfaz de usuario
 */
export class UIManager {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.debounceTimer = null;
    this.throttleTimer = null;
    this.isUpdating = false;

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
    this.colorByLevelBtn = document.getElementById('colorByLevelBtn');
    this.toggleAxisBtn = document.getElementById('toggleAxisBtn');
    this.rotationBtn = document.getElementById('rotationBtn');

    // Estructura para conectores
    this.connCylDiameterMm = document.getElementById('connCylDiameterMm');
    this.connCylDepthMm = document.getElementById('connCylDepthMm');
    // Viga: "Alto" (crece hacia el interior) y "Ancho" (pasa por la arista)
    this.beamHeightMm = document.getElementById('beamHeightMm');
    this.beamWidthMm = document.getElementById('beamWidthMm');
    this.generateStructureBtn = document.getElementById('generateStructureBtn');
    this.toggleStructureVisible = document.getElementById('toggleStructureVisible');
    this.exportStructureObjBtn = document.getElementById('exportStructureObjBtn');

    // Diagonales / aristas extra
    this.toggleDiagonalModeBtn = document.getElementById('toggleDiagonalModeBtn');
    this.clearExtraBeamsBtn = document.getElementById('clearExtraBeamsBtn');

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

    //   PERFORMANCE: No crear indicador de FPS (opcional)
    // this.createPerformanceIndicator();
    
    // Configurar grupos colapsables
    this.setupCollapsibleGroups();

    // Estado UI para modo diagonales
    this._diagModeActive = false;
    this._diagFirstHit = null;
    this._diagModalEl = null;
  }

  createPerformanceIndicator() {
    // Crear elemento de FPS si no existe
    if (!document.getElementById('fpsCounter')) {
      const fpsDiv = document.createElement('div');
      fpsDiv.id = 'fpsCounter';
      fpsDiv.style.cssText = `
        position: fixed;
        bottom: 12px;
        left: 12px;
        background: rgba(20, 20, 25, 0.85);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        padding: 6px 10px;
        font-family: ui-monospace, Menlo, Consolas, monospace;
        font-size: 11px;
        color: #9ca3af;
        z-index: 100;
        pointer-events: none;
      `;
      fpsDiv.textContent = 'FPS: --';
      document.body.appendChild(fpsDiv);
      this.fpsCounter = fpsDiv;
    }
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

  showNotification(message, type = 'info') {
    // Crear notificacion temporal
    const notification = document.createElement('div');

    // Colores segun el tipo
    let borderColor = 'rgba(255, 165, 0, 0.5)'; // warning (naranja)
    let iconColor = '#f59e0b';
    let icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

    if (type === 'success') {
      borderColor = 'rgba(34, 197, 94, 0.5)'; // verde
      iconColor = '#22c55e';
      icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9 12l2 2 4-4"></path></svg>`;
    } else if (type === 'error') {
      borderColor = 'rgba(239, 68, 68, 0.5)'; // rojo
      iconColor = '#ef4444';
      icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    }

    notification.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(20, 20, 25, 0.95);
      backdrop-filter: blur(20px);
      border: 1px solid ${borderColor};
      border-radius: 12px;
      padding: 20px 28px;
      font-size: 14px;
      color: #ececec;
      z-index: 1000;
      box-shadow: 0 10px 40px rgba(0,0,0,0.6);
      animation: slideIn 0.3s ease-out;
      max-width: 90%;
      text-align: center;
    `;

    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        ${icon}
        <span>${message}</span>
      </div>
    `;

    // Agregar animacion CSS
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translate(-50%, -60%);
        }
        to {
          opacity: 1;
          transform: translate(-50%, -50%);
        }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notification);

    // Overlay invisible para permitir cerrar tocando fuera
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: transparent;
      z-index: 999;
    `;
    document.body.appendChild(overlay);

    let closed = false;
    const closeNow = () => {
      if (closed) return;
      closed = true;
      // Animación de salida
      notification.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => {
        try { if (notification.parentNode) notification.parentNode.removeChild(notification); } catch(e){}
        try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch(e){}
        try { if (style.parentNode) style.parentNode.removeChild(style); } catch(e){}
      }, 300);
    };

    // Si el usuario toca fuera del mensaje, se cierra al instante
    overlay.addEventListener('pointerdown', closeNow, { passive: true });
    overlay.addEventListener('click', closeNow, { passive: true });

    // Remover despues de 2.5 segundos (mas tiempo para info)
    const duration = type === 'info' ? 3000 : 2500;
    setTimeout(() => {
      closeNow();
    }, duration);
  }

  // Muestra advertencias generadas al crear la estructura (por ejemplo vigas demasiado cortas)
  // Se usa state.lastStructureWarnings (seteado por SceneManager) y se limpia al mostrar.
  _maybeShowStructureWarnings() {
    const warnings = (state && state.lastStructureWarnings) ? state.lastStructureWarnings : [];
    if (!warnings || warnings.length === 0) return;

    const tooShort = warnings.filter(w => w && w.type === 'BEAM_TOO_SHORT');
    if (tooShort.length > 0) {
      const sample = tooShort[0];
      const sampleId = (sample && sample.beamId) ? ` (${sample.beamId})` : '';
      const msg = `Advertencia: ${tooShort.length} viga(s) quedaron demasiado cortas para el bisel${sampleId}. Ajusta diametro/profundidad de conectores o dimensiones de viga.`;
      this.showNotification(msg, 'warning');
    } else {
      this.showNotification(`Advertencia: ${warnings.length} evento(s) durante la generacion de estructura.`, 'warning');
    }

    state.lastStructureWarnings = [];
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

    if (this.toggleStructureVisible) {
      this.toggleStructureVisible.addEventListener('change', (e) => {
        const isOn = !!e.target.checked;
        try {
          this.sceneManager.setStructureVisible(isOn);
        } catch (err) {
          console.error(err);
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
          this._handleBeamTap(hitBeam);
          return;
        }

        // Click en vacio: limpiar selecciones
        this._clearConnectorTooltipAndSelection();
        this._clearBeamTooltipAndSelection();

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


  editConnectorForSelection(hit) {
    if (!hit || typeof hit.kOriginal !== 'number') return;
    if (!state.structureParams) return;
    this._openConnectorEditModal(hit);
  }


_handleConnectorTap(hit) {
  if (!hit || !hit.mesh) return;

  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const same = (this._lastConnectorMeshUuid && hit.mesh.uuid === this._lastConnectorMeshUuid);
  const dt = (this._lastConnectorTapTime != null) ? (now - this._lastConnectorTapTime) : 1e9;

  // Primer tap: tooltip + resaltado. Segundo tap rapido en el mismo conector: abrir modal.
  const DOUBLE_TAP_MS = 650;

  this._lastConnectorTapTime = now;

  if (same && dt <= DOUBLE_TAP_MS) {
    // Segundo tap: abrir modal
    this._hideConnectorTooltip();
    this.editConnectorForSelection(hit);
    return;
  }

  // Tap a un conector distinto (o demasiado lento): mostrar tooltip
  this._lastConnectorMeshUuid = hit.mesh.uuid;
  this._showConnectorTooltip(hit);
}

_initConnectorTooltip() {
  if (this._connectorTooltipEl) return;
  const el = document.createElement('div');
  el.id = 'zvConnectorTooltip';
  el.className = 'zv-connector-tooltip zv-hidden';
  el.innerHTML = '<div class="zv-ct-title"></div><div class="zv-ct-sub"></div>';
  document.body.appendChild(el);
  this._connectorTooltipEl = el;
  this._connectorTooltipTitle = el.querySelector('.zv-ct-title');
  this._connectorTooltipSub = el.querySelector('.zv-ct-sub');
}

_showConnectorTooltip(hit) {
  if (!hit || !hit.mesh) return;
  this._initConnectorTooltip();

  // Resaltar seleccionado (sin abrir modal)
  try {
    if (this.sceneManager && typeof this.sceneManager.setSelectedConnector === 'function') {
      this.sceneManager.setSelectedConnector(hit.mesh);
    }
  } catch (e) {}

  // Texto tooltip
  const kv = (hit.kVisible != null) ? hit.kVisible : hit.kOriginal;
  const isPoleLow = (hit.kOriginal === 0);
  const isPoleTop = (hit.kOriginal === state.N);
  let typeLabel = 'Nivel intermedio';
  if (state.cutActive) {
    // Con corte activo, el nivel visible mas bajo (kVisible=0) es el "suelo".
    if (kv === 0) typeLabel = 'Suelo';
    else if (isPoleTop) typeLabel = 'Polo superior';
  } else {
    if (isPoleLow) typeLabel = 'Polo inferior';
    else if (isPoleTop) typeLabel = 'Polo superior';
  }

  if (this._connectorTooltipTitle) {
    this._connectorTooltipTitle.textContent = `Conector k${kv} (${typeLabel})`;
  }
  if (this._connectorTooltipSub) {
    this._connectorTooltipSub.textContent = 'Toca nuevamente para editar';
  }

  this._connectorTooltipHit = hit;
  this._connectorTooltipEl.classList.remove('zv-hidden');

  // Auto-ocultar si no hay segundo tap
  if (this._connectorTooltipTimer) {
    try { clearTimeout(this._connectorTooltipTimer); } catch (e) {}
    this._connectorTooltipTimer = null;
  }
  this._connectorTooltipTimer = setTimeout(() => {
    // Si el usuario no edito, ocultar solo el tooltip (mantener resaltado puede ser util)
    this._hideConnectorTooltip(true);
  }, 2500);

  this._updateConnectorTooltipPosition();
}

_hideConnectorTooltip(keepSelection) {
  if (this._connectorTooltipTimer) {
    try { clearTimeout(this._connectorTooltipTimer); } catch (e) {}
    this._connectorTooltipTimer = null;
  }
  if (this._connectorTooltipEl) {
    this._connectorTooltipEl.classList.add('zv-hidden');
  }
  this._connectorTooltipHit = null;

  if (!keepSelection) {
    try {
      if (this.sceneManager && typeof this.sceneManager.setSelectedConnector === 'function') {
        this.sceneManager.setSelectedConnector(null);
      }
    } catch (e) {}
    this._lastConnectorMeshUuid = null;
  }
}

_clearConnectorTooltipAndSelection() {
  this._hideConnectorTooltip(false);
  this._lastConnectorTapTime = null;
}

// =========================
//  Diagonales / aristas extra
// =========================

_structureIsGenerated() {
  try {
    return !!(this.sceneManager && this.sceneManager.structureGroup && this.sceneManager.structureGroup.children && this.sceneManager.structureGroup.children.some(o => o && o.userData && o.userData.isConnector));
  } catch (e) {
    return false;
  }
}

_toggleDiagonalMode() {
  const willEnable = !this._diagModeActive;

  // Evitar activar sin estructura generada (confunde al usuario y no hay conectores para seleccionar)
  if (willEnable && !this._structureIsGenerated()) {
    this._diagModeActive = false;
    if (this.toggleDiagonalModeBtn) {
      this.toggleDiagonalModeBtn.classList.remove('active');
    }
    this.showNotification('Genera la estructura (vigas + conectores) antes de usar vigas extra.', 'error');
    this._setExitExtraModeButtonVisible(false);
    this._setExtraModeToastVisible(false, '');
    return;
  }

  this._diagModeActive = willEnable;
  if (this.toggleDiagonalModeBtn) {
    this.toggleDiagonalModeBtn.classList.toggle('active', this._diagModeActive);
  }
  this._diagFirstHit = null;

  this._setExitExtraModeButtonVisible(this._diagModeActive);
  this._setExtraModeToastVisible(this._diagModeActive, this._diagModeActive ? 'Toca 2 conectores del mismo rombo (arista o diagonal)' : '');

  if (this._diagModeActive) {
    this.showNotification('Modo vigas extra: toca 2 conectores del mismo rombo (arista o diagonal).', 'success');
  } else {
    this.showNotification('Modo vigas extra desactivado.', 'success');
  }
}

_ensureExitExtraModeButton() {
  if (this._exitExtraModeBtn) return;
  const btn = document.createElement('button');
  btn.id = 'zvExitExtraModeBtn';
  btn.className = 'zv-exit-extra-mode-btn';
  btn.type = 'button';
  btn.title = 'Salir del modo vigas extra';
  btn.textContent = 'Salir';
  btn.addEventListener('click', () => {
    if (this._diagModeActive) this._toggleDiagonalMode();
  });
  document.body.appendChild(btn);
  this._exitExtraModeBtn = btn;
}

_setExitExtraModeButtonVisible(isVisible) {
  this._ensureExitExtraModeButton();
  if (!this._exitExtraModeBtn) return;
  this._exitExtraModeBtn.style.display = isVisible ? '' : 'none';
}

  _ensureExtraModeToast() {
    if (this._extraModeToastEl) return;
    const el = document.createElement('div');
    el.id = 'zvExtraModeToast';
    el.className = 'zv-extra-mode-toast zv-hidden';
    el.innerHTML = `
      <div class="zv-extra-mode-toast-title">Modo vigas extra</div>
      <div class="zv-extra-mode-toast-sub">Toca 2 conectores del mismo rombo</div>
    `;
    document.body.appendChild(el);
    this._extraModeToastEl = el;
  }

  _setExtraModeToastVisible(isVisible, subText) {
    this._ensureExtraModeToast();
    if (!this._extraModeToastEl) return;
    const sub = this._extraModeToastEl.querySelector('.zv-extra-mode-toast-sub');
    if (sub && typeof subText === 'string') sub.textContent = subText;
    this._extraModeToastEl.classList.toggle('zv-hidden', !isVisible);
  }



_clearExtraBeams() {
  state.structureExtraBeams = [];
  state.structureIntersectionFaces = {};
  // Mantener overrides de conectores normales y vigas, pero limpiar overrides de interseccion
  // ya que los nodos centrales dependen de las diagonales.
  state.structureIntersectionConnectorOverrides = {};
  this._diagFirstHit = null;
  try {
    // Regenerar estructura conservando params y overrides
    if (state.structureParams) {
      this.sceneManager.generateConnectorStructure({ ...state.structureParams });
      this._maybeShowStructureWarnings();
    }
  } catch (e) {
    console.error(e);
  }
  this.showNotification('Vigas extra eliminadas.', 'success');
}

_handleDiagonalConnectorTap(hit) {
  if (!hit || !hit.mesh) return;

  // Primer conector
  if (!this._diagFirstHit) {
    this._diagFirstHit = hit;
    // Reusar tooltip/resaltado existente
    this._showConnectorTooltip(hit);
    if (this._connectorTooltipSub) {
      this._connectorTooltipSub.textContent = 'Ahora toca un segundo conector del mismo rombo';
    }
    return;
  }

  // Segundo conector
  const a = this._diagFirstHit;
  const b = hit;
  this._diagFirstHit = null;

  // Evitar seleccionar el mismo
  if (a.mesh.uuid === b.mesh.uuid) {
    this.showNotification('Selecciona un segundo conector distinto.', 'error');
    return;
  }


  // ✅ Caso especial: si el usuario eliminó una viga (arista o extra) y ahora selecciona
  // exactamente los mismos 2 conectores, restauramos la viga removiéndola del blacklist
  // incluso si no pertenecen a un rombo visible (por ejemplo, arista en triángulo del corte).
  try {
    if (Array.isArray(state.structureDeletedBeams) && state.structureDeletedBeams.length && state.structureParams) {
      const keyFor = (k, i) => {
        k = Number(k);
        if (!isFinite(k)) return null;
        if (k === 0) return 'pole_low';
        if (k === state.N) return 'pole_top';
        return 'k' + k + '_i' + i;
      };
      const aKey = keyFor(a.kOriginal, a.i);
      const bKey = keyFor(b.kOriginal, b.i);
      if (aKey && bKey && aKey !== bKey) {
        const ek = (aKey < bKey) ? (aKey + '|' + bKey) : (bKey + '|' + aKey);
        const idx = state.structureDeletedBeams.indexOf(ek);
        if (idx !== -1) {
          state.structureDeletedBeams.splice(idx, 1);
          // Regenerar estructura: la viga restaurada recupera sus datos originales
          // (o los de la viga extra correspondiente si existía en structureExtraBeams).
          this.sceneManager.generateConnectorStructure({ ...state.structureParams });
          this._maybeShowStructureWarnings();
          this.showNotification('Viga restaurada.', 'success');
          return;
        }
      }
    }
  } catch (e) {
    console.error(e);
  }

  // Encontrar un rombo (cara quad) que contenga ambos conectores
  const face = this._findQuadFaceContaining(a, b);
  if (!face) {
    this.showNotification('Estos conectores no estan dentro del mismo rombo visible (o estas tocando un triangulo del corte).', 'error');
    return;
  }

  // Guardar seleccion para permitir crear una ARISTA entre los conectores elegidos
  this._diagModalSel = {
    a: { k: Number(a.kOriginal), i: Number(a.i) },
    b: { k: Number(b.kOriginal), i: Number(b.i) },
    aId: (a.mesh && a.mesh.userData && a.mesh.userData.connectorInfo) ? a.mesh.userData.connectorInfo.id : null,
    bId: (b.mesh && b.mesh.userData && b.mesh.userData.connectorInfo) ? b.mesh.userData.connectorInfo.id : null,
  };

  this._openDiagonalModal(face);
}

_findQuadFaceContaining(hitA, hitB) {
  const { N, cutActive, cutLevel } = state;

  const vA = { k: Number(hitA.kOriginal), i: Number(hitA.i) };
  const vB = { k: Number(hitB.kOriginal), i: Number(hitB.i) };
  if (!isFinite(vA.k) || !isFinite(vB.k) || !isFinite(vA.i) || !isFinite(vB.i)) return null;

  // Build visible faces using the same rules as StructureGenerator._buildVisibleFaces()
  const startK = cutActive ? cutLevel : 1;

  const same = (p, q) => (p.k === q.k && p.i === q.i) || (p.k === q.k && (p.k === 0 || p.k === N));
  const inFace = (verts, p) => verts.some(v => same(v, p));

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
        // Triangulo del corte (no admite diagonales internas)
        continue;
      }

      const vBottom = { k: k - 1, i };
      const vTop = { k: k + 1, i };
      const verts = [vBottom, vRight, vTop, vLeft];

      if (inFace(verts, vA) && inFace(verts, vB)) {
        return {
          kFace: k,
          iFace: i,
          verts,
          diagH: { a: vLeft, b: vRight },
          diagV: { a: vBottom, b: vTop },
          label: `Rombo (k${cutActive ? Math.max(0, k - cutLevel) : k}, i${i})`,
        };
      }
    }
  }
  return null;
}


_ensureDiagonalModal() {
  if (this._diagModalEl) return;

  const overlay = document.createElement('div');
  overlay.className = 'zv-modal-overlay zv-hidden';
  overlay.id = 'zvExtraBeamModalOverlay';
  overlay.innerHTML = `
    <div class="zv-modal" role="dialog" aria-modal="true">
      <div class="zv-modal-header">
        <div class="zv-modal-title" id="zvDiagModalTitle">Crear viga extra</div>
        <button class="zv-modal-close" id="zvDiagModalClose" aria-label="Cerrar">✕</button>
      </div>
      <div class="zv-modal-body">
        <div class="zv-modal-section" style="margin-top:6px;">
          <div style="font-size:12px; color: rgba(255,255,255,0.75);" id="zvDiagModalSubtitle"></div>
        </div>

        <div class="zv-modal-section" style="margin-top:14px;">
          <div class="zv-modal-label">Tipo</div>
          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:8px;">
            <label class="zv-pill"><input type="radio" name="zvDiagKind" value="edge" checked> Arista</label>
            <label class="zv-pill"><input type="radio" name="zvDiagKind" value="diagH"> Diagonal horizontal</label>
            <label class="zv-pill"><input type="radio" name="zvDiagKind" value="diagV"> Diagonal vertical</label>
          </div>
        </div>

        <div class="zv-modal-section" style="margin-top:14px;">
          <div class="zv-modal-label">Aplicar</div>
          <select class="param-number" id="zvDiagScope" style="width:100%; margin-top:8px;">
            <option value="one">Solo esta seleccion</option>
            <option value="level">Todo este nivel</option>
            <option value="all">Todos los niveles visibles</option>
          </select>
        </div>
      </div>
      <div class="zv-modal-footer">
        <button class="action-button" id="zvDiagCancelBtn">Cancelar</button>
        <button class="action-button primary" id="zvDiagApplyBtn">Aplicar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  this._diagModalEl = overlay;

  const close = () => this._hideDiagonalModal();

  const btnClose = overlay.querySelector('#zvDiagModalClose');
  const btnCancel = overlay.querySelector('#zvDiagCancelBtn');
  if (btnClose) btnClose.addEventListener('click', close);
  if (btnCancel) btnCancel.addEventListener('click', close);

  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay) close();
  });

  const btnApply = overlay.querySelector('#zvDiagApplyBtn');
  if (btnApply) {
    btnApply.addEventListener('click', () => {
      if (!this._diagModalFace) return;

      const kindEl = overlay.querySelector('input[name="zvDiagKind"]:checked');
      const kind = kindEl ? kindEl.value : 'edge';
      const scopeEl = overlay.querySelector('#zvDiagScope');
      const scope = scopeEl ? scopeEl.value : 'one';

      this._applyExtraBeam(kind, scope, this._diagModalFace);
      this._hideDiagonalModal();
    });
  }
}



_openDiagonalModal(face) {
  this._ensureDiagonalModal();
  this._diagModalFace = face;

  const title = this._diagModalEl.querySelector('#zvDiagModalTitle');
  const sub = this._diagModalEl.querySelector('#zvDiagModalSubtitle');
  if (title) title.textContent = 'Crear viga extra';

  // Seleccion actual (2 conectores tocados)
  const sel = this._diagModalSel;
  const selA = sel && sel.a ? sel.a : null;
  const selB = sel && sel.b ? sel.b : null;

  const keyOf = (a, b) => {
    const A = `${a.k}:${a.i}`;
    const B = `${b.k}:${b.i}`;
    return (A < B) ? `${A}|${B}` : `${B}|${A}`;
  };

  // Detectar si la seleccion corresponde a una ARISTA del rombo
  const v = face.verts; // [bottom, right, top, left]
  const edges = [
    { id: 'edgeBR', a: v[0], b: v[1] },
    { id: 'edgeRT', a: v[1], b: v[2] },
    { id: 'edgeTL', a: v[2], b: v[3] },
    { id: 'edgeLB', a: v[3], b: v[0] },
  ];

  let selEdgeId = null;
  if (selA && selB) {
    const sKey = keyOf(selA, selB);
    for (let j = 0; j < edges.length; j++) {
      if (keyOf(edges[j].a, edges[j].b) === sKey) {
        selEdgeId = edges[j].id;
        break;
      }
    }
  }
  this._diagModalSelEdgeId = selEdgeId;

  // Radios
  const rEdge = this._diagModalEl.querySelector('input[name="zvDiagKind"][value="edge"]');
  const rH = this._diagModalEl.querySelector('input[name="zvDiagKind"][value="diagH"]');
  const rV = this._diagModalEl.querySelector('input[name="zvDiagKind"][value="diagV"]');

  // Arista solo si seleccion es adyacente
  if (rEdge) rEdge.disabled = !selEdgeId;

  // Si el rombo ya tiene una diagonal aplicada, solo permitir la otra (para completar cruce)
  const extra = Array.isArray(state.structureExtraBeams) ? state.structureExtraBeams : [];
  const hKey = keyOf(face.diagH.a, face.diagH.b);
  const vKey = keyOf(face.diagV.a, face.diagV.b);
  const hasH = extra.some(it => it && it.kind === 'diagH' && it.a && it.b && keyOf(it.a, it.b) === hKey);
  const hasV = extra.some(it => it && it.kind === 'diagV' && it.a && it.b && keyOf(it.a, it.b) === vKey);

  if (rH) rH.disabled = false;
  if (rV) rV.disabled = false;

  if (hasH && !hasV) {
    if (rH) rH.disabled = true;
    if (rV) rV.checked = true;
    if (sub) sub.textContent = `${face.label}. Ya existe diagonal horizontal; puedes crear la vertical, o una arista (si corresponde).`;
  } else if (hasV && !hasH) {
    if (rV) rV.disabled = true;
    if (rH) rH.checked = true;
    if (sub) sub.textContent = `${face.label}. Ya existe diagonal vertical; puedes crear la horizontal, o una arista (si corresponde).`;
  } else if (hasH && hasV) {
    // Ya estan ambas; no tiene sentido abrir modal para diagonales.
    // Pero igual podríamos permitir aristas. Si no es arista, avisar.
    if (!selEdgeId) {
      this.showNotification('Este rombo ya tiene diagonal horizontal y vertical.', 'error');
      this._diagModalFace = null;
      return;
    }
    if (rEdge) rEdge.checked = true;
    if (rH) rH.disabled = true;
    if (rV) rV.disabled = true;
    if (sub) sub.textContent = `${face.label}. Ya existen ambas diagonales; puedes crear una arista.`;
  } else {
    // Ninguna diagonal
    if (selEdgeId) {
      if (rEdge) rEdge.checked = true;
      if (sub) sub.textContent = `${face.label}. Puedes crear arista o diagonal.`;
    } else {
      if (rH) rH.checked = true;
      if (sub) sub.textContent = `${face.label}. Seleccion no es una arista; puedes crear diagonal.`;
    }
  }

  this._diagModalEl.classList.remove('zv-hidden');
}


_hideDiagonalModal() {
  if (!this._diagModalEl) return;
  this._diagModalEl.classList.add('zv-hidden');
  this._diagModalFace = null;
}


_applyExtraBeam(kind, scope, face) {
  if (!face) return;

  const extra = Array.isArray(state.structureExtraBeams) ? state.structureExtraBeams.slice() : [];

// Edges ya existentes en la estructura actual (para evitar duplicados al crear vigas extra)
const existingEdges = new Set();
try {
  const sg = this.sceneManager && this.sceneManager.structureGroup;
  if (sg && sg.children && sg.children.length) {
    for (let ci = 0; ci < sg.children.length; ci++) {
      const obj = sg.children[ci];
      if (obj && obj.userData && obj.userData.beamInfo) {
        const bi = obj.userData.beamInfo;
        const aK = bi.aKey;
        const bK = bi.bKey;
        if (aK && bK) {
          const ek = (aK < bK) ? (aK + '|' + bK) : (bK + '|' + aK);
          existingEdges.add(ek);
        }
      }
    }
  }
} catch (e) {
  // noop
}

  const keyOf = (a, b) => {
    const A = `${a.k}:${a.i}`;
    const B = `${b.k}:${b.i}`;
    return (A < B) ? `${A}|${B}` : `${B}|${A}`;
  };
  const has = new Set(extra.map(it => (it && it.a && it.b) ? keyOf(it.a, it.b) : null).filter(Boolean));

  // Helper para keys de vertices (debe coincidir con StructureGenerator._keyForVertex)
  const vKey = (k, i, idMaybe) => {
    // Conector central
    if (idMaybe && typeof idMaybe === 'string' && idMaybe.indexOf('X') === 0) {
      return `X:${k}:${i}`;
    }
    // Polos
    if (k === 0) return 'pole_low';
    if (k === state.N) return 'pole_top';
    return `k${k}_i${i}`;
  };
  const edgeKey2 = (aKey, bKey) => (aKey < bKey) ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;

  // Marcas para conectores centrales: solo cuando se crea la SEGUNDA diagonal de un rombo.
  const intersectionFaces = state.structureIntersectionFaces || (state.structureIntersectionFaces = {});

  const removeFromDeletedIfExists = (a, b, aId, bId) => {
    if (!Array.isArray(state.structureDeletedBeams) || state.structureDeletedBeams.length === 0) return;
    const aK = vKey(a.k, a.i, aId);
    const bK = vKey(b.k, b.i, bId);
    const ek = edgeKey2(aK, bK);
    const idx = state.structureDeletedBeams.indexOf(ek);
    if (idx !== -1) {
      state.structureDeletedBeams.splice(idx, 1);
    }
  };

  const addEdge = (a, b, meta, faceId, oppositeEdgeKey, aId, bId) => {
    const k = keyOf(a, b);
    if (has.has(k)) return false;

    // EdgeKey deterministica (incluye conectores centrales)
    const aK = vKey(a.k, a.i, aId);
    const bK = vKey(b.k, b.i, bId);
    const ek = edgeKey2(aK, bK);

    // Si ya existe una viga en esta arista/diagonal (en la estructura actual), NO permitir duplicar.
    // (Solo se permite si estaba "eliminada" y la estamos restaurando.)
    const deleted = Array.isArray(state.structureDeletedBeams) ? state.structureDeletedBeams : [];
    const isDeleted = deleted.indexOf(ek) !== -1;
    if (existingEdges.has(ek) && !isDeleted) {
      return false;
    }

    // Caso especial: ARISTA del rombo (edge) => esa viga ya existe por defecto.
    // Si el usuario la habia eliminado, la "reponemos" removiendola del blacklist,
    // sin agregarla como viga extra.
    if ((meta.kind === 'edge') && isDeleted) {
      removeFromDeletedIfExists(a, b, aId, bId);
      return true;
    }

    // Para diagonales u otras vigas extra:
    has.add(k);

    // Si la viga estaba eliminada antes, restaurarla (mismo nombre deterministico)
    removeFromDeletedIfExists(a, b, aId, bId);

    extra.push({ a: { k: a.k, i: a.i }, b: { k: b.k, i: b.i }, kind: meta.kind || 'extra', scope: meta.scope || 'one', edgeSel: meta.edgeSel || null });

    // Si el rombo ya tenia la diagonal opuesta, entonces esta es la 2da diagonal: habilitar conector central.
    if (meta.kind && (meta.kind === 'diagH' || meta.kind === 'diagV')) {
      if (faceId && oppositeEdgeKey && has.has(oppositeEdgeKey)) {
        intersectionFaces[faceId] = true;
      }
    }
    return true;
  };

  // === 1) Arista segun seleccion ===
  if (kind === 'edge') {
    const sel = this._diagModalSel;
    if (!sel || !sel.a || !sel.b) {
      this.showNotification('No hay seleccion valida para crear arista.', 'error');
      return;
    }
    if (!this._diagModalSelEdgeId) {
      this.showNotification('La seleccion no corresponde a una arista del rombo.', 'error');
      return;
    }

    const edgeById = (faceObj, edgeId) => {
      const v = faceObj.verts; // [bottom,right,top,left]
      if (edgeId === 'edgeBR') return { a: v[0], b: v[1] };
      if (edgeId === 'edgeRT') return { a: v[1], b: v[2] };
      if (edgeId === 'edgeTL') return { a: v[2], b: v[3] };
      return { a: v[3], b: v[0] }; // edgeLB
    };

    if (scope === 'one') {
      const faceId = `${face.kFace}:${face.iFace}`;
      const t = edgeById(face, this._diagModalSelEdgeId);
      // Mantener ids si los seleccionados son exactamente este edge; si no, null
      const ok = addEdge(t.a, t.b, { kind: 'edge', scope: 'one', edgeSel: this._diagModalSelEdgeId }, null, null, sel.aId, sel.bId);
      if (!ok) {
        this.showNotification('Ya existe una viga en esa arista (o no se puede duplicar).', 'error');
        return;
      }
    } else {
      const { N, cutActive, cutLevel } = state;
      const startK = cutActive ? cutLevel : 1;
      const applyAllLevels = (scope === 'all');

      for (let k = startK; k <= N - 1; k++) {
        if (!applyAllLevels && k !== face.kFace) continue;
        if (cutActive && k === cutLevel) continue;

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
          const vBottom = { k: k - 1, i };
          const vTop = { k: k + 1, i };
          const verts = [vBottom, vRight, vTop, vLeft];

          const f = { verts };
          const t = edgeById(f, this._diagModalSelEdgeId);
          addEdge(t.a, t.b, { kind: 'edge', scope, edgeSel: this._diagModalSelEdgeId }, null, null, null, null);
        }
      }
    }

    state.structureExtraBeams = extra;

    try {
      if (state.structureParams) {
        this.sceneManager.generateConnectorStructure(state.structureParams);
        this._maybeShowStructureWarnings();
      }
    } catch (e) {
      console.error(e);
      this.showNotification('No se pudo crear la arista. Revisa consola.', 'error');
      return;
    }

    this.showNotification('Arista creada como viga extra.', 'success');
    return;
  }

  // === 2) Diagonales H/V ===
  if (!face.diagH || !face.diagV) return;
  const target = (kind === 'diagV') ? face.diagV : face.diagH;
  const opposite = (kind === 'diagV') ? face.diagH : face.diagV;

  if (scope === 'one') {
    const faceId = `${face.kFace}:${face.iFace}`;
    const oppKey = keyOf(opposite.a, opposite.b);
    const ok = addEdge(target.a, target.b, { kind, scope: 'one' }, faceId, oppKey, null, null);
    if (!ok) {
      this.showNotification('Ya existe una viga en esa diagonal (o no se puede duplicar).', 'error');
      return;
    }
  } else {
    const { N, cutActive, cutLevel } = state;
    const startK = cutActive ? cutLevel : 1;
    const applyAllLevels = (scope === 'all');
    for (let k = startK; k <= N - 1; k++) {
      if (!applyAllLevels && k !== face.kFace) continue;
      if (cutActive && k === cutLevel) continue;
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
        const vBottom = { k: k - 1, i };
        const vTop = { k: k + 1, i };
        const t = (kind === 'diagV') ? { a: vBottom, b: vTop } : { a: vLeft, b: vRight };
        const o = (kind === 'diagV') ? { a: vLeft, b: vRight } : { a: vBottom, b: vTop };
        const faceId = `${k}:${i}`;
        const oppKey = keyOf(o.a, o.b);
        addEdge(t.a, t.b, { kind, scope }, faceId, oppKey, null, null);
      }
    }
  }

  state.structureExtraBeams = extra;

  try {
    if (state.structureParams) {
      this.sceneManager.generateConnectorStructure(state.structureParams);
      this._maybeShowStructureWarnings();
    }
  } catch (e) {
    console.error(e);
    this.showNotification('No se pudo aplicar la diagonal. Revisa consola.', 'error');
    return;
  }

  this.showNotification('Viga extra aplicada.', 'success');
}


_updateConnectorTooltipPosition() {
  if (!this._connectorTooltipEl || this._connectorTooltipEl.classList.contains('zv-hidden')) return;
  if (!this._connectorTooltipHit || !this._connectorTooltipHit.mesh) return;
  if (!this.sceneManager || !this.sceneManager.camera || !this.sceneManager.renderer) return;

  const mesh = this._connectorTooltipHit.mesh;
  const cam = this.sceneManager.camera;
  const renderer = this.sceneManager.renderer;

  // Posicion en mundo: centro del conector
  const v = new THREE.Vector3();
  try { mesh.getWorldPosition(v); } catch (e) { return; }

  // Proyectar a NDC
  v.project(cam);

  // Si esta detras de la camara, ocultar
  if (v.z > 1) {
    this._connectorTooltipEl.classList.add('zv-hidden');
    return;
  }

  const rect = renderer.domElement.getBoundingClientRect();
  const x = rect.left + (v.x * 0.5 + 0.5) * rect.width;
  const y = rect.top + (-v.y * 0.5 + 0.5) * rect.height;

  // Si fuera de pantalla, ocultar
  const margin = 6;
  if (x < rect.left - margin || x > rect.right + margin || y < rect.top - margin || y > rect.bottom + margin) {
    this._connectorTooltipEl.classList.add('zv-hidden');
    return;
  } else {
    this._connectorTooltipEl.classList.remove('zv-hidden');
  }

  this._connectorTooltipEl.style.left = `${x}px`;
  this._connectorTooltipEl.style.top = `${y}px`;
}



  /* =============================
     Seleccion + edicion de VIGAS (por nivel)
     ============================= */

  _handleBeamTap(hit) {
    if (!hit || !hit.mesh) return;

    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const same = (this._lastBeamMeshUuid && hit.mesh.uuid === this._lastBeamMeshUuid);
    const dt = (this._lastBeamTapTime != null) ? (now - this._lastBeamTapTime) : 1e9;

    const DOUBLE_TAP_MS = 650;

    this._lastBeamTapTime = now;

    if (same && dt <= DOUBLE_TAP_MS) {
      this._hideBeamTooltip();
      this.editBeamForSelection(hit);
      return;
    }

    this._lastBeamMeshUuid = hit.mesh.uuid;
    this._showBeamTooltip(hit);
  }

  editBeamForSelection(hit) {
    if (!hit || !hit.mesh) return;
    if (!state.structureParams) return;
    this._openBeamEditModal(hit);
  }

  _initBeamTooltip() {
    if (this._beamTooltipEl) return;
    const el = document.createElement('div');
    el.id = 'zvBeamTooltip';
    el.className = 'zv-beam-tooltip zv-hidden';
    el.innerHTML = '<div class="zv-bt-title"></div><div class="zv-bt-sub"></div>';
    document.body.appendChild(el);
    this._beamTooltipEl = el;
    this._beamTooltipTitle = el.querySelector('.zv-bt-title');
    this._beamTooltipSub = el.querySelector('.zv-bt-sub');
  }

  _showBeamTooltip(hit) {
    if (!hit || !hit.mesh) return;
    this._initBeamTooltip();

    try {
      if (this.sceneManager && typeof this.sceneManager.setSelectedBeam === 'function') {
        this.sceneManager.setSelectedBeam(hit.mesh);
      }
    } catch (e) {}

    const kv = (hit.kVisible != null) ? hit.kVisible : hit.kLevelOriginal;
    const w = (hit.widthMm != null) ? Math.round(hit.widthMm) : null;
    const h = (hit.heightMm != null) ? Math.round(hit.heightMm) : null;

    if (this._beamTooltipTitle) {
      this._beamTooltipTitle.textContent = `Viga k${kv}${(w!=null&&h!=null)?` (${w}×${h} mm)`:''}`;
    }
    if (this._beamTooltipSub) {
      this._beamTooltipSub.textContent = 'Toca nuevamente para editar (aplica al nivel)';
    }

    this._beamTooltipHit = hit;
    this._beamTooltipEl.classList.remove('zv-hidden');

    if (this._beamTooltipTimer) {
      try { clearTimeout(this._beamTooltipTimer); } catch (e) {}
      this._beamTooltipTimer = null;
    }
    this._beamTooltipTimer = setTimeout(() => {
      this._hideBeamTooltip(true);
    }, 2500);

    this._updateBeamTooltipPosition();
  }

  _hideBeamTooltip(keepSelection) {
    if (this._beamTooltipTimer) {
      try { clearTimeout(this._beamTooltipTimer); } catch (e) {}
      this._beamTooltipTimer = null;
    }
    if (this._beamTooltipEl) {
      this._beamTooltipEl.classList.add('zv-hidden');
    }
    this._beamTooltipHit = null;

    if (!keepSelection) {
      try {
        if (this.sceneManager && typeof this.sceneManager.setSelectedBeam === 'function') {
          this.sceneManager.setSelectedBeam(null);
        }
      } catch (e) {}
      this._lastBeamMeshUuid = null;
    }
  }

  _clearBeamTooltipAndSelection() {
    this._hideBeamTooltip(false);
    this._lastBeamTapTime = null;
  }

  _updateBeamTooltipPosition() {
    if (!this._beamTooltipEl || this._beamTooltipEl.classList.contains('zv-hidden')) return;
    if (!this._beamTooltipHit || !this._beamTooltipHit.mesh) return;
    if (!this.sceneManager || !this.sceneManager.camera || !this.sceneManager.renderer) return;

    const mesh = this._beamTooltipHit.mesh;
    const cam = this.sceneManager.camera;
    const renderer = this.sceneManager.renderer;

    const v = new THREE.Vector3();
    try { mesh.getWorldPosition(v); } catch (e) { return; }

    v.project(cam);

    const x = (v.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
    const y = (-(v.y * 0.5) + 0.5) * renderer.domElement.clientHeight;

    const rect = renderer.domElement.getBoundingClientRect();
    const left = rect.left + x;
    const top = rect.top + y;

    this._beamTooltipEl.style.left = `${left}px`;
    this._beamTooltipEl.style.top = `${top}px`;
  }

  _initBeamEditModal() {
    if (this._beamModalOverlay) return;

    const overlay = document.createElement('div');
    overlay.className = 'zv-modal-overlay zv-hidden';

    const modal = document.createElement('div');
    modal.className = 'zv-modal';
    overlay.appendChild(modal);

    const title = document.createElement('div');
    title.className = 'zv-modal-title';
    title.textContent = 'Editar viga';
    modal.appendChild(title);
    this._beamModalTitle = title;

    const subtitle = document.createElement('div');
    subtitle.className = 'zv-modal-subtitle';
    subtitle.textContent = '';
    modal.appendChild(subtitle);
    this._beamModalSubtitle = subtitle;

    const body = document.createElement('div');
    body.className = 'zv-modal-body';
    modal.appendChild(body);

    const rowW = document.createElement('div');
    rowW.className = 'zv-modal-row';
    rowW.innerHTML = '<div class="zv-modal-label">Ancho B (mm)</div>';
    const inW = document.createElement('input');
    inW.className = 'zv-modal-input';
    inW.type = 'number';
    inW.min = '1';
    inW.step = '1';
    rowW.appendChild(inW);
    body.appendChild(rowW);
    this._beamModalWidth = inW;

    const rowH = document.createElement('div');
    rowH.className = 'zv-modal-row';
    rowH.innerHTML = '<div class="zv-modal-label">Alto / Espesor H (mm)</div>';
    const inH = document.createElement('input');
    inH.className = 'zv-modal-input';
    inH.type = 'number';
    inH.min = '1';
    inH.step = '1';
    rowH.appendChild(inH);
    body.appendChild(rowH);
    this._beamModalHeight = inH;

    const rowBtns = document.createElement('div');
    rowBtns.className = 'zv-modal-row zv-modal-row-inline';

    const btnRestore = document.createElement('button');
    btnRestore.className = 'zv-btn zv-btn-secondary';
    btnRestore.textContent = 'Restaurar dimensiones del nivel';
    rowBtns.appendChild(btnRestore);

    body.appendChild(rowBtns);

    const footer = document.createElement('div');
    footer.className = 'zv-modal-footer';
    modal.appendChild(footer);

    const btnCancel = document.createElement('button');
    btnCancel.className = 'zv-btn zv-btn-secondary';
    btnCancel.textContent = 'Cancelar';

    const btnDelete = document.createElement('button');
    btnDelete.className = 'zv-btn zv-btn-danger';
    btnDelete.textContent = 'Eliminar viga';

    const btnApply = document.createElement('button');
    btnApply.className = 'zv-btn zv-btn-primary';
    btnApply.textContent = 'Aplicar';

    footer.appendChild(btnCancel);
    footer.appendChild(btnDelete);
    footer.appendChild(btnApply);

    document.body.appendChild(overlay);

    const close = () => this._closeBeamEditModal();

    overlay.addEventListener('pointerdown', (e) => {
      if (e.target === overlay) close();
    });
    btnCancel.addEventListener('click', close);
    btnApply.addEventListener('click', () => this._applyBeamEditModal());
    btnRestore.addEventListener('click', () => this._restoreBeamEditModal());
    btnDelete.addEventListener('click', () => this._deleteSelectedBeamFromModal());

    const onKey = (e) => {
      if (overlay.classList.contains('zv-hidden')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'Enter') this._applyBeamEditModal();
    };
    document.addEventListener('keydown', onKey);

    this._beamModalOverlay = overlay;
    this._beamModalDeleteBtn = btnDelete;
    this._beamModalApplyBtn = btnApply;
    this._beamModalRestoreBtn = btnRestore;
  }

  _closeBeamEditModal() {
    if (!this._beamModalOverlay) return;
    this._beamModalOverlay.classList.add('zv-hidden');
    this._beamEditHit = null;

    // limpiar selección en escena
    try {
      if (this.sceneManager && typeof this.sceneManager.setSelectedBeam === 'function') {
        this.sceneManager.setSelectedBeam(null);
      }
    } catch (e) {}

    // también ocultar tooltip si estaba visible
    try { this._hideBeamTooltip(true); } catch (e) {}
  }


  _edgeKeyFromBeamInfo(bi) {
    if (!bi) return null;
    const aKey = bi.aKey;
    const bKey = bi.bKey;
    if (aKey && bKey) return (aKey < bKey) ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
    // Fallback (sin conectores centrales): derivar desde (k,i)
    const vKey = (k, i) => {
      if (k === 0) return 'pole_low';
      if (k === state.N) return 'pole_top';
      return `k${k}_i${i}`;
    };
    const ak = (bi && bi.a) ? bi.a.k : null;
    const ai = (bi && bi.a) ? bi.a.i : null;
    const bk = (bi && bi.b) ? bi.b.k : null;
    const bi2 = (bi && bi.b) ? bi.b.i : null;
    if (!isFinite(ak) || !isFinite(ai) || !isFinite(bk) || !isFinite(bi2)) return null;
    const A = vKey(ak, ai);
    const B = vKey(bk, bi2);
    return (A < B) ? `${A}|${B}` : `${B}|${A}`;
  }

  _openBeamEditModal(hit) {
    if (!hit || !hit.mesh) return;
    if (!state.structureParams) return;
    if (!this._beamModalOverlay) this._initBeamEditModal();

    const kLevelOriginal = hit.kLevelOriginal;
    const baseW = Number(state.structureParams.beamWidthMm) || 1;
    const baseH = Number(state.structureParams.beamHeightMm ?? state.structureParams.beamThicknessMm) || 1;

    const ov = (state.structureBeamOverrides && (state.structureBeamOverrides[String(kLevelOriginal)] || state.structureBeamOverrides[kLevelOriginal])) || null;
    const currentW = ov && ov.beamWidthMm != null ? Number(ov.beamWidthMm) : (hit.widthMm != null ? Number(hit.widthMm) : baseW);
    const currentH = ov && ov.beamHeightMm != null ? Number(ov.beamHeightMm) : (hit.heightMm != null ? Number(hit.heightMm) : baseH);

    this._beamEditHit = hit;
    // Reset UI estado
    if (this._beamModalDeleteBtn) this._beamModalDeleteBtn.disabled = false;
    if (this._beamModalApplyBtn) this._beamModalApplyBtn.disabled = false;
    if (this._beamModalRestoreBtn) this._beamModalRestoreBtn.disabled = false;
    this._beamModalWidth.disabled = false;
    this._beamModalHeight.disabled = false;

    try {
      if (this.sceneManager && typeof this.sceneManager.setSelectedBeam === 'function') {
        this.sceneManager.setSelectedBeam(hit.mesh || null);
      }
    } catch (e) {}

    const kv = (hit.kVisible != null) ? hit.kVisible : kLevelOriginal;
    this._beamModalTitle.textContent = `Editar viga (nivel k${kv})`;
    if (this._beamModalSubtitle) {
      this._beamModalSubtitle.textContent = 'Se aplicará a todas las vigas del mismo nivel';
    }

    this._beamModalWidth.value = String(Math.round(currentW));
    this._beamModalHeight.value = String(Math.round(currentH));

    this._beamModalOverlay.classList.remove('zv-hidden');
    setTimeout(() => {
      // No auto-focus on mobile (prevents keyboard popping).
      try {
        const fine = window.matchMedia && window.matchMedia('(pointer:fine)').matches;
        if (fine) { this._beamModalWidth.focus(); this._beamModalWidth.select(); }
      } catch (e) {}
    }, 0);
  }

  _deleteSelectedBeamFromModal() {
    const hit = this._beamEditHit;
    if (!hit || !hit.mesh) return;
    if (!state.structureParams) return;

    const bi = hit.mesh.userData && hit.mesh.userData.beamInfo ? hit.mesh.userData.beamInfo : null;
    const ek = this._edgeKeyFromBeamInfo(bi);
    if (!ek) {
      this.showNotification('No se pudo identificar la viga para eliminar.', 'error');
      return;
    }

    if (!Array.isArray(state.structureDeletedBeams)) state.structureDeletedBeams = [];
    if (state.structureDeletedBeams.indexOf(ek) === -1) {
      state.structureDeletedBeams.push(ek);
    }

    try {
      this.sceneManager.generateConnectorStructure(state.structureParams);
      this._maybeShowStructureWarnings();
    } catch (err) {
      console.error(err);
      this.showNotification('No se pudo eliminar la viga (error al regenerar).', 'error');
      return;
    }

    // Cerrar modal inmediatamente (evita estados UI confusos)
    this.showNotification('Viga eliminada', 'success');
    this._closeBeamEditModal();
  }

  _applyBeamEditModal() {
    const hit = this._beamEditHit;
    if (!hit || !hit.mesh) return;
    if (!state.structureParams) return;

    const wMm = Number(this._beamModalWidth.value);
    const hMm = Number(this._beamModalHeight.value);

    if (!isFinite(wMm) || wMm <= 0 || !isFinite(hMm) || hMm <= 0) {
      this.showNotification('Valores inválidos. Usa números positivos en mm.', 'error');
      return;
    }

    const k = hit.kLevelOriginal;
    if (!state.structureBeamOverrides || typeof state.structureBeamOverrides !== 'object') {
      state.structureBeamOverrides = {};
    }

    state.structureBeamOverrides[String(k)] = {
      beamWidthMm: wMm,
      beamHeightMm: hMm,
    };

    try {
      this.sceneManager.generateConnectorStructure(state.structureParams);
      this._maybeShowStructureWarnings();
      this.showNotification('Vigas actualizadas', 'success');
      this._closeBeamEditModal();
    } catch (err) {
      console.error(err);
      this.showNotification('No se pudo actualizar la estructura', 'error');
    }
  }



  _initConnectorEditModal() {
    // Modal para editar un conector seleccionado.
    // Se crea una sola vez y se reutiliza.
    if (this._connectorModalOverlay) return;

    const overlay = document.createElement('div');
    overlay.id = 'connectorEditOverlay';
    overlay.className = 'zv-modal-overlay zv-hidden';

    const dialog = document.createElement('div');
    dialog.className = 'zv-modal';

    const title = document.createElement('div');
    title.className = 'zv-modal-title';
    title.textContent = 'Editar conector';

    const subtitle = document.createElement('div');
    subtitle.className = 'zv-modal-subtitle';
    subtitle.textContent = '';

    const body = document.createElement('div');
    body.className = 'zv-modal-body';

    const row1 = document.createElement('div');
    row1.className = 'zv-modal-row';
    const labD = document.createElement('label');
    labD.textContent = 'Diametro (mm)';
    labD.className = 'zv-modal-label';
    const inpD = document.createElement('input');
    inpD.type = 'number';
    inpD.min = '1';
    inpD.step = '1';
    inpD.className = 'zv-modal-input';
    inpD.id = 'connectorEditDiameterMm';
    row1.appendChild(labD);
    row1.appendChild(inpD);

    const row2 = document.createElement('div');
    row2.className = 'zv-modal-row';
    const labP = document.createElement('label');
    labP.textContent = 'Profundidad (mm)';
    labP.className = 'zv-modal-label';
    const inpP = document.createElement('input');
    inpP.type = 'number';
    inpP.min = '1';
    inpP.step = '1';
    inpP.className = 'zv-modal-input';
    inpP.id = 'connectorEditDepthMm';
    row2.appendChild(labP);
    row2.appendChild(inpP);

    // Row 3: Offset hacia el interior (a lo largo de la directriz)
    const row3 = document.createElement('div');
    row3.className = 'zv-modal-row';
    const labO = document.createElement('label');
    labO.textContent = 'Traslado hacia interior (mm)';
    labO.className = 'zv-modal-label';
    const inpO = document.createElement('input');
    inpO.type = 'number';
    inpO.min = '0';
    inpO.step = '1';
    inpO.className = 'zv-modal-input';
    inpO.id = 'connectorEditOffsetMm';
    row3.appendChild(labO);
    row3.appendChild(inpO);

    // Presets: borde / centro de testa / posicion inicial
    const rowPreset = document.createElement('div');
    rowPreset.className = 'zv-modal-row zv-modal-row-inline';
    const btnEdge = document.createElement('button');
    btnEdge.type = 'button';
    btnEdge.className = 'zv-btn zv-btn-secondary';
    btnEdge.textContent = 'Al borde (max bisel)';

    const btnMid = document.createElement('button');
    btnMid.type = 'button';
    btnMid.className = 'zv-btn zv-btn-secondary';
    btnMid.textContent = 'Centro de testa';

    const btnZero = document.createElement('button');
    btnZero.type = 'button';
    btnZero.className = 'zv-btn zv-btn-secondary';
    btnZero.textContent = 'Posicion inicial';
    rowPreset.appendChild(btnEdge);
    rowPreset.appendChild(btnMid);
    rowPreset.appendChild(btnZero);

    body.appendChild(row1);
    body.appendChild(row2);
    body.appendChild(row3);
    body.appendChild(rowPreset);

    const footer = document.createElement('div');
    footer.className = 'zv-modal-footer';

    const btnRestore = document.createElement('button');
    btnRestore.className = 'zv-btn zv-btn-secondary';
    btnRestore.textContent = 'Restaurar global';

    const btnCancel = document.createElement('button');
    btnCancel.className = 'zv-btn zv-btn-secondary';
    btnCancel.textContent = 'Cancelar';

    const btnApply = document.createElement('button');
    btnApply.className = 'zv-btn zv-btn-primary';
    btnApply.textContent = 'Aplicar';

    footer.appendChild(btnRestore);
    footer.appendChild(btnCancel);
    footer.appendChild(btnApply);

    dialog.appendChild(title);
    dialog.appendChild(subtitle);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Guardar refs
    this._connectorModalOverlay = overlay;
    this._connectorModalTitle = title;
    this._connectorModalSubtitle = subtitle;
    this._connectorModalDiameter = inpD;
    this._connectorModalDepth = inpP;
    this._connectorModalOffset = inpO;
    this._connectorModalRestoreBtn = btnRestore;
    this._connectorModalPresetEdgeBtn = btnEdge;
    this._connectorModalPresetMidBtn = btnMid;
    this._connectorModalPresetZeroBtn = btnZero;

    const close = () => this._closeConnectorEditModal();
    overlay.addEventListener('click', (e) => {
      // Cerrar al tocar fuera del dialogo
      if (e.target === overlay) close();
    });
    btnCancel.addEventListener('click', close);
    btnApply.addEventListener('click', () => this._applyConnectorEditModal());
    btnRestore.addEventListener('click', () => this._restoreConnectorEditModal());

    // Presets (no aplican hasta que el usuario toque "Aplicar")
    // Se calculan desde la geometria real: la cara exterior del cilindro queda a ras con
    // la punta de la viga cuyo bisel es mas pronunciado en ese conector.
    const computePresets = () => {
      try {
        if (!this.sceneManager || typeof this.sceneManager.getConnectorOffsetPresetsMm !== 'function') return null;
        return this.sceneManager.getConnectorOffsetPresetsMm(this._connectorEditHit || null);
      } catch (e) {
        return null;
      }
    };
    btnEdge.addEventListener('click', () => {
      const p = computePresets();
      if (p && isFinite(p.edgeMm)) {
        try { this._connectorModalOffset.value = String(Math.max(0, Math.round(p.edgeMm))); } catch (e) {}
      }
    });

    btnMid.addEventListener('click', () => {
      const p = computePresets();
      if (p && isFinite(p.midMm)) {
        try { this._connectorModalOffset.value = String(Math.max(0, Math.round(p.midMm))); } catch (e) {}
      }
    });

    btnZero.addEventListener('click', () => {
      try { this._connectorModalOffset.value = '0'; } catch (e) {}
    });

    // Enter aplica, Esc cierra
    const onKey = (e) => {
      if (overlay.classList.contains('zv-hidden')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'Enter') this._applyConnectorEditModal();
    };
    document.addEventListener('keydown', onKey);
  }

  _openConnectorEditModal(hit) {
    if (!hit || typeof hit.kOriginal !== 'number') return;
    if (!state.structureParams) return;
    if (!this._connectorModalOverlay) this._initConnectorEditModal();

    const k = hit.kOriginal;
    const baseD = Number(state.structureParams.cylDiameterMm) || 1;
    const baseP = Number(state.structureParams.cylDepthMm) || 1;
    const isIntersection = !!hit.isIntersection;
    const mapName = isIntersection ? 'structureIntersectionConnectorOverrides' : 'structureConnectorOverrides';
    const ov = (state[mapName] && (state[mapName][String(k)] || state[mapName][k])) || null;
    const currentD = ov && ov.cylDiameterMm != null ? Number(ov.cylDiameterMm) : baseD;
    const currentP = ov && ov.cylDepthMm != null ? Number(ov.cylDepthMm) : baseP;
    const currentO = ov && ov.offsetMm != null ? Number(ov.offsetMm) : 0;

    const labelK = (hit.kVisible != null) ? hit.kVisible : k;
    this._connectorEditHit = hit;

    // Resaltar conector seleccionado
    try {
      if (this.sceneManager && typeof this.sceneManager.setSelectedConnector === 'function') {
        this.sceneManager.setSelectedConnector(hit.mesh || null);
      }
    } catch (e) {}

    this._connectorModalTitle.textContent = `${isIntersection ? 'Editar conector de interseccion' : 'Editar conector'} (nivel k${labelK})`;

    // Subtitulo: k visible + tipo (polo/suelo/intermedio)
    const isPoleLow = (hit.kOriginal === 0);
    const isPoleTop = (hit.kOriginal === state.N);
    const isFloorVisible = (state.cutActive && (hit.kVisible != null) && Number(hit.kVisible) === 0);
    let typeLabel = 'Nivel intermedio';
    if (state.cutActive) {
      if (isPoleTop) typeLabel = 'Polo superior (unico polo visible)';
      else if (isFloorVisible) typeLabel = 'Suelo (nivel inferior visible)';
    } else {
      if (isPoleLow) typeLabel = 'Polo inferior';
      else if (isPoleTop) typeLabel = 'Polo superior';
    }
    if (this._connectorModalSubtitle) {
      const kv = (hit.kVisible != null) ? hit.kVisible : '—';
      // El usuario siempre trabaja con niveles visibles (K). Evitar mostrar "k original" para no confundir.
      this._connectorModalSubtitle.textContent = `k: ${kv} | ${typeLabel}`;
    }

    this._connectorModalDiameter.value = String(Math.round(currentD));
    this._connectorModalDepth.value = String(Math.round(currentP));
    if (this._connectorModalOffset) this._connectorModalOffset.value = String(Math.round(isFinite(currentO) ? Math.max(0, currentO) : 0));

    this._connectorModalOverlay.classList.remove('zv-hidden');
    // Foco al primer input
    setTimeout(() => {
      // No auto-focus on mobile (prevents keyboard popping).
      try {
        const fine = window.matchMedia && window.matchMedia('(pointer:fine)').matches;
        if (fine) { this._connectorModalDiameter.focus(); this._connectorModalDiameter.select(); }
      } catch (e) {}
    }, 0);
  }

  _closeConnectorEditModal() {
    if (!this._connectorModalOverlay) return;
    this._connectorModalOverlay.classList.add('zv-hidden');
    this._connectorEditHit = null;

    // Quitar resaltado
    try {
      if (this.sceneManager && typeof this.sceneManager.setSelectedConnector === 'function') {
        this.sceneManager.setSelectedConnector(null);
      }
    } catch (e) {}
  }

  _restoreConnectorEditModal() {
    const hit = this._connectorEditHit;
    if (!hit || typeof hit.kOriginal !== 'number') return;
    if (!state.structureParams) return;

    const k = hit.kOriginal;
    const isIntersection = !!hit.isIntersection;
    const targets = [];
    if (isIntersection) targets.push(k);
    else {
      const isPoleLow = k === 0;
      const isPoleTop = k === state.N;
      if ((isPoleLow || isPoleTop) && !state.cutActive) targets.push(0, state.N);
      else targets.push(k);
    }

    const mapName = isIntersection ? 'structureIntersectionConnectorOverrides' : 'structureConnectorOverrides';
    if (state[mapName] && typeof state[mapName] === 'object') {
      for (const kk of targets) {
        delete state[mapName][String(kk)];
      }
    }

    // Refrescar inputs a valores globales (offset global = 0)
    const baseD = Number(state.structureParams.cylDiameterMm) || 1;
    const baseP = Number(state.structureParams.cylDepthMm) || 1;
    this._connectorModalDiameter.value = String(Math.round(baseD));
    this._connectorModalDepth.value = String(Math.round(baseP));
    if (this._connectorModalOffset) this._connectorModalOffset.value = '0';

    try {
      this.sceneManager.generateConnectorStructure(state.structureParams);
      this._maybeShowStructureWarnings();
      this.showNotification('Nivel restaurado a valores globales', 'success');
    } catch (err) {
      console.error(err);
      this.showNotification('No se pudo restaurar la estructura', 'error');
    }
  }

  _applyConnectorEditModal() {
    const hit = this._connectorEditHit;
    if (!hit || typeof hit.kOriginal !== 'number') return;
    if (!state.structureParams) return;

    const dMm = Number(this._connectorModalDiameter.value);
    const pMm = Number(this._connectorModalDepth.value);
    const oMm = this._connectorModalOffset ? Number(this._connectorModalOffset.value) : 0;

    if (!isFinite(dMm) || dMm <= 0 || !isFinite(pMm) || pMm <= 0 || !isFinite(oMm) || oMm < 0) {
      this.showNotification('Valores invalidos. Usa numeros positivos en mm.', 'error');
      return;
    }

    const k = hit.kOriginal;
    const isIntersection = !!hit.isIntersection;
    const targets = [];
    if (isIntersection) {
      // Conectores de interseccion: se editan por nivel del rombo (kFace) y NO se acoplan polos.
      targets.push(k);
    } else {
      const isPoleLow = k === 0;
      const isPoleTop = k === state.N;
      if ((isPoleLow || isPoleTop) && !state.cutActive) targets.push(0, state.N);
      else targets.push(k);
    }

    const mapName = isIntersection ? 'structureIntersectionConnectorOverrides' : 'structureConnectorOverrides';
    if (!state[mapName] || typeof state[mapName] !== 'object') state[mapName] = {};
    for (const kk of targets) {
      state[mapName][String(kk)] = { cylDiameterMm: dMm, cylDepthMm: pMm, offsetMm: oMm };
    }

    try {
      // Regenerar SIN tocar la camara. Solo reemplaza los meshes de estructura.
      this.sceneManager.generateConnectorStructure(state.structureParams);
      this._maybeShowStructureWarnings();
      this.showNotification('Conectores actualizados', 'success');
      this._closeConnectorEditModal();
    } catch (err) {
      console.error(err);
      this.showNotification('No se pudo actualizar la estructura', 'error');
    }
  }


  toggleInfo() {
    if (this.quickInfo) {
      this.quickInfo.classList.toggle('collapsed');
    }
  }

  setMainPanelCollapsed(collapsed = true) {
    const on = !!collapsed;
    if (this.paramsSection) this.paramsSection.classList.toggle('collapsed', on);
    if (this.quickInfo) this.quickInfo.classList.toggle('collapsed', on);
    // El boton suele invertir su icono/estado con la misma clase 'collapsed'
    if (this.toggleMainPanelBtn) this.toggleMainPanelBtn.classList.toggle('collapsed', on);
  }

  toggleMainPanel() {
    if (this.paramsSection) {
      this.paramsSection.classList.toggle('collapsed');
    }
    if (this.quickInfo) {
      this.quickInfo.classList.toggle('collapsed');
    }
    if (this.toggleMainPanelBtn) {
      this.toggleMainPanelBtn.classList.toggle('collapsed');
    }
  }

  showHeightIndicator() {
    if (!this.heightIndicator || !this.heightIndicatorInput) return;

    // Calcular altura total visible
    const nivelesVisibles = state.cutActive ? state.N - state.cutLevel : state.N;
    const alturaVisible = state.h1 * nivelesVisibles;

    // Actualizar valor en el input (3 decimales)
    this.heightIndicatorInput.value = alturaVisible.toFixed(3);

    // Posicionar dinamicamente en moviles justo encima del control de angulo
    if (window.innerWidth <= 640) {
      const mainControls = document.getElementById('mainControls');
      if (mainControls) {
        const rect = mainControls.getBoundingClientRect();
        // Posicionar justo arriba del panel con un margen de 12px
        this.heightIndicator.style.bottom = `${window.innerHeight - rect.top + 12}px`;
      }
    } else {
      // En desktop, mantener posicion fija bottom-right
      this.heightIndicator.style.bottom = '20px';
    }

    // Mostrar indicador
    this.heightIndicator.classList.add('visible');

    // Cancelar timer anterior si existe
    if (this.heightIndicatorTimer) {
      clearTimeout(this.heightIndicatorTimer);
    }

    // Auto-ocultar despues de 5 segundos de inactividad (solo si no esta en edicion)
    // Tiempo aumentado para dar oportunidad de interactuar
    if (!this.heightIndicator.classList.contains('editing')) {
      this.heightIndicatorTimer = setTimeout(() => {
        this.hideHeightIndicator();
      }, 5000);
    }
  }

  hideHeightIndicator() {
    if (!this.heightIndicator) return;

    // No ocultar si esta en modo edicion
    if (this.heightIndicator.classList.contains('editing')) {
      return;
    }

    // Cancelar timer si existe
    if (this.heightIndicatorTimer) {
      clearTimeout(this.heightIndicatorTimer);
      this.heightIndicatorTimer = null;
    }

    // Ocultar indicador
    this.heightIndicator.classList.remove('visible');
  }

  onHeightInputFocus() {
    if (!this.heightIndicator) return;

    // Entrar en modo edicion
    this.heightIndicator.classList.add('editing');

    // Cancelar auto-hide
    if (this.heightIndicatorTimer) {
      clearTimeout(this.heightIndicatorTimer);
      this.heightIndicatorTimer = null;
    }

    // Seleccionar todo el texto para facilitar la edicion
    if (this.heightIndicatorInput) {
      this.heightIndicatorInput.select();
    }
  }

  onHeightInputBlur() {
    // Pequeno delay para permitir que el boton sea clickeable
    setTimeout(() => {
      if (!this.heightIndicator) return;
      
      // Salir del modo edicion solo si no se esta clickeando el boton
      if (document.activeElement !== this.heightIndicatorButton) {
        this.heightIndicator.classList.remove('editing');
        
        // Reiniciar auto-hide con mas tiempo
        this.heightIndicatorTimer = setTimeout(() => {
          this.hideHeightIndicator();
        }, 5000);
      }
    }, 100);
  }

  applyHeightChange() {
    if (!this.heightIndicatorInput) return;

    const inputValue = parseFloat(this.heightIndicatorInput.value);

    // Validar entrada
    if (isNaN(inputValue) || inputValue <= 0) {
      this.showNotification('Por favor ingresa una altura valida mayor a 0', 'error');
      return;
    }

    // Calcular altura minima y maxima posible
    const nivelesVisibles = state.cutActive ? state.N - state.cutLevel : state.N;
    
    // Altura minima: con angulo de 0.1°
    const minAngle = 0.1 * Math.PI / 180;
    const minH1 = (state.Dmax / 2) * Math.tan(minAngle) * Math.sin(Math.PI / state.N);
    const minHeight = minH1 * nivelesVisibles;
    
    // Altura maxima: con angulo de 89°
    const maxAngle = 89 * Math.PI / 180;
    const maxH1 = (state.Dmax / 2) * Math.tan(maxAngle) * Math.sin(Math.PI / state.N);
    const maxHeight = maxH1 * nivelesVisibles;

    if (inputValue < minHeight) {
      this.showNotification(`Altura muy pequena. Minimo: ${minHeight.toFixed(3)} m`, 'error');
      return;
    }

    if (inputValue > maxHeight) {
      this.showNotification(`Altura muy grande. Maximo: ${maxHeight.toFixed(3)} m`, 'error');
      return;
    }

    // Calcular h1 necesario
    const h1_needed = inputValue / nivelesVisibles;

    // Calcular angulo necesario usando la formula inversa:
    // h1 = (Dmax / 2) * tan(aRad) * sin(  / N)
    // tan(aRad) = h1 / ((Dmax / 2) * sin(  / N))
    // aRad = atan(h1 / ((Dmax / 2) * sin(  / N)))
    
    const denominator = (state.Dmax / 2) * Math.sin(Math.PI / state.N);
    const aRad_needed = Math.atan(h1_needed / denominator);
    const aDeg_needed = (aRad_needed * 180) / Math.PI;

    // Validar que el angulo este en rango valido
    if (aDeg_needed < 0.1 || aDeg_needed > 89) {
      this.showNotification('No se puede calcular un angulo valido para esta altura', 'error');
      return;
    }

    // Actualizar el estado y los controles
    state.aDeg = aDeg_needed;
    
    // Actualizar los inputs de angulo
    if (this.aNum) this.aNum.value = aDeg_needed.toFixed(2);
    if (this.aRange) this.aRange.value = aDeg_needed.toFixed(2);

    // Actualizar badge
    if (this.badgeAngle) {
      this.badgeAngle.textContent = `${aDeg_needed.toFixed(2)}°`;
    }

    // Actualizar calculos del estado
    this.updateState();

    // Reconstruir geometria
    this.sceneManager.requestRebuild();
    this.updateFacesCount();
    this.updateGeometryInfo();

    // Salir del modo edicion
    this.heightIndicator.classList.remove('editing');

    // Mostrar mensaje de exito
    this.showNotification(`Altura ajustada a ${inputValue.toFixed(3)} m (  = ${aDeg_needed.toFixed(2)}°)`, 'success');

    // Ocultar despues de 3 segundos para ver el resultado
    this.heightIndicatorTimer = setTimeout(() => {
      this.hideHeightIndicator();
    }, 3000);
  }

  openAdvancedPanel() {
    if (this.advancedPanel) {
      this.advancedPanel.classList.add('visible');
    }
  }

  closeAdvancedPanel() {
    if (this.advancedPanel) {
      this.advancedPanel.classList.remove('visible');
    }
  }

  //   NUEVO: Actualizar display de niveles visibles
  updateCutLevelDisplay() {
    const visibleLevels = state.N - state.cutLevel;
    if (this.cutLevelNum) this.cutLevelNum.value = visibleLevels;
    if (this.cutLevelRange) this.cutLevelRange.value = visibleLevels;
  }

  //   NUEVO: Actualizar display de altura visible
  updateHeightDisplay() {
    const nivelesVisibles = state.cutActive ? (state.N - state.cutLevel) : state.N;
    const alturaVisible = state.h1 * nivelesVisibles;
    if (this.infoH) this.infoH.textContent = alturaVisible.toFixed(3);
  }

  //   NUEVO: Toggle entre controles Dmax y diametro del piso
  toggleDiameterControls() {
    if (state.cutActive) {
      // Mostrar control de diametro del piso, ocultar Dmax
      if (this.dmaxControl) this.dmaxControl.style.display = 'none';
      if (this.floorDiameterControl) this.floorDiameterControl.style.display = 'grid';
      
      // Actualizar valores del control de diametro del piso
      if (this.floorDiameterNum) this.floorDiameterNum.value = state.floorDiameter.toFixed(3);
      if (this.floorDiameterRange) {
        this.floorDiameterRange.value = state.floorDiameter.toFixed(3);
        this.floorDiameterRange.max = state.Dmax;
      }
    } else {
      // Mostrar control de Dmax, ocultar diametro del piso
      if (this.dmaxControl) this.dmaxControl.style.display = 'grid';
      if (this.floorDiameterControl) this.floorDiameterControl.style.display = 'none';
    }
  }

  updateState() {
    state.Dmax = Math.max(0.1, parseFloat((this.dmaxNum && this.dmaxNum.value) ? this.dmaxNum.value : '') || 10);
    state.N = Math.max(3, parseInt((this.nNum && this.nNum.value) ? this.nNum.value : '') || 11);
    state.aDeg = Math.min(89.9, Math.max(0.1, parseFloat((this.aNum && this.aNum.value) ? this.aNum.value : '') || 39.8));

    updateStateCalculations();

    // Actualizar rango del plano de corte para niveles visibles
    const maxVisibleLevels = state.N - 1;
    if (this.cutLevelRange) {
      this.cutLevelRange.max = maxVisibleLevels;
      this.cutLevelRange.min = 1;
    }
    if (this.cutLevelNum) {
      this.cutLevelNum.max = maxVisibleLevels;
      this.cutLevelNum.min = 1;
    }

    // Asegurar que cutLevel este dentro del rango valido
    if (state.cutLevel >= state.N - 1) state.cutLevel = state.N - 1;
    if (state.cutLevel < 1) state.cutLevel = 1;

    // Actualizar display con niveles visibles
    this.updateCutLevelDisplay();

    //   CAMBIO: Usar updateHeightDisplay() en lugar de asignar directamente
    this.updateHeightDisplay();

    if (this.infoH1) this.infoH1.textContent = state.h1.toFixed(3);
    
    //   NUEVO: Actualizar badges del header
    this.updateBadges();

    // Actualizar informacion geometrica
    this.updateGeometryInfo();
    
    //   NUEVO: Actualizar controles de diametro
    this.toggleDiameterControls();
  }

  //   NUEVO: Metodo para actualizar los badges del header
  updateBadges() {
    if (this.badgeN) {
      this.badgeN.textContent = state.N;
    }
    if (this.badgeAngle) {
      this.badgeAngle.textContent = `${state.aDeg.toFixed(2)}°`;
    }
    if (this.badgeDiameter) {
      if (state.cutActive) {
        // Usar el valor de floorDiameter que esta en el state
        this.badgeDiameter.textContent = `${state.floorDiameter.toFixed(3)}m`;
      } else {
        this.badgeDiameter.textContent = `${state.Dmax.toFixed(3)}m`;
      }
    }
    if (this.badgeLevels && this.badgeLevelsValue) {
      if (state.cutActive) {
        this.badgeLevels.style.display = 'inline-flex';
        // Mostrar niveles visibles (no cutLevel interno)
        const visibleLevels = state.N - state.cutLevel;
        this.badgeLevelsValue.textContent = visibleLevels;
      } else {
        this.badgeLevels.style.display = 'none';
      }
    }
    // Actualizar badge de altura total
    if (this.badgeHeight && this.badgeHeightValue) {
      if (state.cutActive) {
        const nivelesVisibles = state.N - state.cutLevel;
        const alturaVisible = state.h1 * nivelesVisibles;
        this.badgeHeightValue.textContent = `${alturaVisible.toFixed(3)}m`;
        this.badgeHeight.style.display = 'inline-flex';
      } else {
        this.badgeHeight.style.display = 'none';
      }
    }
  }

  //   NUEVO: Actualizar Dmax desde el diametro del piso
  updateDmaxFromFloorDiameter() {
    const floorDiameter = Math.max(0.1, parseFloat((this.floorDiameterNum && this.floorDiameterNum.value) ? this.floorDiameterNum.value : '') || 6);
    
    const sineFactor = Math.sin((state.cutLevel * Math.PI) / state.N);
    
    if (sineFactor > 0.001) {  // Evitar division por cero
      state.Dmax = floorDiameter / sineFactor;
      
      // Actualizar los controles de Dmax (aunque esten ocultos)
      if (this.dmaxNum) this.dmaxNum.value = state.Dmax.toFixed(3);
      if (this.dmaxRange) this.dmaxRange.value = state.Dmax.toFixed(3);
      
      // Recalcular todo
      updateStateCalculations();
      
      //   CAMBIO: Usar updateHeightDisplay()
      this.updateHeightDisplay();
      
      if (this.infoH1) this.infoH1.textContent = state.h1.toFixed(3);
      if (this.statusBadge) this.statusBadge.textContent = `N=${state.N}    =${state.aDeg.toFixed(2)}°`;
      this.updateGeometryInfo();
    }
  }

  updateGeometryInfo() {
    const { N, Dmax, h1, cutActive, cutLevel, aRad, floorDiameter } = state;

    // Calcular diametro del poligono en el piso de corte
    if (cutActive) {
      // Mostrar el diametro del piso que el usuario esta controlando
      if (this.infoDiameter) this.infoDiameter.textContent = floorDiameter.toFixed(3);
      if (this.diameterLabel) this.diameterLabel.textContent = '  piso';
    } else {
      // Mostrar Dmax cuando no hay corte
      if (this.infoDiameter) this.infoDiameter.textContent = Dmax.toFixed(3);
      if (this.diameterLabel) this.diameterLabel.textContent = 'Dmax';
    }

    // Calcular lado del rombo
    // El lado del rombo se calcula usando la distancia entre vertices adyacentes
    // Para un rombo en el nivel k, usamos k=1 como referencia
    const k = 1;
    const Rk = (Dmax / 2) * Math.sin((k * Math.PI) / N);
    const step = (2 * Math.PI) / N;

    // Distancia entre dos vertices consecutivos en el mismo nivel
    const chordLength = 2 * Rk * Math.sin(step / 2);

    // Altura entre niveles es h1
    // El lado del rombo usa teorema de Pitagoras
    const rhombusSide = Math.sqrt(chordLength * chordLength + h1 * h1);
    if (this.infoRhombusSide) this.infoRhombusSide.textContent = rhombusSide.toFixed(3);

    // Calcular base del triangulo en el piso de corte (si esta activo)
    if (cutActive) {
      const RkCut = (Dmax / 2) * Math.sin((cutLevel * Math.PI) / N);
      const triangleBase = 2 * RkCut * Math.sin(step / 2);
      if (this.infoTriangleBase) this.infoTriangleBase.textContent = triangleBase.toFixed(3);
      if (this.triangleBaseInfo) this.triangleBaseInfo.style.display = 'flex';
    } else {
      if (this.triangleBaseInfo) this.triangleBaseInfo.style.display = 'none';
    }
  }

  updateFacesCount() {
    if (state.rhombiVisible && rhombiData.length > 0) {
      const totalRhombi = rhombiData.reduce((sum, level) => sum + level.rhombi.length, 0);
      if (this.infoFaces) this.infoFaces.textContent = totalRhombi;
    } else {
      if (this.infoFaces) this.infoFaces.textContent = '0';
    }
  }

  // Metodo con debouncing para cambios finales
  debouncedSyncInputs(source, param) {
    // Actualizar valores inmediatamente para feedback visual
    this.syncInputValues(source);

    // Cancelar timer anterior
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    // Esperar 200ms despues del ultimo cambio para reconstruir (aumentado para mejor performance)
    this.debounceTimer = setTimeout(() => {
      this.performSync();
    }, 200);
  }

  // Metodo con throttling para actualizaciones continuas (sliders)
  throttledSyncInputs(source, param) {
    // Actualizar valores inmediatamente
    this.syncInputValues(source);

    // Si ya hay una actualizacion en curso, salir
    if (this.isUpdating) return;

    // Marcar como actualizando
    this.isUpdating = true;

    // Throttle: maximo una reconstruccion cada 150ms (aumentado de 100ms)
    setTimeout(() => {
      this.performSync();
      this.isUpdating = false;
    }, 150);
  }

  // Sincronizar solo los valores de los inputs (sin rebuild)
  syncInputValues(source) {
    if (source === 'num') {
      if (this.dmaxRange && this.dmaxNum) this.dmaxRange.value = this.dmaxNum.value;
      if (this.nRange && this.nNum) this.nRange.value = this.nNum.value;
      if (this.aRange && this.aNum) this.aRange.value = this.aNum.value;
    } else {
      if (this.dmaxNum && this.dmaxRange) this.dmaxNum.value = this.dmaxRange.value;
      if (this.nNum && this.nRange) this.nNum.value = this.nRange.value;
      if (this.aNum && this.aRange) this.aNum.value = this.aRange.value;
    }
    
    // Actualizar state temporalmente para calculo de badges
    const prevState = {
      N: state.N,
      aDeg: state.aDeg,
      Dmax: state.Dmax
    };
    
    if (this.nNum) state.N = parseInt(this.nNum.value);
    if (this.aNum) state.aDeg = parseFloat(this.aNum.value);
    if (this.dmaxNum) state.Dmax = parseFloat(this.dmaxNum.value);
    
    // Recalcular h1 temporalmente
    state.aRad = (state.aDeg * Math.PI) / 180;
    state.h1 = (state.Dmax / 2) * Math.tan(state.aRad) * Math.sin(Math.PI / state.N);
    
    // Actualizar badges inmediatamente
    this.updateBadges();
  }

  // Realizar la sincronizacion completa con rebuild
  performSync() {
    this.updateState();
    this.sceneManager.requestRebuild();
    this.updateFacesCount();
  }

  //   NUEVO: Debouncing para diametro del piso
  debouncedSyncFloorDiameter(source) {
    this.syncFloorDiameterValues(source);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.performFloorDiameterSync();
    }, 200);
  }

  //   NUEVO: Throttling para diametro del piso
  throttledSyncFloorDiameter(source) {
    this.syncFloorDiameterValues(source);
    if (this.isUpdating) return;
    this.isUpdating = true;
    setTimeout(() => {
      this.performFloorDiameterSync();
      this.isUpdating = false;
    }, 150);
  }

  //   NUEVO: Sincronizar valores de diametro del piso
  syncFloorDiameterValues(source) {
    if (source === 'num') {
      if (this.floorDiameterRange && this.floorDiameterNum) 
        this.floorDiameterRange.value = this.floorDiameterNum.value;
    } else {
      if (this.floorDiameterNum && this.floorDiameterRange) 
        this.floorDiameterNum.value = this.floorDiameterRange.value;
    }
    
    // Actualizar floorDiameter temporalmente para el badge
    if (this.floorDiameterNum) {
      state.floorDiameter = parseFloat(this.floorDiameterNum.value);
    }
    
    // Actualizar badges inmediatamente
    this.updateBadges();
  }

  //   NUEVO: Realizar sincronizacion de diametro del piso
  performFloorDiameterSync() {
    this.updateDmaxFromFloorDiameter();
    this.sceneManager.requestRebuild();
    this.updateFacesCount();
  }

  debouncedSyncCutInputs(source) {
    this.syncCutValues(source);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.performCutSync();
    }, 150);
  }

  throttledSyncCutInputs(source) {
    this.syncCutValues(source);
    if (this.isUpdating) return;
    this.isUpdating = true;
    setTimeout(() => {
      this.performCutSync();
      this.isUpdating = false;
    }, 120);
  }

  syncCutValues(source) {
    if (source === 'num') {
      if (this.cutLevelRange && this.cutLevelNum) 
        this.cutLevelRange.value = this.cutLevelNum.value;
    } else {
      if (this.cutLevelNum && this.cutLevelRange) 
        this.cutLevelNum.value = this.cutLevelRange.value;
    }
  }

  performCutSync() {
    // Convertir niveles visibles a cutLevel interno (K desde abajo)
    const visibleLevels = parseInt((this.cutLevelNum && this.cutLevelNum.value) ? this.cutLevelNum.value : '') || 5;
    state.cutLevel = state.N - visibleLevels;

    // Asegurar limites validos
    state.cutLevel = Math.max(1, Math.min(state.N - 1, state.cutLevel));

    if (state.cutActive) {
      //   NUEVO: Actualizar altura visible
      this.updateHeightDisplay();
      
      //   NUEVO: Recalcular y actualizar diametro del piso
      updateStateCalculations();
      
      if (this.floorDiameterNum) this.floorDiameterNum.value = state.floorDiameter.toFixed(3);
      if (this.floorDiameterRange) {
        this.floorDiameterRange.value = state.floorDiameter.toFixed(3);
        this.floorDiameterRange.max = state.Dmax;
      }
      
      this.sceneManager.requestRebuild();
      this.updateFacesCount();
      this.updateGeometryInfo();
      this.updateBadges();
    }
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
    const cylDiameterMm = Number((this.connCylDiameterMm && this.connCylDiameterMm.value) ? this.connCylDiameterMm.value : 0);
    const cylDepthMm = Number((this.connCylDepthMm && this.connCylDepthMm.value) ? this.connCylDepthMm.value : 0);
    const beamHeightMm = Number((this.beamHeightMm && this.beamHeightMm.value) ? this.beamHeightMm.value : 0);
    const beamWidthMm = Number((this.beamWidthMm && this.beamWidthMm.value) ? this.beamWidthMm.value : 0);

    if (!cylDiameterMm || !cylDepthMm || !beamHeightMm || !beamWidthMm) {
      this.showNotification('Ingresa diametro/profundidad del conector y alto/ancho de la viga (mm).', 'error');
      return;
    }

    try {
      // Al regenerar desde el panel, se asume que se resetean overrides por nivel
      state.structureConnectorOverrides = {};
      this.sceneManager.generateConnectorStructure({
        cylDiameterMm,
        cylDepthMm,
        beamHeightMm,
        beamWidthMm,
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
      console.error(err);
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
      console.error(err);
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

    // Iniciar monitoreo de FPS
    this.startFPSMonitor();
  }

  startFPSMonitor() {
    let lastTime = performance.now();
    let frames = 0;

    const updateFPS = () => {
      frames++;
      const currentTime = performance.now();

      if (currentTime - lastTime >= 1000) {
        const fps = Math.round((frames * 1000) / (currentTime - lastTime));

        if (this.fpsCounter) {
          // Color segun rendimiento
          let color = '#4ade80'; // Verde
          if (fps < 30) color = '#ef4444'; // Rojo
          else if (fps < 45) color = '#f59e0b'; // Naranja

          this.fpsCounter.style.color = color;
          this.fpsCounter.textContent = `FPS: ${fps}`;
        }

        frames = 0;
        lastTime = currentTime;
      }

      requestAnimationFrame(updateFPS);
    };

    updateFPS();
  }
}