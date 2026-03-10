import { SceneManager }        from './scene.js';
import { UIManager }           from './ui.js';
import { OBJExporter }         from './export.js';
import { PDFReporter }         from './pdf-report.js';
import { NodePDFReporter }     from './node-pdf-report.js';
import { BeamPDFReporter }     from './beam-pdf-report.js';
import { PinwheelPDFReporter } from './pinwheel-pdf.js';
import { ShareManager }        from './share.js';
import { state, rhombiData }   from './state.js';
import { logger }              from './logger.js';

/**
 * Punto de entrada principal.
 * Los únicos delays reales que quedan son:
 *   - fadeOut de loading screen (animación CSS de 300ms)
 *   - notificaciones de PDF (300ms para que el navegador pinte el estado del botón)
 */
class App {
  constructor() {
    this.init();
  }

  async init() {
    // Tiempo mínimo garantizado de splash (para que las animaciones se vean)
    const SPLASH_MIN_MS = 2800;
    const splashStart   = performance.now();

    await this._initApp();

    // Esperar el tiempo mínimo restante antes de ocultar el splash
    const elapsed = performance.now() - splashStart;
    const remaining = Math.max(0, SPLASH_MIN_MS - elapsed);
    if (remaining > 0) await new Promise(r => setTimeout(r, remaining));

    this._hideLoadingScreen();
  }

  async _initApp() {
    this._splashProgress(5, 'Cargando escena…');

    const canvas = document.getElementById('c');
    this.sceneManager = new SceneManager(canvas);
    this._splashProgress(35, 'Iniciando interfaz…');

    this.uiManager    = new UIManager(this.sceneManager);
    this._splashProgress(60, 'Configurando controles…');

    this.shareManager = new ShareManager(this.uiManager, this.sceneManager);
    this._loadSharedConfig();

    this._setupExportButton();
    this._setupPDFButton();
    this._setupNodePDFButton();
    this._setupBeamsPDFButton();
    this._setupPinwheelPDFButton();
    this._setupShareButtons();
    this._splashProgress(80, 'Preparando vista…');

    this.uiManager.initialize();
    this._setupThemeToggle();

    if (this._sharedConfigLoaded && this.uiManager.updateAllButtons) {
      this.uiManager.updateAllButtons();
    }

    this.sceneManager.render();
    this._splashProgress(100, 'Listo');
  }

  /** Actualiza la barra de progreso y el texto de estado del splash. */
  _splashProgress(pct, text) {
    const fill   = document.getElementById('lsBarFill');
    const status = document.getElementById('lsStatus');
    if (fill)   fill.style.width = pct + '%';
    if (status) status.textContent = text;
  }

  _hideLoadingScreen() {
    const el = document.getElementById('loadingScreen');
    if (!el) return;
    this._splashProgress(100, '');
    el.classList.add('fade-out');
    setTimeout(() => { el.style.display = 'none'; }, 650);
  }

  _setupThemeToggle() {
    const toggle = document.getElementById('themeToggle');
    if (!toggle) return;
    const saved = localStorage.getItem('theme') || 'dark';
    if (saved === 'light') {
      document.body.classList.replace('dark-mode', 'light-mode');
    }
    toggle.addEventListener('click', () => {
      if (document.body.classList.contains('light-mode')) {
        document.body.classList.replace('light-mode', 'dark-mode');
        localStorage.setItem('theme', 'dark');
      } else {
        document.body.classList.replace('dark-mode', 'light-mode');
        localStorage.setItem('theme', 'light');
      }
    });
  }

  _loadSharedConfig() {
    const loaded = this.shareManager.loadFromURL();
    if (loaded) {
      logger.info('Configuración cargada desde URL');
      this._sharedConfigLoaded = true;
    }
  }

  // ── Botones de exportación ────────────────────────────────────────────────

