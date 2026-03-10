import { state, updateStateCalculations } from './state.js';
import { logger } from './logger.js';

/**
 * Versión del esquema de serialización.
 * Incrementar cuando cambie la estructura del JSON/URL de forma incompatible.
 */
const SCHEMA_VERSION = '1.1';

/**
 * Valida y normaliza una configuración importada.
 * Rellena valores faltantes con defaults seguros y coerciona tipos.
 * @param {object} raw - Objeto parseado desde JSON o URL
 * @returns {{ ok: boolean, config: object, warnings: string[] }}
 */
function normalizeImportedConfig(raw) {
  const warnings = [];

  if (!raw || typeof raw !== 'object') {
    return { ok: false, config: null, warnings: ['Objeto de configuración inválido'] };
  }

  const safeNum = (v, min, max, fallback) => {
    const n = Number(v);
    if (!isFinite(n)) return fallback;
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };

  const safeBool = (v, fallback) => (v === true || v === false) ? v : fallback;
  const safeObj  = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  const safeArr  = (v) => Array.isArray(v) ? v : [];

  // Geometría
  const params = raw.parameters || {};
  const N    = safeNum(params.N,    3,   50,   state.N);
  const aDeg = safeNum(params.aDeg, 0.1, 89.9, state.aDeg);
  const Dmax = safeNum(params.Dmax, 0.01, null, state.Dmax);

  // Corte
  const cut = raw.cut || {};
  const cutActive = safeBool(cut.active, state.cutActive);
  const cutLevel  = safeNum(cut.level, 1, N - 1, state.cutLevel);

  // Visualización
  const viz = raw.visualization || {};
  const rhombiVisible = safeBool(viz.rhombiVisible, state.rhombiVisible);
  const polysVisible  = safeBool(viz.polysVisible,  state.polysVisible);
  const linesVisible  = safeBool(viz.linesVisible,  state.linesVisible);
  const axisVisible   = safeBool(viz.axisVisible,   state.axisVisible);
  const colorByLevel  = safeBool(viz.colorByLevel,  state.colorByLevel);

  // Estructura
  const struct = raw.structure || {};
  let structureParams = null;
  if (struct.params) {
    const sp = struct.params;
    const cd = safeNum(sp.cylDiameterMm, 1, null, 0);
    const cp = safeNum(sp.cylDepthMm,    1, null, 0);
    const bw = safeNum(sp.beamWidthMm,   1, null, 0);
    const bh = safeNum(sp.beamHeightMm,  1, null, 0);
    if (cd > 0 && cp > 0 && bw > 0 && bh > 0) {
      structureParams = {
        cylDiameterMm: cd, cylDepthMm: cp, beamWidthMm: bw, beamHeightMm: bh,
        platThicknessMm: safeNum(sp.platThicknessMm, 0, null, 3),
        platLengthMm:    safeNum(sp.platLengthMm,    0, null, 120),
        platWidthMm:     safeNum(sp.platWidthMm,     0, null, 50),
      };
    } else {
      warnings.push('Parámetros de estructura incompletos; estructura ignorada');
    }
  }

  return {
    ok: true,
    config: {
      N, aDeg, Dmax, cutActive, cutLevel,
      rhombiVisible, polysVisible, linesVisible, axisVisible, colorByLevel,
      structureVisible: safeBool(struct.visible, true),
      structureParams,
      connectorOverrides:             safeObj(struct.connectorOverrides),
      intersectionConnectorOverrides: safeObj(struct.intersectionConnectorOverrides || {}),
      beamOverrides:                  safeObj(struct.beamOverrides),
      intersectionFaces:              safeObj(struct.intersectionFaces),
      extraBeams:                     safeArr(struct.extraBeams),
      deletedBeams:                   safeArr(struct.deletedBeams),
    },
    warnings,
  };
}

/**
 * Aplica una configuración normalizada al estado global.
 */
function applyNormalizedConfig(cfg) {
  state.N         = cfg.N;
  state.aDeg      = cfg.aDeg;
  state.Dmax      = cfg.Dmax;
  state.cutActive = cfg.cutActive;
  state.cutLevel  = cfg.cutLevel;

  state.rhombiVisible = cfg.rhombiVisible;
  state.polysVisible  = cfg.polysVisible;
  state.linesVisible  = cfg.linesVisible;
  state.axisVisible   = cfg.axisVisible;
  state.colorByLevel  = cfg.colorByLevel;

  state.structureParams   = cfg.structureParams;
  state.structureVisible  = cfg.structureVisible;

  state.structureConnectorOverrides             = cfg.connectorOverrides;
  state.structureIntersectionConnectorOverrides = cfg.intersectionConnectorOverrides;
  state.structureBeamOverrides                  = cfg.beamOverrides;
  state.structureIntersectionFaces              = cfg.intersectionFaces;
  state.structureExtraBeams                     = cfg.extraBeams;
  state.structureDeletedBeams                   = cfg.deletedBeams;

  updateStateCalculations();
}

