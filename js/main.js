import { SceneManager } from './scene.js';
import { UIManager } from './ui.js';
import { OBJExporter } from './export.js';
import { PDFReporter } from './pdf-report.js';
import { NodePDFReporter } from './node-pdf-report.js';
import { BeamPDFReporter } from './beam-pdf-report.js';
import { ShareManager } from './share.js';
import { state, rhombiData } from './state.js';

/**
 * Punto de entrada principal de la aplicacion
 */
class App {
  constructor() {
    this.loadingComplete = false;
    this.init();
  }

  async init() {
    // Mostrar pantalla de carga
    await this.showLoadingScreen();

    // Obtener canvas
    const canvas = document.getElementById('c');

    // Inicializar el gestor de escena
    this.sceneManager = new SceneManager(canvas);

    // Inicializar el gestor de UI
    this.uiManager = new UIManager(this.sceneManager);

    // Inicializar ShareManager
    this.shareManager = new ShareManager(this.uiManager, this.sceneManager);

    // Cargar configuracion compartida desde URL
    this.loadSharedConfig();

    // Configurar botones de exportacion
    this.setupExportButton();
    this.setupPDFButton();
    this.setupNodePDFButton();
    this.setupBeamsPDFButton();
    
    // Configurar botones de compartir
    this.setupShareButtons();

    // Inicializar la aplicacion
    this.uiManager.initialize();

    // Configurar modo oscuro/claro
    this.setupThemeToggle();

    // Iniciar el loop de renderizado
    this.sceneManager.render();

    // Ocultar pantalla de carga
    await this.hideLoadingScreen();

    this.loadingComplete = true;
  }

  async showLoadingScreen() {
    return new Promise((resolve) => {
      // Simular carga minima
      setTimeout(resolve, 1500);
    });
  }

  setupNodePDFButton() {
    const exportNodePdfBtn = document.getElementById('exportNodePdfBtn');
    if (exportNodePdfBtn) {
      exportNodePdfBtn.addEventListener('click', async () => {
        if (!state.rhombiVisible || rhombiData.length === 0) {
          this.uiManager.showNotification('Debes activar las caras primero para generar el PDF de nodos');
          return;
        }

        this.uiManager.showNotification('Generando PDF de nodos...', 'info');
        await new Promise(resolve => setTimeout(resolve, 300));

        try {
          await NodePDFReporter.generateNodeReport();
          this.uiManager.showNotification('PDF de nodos generado exitosamente', 'success');
        } catch (error) {
          console.error('Error generando PDF de nodos:', error);
          this.uiManager.showNotification('Error generando PDF de nodos', 'error');
        }
      });
    }
  }

  setupBeamsPDFButton() {
    const exportBeamsPdfBtn = document.getElementById('exportBeamsPdfBtn');
    if (exportBeamsPdfBtn) {
      exportBeamsPdfBtn.addEventListener('click', async () => {
        // Requiere que la estructura exista (generada al menos una vez)
        const sg = this.sceneManager?.structureGroup;
        const hasStructure = sg && sg.children && sg.children.length > 0;
        if (!hasStructure) {
          this.uiManager.showNotification('Debes generar la estructura primero para crear el PDF de vigas', 'error');
          return;
        }

        this.uiManager.showNotification('Generando PDF de vigas...', 'info');
        await new Promise(r => setTimeout(r, 250));

        try {
          await BeamPDFReporter.generateBeamsReport(sg, this.sceneManager);
          this.uiManager.showNotification('PDF de vigas generado exitosamente', 'success');
        } catch (error) {
          console.error('Error generando PDF de vigas:', error);
          this.uiManager.showNotification('Error generando PDF de vigas', 'error');
        }
      });
    }
  }


  async hideLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
      loadingScreen.classList.add('fade-out');
      await new Promise(resolve => setTimeout(resolve, 500));
      loadingScreen.style.display = 'none';
    }
  }

  setupThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      // Cargar preferencia guardada
      const savedTheme = localStorage.getItem('theme') || 'dark';
      if (savedTheme === 'light') {
        document.body.classList.remove('dark-mode');
        document.body.classList.add('light-mode');
      }

      themeToggle.addEventListener('click', () => {
        const isLight = document.body.classList.contains('light-mode');
        
        if (isLight) {
          document.body.classList.remove('light-mode');
          document.body.classList.add('dark-mode');
          localStorage.setItem('theme', 'dark');
        } else {
          document.body.classList.remove('dark-mode');
          document.body.classList.add('light-mode');
          localStorage.setItem('theme', 'light');
        }
      });
    }
  }

  loadSharedConfig() {
    const loaded = this.shareManager.loadFromURL();
    if (loaded) {
      console.log('  Configuracion cargada desde URL');
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

// Iniciar la aplicacion cuando el DOM este listo
document.addEventListener('DOMContentLoaded', () => {
  new App();
});
