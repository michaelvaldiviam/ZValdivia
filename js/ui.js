import { state, updateStateCalculations, rhombiData } from './state.js';

/**
 * Maneja toda la lógica de la interfaz de usuario
 */
export class UIManager {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.debounceTimer = null;
    this.throttleTimer = null;
    this.isUpdating = false;

    this.getDOMElements();
    this.setupEventListeners();
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
    
    // ✅ NUEVO: Controles de diámetro del piso
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
    this.statusBadge = document.getElementById('statusBadge');
    this.infoDiameter = document.getElementById('infoDiameter');
    this.diameterLabel = document.getElementById('diameterLabel');
    this.infoRhombusSide = document.getElementById('infoRhombusSide');
    this.infoTriangleBase = document.getElementById('infoTriangleBase');
    this.triangleBaseInfo = document.getElementById('triangleBaseInfo');

    // 🚀 PERFORMANCE: Agregar indicador de FPS
    this.createPerformanceIndicator();
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

  showNotification(message, type = 'info') {
    // Crear notificación temporal
    const notification = document.createElement('div');

    // Colores según el tipo
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

    // Agregar animación CSS
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

    // Remover después de 2.5 segundos (más tiempo para info)
    const duration = type === 'info' ? 3000 : 2500;
    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => {
        document.body.removeChild(notification);
        document.head.removeChild(style);
      }, 300);
    }, duration);
  }

  setupEventListeners() {
    // Advanced panel controls
    if (this.toggleAdvancedBtn) 
      this.toggleAdvancedBtn.addEventListener('click', () => this.openAdvancedPanel());
    if (this.closeAdvancedBtn) 
      this.closeAdvancedBtn.addEventListener('click', () => this.closeAdvancedPanel());

    // Info panel toggle (solo móvil)
    if (this.toggleInfoBtn) 
      this.toggleInfoBtn.addEventListener('click', () => this.toggleInfo());

    // Input controls - con debouncing y throttling
    if (this.dmaxNum) 
      this.dmaxNum.addEventListener('input', () => this.debouncedSyncInputs('num', 'dmax'));
    if (this.dmaxRange) 
      this.dmaxRange.addEventListener('input', () => this.throttledSyncInputs('range', 'dmax'));

    // ✅ NUEVO: Listeners para diámetro del piso
    if (this.floorDiameterNum) 
      this.floorDiameterNum.addEventListener('input', () => this.debouncedSyncFloorDiameter('num'));
    if (this.floorDiameterRange) 
      this.floorDiameterRange.addEventListener('input', () => this.throttledSyncFloorDiameter('range'));

    // N es el más crítico - throttling más agresivo
    if (this.nNum) 
      this.nNum.addEventListener('input', () => this.debouncedSyncInputs('num', 'n'));
    if (this.nRange) 
      this.nRange.addEventListener('input', () => this.throttledSyncInputs('range', 'n'));

    if (this.aNum) 
      this.aNum.addEventListener('input', () => this.debouncedSyncInputs('num', 'a'));
    if (this.aRange) 
      this.aRange.addEventListener('input', () => this.throttledSyncInputs('range', 'a'));

    // Cut plane controls
    if (this.cutLevelNum) 
      this.cutLevelNum.addEventListener('input', () => this.debouncedSyncCutInputs('num'));
    if (this.cutLevelRange) 
      this.cutLevelRange.addEventListener('input', () => this.throttledSyncCutInputs('range'));

    // Button controls
    if (this.facesBtn) 
      this.facesBtn.addEventListener('click', () => this.toggleFaces());
    if (this.togglePolysBtn) 
      this.togglePolysBtn.addEventListener('click', () => this.togglePolygons());
    if (this.toggleLinesBtn) 
      this.toggleLinesBtn.addEventListener('click', () => this.toggleLines());
    if (this.fitBtn) 
      this.fitBtn.addEventListener('click', () => this.sceneManager.fitCamera());
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

    // Window resize
    window.addEventListener('resize', () => this.sceneManager.handleResize());
  }

  toggleInfo() {
    if (this.quickInfo) {
      this.quickInfo.classList.toggle('collapsed');
    }
  }

  openAdvancedPanel() {
    if (this.advancedPanel) {
      this.advancedPanel.style.display = 'block';
    }
  }

  closeAdvancedPanel() {
    if (this.advancedPanel) {
      this.advancedPanel.style.display = 'none';
    }
  }

  // ✅ NUEVO: Actualizar display de niveles visibles
  updateCutLevelDisplay() {
    const visibleLevels = state.N - state.cutLevel;
    if (this.cutLevelNum) this.cutLevelNum.value = visibleLevels;
    if (this.cutLevelRange) this.cutLevelRange.value = visibleLevels;
  }

  // ✅ NUEVO: Actualizar display de altura visible
  updateHeightDisplay() {
    const nivelesVisibles = state.cutActive ? (state.N - state.cutLevel) : state.N;
    const alturaVisible = state.h1 * nivelesVisibles;
    if (this.infoH) this.infoH.textContent = alturaVisible.toFixed(2);
  }

  // ✅ NUEVO: Toggle entre controles Dmax y diámetro del piso
  toggleDiameterControls() {
    if (state.cutActive) {
      // Mostrar control de diámetro del piso, ocultar Dmax
      if (this.dmaxControl) this.dmaxControl.style.display = 'none';
      if (this.floorDiameterControl) this.floorDiameterControl.style.display = 'grid';
      
      // Actualizar valores del control de diámetro del piso
      if (this.floorDiameterNum) this.floorDiameterNum.value = state.floorDiameter.toFixed(2);
      if (this.floorDiameterRange) {
        this.floorDiameterRange.value = state.floorDiameter.toFixed(2);
        this.floorDiameterRange.max = state.Dmax;
      }
    } else {
      // Mostrar control de Dmax, ocultar diámetro del piso
      if (this.dmaxControl) this.dmaxControl.style.display = 'grid';
      if (this.floorDiameterControl) this.floorDiameterControl.style.display = 'none';
    }
  }

  updateState() {
    state.Dmax = Math.max(0.1, parseFloat(this.dmaxNum?.value) || 10);
    state.N = Math.max(3, parseInt(this.nNum?.value) || 11);
    state.aDeg = Math.min(89.9, Math.max(0.1, parseFloat(this.aNum?.value) || 39.8));

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

    // Asegurar que cutLevel esté dentro del rango válido
    if (state.cutLevel >= state.N - 1) state.cutLevel = state.N - 1;
    if (state.cutLevel < 1) state.cutLevel = 1;

    // Actualizar display con niveles visibles
    this.updateCutLevelDisplay();

    // ✅ CAMBIO: Usar updateHeightDisplay() en lugar de asignar directamente
    this.updateHeightDisplay();

    if (this.infoH1) this.infoH1.textContent = state.h1.toFixed(3);
    if (this.statusBadge) this.statusBadge.textContent = `N=${state.N} · α=${state.aDeg.toFixed(1)}°`;

    // Actualizar información geométrica
    this.updateGeometryInfo();
    
    // ✅ NUEVO: Actualizar controles de diámetro
    this.toggleDiameterControls();
  }

  // ✅ NUEVO: Actualizar Dmax desde el diámetro del piso
  updateDmaxFromFloorDiameter() {
    const floorDiameter = Math.max(0.1, parseFloat(this.floorDiameterNum?.value) || 5);
    
    const sineFactor = Math.sin((state.cutLevel * Math.PI) / state.N);
    
    if (sineFactor > 0.001) {  // Evitar división por cero
      state.Dmax = floorDiameter / sineFactor;
      
      // Actualizar los controles de Dmax (aunque estén ocultos)
      if (this.dmaxNum) this.dmaxNum.value = state.Dmax.toFixed(2);
      if (this.dmaxRange) this.dmaxRange.value = state.Dmax.toFixed(2);
      
      // Recalcular todo
      updateStateCalculations();
      
      // ✅ CAMBIO: Usar updateHeightDisplay()
      this.updateHeightDisplay();
      
      if (this.infoH1) this.infoH1.textContent = state.h1.toFixed(3);
      if (this.statusBadge) this.statusBadge.textContent = `N=${state.N} · α=${state.aDeg.toFixed(1)}°`;
      this.updateGeometryInfo();
    }
  }

  updateGeometryInfo() {
    const { N, Dmax, h1, cutActive, cutLevel, aRad } = state;

    // Calcular diámetro del polígono en el piso de corte
    if (cutActive) {
      // Diámetro del polígono en el nivel de corte
      const Rk = (Dmax / 2) * Math.sin((cutLevel * Math.PI) / N);
      const diameterCut = 2 * Rk;
      if (this.infoDiameter) this.infoDiameter.textContent = diameterCut.toFixed(2);
      if (this.diameterLabel) this.diameterLabel.textContent = 'D corte';
    } else {
      // Mostrar Dmax cuando no hay corte
      if (this.infoDiameter) this.infoDiameter.textContent = Dmax.toFixed(2);
      if (this.diameterLabel) this.diameterLabel.textContent = 'Dmax';
    }

    // Calcular lado del rombo
    // El lado del rombo se calcula usando la distancia entre vértices adyacentes
    // Para un rombo en el nivel k, usamos k=1 como referencia
    const k = 1;
    const Rk = (Dmax / 2) * Math.sin((k * Math.PI) / N);
    const step = (2 * Math.PI) / N;

    // Distancia entre dos vértices consecutivos en el mismo nivel
    const chordLength = 2 * Rk * Math.sin(step / 2);

    // Altura entre niveles es h1
    // El lado del rombo usa teorema de Pitágoras
    const rhombusSide = Math.sqrt(chordLength * chordLength + h1 * h1);
    if (this.infoRhombusSide) this.infoRhombusSide.textContent = rhombusSide.toFixed(3);

    // Calcular base del triángulo en el piso de corte (si está activo)
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

  // Método con debouncing para cambios finales
  debouncedSyncInputs(source, param) {
    // Actualizar valores inmediatamente para feedback visual
    this.syncInputValues(source);

    // Cancelar timer anterior
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    // Esperar 200ms después del último cambio para reconstruir (aumentado para mejor performance)
    this.debounceTimer = setTimeout(() => {
      this.performSync();
    }, 200);
  }

  // Método con throttling para actualizaciones continuas (sliders)
  throttledSyncInputs(source, param) {
    // Actualizar valores inmediatamente
    this.syncInputValues(source);

    // Si ya hay una actualización en curso, salir
    if (this.isUpdating) return;

    // Marcar como actualizando
    this.isUpdating = true;

    // Throttle: máximo una reconstrucción cada 150ms (aumentado de 100ms)
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
  }

  // Realizar la sincronización completa con rebuild
  performSync() {
    this.updateState();
    this.sceneManager.requestRebuild();
    this.updateFacesCount();
  }

  // ✅ NUEVO: Debouncing para diámetro del piso
  debouncedSyncFloorDiameter(source) {
    this.syncFloorDiameterValues(source);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.performFloorDiameterSync();
    }, 200);
  }

  // ✅ NUEVO: Throttling para diámetro del piso
  throttledSyncFloorDiameter(source) {
    this.syncFloorDiameterValues(source);
    if (this.isUpdating) return;
    this.isUpdating = true;
    setTimeout(() => {
      this.performFloorDiameterSync();
      this.isUpdating = false;
    }, 150);
  }

  // ✅ NUEVO: Sincronizar valores de diámetro del piso
  syncFloorDiameterValues(source) {
    if (source === 'num') {
      if (this.floorDiameterRange && this.floorDiameterNum) 
        this.floorDiameterRange.value = this.floorDiameterNum.value;
    } else {
      if (this.floorDiameterNum && this.floorDiameterRange) 
        this.floorDiameterNum.value = this.floorDiameterRange.value;
    }
  }

  // ✅ NUEVO: Realizar sincronización de diámetro del piso
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
    const visibleLevels = parseInt(this.cutLevelNum?.value) || 5;
    state.cutLevel = state.N - visibleLevels;

    // Asegurar límites válidos
    state.cutLevel = Math.max(1, Math.min(state.N - 1, state.cutLevel));

    if (state.cutActive) {
      // ✅ NUEVO: Actualizar altura visible
      this.updateHeightDisplay();
      
      // ✅ NUEVO: Recalcular y actualizar diámetro del piso
      updateStateCalculations();
      
      if (this.floorDiameterNum) this.floorDiameterNum.value = state.floorDiameter.toFixed(2);
      if (this.floorDiameterRange) {
        this.floorDiameterRange.value = state.floorDiameter.toFixed(2);
        this.floorDiameterRange.max = state.Dmax;
      }
      
      this.sceneManager.requestRebuild();
      this.sceneManager.fitCamera();
      this.updateFacesCount();
      this.updateGeometryInfo();
    }
  }

  toggleFaces() {
    state.rhombiVisible = !state.rhombiVisible;
    if (this.facesBtn) {
      this.facesBtn.classList.toggle('primary', state.rhombiVisible);
      this.facesBtn.textContent = state.rhombiVisible ? 'Caras activadas' : 'Caras desactivadas';
    }
    this.sceneManager.requestRebuild();
    this.updateFacesCount();
  }

  togglePolygons() {
    state.polysVisible = !state.polysVisible;
    if (this.togglePolysBtn) {
      this.togglePolysBtn.classList.toggle('primary', state.polysVisible);
      this.togglePolysBtn.textContent = state.polysVisible ? 'Polígonos activados' : 'Polígonos desactivados';
    }
    this.sceneManager.requestRebuild();
  }

  toggleLines() {
    state.linesVisible = !state.linesVisible;
    if (this.toggleLinesBtn) {
      this.toggleLinesBtn.classList.toggle('primary', state.linesVisible);
      this.toggleLinesBtn.textContent = state.linesVisible ? 'Aristas activadas' : 'Aristas desactivadas';
    }
    this.sceneManager.requestRebuild();
  }

  toggleColorByLevel() {
    // Verificar si las caras están activadas
    if (!state.rhombiVisible) {
      this.showNotification('Debes activar las caras primero para cambiar el skin');
      return;
    }

    state.colorByLevel = !state.colorByLevel;
    if (this.colorByLevelBtn) {
      this.colorByLevelBtn.classList.toggle('primary', !state.colorByLevel);
      this.colorByLevelBtn.textContent = state.colorByLevel ? 'Skin Arcoíris' : 'Skin Cristal';
    }
    this.sceneManager.requestRebuild();
    this.updateFacesCount();
  }

  toggleAxis() {
    state.axisVisible = !state.axisVisible;
    if (this.toggleAxisBtn) {
      this.toggleAxisBtn.classList.toggle('primary', state.axisVisible);
      this.toggleAxisBtn.textContent = state.axisVisible ? 'Eje activado' : 'Eje desactivado';
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
      this.cutBtn.textContent = state.cutActive ? 'Desactivar porción' : 'Crear porción';
    }

    // ✅ NUEVO: Actualizar altura visible
    this.updateHeightDisplay();
    
    // ✅ NUEVO: Actualizar controles de diámetro
    this.toggleDiameterControls();

    this.sceneManager.requestRebuild();
    this.sceneManager.fitCamera();
    this.updateFacesCount();
    this.updateGeometryInfo();
  }

  updateRotationSpeed(e) {
    const speedValue = parseFloat(e.target.value);
    state.rotationSpeed = speedValue / 100;
  }

    /**
   * Actualiza todos los botones según el estado actual
   */
  updateAllButtons() {
    // Actualizar inputs
    if (this.dmaxNum) this.dmaxNum.value = state.Dmax.toFixed(2);
    if (this.dmaxRange) this.dmaxRange.value = state.Dmax.toFixed(2);
    if (this.nNum) this.nNum.value = state.N;
    if (this.nRange) this.nRange.value = state.N;
    if (this.aNum) this.aNum.value = state.aDeg.toFixed(1);
    if (this.aRange) this.aRange.value = state.aDeg.toFixed(1);

    // Faces
    if (this.facesBtn) {
      this.facesBtn.classList.toggle('primary', state.rhombiVisible);
      this.facesBtn.textContent = state.rhombiVisible ? 'Caras activadas' : 'Caras desactivadas';
    }

    // Polygons
    if (this.togglePolysBtn) {
      this.togglePolysBtn.classList.toggle('primary', state.polysVisible);
      this.togglePolysBtn.textContent = state.polysVisible ? 'Polígonos activados' : 'Polígonos desactivados';
    }

    // Lines
    if (this.toggleLinesBtn) {
      this.toggleLinesBtn.classList.toggle('primary', state.linesVisible);
      this.toggleLinesBtn.textContent = state.linesVisible ? 'Aristas activadas' : 'Aristas desactivadas';
    }

    // Axis
    if (this.toggleAxisBtn) {
      this.toggleAxisBtn.classList.toggle('primary', state.axisVisible);
      this.toggleAxisBtn.textContent = state.axisVisible ? 'Eje activado' : 'Eje desactivado';
    }

    // Color by level
    if (this.colorByLevelBtn) {
      this.colorByLevelBtn.classList.toggle('primary', !state.colorByLevel);
      this.colorByLevelBtn.textContent = state.colorByLevel ? 'Skin: Arcoíris' : 'Skin: Cristal';
    }

    // Cut button
    if (this.cutBtn) {
      this.cutBtn.classList.toggle('active', state.cutActive);
      this.cutBtn.textContent = state.cutActive ? 'Desactivar porción' : 'Crear porción';
    }

    // Toggle diameter controls
    this.toggleDiameterControls();
    this.updateCutLevelDisplay();
    this.updateGeometryInfo();
  }

  initialize() {
    // Cerrar panel avanzado al inicio
    this.closeAdvancedPanel();

    // En móvil, ocultar info por defecto
    if (window.innerWidth <= 640 && this.quickInfo) {
      this.quickInfo.classList.add('collapsed');
    }

    this.updateState();
    this.updateGeometryInfo(); // Inicializar valores geométricos
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
          // Color según rendimiento
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