/**
 * Maneja compartir configuración mediante URL y JSON
 */
export class ShareManager {
  constructor(uiManager, sceneManager) {
    this.uiManager    = uiManager;
    this.sceneManager = sceneManager;
  }

  /** Genera URL con parámetros de configuración */
  generateShareURL() {
    const params = new URLSearchParams({
      v:        SCHEMA_VERSION,
      N:        state.N,
      a:        state.aDeg.toFixed(2),
      Dmax:     state.Dmax.toFixed(2),
      cut:      state.cutActive ? '1' : '0',
      cutLevel: state.cutLevel,
      faces:    state.rhombiVisible ? '1' : '0',
      polys:    state.polysVisible  ? '1' : '0',
      lines:    state.linesVisible  ? '1' : '0',
      skin:     state.colorByLevel  ? 'rainbow' : 'crystal',
      axis:     state.axisVisible   ? '1' : '0',
    });

    if (state.structureParams) {
      params.set('struct', '1');
      params.set('sv', state.structureVisible ? '1' : '0');
      const p = state.structureParams;
      if (Number.isFinite(Number(p.cylDiameterMm))) params.set('cd', String(Math.round(Number(p.cylDiameterMm))));
      if (Number.isFinite(Number(p.cylDepthMm)))    params.set('cp', String(Math.round(Number(p.cylDepthMm))));
      if (Number.isFinite(Number(p.beamWidthMm)))   params.set('bw', String(Math.round(Number(p.beamWidthMm))));
      if (Number.isFinite(Number(p.beamHeightMm)))  params.set('bh', String(Math.round(Number(p.beamHeightMm))));
      if (Number.isFinite(Number(p.platThicknessMm))) params.set('pt', String(Number(p.platThicknessMm)));
      if (Number.isFinite(Number(p.platLengthMm)))    params.set('pl', String(Number(p.platLengthMm)));
      if (Number.isFinite(Number(p.platWidthMm)))     params.set('pw', String(Number(p.platWidthMm)));

      const safeSetJSON = (key, value) => {
        if (!value) return;
        const isEmpty = (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
                     || (Array.isArray(value) && value.length === 0);
        if (isEmpty) return;
        try { params.set(key, encodeURIComponent(JSON.stringify(value))); } catch (e) { /* ignore */ }
      };
      safeSetJSON('co',  state.structureConnectorOverrides);
      safeSetJSON('cio', state.structureIntersectionConnectorOverrides);
      safeSetJSON('bo',  state.structureBeamOverrides);
      safeSetJSON('xf',  state.structureIntersectionFaces);
      safeSetJSON('xb',  state.structureExtraBeams);
      safeSetJSON('db',  state.structureDeletedBeams);
    }

    const baseURL = window.location.origin + window.location.pathname;
    return `${baseURL}?${params.toString()}`;
  }

  /** Carga configuración desde URL al iniciar la app */
  loadFromURL() {
    const params = new URLSearchParams(window.location.search);
    if (params.size === 0) return false;

    const safeGetJSON = (key) => {
      if (!params.has(key)) return null;
      try { return JSON.parse(decodeURIComponent(params.get(key))); } catch (e) { return null; }
    };

    if (params.has('N'))    state.N    = Math.max(3, Math.min(50, parseInt(params.get('N'))));
    if (params.has('a'))    state.aDeg = Math.max(0.1, Math.min(89.9, parseFloat(params.get('a'))));
    if (params.has('Dmax')) state.Dmax = Math.max(0.1, parseFloat(params.get('Dmax')));

    if (params.has('cut'))      state.cutActive = params.get('cut') === '1';
    if (params.has('cutLevel')) state.cutLevel  = parseInt(params.get('cutLevel'));
    if (params.has('faces'))    state.rhombiVisible = params.get('faces') === '1';
    if (params.has('polys'))    state.polysVisible  = params.get('polys') === '1';
    if (params.has('lines'))    state.linesVisible  = params.get('lines') === '1';
    if (params.has('axis'))     state.axisVisible   = params.get('axis') === '1';
    if (params.has('skin'))     state.colorByLevel  = params.get('skin') === 'rainbow';

    const hasStructFlag = params.get('struct') === '1' || params.has('cd') || params.has('cp') || params.has('bw') || params.has('bh');
    if (hasStructFlag) {
      const cd = params.has('cd') ? Number(params.get('cd')) : null;
      const cp = params.has('cp') ? Number(params.get('cp')) : null;
      const bw = params.has('bw') ? Number(params.get('bw')) : null;
      const bh = params.has('bh') ? Number(params.get('bh')) : null;

      if ([cd, cp, bw, bh].every(v => Number.isFinite(v) && v > 0)) {
        state.structureParams = {
          cylDiameterMm: cd, cylDepthMm: cp, beamWidthMm: bw, beamHeightMm: bh,
          platThicknessMm: params.has('pt') ? Number(params.get('pt')) : 3,
          platLengthMm:    params.has('pl') ? Number(params.get('pl')) : 120,
          platWidthMm:     params.has('pw') ? Number(params.get('pw')) : 50,
        };
        state.structureVisible = params.get('sv') !== '0';

        const co  = safeGetJSON('co');  if (co  && typeof co  === 'object') state.structureConnectorOverrides             = co;
        const cio = safeGetJSON('cio'); if (cio && typeof cio === 'object') state.structureIntersectionConnectorOverrides = cio;
        const bo  = safeGetJSON('bo');  if (bo  && typeof bo  === 'object') state.structureBeamOverrides                  = bo;
        const xf  = safeGetJSON('xf');  if (xf  && typeof xf  === 'object') state.structureIntersectionFaces              = xf;
        const xb  = safeGetJSON('xb');  if (Array.isArray(xb))              state.structureExtraBeams                     = xb;
        const db  = safeGetJSON('db');  if (Array.isArray(db))              state.structureDeletedBeams                   = db;
      } else {
        logger.warn('URL: parámetros de estructura incompletos o inválidos');
      }
    }

    updateStateCalculations();
    this.uiManager.updateState();
    this.uiManager.updateAllButtons();
    this.uiManager.updateGeometryInfo();
    this.uiManager.updateFacesCount();
    this.sceneManager.requestRebuild();
    return true;
  }

  /** Copia URL al portapapeles */
  async copyShareURL() {
    const url = this.generateShareURL();
    try {
      await navigator.clipboard.writeText(url);
      this.uiManager.showNotification('Enlace copiado. Compártelo para que otros vean tu diseño', 'success');
      return true;
    } catch (err) {
      this._showFallbackCopy(url);
      return false;
    }
  }

  _showFallbackCopy(url) {
    try {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) { this.uiManager.showNotification('Enlace copiado!', 'success'); return; }
    } catch (_) { /* continuar */ }
    window.prompt('Copia esta URL para compartir:', url);
  }

