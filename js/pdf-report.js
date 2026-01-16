import * as THREE from 'three';
import { state, rhombiData } from './state.js';

// Hacer THREE disponible globalmente para el generador de PDF
window.THREE = THREE;

/**
 * Genera un reporte en PDF con vistas ortogonales y datos técnicos
 */
export class PDFReporter {
  /**
   * Genera el reporte PDF completo
   * @param {THREE.Scene} scene - Escena de Three.js
   * @param {THREE.Camera} camera - Cámara de Three.js
   * @param {THREE.WebGLRenderer} renderer - Renderer de Three.js
   */
  static async generateReport(scene, camera, renderer) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    // Calcular datos técnicos
    const technicalData = this.calculateTechnicalData();

    // PÁGINA 1: Vista XZ (lateral)
    await this.addPage1_ViewXZ(doc, scene, camera, renderer, technicalData);

    // PÁGINA 2: Vista XY (superior)
    doc.addPage();
    await this.addPage2_ViewXY(doc, scene, camera, renderer, technicalData);

    // Guardar PDF
    const filename = `Reporte_Zonohedro_N${state.N}_a${state.aDeg.toFixed(1)}.pdf`;
    doc.save(filename);

    console.log('✅ Reporte PDF generado exitosamente');
  }

  /**
   * Calcula todos los datos técnicos necesarios para el reporte
   */
  static calculateTechnicalData() {
    const { N, Dmax, aDeg, h1, Htotal, cutActive, cutLevel } = state;

    // Diámetro del polígono en el corte (si está activo)
    let diametroCutPlane = 0;
    if (cutActive) {
      const Rk = (Dmax / 2) * Math.sin((cutLevel * Math.PI) / N);
      diametroCutPlane = 2 * Rk;
    }

    // Niveles visibles
    const nivelesVisibles = cutActive ? N - cutLevel : N;

    // Lado del rombo (arista)
    const k = 1;
    const Rk = (Dmax / 2) * Math.sin((k * Math.PI) / N);
    const step = (2 * Math.PI) / N;
    const chordLength = 2 * Rk * Math.sin(step / 2);
    const aristaRombo = Math.sqrt(chordLength * chordLength + h1 * h1);

    // Base del triángulo (si hay corte)
    let baseTriangulo = 0;
    if (cutActive) {
      const RkCut = (Dmax / 2) * Math.sin((cutLevel * Math.PI) / N);
      baseTriangulo = 2 * RkCut * Math.sin(step / 2);
    }

    // Contar rombos y triángulos
    let totalRombos = 0;
    let totalTriangulos = 0;

    if (rhombiData.length > 0) {
      rhombiData.forEach(level => {
        level.rhombi.forEach(face => {
          if (face.isTriangle) {
            totalTriangulos++;
          } else {
            totalRombos++;
          }
        });
      });
    }

    return {
      Dmax,
      N,
      aDeg,
      diametroCutPlane,
      nivelesVisibles,
      Htotal,
      aristaRombo,
      baseTriangulo,
      totalRombos,
      totalTriangulos,
      cutActive
    };
  }

  /**
   * Página 1: Vista ortogonal XZ con datos técnicos
   */
  static async addPage1_ViewXZ(doc, scene, camera, renderer, data) {
    // Título
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text('REPORTE TÉCNICO - ZONOHEDRO POLAR', 148, 15, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text('Vista Ortogonal Plano XZ (Lateral)', 148, 22, { align: 'center' });

    // Capturar vista XZ
    const imageXZ = await this.captureOrthographicView(scene, camera, renderer, 'xz');

    // Agregar imagen (lado izquierdo)
    doc.addImage(imageXZ, 'PNG', 10, 30, 150, 150);

    // Panel de datos técnicos (lado derecho)
    const startX = 170;
    let currentY = 35;
    const lineHeight = 8;

    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('DATOS TÉCNICOS', startX, currentY);
    currentY += lineHeight + 2;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');

    // Parámetros principales
    doc.setFont(undefined, 'bold');
    doc.text('Parámetros:', startX, currentY);
    currentY += lineHeight;
    doc.setFont(undefined, 'normal');

    doc.text(`Dmax: ${data.Dmax.toFixed(2)} unidades`, startX + 5, currentY);
    currentY += lineHeight;

    doc.text(`N (Lados): ${data.N}`, startX + 5, currentY);
    currentY += lineHeight;

    doc.text(`Ángulo α: ${data.aDeg.toFixed(1)}°`, startX + 5, currentY);
    currentY += lineHeight + 3;

    // Dimensiones
    doc.setFont(undefined, 'bold');
    doc.text('Dimensiones:', startX, currentY);
    currentY += lineHeight;
    doc.setFont(undefined, 'normal');

    doc.text(`Altura Total: ${data.Htotal.toFixed(2)} unidades`, startX + 5, currentY);
    currentY += lineHeight;

    doc.text(`Arista (lado rombo): ${data.aristaRombo.toFixed(3)} unidades`, startX + 5, currentY);
    currentY += lineHeight + 3;

    // Información del corte (si está activo)
    if (data.cutActive) {
      doc.setFont(undefined, 'bold');
      doc.text('Plano de Corte:', startX, currentY);
      currentY += lineHeight;
      doc.setFont(undefined, 'normal');

      doc.text(`Diámetro corte: ${data.diametroCutPlane.toFixed(2)} unidades`, startX + 5, currentY);
      currentY += lineHeight;

      doc.text(`Niveles visibles: ${data.nivelesVisibles}`, startX + 5, currentY);
      currentY += lineHeight;

      doc.text(`Base triángulo: ${data.baseTriangulo.toFixed(3)} unidades`, startX + 5, currentY);
      currentY += lineHeight + 3;
    }

    // Conteo de caras
    doc.setFont(undefined, 'bold');
    doc.text('Caras:', startX, currentY);
    currentY += lineHeight;
    doc.setFont(undefined, 'normal');

    doc.text(`Rombos totales: ${data.totalRombos}`, startX + 5, currentY);
    currentY += lineHeight;

    if (data.cutActive) {
      doc.text(`Triángulos totales: ${data.totalTriangulos}`, startX + 5, currentY);
      currentY += lineHeight;
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(128);
    const date = new Date().toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    doc.text(`Generado el ${date}`, 148, 200, { align: 'center' });
    doc.text('Zonohedro Polar - ZValdivia', 148, 205, { align: 'center' });
    doc.setTextColor(0);
  }

  /**
   * Página 2: Vista ortogonal XY
   */
  static async addPage2_ViewXY(doc, scene, camera, renderer, data) {
    // Título
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text('REPORTE TÉCNICO - ZONOHEDRO POLAR', 148, 15, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text('Vista Ortogonal Plano XY (Superior)', 148, 22, { align: 'center' });

    // Capturar vista XY
    const imageXY = await this.captureOrthographicView(scene, camera, renderer, 'xy');

    // Agregar imagen centrada
    doc.addImage(imageXY, 'PNG', 73, 40, 150, 150);

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(128);
    const date = new Date().toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    doc.text(`Generado el ${date}`, 148, 200, { align: 'center' });
    doc.text('Zonohedro Polar - ZValdivia', 148, 205, { align: 'center' });
    doc.setTextColor(0);
  }

  /**
   * Captura una vista ortogonal de la escena
   * @param {THREE.Scene} scene - Escena
   * @param {THREE.Camera} camera - Cámara actual
   * @param {THREE.WebGLRenderer} renderer - Renderer
   * @param {string} view - 'xz' o 'xy'
   * @returns {string} - Data URL de la imagen
   */
  static async captureOrthographicView(scene, camera, renderer, view) {
    const THREE = window.THREE;
    
    // Guardar estado actual
    const originalCamera = camera;
    const originalSize = new THREE.Vector2();
    renderer.getSize(originalSize);

    // Crear cámara ortográfica
    const aspect = 1; // Cuadrada
    const frustumSize = state.Dmax * 1.5;
    
    const orthoCamera = new THREE.OrthographicCamera(
      frustumSize * aspect / -2,
      frustumSize * aspect / 2,
      frustumSize / 2,
      frustumSize / -2,
      0.1,
      1000
    );

    // Posicionar cámara según la vista
    if (view === 'xz') {
      // Vista lateral (desde el eje Y) - CORREGIDO: Y negativo para ver correctamente
      orthoCamera.position.set(0, -state.Dmax * 3, state.Htotal / 2);
      orthoCamera.lookAt(0, 0, state.Htotal / 2);
      orthoCamera.up.set(0, 0, 1);
    } else if (view === 'xy') {
      // Vista superior (desde el eje Z)
      const viewHeight = state.cutActive ? state.cutLevel * state.h1 : state.Htotal;
      orthoCamera.position.set(0, 0, viewHeight + state.Dmax * 2);
      orthoCamera.lookAt(0, 0, viewHeight);
      orthoCamera.up.set(0, 1, 0);
    }

    // Renderizar con tamaño cuadrado
    const renderSize = 2048;
    renderer.setSize(renderSize, renderSize);
    renderer.render(scene, orthoCamera);

    // Capturar imagen
    const imageData = renderer.domElement.toDataURL('image/png');

    // Restaurar tamaño original
    renderer.setSize(originalSize.x, originalSize.y);

    return imageData;
  }
}