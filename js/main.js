import { SceneManager } from './scene.js';
import { UIManager } from './ui.js';
import { OBJExporter } from './export.js';
import { PDFReporter } from './pdf-report.js';
import { ShareManager } from './share.js';  // ✅ NUEVO
import { state, rhombiData } from './state.js';

/**
 * Punto de entrada principal de la aplicación
 */
class App {
  constructor() {
    this.init();
  }

  init() {
    // Obtener canvas
    const canvas = document.getElementById('c');

    // Inicializar el gestor de escena
    this.sceneManager = new SceneManager(canvas);

    // Inicializar el gestor de UI
    this.uiManager = new UIManager(this.sceneManager);

    // ✅ NUEVO: Inicializar ShareManager
    this.shareManager = new ShareManager(this.uiManager, this.sceneManager);

    // ✅ NUEVO: Cargar configuración compartida desde URL
    this.loadSharedConfig();

    // Configurar botones de exportación
    this.setupExportButton();
    this.setupPDFButton();
    
    // ✅ NUEVO: Configurar botones de compartir
    this.setupShareButtons();

    // Inicializar la aplicación
    this.uiManager.initialize();

    // Iniciar el loop de renderizado
    this.sceneManager.render();
  }

  // ✅ NUEVO
  loadSharedConfig() {
    const loaded = this.shareManager.loadFromURL();
    if (loaded) {
      console.log('✅ Configuración cargada desde URL');
      setTimeout(() => {
        if (this.uiManager.updateAllButtons) {
          this.uiManager.updateAllButtons();
        }
      }, 100);
    }
  }

  setupExportButton() {
    const exportObjBtn = document.getElementById('exportObjBtn');
    if (exportObjBtn) {
      exportObjBtn.addEventListener('click', () => {
        if (!state.rhombiVisible || rhombiData.length === 0) {
          this.uiManager.showNotification('Debes activar las caras primero para exportar el modelo');
          return;
        }

        OBJExporter.exportToOBJ();

        const totalFaces = rhombiData.reduce((sum, level) => sum + level.rhombi.length, 0);
        this.uiManager.showNotification(`Archivo OBJ exportado exitosamente (${totalFaces} caras)`, 'success');
      });
    }
  }

  setupPDFButton() {
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    if (exportPdfBtn) {
      exportPdfBtn.addEventListener('click', async () => {
        if (!state.rhombiVisible || rhombiData.length === 0) {
          this.uiManager.showNotification('Debes activar las caras primero para generar el reporte');
          return;
        }

        this.uiManager.showNotification('Generando reporte PDF...', 'info');

        await new Promise(resolve => setTimeout(resolve, 500));

        try {
          await PDFReporter.generateReport(
            this.sceneManager.scene,
            this.sceneManager.camera,
            this.sceneManager.renderer
          );

          this.uiManager.showNotification('Reporte PDF generado exitosamente', 'success');
        } catch (error) {
          console.error('Error generando PDF:', error);
          this.uiManager.showNotification('Error al generar el reporte PDF', 'error');
        }
      });
    }
  }

  // ✅ NUEVO
  setupShareButtons() {
    const shareUrlBtn = document.getElementById('shareUrlBtn');
    if (shareUrlBtn) {
      shareUrlBtn.addEventListener('click', () => {
        this.shareManager.copyShareURL();
      });
    }

    const exportJsonBtn = document.getElementById('exportJsonBtn');
    if (exportJsonBtn) {
      exportJsonBtn.addEventListener('click', () => {
        this.shareManager.exportJSON();
      });
    }

    const importJsonBtn = document.getElementById('importJsonBtn');
    if (importJsonBtn) {
      importJsonBtn.addEventListener('click', () => {
        this.shareManager.importJSON();
      });
    }
  }
}

// Iniciar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  new App();
});