  /** Exporta configuración como JSON */
  exportJSON() {
    const config = {
      version: SCHEMA_VERSION,
      app: 'ZValdivia',
      timestamp: new Date().toISOString(),
      parameters: { N: state.N, aDeg: state.aDeg, Dmax: state.Dmax },
      cut:          { active: state.cutActive, level: state.cutLevel },
      visualization: {
        rhombiVisible: state.rhombiVisible,
        polysVisible:  state.polysVisible,
        linesVisible:  state.linesVisible,
        axisVisible:   state.axisVisible,
        colorByLevel:  state.colorByLevel,
      },
      structure: {
        visible: !!state.structureVisible,
        params:  state.structureParams ? { ...state.structureParams } : null,
        connectorOverrides:             { ...(state.structureConnectorOverrides             || {}) },
        intersectionConnectorOverrides: { ...(state.structureIntersectionConnectorOverrides || {}) },
        beamOverrides:                  { ...(state.structureBeamOverrides                  || {}) },
        intersectionFaces:              { ...(state.structureIntersectionFaces              || {}) },
        extraBeams:   [...(state.structureExtraBeams   || [])],
        deletedBeams: [...(state.structureDeletedBeams || [])],
      },
    };

    const json = JSON.stringify(config, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `zvaldivia-N${state.N}-a${state.aDeg.toFixed(2)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.uiManager.showNotification('Configuración exportada como JSON', 'success');
  }

  /** Importa configuración desde JSON */
  importJSON() {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = '.json';

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const raw = JSON.parse(event.target.result);

          // Validación básica de estructura del JSON
          if (!raw.version || !raw.parameters) {
            throw new Error('Archivo JSON inválido: faltan campos requeridos');
          }

          // Advertir si la versión es diferente
          if (raw.version !== SCHEMA_VERSION) {
            logger.warn(`JSON versión ${raw.version}, app usa ${SCHEMA_VERSION}. Se intentará importar.`);
          }

          const { ok, config, warnings } = normalizeImportedConfig(raw);
          if (!ok) throw new Error('No se pudo normalizar la configuración');

          warnings.forEach(w => logger.warn('Import:', w));
          applyNormalizedConfig(config);

          this.uiManager.updateState();
          if (this.uiManager.updateAllButtons) this.uiManager.updateAllButtons();
          this.sceneManager.requestRebuild();
          this.sceneManager.fitCamera();
          this.uiManager.updateFacesCount();

          const warnMsg = warnings.length ? ` (${warnings.length} advertencia/s en consola)` : '';
          this.uiManager.showNotification(`Configuración cargada exitosamente${warnMsg}`, 'success');
        } catch (err) {
          logger.error('importJSON:', err);
          this.uiManager.showNotification('Error: ' + err.message, 'error');
        }
      };
      reader.readAsText(file);
    };

    input.click();
  }
}
