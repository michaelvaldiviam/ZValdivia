import { state, updateStateCalculations } from './state.js';

/**
 * Maneja compartir configuracion mediante URL y JSON
 * Optimizado para GitHub Pages
 */
export class ShareManager {
  constructor(uiManager, sceneManager) {
    this.uiManager = uiManager;
    this.sceneManager = sceneManager;
  }

  /**
   * Genera URL con parametros de configuracion
   */
  generateShareURL() {
    const params = new URLSearchParams({
      N: state.N,
      a: state.aDeg.toFixed(2),
      Dmax: state.Dmax.toFixed(2),
      cut: state.cutActive ? '1' : '0',
      cutLevel: state.cutLevel,
      faces: state.rhombiVisible ? '1' : '0',
      polys: state.polysVisible ? '1' : '0',
      lines: state.linesVisible ? '1' : '0',
      skin: state.colorByLevel ? 'rainbow' : 'crystal',
      axis: state.axisVisible ? '1' : '0'
    });

    // Estructura (vigas + conectores): incluir parametros y toggle si existen
    // La estructura se re-genera deterministicamente desde los parametros
    // y el estado del zonohedro, por lo que no se serializa la malla.
    if (state.structureParams) {
      params.set('struct', '1');
      params.set('sv', state.structureVisible ? '1' : '0');
      const p = state.structureParams;
      if (Number.isFinite(Number(p.cylDiameterMm))) params.set('cd', String(Math.round(Number(p.cylDiameterMm))));
      if (Number.isFinite(Number(p.cylDepthMm))) params.set('cp', String(Math.round(Number(p.cylDepthMm))));
      if (Number.isFinite(Number(p.beamWidthMm))) params.set('bw', String(Math.round(Number(p.beamWidthMm))));
      if (Number.isFinite(Number(p.beamHeightMm))) params.set('bh', String(Math.round(Number(p.beamHeightMm))));

      // Overrides por nivel para conectores (opcional)
      if (state.structureConnectorOverrides && Object.keys(state.structureConnectorOverrides).length > 0) {
        try {
          params.set('co', encodeURIComponent(JSON.stringify(state.structureConnectorOverrides)));
        } catch (e) {
          // ignorar si falla
        }
      }

      // Overrides / ediciones de estructura (vigas/caras extra/eliminadas)
      // Siempre se serializan si existen, independientemente de connector overrides
      const safeSetJSON = (key, value) => {
        if (!value) return;
        const isEmptyObj = (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);
        const isEmptyArr = Array.isArray(value) && value.length === 0;
        if (isEmptyObj || isEmptyArr) return;
        try { params.set(key, encodeURIComponent(JSON.stringify(value))); } catch (e) { /* ign */ }
      };
      safeSetJSON('bo', state.structureBeamOverrides);
      safeSetJSON('xf', state.structureIntersectionFaces);
      safeSetJSON('xb', state.structureExtraBeams);
      safeSetJSON('db', state.structureDeletedBeams);
    }

    const baseURL = window.location.origin + window.location.pathname;
    return `${baseURL}?${params.toString()}`;
  }