  _setupExportButton() {
    const btn = document.getElementById('exportObjBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        if (!state.rhombiVisible || rhombiData.length === 0) {
          this.uiManager.showNotification('Activa las caras primero para exportar el modelo');
          return;
        }
        OBJExporter.exportToOBJ();
        const total = rhombiData.reduce((s, l) => s + l.rhombi.length, 0);
        this.uiManager.showNotification(`OBJ exportado (${total} caras)`, 'success');
      });
    }

    const meshBtn = document.getElementById('exportMeshObjBtn');
    if (meshBtn) {
      meshBtn.addEventListener('click', () => {
        if (!state.rhombiVisible || rhombiData.length === 0) {
          this.uiManager.showNotification('Activa las caras primero para exportar la malla');
          return;
        }
        try {
          OBJExporter.exportMeshFacesGroupedToOBJ();
          const total = rhombiData.reduce((s, l) => s + l.rhombi.length, 0);
          this.uiManager.showNotification(`OBJ malla exportado (${total} caras)`, 'success');
        } catch (e) {
          logger.error('exportMeshOBJ:', e);
          this.uiManager.showNotification('Error exportando OBJ malla', 'error');
        }
      });
    }
  }

  _setupPDFButton() {
    const btn = document.getElementById('exportPdfBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      if (!state.rhombiVisible || rhombiData.length === 0) {
        this.uiManager.showNotification('Activa las caras primero para generar el reporte');
        return;
      }
      this.uiManager.showNotification('Generando reporte PDF...', 'info');
      // Pequeño delay para que el navegador pinte el estado "info" antes del proceso pesado
      await new Promise(r => setTimeout(r, 100));
      try {
        await PDFReporter.generateReport(
          this.sceneManager.scene,
          this.sceneManager.camera,
          this.sceneManager.renderer
        );
        this.uiManager.showNotification('Reporte PDF generado exitosamente', 'success');
      } catch (err) {
        logger.error('PDF caras:', err);
        this.uiManager.showNotification('Error al generar el reporte PDF', 'error');
      }
    });
  }

  _setupNodePDFButton() {
    const btn = document.getElementById('exportNodePdfBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const sg = this.sceneManager?.structureGroup;
      if (!sg?.children?.length) {
        this.uiManager.showNotification('Genera la estructura primero para crear el PDF de conectores', 'error');
        return;
      }
      this.uiManager.showNotification('Generando PDF de nodos...', 'info');
      await new Promise(r => setTimeout(r, 100));
      try {
        await NodePDFReporter.generateNodeReport(sg, this.sceneManager);
        this.uiManager.showNotification('PDF de nodos generado exitosamente', 'success');
      } catch (err) {
        logger.error('PDF nodos:', err);
        this.uiManager.showNotification('Error generando PDF de nodos', 'error');
      }
    });
  }

  _setupBeamsPDFButton() {
    const btn = document.getElementById('exportBeamsPdfBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const sg = this.sceneManager?.structureGroup;
      if (!sg?.children?.length) {
        this.uiManager.showNotification('Genera la estructura primero para crear el PDF de vigas', 'error');
        return;
      }
      this.uiManager.showNotification('Generando PDF de vigas...', 'info');
      await new Promise(r => setTimeout(r, 100));
      try {
        await BeamPDFReporter.generateBeamsReport(sg, this.sceneManager);
        this.uiManager.showNotification('PDF de vigas generado exitosamente', 'success');
      } catch (err) {
        logger.error('PDF vigas:', err);
        this.uiManager.showNotification('Error generando PDF de vigas', 'error');
      }
    });
  }

  _setupPinwheelPDFButton() {
    const pdfBtn = document.getElementById('exportPinwheelPdfBtn');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', async () => {
        if (!state.rhombiVisible || rhombiData.length === 0) {
          this.uiManager.showNotification('Activa las caras primero para generar el remolino', 'warning');
          return;
        }
        this.uiManager.showNotification('Generando PDF Remolino...', 'info');
        await new Promise(r => setTimeout(r, 100));
        try {
          await PinwheelPDFReporter.generateReport();
          this.uiManager.showNotification('PDF Remolino generado', 'success');
        } catch (err) {
          logger.error('PDF pinwheel:', err);
          this.uiManager.showNotification('Error al generar el PDF Remolino', 'error');
        }
      });
    }

    const svgBtn = document.getElementById('exportPinwheelSvgBtn');
    if (svgBtn) {
      svgBtn.addEventListener('click', () => {
        if (!state.rhombiVisible || rhombiData.length === 0) {
          this.uiManager.showNotification('Activa las caras primero', 'warning');
          return;
        }
        try {
          PinwheelPDFReporter.generateSVG();
          this.uiManager.showNotification('SVG Remolino descargado', 'success');
        } catch (err) {
          logger.error('SVG pinwheel:', err);
          this.uiManager.showNotification('Error al generar el SVG', 'error');
        }
      });
    }
  }

  _setupShareButtons() {
    const shareUrlBtn  = document.getElementById('shareUrlBtn');
    const exportJsonBtn = document.getElementById('exportJsonBtn');
    const importJsonBtn = document.getElementById('importJsonBtn');

    if (shareUrlBtn)   shareUrlBtn.addEventListener('click',  () => this.shareManager.copyShareURL());
    if (exportJsonBtn) exportJsonBtn.addEventListener('click', () => this.shareManager.exportJSON());
    if (importJsonBtn) importJsonBtn.addEventListener('click', () => this.shareManager.importJSON());
  }
}

document.addEventListener('DOMContentLoaded', () => { new App(); });
