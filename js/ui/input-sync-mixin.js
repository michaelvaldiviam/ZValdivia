import { state, updateStateCalculations } from '../state.js';

export function applyInputSyncMixin(proto) {

  proto.debouncedSyncInputs = function(source, param) {
    // Actualizar valores inmediatamente para feedback visual
    this.syncInputValues(source);

    // Timer independiente para el debounce de inputs numéricos
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.performSync();
    }, 200);
  };

  proto.throttledSyncInputs = function(source, param) {
    // Actualizar valores inmediatamente (sin rebuild)
    this.syncInputValues(source);

    // Throttle por parámetro (no compartido) para evitar que sliders distintos se bloqueen entre sí
    const key = String(param || 'default');
    if (this._throttleTimers[key]) return;

    this._throttleTimers[key] = setTimeout(() => {
      this._throttleTimers[key] = null;
      // Solo ejecutar si no hay un debounce pendiente (el debounce tiene mayor precisión)
      if (!this.debounceTimer) {
        this.performSync();
      }
    }, 150);
  };

  proto.syncInputValues = function(source) {
    if (source === 'num') {
      if (this.dmaxRange && this.dmaxNum) this.dmaxRange.value = this.dmaxNum.value;
      if (this.nRange && this.nNum) this.nRange.value = this.nNum.value;
      if (this.aRange && this.aNum) this.aRange.value = this.aNum.value;
    } else {
      if (this.dmaxNum && this.dmaxRange) this.dmaxNum.value = this.dmaxRange.value;
      if (this.nNum && this.nRange) this.nNum.value = this.nRange.value;
      if (this.aNum && this.aRange) this.aNum.value = this.aRange.value;
    }
    
    // BUG-M5 / MEJ-10 fix: usar updateStateCalculations() en lugar de recalcular parcialmente.
    // Antes se recalculaba solo h1 y aRad, dejando Htotal y floorDiameter desactualizados durante el drag.
    if (this.nNum) state.N = Math.max(3, parseInt(this.nNum.value) || state.N);
    if (this.aNum) state.aDeg = parseFloat(this.aNum.value) || state.aDeg;
    if (this.dmaxNum) state.Dmax = parseFloat(this.dmaxNum.value) || state.Dmax;
    
    // Recalcular estado completo (incluye h1, Htotal, floorDiameter)
    updateStateCalculations();
    
    // Actualizar badges inmediatamente
    this.updateBadges();
  };

  proto.performSync = function() {
    this.updateState();
    this.sceneManager.requestRebuild();
    if (this.sceneManager.markDirty) this.sceneManager.markDirty();
    this.updateFacesCount();
  };

  proto.debouncedSyncFloorDiameter = function(source) {
    this.syncFloorDiameterValues(source);
    if (this._floorDebounceTimer) clearTimeout(this._floorDebounceTimer);
    this._floorDebounceTimer = setTimeout(() => {
      this._floorDebounceTimer = null;
      this.performFloorDiameterSync();
    }, 200);
  };

  proto.throttledSyncFloorDiameter = function(source) {
    this.syncFloorDiameterValues(source);
    // Flag independiente para no bloquear el slider de corte ni los sliders principales
    if (this._throttleTimers['floor']) return;
    this._throttleTimers['floor'] = setTimeout(() => {
      this._throttleTimers['floor'] = null;
      if (!this._floorDebounceTimer) {
        this.performFloorDiameterSync();
      }
    }, 150);
  };

  proto.syncFloorDiameterValues = function(source) {
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
  };

  proto.performFloorDiameterSync = function() {
    this.updateDmaxFromFloorDiameter();
    this.sceneManager.requestRebuild();
    this.updateFacesCount();
  };

  proto.debouncedSyncCutInputs = function(source) {
    this.syncCutValues(source);
    if (this._cutDebounceTimer) clearTimeout(this._cutDebounceTimer);
    this._cutDebounceTimer = setTimeout(() => {
      this._cutDebounceTimer = null;
      this.performCutSync();
    }, 150);
  };

  proto.throttledSyncCutInputs = function(source) {
    this.syncCutValues(source);
    // Flag independiente para no bloquear el slider de piso ni los sliders principales
    if (this._throttleTimers['cut']) return;
    this._throttleTimers['cut'] = setTimeout(() => {
      this._throttleTimers['cut'] = null;
      if (!this._cutDebounceTimer) {
        this.performCutSync();
      }
    }, 120);
  };

  proto.syncCutValues = function(source) {
    if (source === 'num') {
      if (this.cutLevelRange && this.cutLevelNum) 
        this.cutLevelRange.value = this.cutLevelNum.value;
    } else {
      if (this.cutLevelNum && this.cutLevelRange) 
        this.cutLevelNum.value = this.cutLevelRange.value;
    }
  };

  proto.performCutSync = function() {
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
  };

  proto.updateRotationSpeed = function(e) {
    const speedValue = parseFloat(e.target.value);
    state.rotationSpeed = speedValue / 100;
  };

}