import * as THREE from 'three';
import { SceneManager } from './scene.js';
import { UIManager } from './ui.js';
import { GeometryBuilder } from './geometry.js';
import { ExportManager } from './export.js';
import { PDFReportGenerator } from './pdf-report.js';
import { ShareManager } from './share.js'; // ✅ NUEVO

/**
 * Punto de entrada principal de la aplicación
 */
class App {
  constructor() {
    this.initManagers();
    this.loadSharedConfig(); // ✅ Cargar primero antes de inicializar UI
    this.setupExportButtons();
    this.setupShareButtons(); // ✅ NUEVO
    this.initialize();
  }

  initManagers() {
    this.sceneManager = new SceneManager();
    this.geometryBuilder = new GeometryBuilder();
    this.uiManager = new UIManager(this.sceneManager);
    this.exportManager = new ExportManager(this.geometryBuilder);
    this.pdfGenerator = new PDFReportGenerator();
    this.shareManager = new ShareManager(this.uiManager, this.sceneManager); // ✅ NUEVO
  }

  setupExportButtons() {
    const exportObjBtn = document.getElementById('exportObjBtn');
    if (exportObjBtn) {
      exportObjBtn.addEventListener('click', () => {
        this.exportManager.exportOBJ();
      });
    }

    const exportPdfBtn = document.getElementById('exportPdfBtn');
    if (exportPdfBtn) {
      exportPdfBtn.addEventListener('click', () => {
        this.pdfGenerator.generateReport();
      });
    }
  }

  // ✅ NUEVO: Configurar botones de compartir
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

  // ✅ NUEVO: Cargar configuración compartida desde URL
  loadSharedConfig() {
    const loaded = this.shareManager.loadFromURL();
    if (loaded) {
      console.log('✅ Configuración cargada desde URL compartida');
      // Actualizar botones según configuración cargada
      setTimeout(() => {
        if (this.uiManager.updateAllButtons) {
          this.uiManager.updateAllButtons();
        }
      }, 100);
    }
  }

  initialize() {
    this.uiManager.initialize();
  }
}

// Iniciar la aplicación cuando el DOM esté listo
window.addEventListener('DOMContentLoaded', () => {
  new App();
});