  /**
   * Carga configuracion desde URL al iniciar la app
   */
  loadFromURL() {
    const params = new URLSearchParams(window.location.search);
    
    if (params.size === 0) return false;

    if (params.has('N')) state.N = Math.max(3, Math.min(100, parseInt(params.get('N'))));
    if (params.has('a')) state.aDeg = Math.max(0.1, Math.min(89.9, parseFloat(params.get('a'))));
    if (params.has('Dmax')) state.Dmax = Math.max(0.1, parseFloat(params.get('Dmax')));
    
    if (params.has('cut')) state.cutActive = params.get('cut') === '1';
    if (params.has('cutLevel')) state.cutLevel = parseInt(params.get('cutLevel'));
    
    if (params.has('faces')) state.rhombiVisible = params.get('faces') === '1';
    if (params.has('polys')) state.polysVisible = params.get('polys') === '1';
    if (params.has('lines')) state.linesVisible = params.get('lines') === '1';
    if (params.has('axis')) state.axisVisible = params.get('axis') === '1';
    
    if (params.has('skin')) {
      state.colorByLevel = params.get('skin') === 'rainbow';
    }

    // Estructura (vigas + conectores)
    // Si vienen parametros en la URL, la estructura se re-genera automaticamente.
    const hasStructFlag = params.get('struct') === '1' || params.has('cd') || params.has('cp') || params.has('bw') || params.has('bh');
    if (hasStructFlag) {
      const cd = params.has('cd') ? Number(params.get('cd')) : null;
      const cp = params.has('cp') ? Number(params.get('cp')) : null;
      const bw = params.has('bw') ? Number(params.get('bw')) : null;
      const bh = params.has('bh') ? Number(params.get('bh')) : null;

      // Solo activar params si estan completos
      const complete = [cd, cp, bw, bh].every(v => Number.isFinite(v) && v > 0);
      if (complete) {
        state.structureParams = {
          cylDiameterMm: cd,
          cylDepthMm: cp,
          beamWidthMm: bw,
          beamHeightMm: bh,
        };
        state.structureVisible = params.get('sv') === '0' ? false : true;

        // Overrides por nivel
        if (params.has('co')) {
          try {
            const raw = decodeURIComponent(params.get('co'));
            const obj = JSON.parse(raw);
            if (obj && typeof obj === 'object') {
              state.structureConnectorOverrides = obj;
            }
          } catch (e) {
            // ign
          }
        }
        if (params.has('cio')) {
          try {
            const raw = decodeURIComponent(params.get('cio'));
            const obj = JSON.parse(raw);
            if (obj && typeof obj === 'object') {
              state.structureIntersectionConnectorOverrides = obj;
            }
          } catch (e) {
            // ignorar
          }
        }

        // Overrides / ediciones de estructura (opcional)
        const safeGetJSON = (key) => {
          if (!params.has(key)) return null;
          try {
            const raw = decodeURIComponent(params.get(key));
            return JSON.parse(raw);
          } catch (e) {
            return null;
          }
        };
        const bo = safeGetJSON('bo');
        const xf = safeGetJSON('xf');
        const xb = safeGetJSON('xb');
        const db = safeGetJSON('db');

        if (bo && typeof bo === 'object') state.structureBeamOverrides = bo;
        if (xf && typeof xf === 'object') state.structureIntersectionFaces = xf;
        if (xb && Array.isArray(xb)) state.structureExtraBeams = xb;
        if (db && Array.isArray(db)) state.structureDeletedBeams = db;

      }
    }

    updateStateCalculations();
    
    // Actualizar UI completa
    this.uiManager.updateState();
    this.uiManager.updateAllButtons();
    this.uiManager.updateGeometryInfo();
    this.uiManager.updateFacesCount();
    // Rebuild geometria base y (si aplica) estructura
    this.sceneManager.requestRebuild();
    
    return true;
  }

  /**
   * Copia URL al portapapeles
   */
  async copyShareURL() {
    const url = this.generateShareURL();
    
    try {
      await navigator.clipboard.writeText(url);
      this.uiManager.showNotification(' Enlace copiado! Compartelo para que otros vean tu diseno', 'success');
      return true;
    } catch (err) {
      this.showFallbackCopy(url);
      return false;
    }
  }

  /**
   * Fallback para copiar URL cuando navigator.clipboard no está disponible
   */
  showFallbackCopy(url) {
    // Intentar con la API de selección de texto (más compatible que execCommand)
    try {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (ok) {
        this.uiManager.showNotification('Enlace copiado!', 'success');
        return;
      }
    } catch (_) { /* continuar al fallback visual */ }

    // Último recurso: mostrar URL en prompt para que el usuario la copie manualmente
    window.prompt('Copia esta URL para compartir:', url);
  }

