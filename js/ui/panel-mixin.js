import { state, updateStateCalculations, rhombiData } from '../state.js';

export function applyPanelMixin(proto) {

  proto.toggleInfo = function() {
    if (this.quickInfo) {
      this.quickInfo.classList.toggle('collapsed');
    }
  };

  proto.setMainPanelCollapsed = function(collapsed = true) {
    const on = !!collapsed;
    if (this.paramsSection) this.paramsSection.classList.toggle('collapsed', on);
    if (this.quickInfo) this.quickInfo.classList.toggle('collapsed', on);
    // El boton suele invertir su icono/estado con la misma clase 'collapsed'
    if (this.toggleMainPanelBtn) this.toggleMainPanelBtn.classList.toggle('collapsed', on);
  };

  proto.toggleMainPanel = function() {
    if (this.paramsSection) {
      this.paramsSection.classList.toggle('collapsed');
    }
    if (this.quickInfo) {
      this.quickInfo.classList.toggle('collapsed');
    }
    if (this.toggleMainPanelBtn) {
      this.toggleMainPanelBtn.classList.toggle('collapsed');
    }
  };

  proto.showHeightIndicator = function() {
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
  };

  proto.hideHeightIndicator = function() {
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
  };

  proto.onHeightInputFocus = function() {
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
  };

  proto.onHeightInputBlur = function() {
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
  };

  proto.applyHeightChange = function() {
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
  };

  proto.openAdvancedPanel = function() {
    if (this.advancedPanel) {
      this.advancedPanel.classList.add('visible');
    }
  };

  proto.closeAdvancedPanel = function() {
    if (this.advancedPanel) {
      this.advancedPanel.classList.remove('visible');
    }
  };

  proto.updateCutLevelDisplay = function() {
    const visibleLevels = state.N - state.cutLevel;
    if (this.cutLevelNum) this.cutLevelNum.value = visibleLevels;
    if (this.cutLevelRange) this.cutLevelRange.value = visibleLevels;
  };

  proto.updateHeightDisplay = function() {
    const nivelesVisibles = state.cutActive ? (state.N - state.cutLevel) : state.N;
    const alturaVisible = state.h1 * nivelesVisibles;
    if (this.infoH) this.infoH.textContent = alturaVisible.toFixed(3);
  };

  proto.toggleDiameterControls = function() {
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
  };

  proto.updateState = function() {
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
  };

  proto.updateBadges = function() {
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
  };

  proto.updateDmaxFromFloorDiameter = function() {
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
      this.updateGeometryInfo();
      // BUG-M8 fix: actualizar badges tras cambio de diámetro de piso
      this.updateBadges();
    }
  };

  proto.updateGeometryInfo = function() {
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
  };

  proto.updateFacesCount = function() {
    if (state.rhombiVisible && rhombiData.length > 0) {
      const totalRhombi = rhombiData.reduce((sum, level) => sum + level.rhombi.length, 0);
      if (this.infoFaces) this.infoFaces.textContent = totalRhombi;
    } else {
      if (this.infoFaces) this.infoFaces.textContent = '0';
    }
  };

}