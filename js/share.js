import { state, updateStateCalculations } from './state.js';

/**
 * Maneja compartir configuración mediante URL y JSON
 * Optimizado para GitHub Pages
 */
export class ShareManager {
  constructor(uiManager, sceneManager) {
    this.uiManager = uiManager;
    this.sceneManager = sceneManager;
  }

  /**
   * Genera URL con parámetros de configuración
   * Compatible con GitHub Pages
   */
  generateShareURL() {
    const params = new URLSearchParams({
      N: state.N,
      a: state.aDeg.toFixed(1),
      Dmax: state.Dmax.toFixed(2),
      cut: state.cutActive ? '1' : '0',
      cutLevel: state.cutLevel,
      faces: state.rhombiVisible ? '1' : '0',
      polys: state.polysVisible ? '1' : '0',
      lines: state.linesVisible ? '1' : '0',
      skin: state.colorByLevel ? 'rainbow' : 'crystal',
      axis: state.axisVisible ? '1' : '0'
    });

    // GitHub Pages URL
    const baseURL = window.location.origin + window.location.pathname;
    return `${baseURL}?${params.toString()}`;
  }

  /**
   * Carga configuración desde URL al iniciar la app
   */
  loadFromURL() {
    const params = new URLSearchParams(window.location.search);
    
    if (params.size === 0) return false; // No hay parámetros

    // Cargar parámetros básicos
    if (params.has('N')) state.N = Math.max(3, Math.min(100, parseInt(params.get('N'))));
    if (params.has('a')) state.aDeg = Math.max(0.1, Math.min(89.9, parseFloat(params.get('a'))));
    if (params.has('Dmax')) state.Dmax = Math.max(0.1, parseFloat(params.get('Dmax')));
    
    // Plano de corte
    if (params.has('cut')) state.cutActive = params.get('cut') === '1';
    if (params.has('cutLevel')) state.cutLevel = parseInt(params.get('cutLevel'));
    
    // Visualización
    if (params.has('faces')) state.rhombiVisible = params.get('faces') === '1';
    if (params.has('polys')) state.polysVisible = params.get('polys') === '1';
    if (params.has('lines')) state.linesVisible = params.get('lines') === '1';
    if (params.has('axis')) state.axisVisible = params.get('axis') === '1';
    
    // Skin
    if (params.has('skin')) {
      state.colorByLevel = params.get('skin') === 'rainbow';
    }

    updateStateCalculations();
    return true; // Se cargó configuración
  }

  /**
   * Copia URL al portapapeles y muestra notificación
   */
  async copyShareURL() {
    const url = this.generateShareURL();
    
    try {
      await navigator.clipboard.writeText(url);
      this.uiManager.showNotification('¡Enlace copiado! Compártelo para que otros vean tu diseño', 'success');
      return true;
    } catch (err) {
      // Fallback para navegadores sin clipboard API
      this.showFallbackCopy(url);
      return false;
    }
  }

  /**
   * Fallback para copiar URL (navegadores antiguos)
   */
  showFallbackCopy(url) {
    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
      document.execCommand('copy');
      this.uiManager.showNotification('¡Enlace copiado!', 'success');
    } catch (err) {
      this.uiManager.showNotification('No se pudo copiar. Comparte esta URL: ' + url, 'info');
    }
    
    document.body.removeChild(textarea);
  }

  /**
   * Exporta configuración como JSON
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
      computed: {
        h1: state.h1,
        Htotal: state.Htotal,
        floorDiameter: state.floorDiameter
      }
    };

    const json = JSON.stringify(config, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `zvaldivia-N${state.N}-a${state.aDeg.toFixed(1)}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    this.uiManager.showNotification('Configuración exportada como JSON', 'success');
  }

  /**
   * Importa configuración desde JSON
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
          
          // Validar versión
          if (!config.version || !config.parameters) {
            throw new Error('Archivo JSON inválido');
          }

          // Cargar parámetros con validación
          state.N = Math.max(3, Math.min(100, config.parameters.N));
          state.aDeg = Math.max(0.1, Math.min(89.9, config.parameters.aDeg));
          state.Dmax = Math.max(0.1, config.parameters.Dmax);
          
          // Cargar corte
          state.cutActive = config.cut.active;
          state.cutLevel = Math.max(1, Math.min(state.N - 1, config.cut.level));
          
          // Cargar visualización
          state.rhombiVisible = config.visualization.rhombiVisible;
          state.polysVisible = config.visualization.polysVisible;
          state.linesVisible = config.visualization.linesVisible;
          state.axisVisible = config.visualization.axisVisible;
          state.colorByLevel = config.visualization.colorByLevel;

          updateStateCalculations();
          
          // Actualizar UI y escena
          this.uiManager.updateState();
          this.uiManager.updateAllButtons();
          this.sceneManager.requestRebuild();
          this.sceneManager.fitCamera();
          this.uiManager.updateFacesCount();
          
          this.uiManager.showNotification('Configuración cargada exitosamente', 'success');
        } catch (err) {
          this.uiManager.showNotification('Error al cargar configuración: ' + err.message, 'error');
        }
      };
      
      reader.readAsText(file);
    };
    
    input.click();
  }
} 