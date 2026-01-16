import { SceneManager } from './scene.js';
import { UIManager } from './ui.js';
import { OBJExporter } from './export.js';
import { PDFReporter } from './pdf-report.js';
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

    // Configurar botones de exportación
    this.setupExportButton();
    this.setupPDFButton();

    // Inicializar la aplicación
    this.uiManager.initialize();

    // Iniciar el loop de renderizado
    this.sceneManager.render();
  }

  setupExportButton() {
    const exportObjBtn = document.getElementById('exportObjBtn');
    if (exportObjBtn) {
      exportObjBtn.addEventListener('click', () => {
        // Verificar si las caras están activadas antes de exportar
        if (!state.rhombiVisible || rhombiData.length === 0) {
          this.uiManager.showNotification('Debes activar las caras primero para exportar el modelo');
          return;
        }
        
        // Exportar el archivo
        OBJExporter.exportToOBJ();
        
        // Mostrar mensaje de éxito
        const totalFaces = rhombiData.reduce((sum, level) => sum + level.rhombi.length, 0);
        this.uiManager.showNotification(`Archivo OBJ exportado exitosamente (${totalFaces} caras)`, 'success');
      });
    }
  }

  setupPDFButton() {
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    if (exportPdfBtn) {
      exportPdfBtn.addEventListener('click', async () => {
        // Verificar si las caras están activadas
        if (!state.rhombiVisible || rhombiData.length === 0) {
          this.uiManager.showNotification('Debes activar las caras primero para generar el reporte');
          return;
        }

        // Mostrar mensaje de generación
        this.uiManager.showNotification('Generando reporte PDF...', 'info');

        // Pequeño delay para que se vea el mensaje
        await new Promise(resolve => setTimeout(resolve, 500));

        try {
          // Generar PDF
          await PDFReporter.generateReport(
            this.sceneManager.scene,
            this.sceneManager.camera,
            this.sceneManager.renderer
          );

          // Mostrar mensaje de éxito
          this.uiManager.showNotification('Reporte PDF generado exitosamente', 'success');
        } catch (error) {
          console.error('Error generando PDF:', error);
          this.uiManager.showNotification('Error al generar el reporte PDF', 'error');
        }
      });
    }
  }
}

// Iniciar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  new App();
});