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

    // PÁGINAS 3+: Detalles de cada tipo de cara (nivel por nivel)
    await this.addFaceDetailPages(doc, technicalData);

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
    
    // ✅ CORRECCIÓN: Calcular altura visible basada en niveles visibles
    const alturaVisible = h1 * nivelesVisibles;

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
      Htotal: alturaVisible,  // ✅ Usar altura calculada en lugar de Htotal del state
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

  /**
   * Calcula los detalles geométricos de una cara (rombo o triángulo)
   * @param {Object} face - Cara con sus vértices
   * @param {number} level - Nivel al que pertenece
   * @returns {Object} - Detalles geométricos completos
   */
  static calculateFaceDetails(face, level) {
    const vertices = face.vertices;
    const isTriangle = face.isTriangle;
    const { N } = state;

    // Encontrar el vértice superior (mayor Z)
    let topVertexIndex = 0;
    let maxZ = -Infinity;
    vertices.forEach((v, i) => {
      if (v.z > maxZ) {
        maxZ = v.z;
        topVertexIndex = i;
      }
    });

    // Calcular longitudes de lados
    const sideLengths = [];
    for (let i = 0; i < vertices.length; i++) {
      const v1 = vertices[i];
      const v2 = vertices[(i + 1) % vertices.length];
      const length = v1.distanceTo(v2);
      sideLengths.push(length);
    }

    // Calcular ángulos internos de los vértices
    const vertexAngles = [];
    for (let i = 0; i < vertices.length; i++) {
      const prev = vertices[(i - 1 + vertices.length) % vertices.length];
      const current = vertices[i];
      const next = vertices[(i + 1) % vertices.length];
      const v1 = new THREE.Vector3().subVectors(prev, current).normalize();
      const v2 = new THREE.Vector3().subVectors(next, current).normalize();
      const angle = Math.acos(Math.max(-1, Math.min(1, v1.dot(v2))));
      vertexAngles.push((angle * 180) / Math.PI);
    }

    // Calcular ángulos diedros REALES (entre caras adyacentes usando normales)
    const dihedralAngles = this.calculateDihedralAngles(face, level);

    // Dimensiones horizontales y verticales
    let horizontalWidth = 0;
    let verticalHeight = 0;

    if (isTriangle) {
      // Para triángulo: base horizontal y altura vertical
      horizontalWidth = sideLengths[0]; // Base del triángulo
      const p1 = vertices[0];
      const p2 = vertices[1];
      const p3 = vertices[2];
      const base = new THREE.Vector3().subVectors(p2, p1);
      const toVertex = new THREE.Vector3().subVectors(p3, p1);
      const projection = base.clone().multiplyScalar(toVertex.dot(base) / base.lengthSq());
      const heightVector = new THREE.Vector3().subVectors(toVertex, projection);
      verticalHeight = heightVector.length();
    } else {
      // Para rombo: diagonal horizontal y diagonal vertical
      const diagonal1 = vertices[0].distanceTo(vertices[2]);
      const diagonal2 = vertices[1].distanceTo(vertices[3]);
      
      // Determinar cuál es horizontal y cuál vertical comparando componentes Z
      const d1Vector = new THREE.Vector3().subVectors(vertices[2], vertices[0]);
      const d2Vector = new THREE.Vector3().subVectors(vertices[3], vertices[1]);
      
      if (Math.abs(d1Vector.z) > Math.abs(d2Vector.z)) {
        verticalHeight = diagonal1;
        horizontalWidth = diagonal2;
      } else {
        verticalHeight = diagonal2;
        horizontalWidth = diagonal1;
      }
    }

    return {
      sideLengths,
      vertexAngles,
      dihedralAngles,
      horizontalWidth,
      verticalHeight,
      isTriangle,
      levelName: isTriangle ? `Triángulo nivel ${level}` : `Rombo nivel ${level}`,
      quantity: N,
      vertices, // Incluir vértices 3D reales para el dibujo
      topVertexIndex // Incluir índice del vértice superior
    };
  }

  /**
   * Calcula los ángulos diedros REALES de una cara usando las normales de caras adyacentes
   * @param {Object} face - Cara con vértices
   * @param {number} level - Nivel de la cara
   * @returns {Array} - Ángulos diedros en grados para cada arista
   */
  static calculateDihedralAngles(face, level) {
    const { N } = state;
    const vertices = face.vertices;
    const angles = [];

    // Calcular la normal de la cara actual
    const v0 = vertices[0];
    const v1 = vertices[1];
    const v2 = vertices[2];
    const edge1 = new THREE.Vector3().subVectors(v1, v0);
    const edge2 = new THREE.Vector3().subVectors(v2, v0);
    const currentNormal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

    // Para cada arista, encontrar la cara adyacente y calcular el ángulo diedro
    for (let i = 0; i < vertices.length; i++) {
      const edgeStart = vertices[i];
      const edgeEnd = vertices[(i + 1) % vertices.length];

      // Encontrar la cara adyacente que comparte esta arista
      const adjacentFace = this.findAdjacentFace(edgeStart, edgeEnd, level, face);
      
      if (adjacentFace) {
        // Calcular normal de la cara adyacente
        const av0 = adjacentFace.vertices[0];
        const av1 = adjacentFace.vertices[1];
        const av2 = adjacentFace.vertices[2];
        const aEdge1 = new THREE.Vector3().subVectors(av1, av0);
        const aEdge2 = new THREE.Vector3().subVectors(av2, av0);
        const adjacentNormal = new THREE.Vector3().crossVectors(aEdge1, aEdge2).normalize();

        // Calcular ángulo diedro usando las normales
        // El ángulo diedro es π - ángulo entre normales (cuando apuntan hacia afuera)
        const dotProduct = currentNormal.dot(adjacentNormal);
        const angleRad = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
        const dihedralAngle = 180 - (angleRad * 180 / Math.PI);
        angles.push(dihedralAngle);
      } else {
        // Si no hay cara adyacente (borde del corte o vértice superior/inferior)
        // Calcular ángulo con geometría específica
        if (face.isTriangle && i === 0) {
          // Base del triángulo contra la tapa de corte
          const capAngle = this.calculateCapAngle(level);
          angles.push(capAngle);
        } else {
          angles.push(0); // Placeholder para aristas sin cara adyacente
        }
      }
    }

    return angles;
  }

  /**
   * Encuentra la cara adyacente que comparte una arista
   * @param {THREE.Vector3} edgeStart - Inicio de la arista
   * @param {THREE.Vector3} edgeEnd - Fin de la arista
   * @param {number} currentLevel - Nivel actual
   * @param {Object} currentFace - Cara actual (para excluirla)
   * @returns {Object|null} - Cara adyacente o null
   */
  static findAdjacentFace(edgeStart, edgeEnd, currentLevel, currentFace) {
    const tolerance = 0.001;

    // Buscar en niveles adyacentes (nivel-1, nivel, nivel+1)
    for (const levelData of rhombiData) {
      if (Math.abs(levelData.level - currentLevel) > 1) continue;
      
      for (const face of levelData.rhombi) {
        if (face === currentFace) continue;

        // Verificar si esta cara comparte la arista
        const faceVertices = face.vertices;
        for (let i = 0; i < faceVertices.length; i++) {
          const v1 = faceVertices[i];
          const v2 = faceVertices[(i + 1) % faceVertices.length];

          // Verificar si la arista coincide (en cualquier dirección)
          const match1 = v1.distanceTo(edgeStart) < tolerance && v2.distanceTo(edgeEnd) < tolerance;
          const match2 = v1.distanceTo(edgeEnd) < tolerance && v2.distanceTo(edgeStart) < tolerance;

          if (match1 || match2) {
            return face;
          }
        }
      }
    }

    return null;
  }

  /**
   * Calcula el ángulo diedro entre la base del triángulo y la tapa de corte
   * @param {number} cutLevel - Nivel del corte
   * @returns {number} - Ángulo en grados
   */
  static calculateCapAngle(cutLevel) {
    const { N, aDeg, h1 } = state;

    // La normal de la tapa de corte apunta hacia abajo (0, 0, -1)
    const capNormal = new THREE.Vector3(0, 0, -1);

    // Para calcular la normal del triángulo necesitamos sus vértices
    // Tomamos el triángulo representativo del nivel de corte
    const cutLevelData = rhombiData.find(ld => ld.level === cutLevel);
    if (!cutLevelData || cutLevelData.rhombi.length === 0) return 90;

    const triangle = cutLevelData.rhombi[0];
    const v0 = triangle.vertices[0];
    const v1 = triangle.vertices[1];
    const v2 = triangle.vertices[2];

    // Calcular normal del triángulo
    const edge1 = new THREE.Vector3().subVectors(v1, v0);
    const edge2 = new THREE.Vector3().subVectors(v2, v0);
    const triangleNormal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

    // Ángulo diedro entre la tapa y el triángulo
    const dotProduct = triangleNormal.dot(capNormal);
    const angleRad = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
    const dihedralAngle = 180 - (angleRad * 180 / Math.PI);

    return dihedralAngle;
  }

  /**
   * Genera páginas con detalles de cada tipo de cara
   * @param {jsPDF} doc - Documento PDF
   * @param {Object} technicalData - Datos técnicos calculados
   */
  static async addFaceDetailPages(doc, technicalData) {
    if (rhombiData.length === 0) return;

    // Determinar nivel inicial
    const startLevel = state.cutActive ? state.cutLevel : 1;

    // Iterar por cada nivel desde el inicio hasta el top
    for (const levelData of rhombiData) {
      if (levelData.rhombi.length === 0) continue;

      // Tomar la primera cara del nivel como representativa
      const representativeFace = levelData.rhombi[0];

      // Calcular detalles geométricos
      const faceDetails = this.calculateFaceDetails(representativeFace, levelData.level);

      // Agregar página
      doc.addPage();

      // Dibujar la página de detalle
      this.drawFaceDetailPage(doc, faceDetails, levelData.level);
    }
  }

  /**
   * Dibuja una página de detalle de una cara
   * @param {jsPDF} doc - Documento PDF
   * @param {Object} faceDetails - Detalles de la cara
   * @param {number} level - Nivel de la cara
   */
  static drawFaceDetailPage(doc, faceDetails, level) {
    const { isTriangle, levelName, quantity, sideLengths, vertexAngles, dihedralAngles, horizontalWidth, verticalHeight } = faceDetails;

    // Título
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text(`DETALLE DE CARA - ${levelName.toUpperCase()}`, 148, 15, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text(`Tipo: ${isTriangle ? 'Triángulo' : 'Rombo'} | Cantidad por nivel: ${quantity} piezas`, 148, 22, { align: 'center' });

    // Dibujar esquema de la cara en el centro-izquierda
    this.drawFaceSchematic(doc, faceDetails, 40, 50);

    // Panel de datos técnicos (derecha)
    const startX = 160;
    let currentY = 35;
    const lineHeight = 7;

    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('DIMENSIONES', startX, currentY);
    currentY += lineHeight + 2;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Ancho horizontal: ${horizontalWidth.toFixed(3)} unidades`, startX + 3, currentY);
    currentY += lineHeight;
    doc.text(`Alto vertical: ${verticalHeight.toFixed(3)} unidades`, startX + 3, currentY);
    currentY += lineHeight + 3;

    // Longitudes de lados
    doc.setFont(undefined, 'bold');
    doc.text('LONGITUD DE LADOS', startX, currentY);
    currentY += lineHeight + 2;
    doc.setFont(undefined, 'normal');
    sideLengths.forEach((length, i) => {
      doc.text(`Lado ${i + 1}: ${length.toFixed(3)} unidades`, startX + 3, currentY);
      currentY += lineHeight;
    });
    currentY += 2;

    // Ángulos internos de vértices
    doc.setFont(undefined, 'bold');
    doc.text('ÁNGULOS INTERNOS', startX, currentY);
    currentY += lineHeight + 2;
    doc.setFont(undefined, 'normal');
    vertexAngles.forEach((angle, i) => {
      doc.text(`Vértice ${i + 1}: ${angle.toFixed(2)}°`, startX + 3, currentY);
      currentY += lineHeight;
    });
    currentY += 2;

    // Ángulos diedros
    doc.setFont(undefined, 'bold');
    doc.text('ÁNGULOS DIEDROS', startX, currentY);
    currentY += lineHeight + 2;
    doc.setFont(undefined, 'normal');
    dihedralAngles.forEach((angle, i) => {
      doc.text(`Arista ${i + 1}: ${angle.toFixed(2)}°`, startX + 3, currentY);
      currentY += lineHeight;
    });

    // Información adicional
    currentY += 5;
    doc.setFont(undefined, 'bold');
    doc.text('INFORMACIÓN ADICIONAL', startX, currentY);
    currentY += lineHeight + 2;
    doc.setFont(undefined, 'normal');
    doc.text(`Nivel: ${level}`, startX + 3, currentY);
    currentY += lineHeight;
    doc.text(`Grupo: ${levelName}`, startX + 3, currentY);
    currentY += lineHeight;
    doc.text(`Repeticiones: ${quantity} piezas`, startX + 3, currentY);

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(128);
    doc.text(`Nivel ${level} de ${state.N - 1}`, 148, 200, { align: 'center' });
    doc.text('Vista exterior de la cara', 148, 205, { align: 'center' });
    doc.setTextColor(0);
  }

  /**
   * Dibuja el esquema de la cara con anotaciones (orientada correctamente)
   * @param {jsPDF} doc - Documento PDF
   * @param {Object} faceDetails - Detalles de la cara
   * @param {number} centerX - Posición X del centro
   * @param {number} centerY - Posición Y del centro
   */
  static drawFaceSchematic(doc, faceDetails, centerX, centerY) {
    const { isTriangle, sideLengths, vertexAngles, dihedralAngles } = faceDetails;
    const vertices = faceDetails.vertices; // Vértices 3D reales

    // 1. Encontrar el vértice superior (mayor Z)
    let topVertexIndex = 0;
    let maxZ = -Infinity;
    vertices.forEach((v, i) => {
      if (v.z > maxZ) {
        maxZ = v.z;
        topVertexIndex = i;
      }
    });

    // 2. Calcular el centro de la cara
    const center = new THREE.Vector3();
    vertices.forEach(v => center.add(v));
    center.divideScalar(vertices.length);

    // 3. Calcular la normal de la cara
    const v0 = vertices[0];
    const v1 = vertices[1];
    const v2 = vertices[2];
    const edge1 = new THREE.Vector3().subVectors(v1, v0);
    const edge2 = new THREE.Vector3().subVectors(v2, v0);
    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

    // 4. Crear sistema de coordenadas local para la cara
    // El eje Z local será la normal de la cara
    const localZ = normal.clone();
    
    // El eje Y local apuntará hacia el vértice superior
    const toTopVertex = new THREE.Vector3().subVectors(vertices[topVertexIndex], center).normalize();
    const localY = toTopVertex.clone();
    
    // El eje X local será perpendicular a Y y Z
    const localX = new THREE.Vector3().crossVectors(localY, localZ).normalize();
    
    // Reortogonalizar Y para que sea perpendicular a X y Z
    localY.crossVectors(localZ, localX).normalize();

    // 5. Proyectar cada vértice al sistema de coordenadas local
    const points2D = [];
    vertices.forEach(v => {
      const relativePos = new THREE.Vector3().subVectors(v, center);
      // Proyectar al plano local (usando X e Y locales)
      const x = relativePos.dot(localX);
      const y = relativePos.dot(localY);
      points2D.push({ x, y });
    });

    // 6. Rotar los puntos 2D para que el vértice superior quede arriba
    // El vértice superior debe estar en la dirección +Y (arriba en el PDF)
    const topPoint = points2D[topVertexIndex];
    const angleToTop = Math.atan2(topPoint.x, topPoint.y); // Ángulo desde +Y
    const rotatedPoints = points2D.map(p => {
      const cos = Math.cos(-angleToTop);
      const sin = Math.sin(-angleToTop);
      return {
        x: p.x * cos - p.y * sin,
        y: p.x * sin + p.y * cos
      };
    });

    // 7. Encontrar bounding box y calcular escala
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    rotatedPoints.forEach(p => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });

    const width = maxX - minX;
    const height = maxY - minY;
    const maxDimension = Math.max(width, height);
    const scale = maxDimension > 0 ? 80 / maxDimension : 1;

    // 8. Centrar y escalar puntos para el PDF
    const finalPoints = rotatedPoints.map(p => ({
      x: centerX + (p.x - (minX + maxX) / 2) * scale,
      y: centerY - (p.y - (minY + maxY) / 2) * scale // Invertir Y para PDF
    }));

    // 9. Dibujar el polígono
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    for (let i = 0; i < finalPoints.length; i++) {
      const p1 = finalPoints[i];
      const p2 = finalPoints[(i + 1) % finalPoints.length];
      doc.line(p1.x, p1.y, p2.x, p2.y);
    }

    // 10. Dibujar vértices
    doc.setFillColor(0);
    finalPoints.forEach((p, i) => {
      // Marcar el vértice superior con círculo más grande
      const radius = (i === topVertexIndex) ? 1.2 : 0.8;
      doc.circle(p.x, p.y, radius, 'F');
    });

    // 11. Anotar longitudes de lados con número de arista
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 200);
    for (let i = 0; i < finalPoints.length; i++) {
      const p1 = finalPoints[i];
      const p2 = finalPoints[(i + 1) % finalPoints.length];
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;

      // Vector perpendicular a la línea (hacia afuera)
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);

      if (len > 0) {
        // Vector perpendicular (rotado 90° hacia afuera)
        const perpX = -dy / len;
        const perpY = dx / len;

        // Determinar si el perpendicular apunta hacia afuera o adentro
        const toCenterX = centerX - midX;
        const toCenterY = centerY - midY;
        const dotProduct = perpX * toCenterX + perpY * toCenterY;

        // Si apunta hacia el centro, invertir
        const direction = dotProduct > 0 ? -1 : 1;

        const offsetDist = 8;
        const textX = midX + perpX * offsetDist * direction;
        const textY = midY + perpY * offsetDist * direction;

        // Dibujar etiqueta con número de arista y longitud
        doc.setFont(undefined, 'bold');
        doc.text(`A${i + 1}:`, textX, textY - 1.5, { align: 'center' });
        doc.setFont(undefined, 'normal');
        doc.text(`${sideLengths[i].toFixed(2)}`, textX, textY + 1.5, { align: 'center' });
      }
    }

    // 12. Anotar ángulos internos en vértices
    doc.setTextColor(200, 0, 0);
    doc.setFontSize(8);
    finalPoints.forEach((p, i) => {
      // Vector desde vértice hacia el centro
      const toCenterX = centerX - p.x;
      const toCenterY = centerY - p.y;
      const centerDist = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY);

      if (centerDist > 0) {
        // Offset hacia afuera (opuesto al centro)
        const offsetDist = (i === topVertexIndex) ? 10 : 8;
        const offsetX = -(toCenterX / centerDist) * offsetDist;
        const offsetY = -(toCenterY / centerDist) * offsetDist;

        const label = (i === topVertexIndex) ? `${vertexAngles[i].toFixed(1)}° ▲` : `${vertexAngles[i].toFixed(1)}°`;
        doc.text(label, p.x + offsetX, p.y + offsetY, { align: 'center' });
      }
    });

    // 13. Anotar ángulos diedros en el centro de cada arista (en verde)
    doc.setTextColor(0, 120, 0);
    doc.setFontSize(7);
    for (let i = 0; i < finalPoints.length; i++) {
      if (dihedralAngles[i] > 0) {
        const p1 = finalPoints[i];
        const p2 = finalPoints[(i + 1) % finalPoints.length];
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        // Offset hacia el centro
        const toCenterX = centerX - midX;
        const toCenterY = centerY - midY;
        const centerDist = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY);

        if (centerDist > 0) {
          const offsetDist = 8;
          const offsetX = (toCenterX / centerDist) * offsetDist;
          const offsetY = (toCenterY / centerDist) * offsetDist;

          // Usar texto simple en lugar del símbolo especial
          doc.setFont(undefined, 'bold');
          doc.text(`<${dihedralAngles[i].toFixed(1)}°`, midX + offsetX, midY + offsetY - 1.5, { align: 'center' });
          doc.setFont(undefined, 'normal');
          doc.text(`Arista ${i + 1}`, midX + offsetX, midY + offsetY + 1.5, { align: 'center' });
        }
      }
    }

    doc.setTextColor(0);
  }
}