  /**
   * Exporta configuracion como JSON
   */
  exportJSON() {
    const config = {
      version: '1.0',
      app: 'ZValdivia',
      timestamp: new Date().toISOString(),
      parameters: {
        N: state.N,
        aDeg: state.aDeg,
        Dmax: state.Dmax
      },
      cut: {
        active: state.cutActive,
        level: state.cutLevel
      },
      visualization: {
        rhombiVisible: state.rhombiVisible,
        polysVisible: state.polysVisible,
        linesVisible: state.linesVisible,
        axisVisible: state.axisVisible,
        colorByLevel: state.colorByLevel
      },
      structure: {
        visible: !!state.structureVisible,
        params: state.structureParams ? { ...state.structureParams } : null,
        connectorOverrides: (state.structureConnectorOverrides && typeof state.structureConnectorOverrides === 'object')
          ? { ...state.structureConnectorOverrides }
          : {},
        beamOverrides: (state.structureBeamOverrides && typeof state.structureBeamOverrides === 'object')
          ? { ...state.structureBeamOverrides }
          : {},
        intersectionFaces: (state.structureIntersectionFaces && typeof state.structureIntersectionFaces === 'object')
          ? { ...state.structureIntersectionFaces }
          : {},
        extraBeams: Array.isArray(state.structureExtraBeams) ? [...state.structureExtraBeams] : [],
        deletedBeams: Array.isArray(state.structureDeletedBeams) ? [...state.structureDeletedBeams] : []
      }
    };

    const json = JSON.stringify(config, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `zvaldivia-N${state.N}-a${state.aDeg.toFixed(2)}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    this.uiManager.showNotification('Configuracion exportada como JSON', 'success');
  }

  /**
   * Importa configuracion desde JSON
   */
  importJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const config = JSON.parse(event.target.result);
          
          if (!config.version || !config.parameters) {
            throw new Error('Archivo JSON invalido');
          }

          state.N = Math.max(3, Math.min(100, config.parameters.N));
          state.aDeg = Math.max(0.1, Math.min(89.9, config.parameters.aDeg));
          state.Dmax = Math.max(0.1, config.parameters.Dmax);
          
          state.cutActive = config.cut.active;
          state.cutLevel = Math.max(1, Math.min(state.N - 1, config.cut.level));
          
          state.rhombiVisible = config.visualization.rhombiVisible;
          state.polysVisible = config.visualization.polysVisible;
          state.linesVisible = config.visualization.linesVisible;
          state.axisVisible = config.visualization.axisVisible;
          state.colorByLevel = config.visualization.colorByLevel;

          // Estructura (opcional)
          if (config.structure && config.structure.params) {
            state.structureParams = { ...config.structure.params };
            state.structureVisible = !!config.structure.visible;

            // Overrides por nivel
            if (config.structure.connectorOverrides && typeof config.structure.connectorOverrides === 'object') {
              state.structureConnectorOverrides = { ...config.structure.connectorOverrides };
            } else {
              state.structureConnectorOverrides = {};
            }

            // Overrides de vigas/caras extra/eliminadas
            if (config.structure.beamOverrides && typeof config.structure.beamOverrides === 'object') {
              state.structureBeamOverrides = { ...config.structure.beamOverrides };
            } else {
              state.structureBeamOverrides = {};
            }
            if (config.structure.intersectionFaces && typeof config.structure.intersectionFaces === 'object') {
              state.structureIntersectionFaces = { ...config.structure.intersectionFaces };
            } else {
              state.structureIntersectionFaces = {};
            }
            state.structureExtraBeams = Array.isArray(config.structure.extraBeams) ? [...config.structure.extraBeams] : [];
            state.structureDeletedBeams = Array.isArray(config.structure.deletedBeams) ? [...config.structure.deletedBeams] : [];
          } else {
            state.structureParams = null;
            state.structureVisible = false;
            state.structureConnectorOverrides = {};
            state.structureBeamOverrides = {};
            state.structureIntersectionFaces = {};
            state.structureExtraBeams = [];
            state.structureDeletedBeams = [];
          }

          updateStateCalculations();
          
          this.uiManager.updateState();
          if (this.uiManager.updateAllButtons) {
            this.uiManager.updateAllButtons();
          }
          this.sceneManager.requestRebuild();
          this.sceneManager.fitCamera();
          this.uiManager.updateFacesCount();
          
          this.uiManager.showNotification('Configuracion cargada exitosamente', 'success');
        } catch (err) {
          this.uiManager.showNotification('Error: ' + err.message, 'error');
        }
      };
      
      reader.readAsText(file);
    };
    
    input.click();
  }
}