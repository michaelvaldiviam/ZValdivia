import * as THREE from 'three';
import { state, rhombiData } from './state.js';

// Hacer THREE disponible globalmente para el generador de PDF
window.THREE = THREE;

/**
 * Genera un reporte en PDF con vistas ortogonales y datos tecnicos
 */
export class PDFReporter {
  /**
   * Genera el reporte PDF completo
   * @param {THREE.Scene} scene - Escena de Three.js
   * @param {THREE.Camera} camera - Camara de Three.js
   * @param {THREE.WebGLRenderer} renderer - Renderer de Three.js
   */
  static async generateReport(scene, camera, renderer) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    // Calcular datos tecnicos
    const technicalData = this.calculateTechnicalData();

    // PAGINA 1: Vista XZ (lateral)
    await this.addPage1_ViewXZ(doc, scene, camera, renderer, technicalData);

    // PAGINA 2: Vista XY (superior)
    doc.addPage();
    await this.addPage2_ViewXY(doc, scene, camera, renderer, technicalData);

    // PAGINAS 3+: Detalles de cada tipo de cara (nivel por nivel)
    await this.addFaceDetailPages(doc, technicalData);

    // Guardar PDF
    const filename = `Reporte_Zonohedro_N${state.N}_a${state.aDeg.toFixed(2)}.pdf`;
    doc.save(filename);
    console.log('  Reporte PDF generado exitosamente');
  }

  /**
   * Calcula todos los datos tecnicos necesarios para el reporte
   */
  static calculateTechnicalData() {
    const { N, Dmax, aDeg, h1, Htotal, cutActive, cutLevel } = state;

    // Diametro del poligono en el corte (si esta activo)
    let diametroCutPlane = 0;
    if (cutActive) {
      const Rk = (Dmax / 2) * Math.sin((cutLevel * Math.PI) / N);
      diametroCutPlane = 2 * Rk;
    }

    // Niveles visibles
    const nivelesVisibles = cutActive ? N - cutLevel : N;
    
    //   CORRECCION: Calcular altura visible basada en niveles visibles
    const alturaVisible = h1 * nivelesVisibles;

    // Lado del rombo
    const k = 1;
    const Rk = (Dmax / 2) * Math.sin((k * Math.PI) / N);
    const step = (2 * Math.PI) / N;
    const chordLength = 2 * Rk * Math.sin(step / 2);
    const aristaRombo = Math.sqrt(chordLength * chordLength + h1 * h1);

    // Base del triangulo (si hay corte)
    let baseTriangulo = 0;
    if (cutActive) {
      const RkCut = (Dmax / 2) * Math.sin((cutLevel * Math.PI) / N);
      baseTriangulo = 2 * RkCut * Math.sin(step / 2);
    }

    // Contar rombos y triangulos
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
      Htotal: alturaVisible,  //   Usar altura calculada en lugar de Htotal del state
      aristaRombo,
      baseTriangulo,
      totalRombos,
      totalTriangulos,
      cutActive
    };
  }

  /**
   * Pagina 1: Vista ortogonal XZ con datos tecnicos
   */
  static async addPage1_ViewXZ(doc, scene, camera, renderer, data) {
    // Titulo
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text('REPORTE TECNICO - ZONOHEDRO POLAR', 148, 15, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text('Vista Ortogonal Plano XZ (Lateral)', 148, 22, { align: 'center' });

    // Capturar vista XZ
    const imageXZ = await this.captureOrthographicView(scene, camera, renderer, 'xz');

    // Agregar imagen (lado izquierdo)
    doc.addImage(imageXZ, 'JPEG', 10, 30, 150, 150);

    // Panel de datos tecnicos (lado derecho)
    const startX = 170;
    let currentY = 35;
    const lineHeight = 8;

    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('DATOS TECNICOS', startX, currentY);
    currentY += lineHeight + 2;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');

    // Parametros principales
    doc.setFont(undefined, 'bold');
    doc.text('Parametros:', startX, currentY);
    currentY += lineHeight;
    doc.setFont(undefined, 'normal');
    doc.text(`Dmax: ${data.Dmax.toFixed(2)} unidades`, startX + 5, currentY);
    currentY += lineHeight;
    doc.text(`N (Lados): ${data.N}`, startX + 5, currentY);
    currentY += lineHeight;
    doc.text(`Angulo  : ${data.aDeg.toFixed(2)}deg`, startX + 5, currentY);
    currentY += lineHeight + 3;

    // Dimensiones
    doc.setFont(undefined, 'bold');
    doc.text('Dimensiones:', startX, currentY);
    currentY += lineHeight;
    doc.setFont(undefined, 'normal');
    doc.text(`Altura Total: ${data.Htotal.toFixed(2)} unidades`, startX + 5, currentY);
    currentY += lineHeight;
    doc.text(`Lado del rombo: ${data.aristaRombo.toFixed(3)} unidades`, startX + 5, currentY);
    currentY += lineHeight + 3;

    // Informacion del corte (si esta activo)
    if (data.cutActive) {
      doc.setFont(undefined, 'bold');
      doc.text('Plano de Corte:', startX, currentY);
      currentY += lineHeight;
      doc.setFont(undefined, 'normal');
      doc.text(`Diametro corte: ${data.diametroCutPlane.toFixed(2)} unidades`, startX + 5, currentY);
      currentY += lineHeight;
      doc.text(`Niveles visibles: ${data.nivelesVisibles}`, startX + 5, currentY);
      currentY += lineHeight;
      doc.text(`Base triangulo: ${data.baseTriangulo.toFixed(3)} unidades`, startX + 5, currentY);
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
      doc.text(`Triangulos totales: ${data.totalTriangulos}`, startX + 5, currentY);
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
   * Pagina 2: Vista ortogonal XY
   */
  static async addPage2_ViewXY(doc, scene, camera, renderer, data) {
    // Titulo
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text('REPORTE TECNICO - ZONOHEDRO POLAR', 148, 15, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text('Vista Ortogonal Plano XY (Superior)', 148, 22, { align: 'center' });

    // Capturar vista XY
    const imageXY = await this.captureOrthographicView(scene, camera, renderer, 'xy');

    // Agregar imagen centrada
    doc.addImage(imageXY, 'JPEG', 73, 40, 150, 150);

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
   * @param {THREE.Camera} camera - Camara actual
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

    // Crear camara ortografica
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

    //   Calcular altura visible actual
    const nivelesVisibles = state.cutActive ? (state.N - state.cutLevel) : state.N;
    const alturaVisible = state.h1 * nivelesVisibles;

    // Posicionar camara segun la vista
    if (view === 'xz') {
      // Vista lateral (desde el eje Y)
      orthoCamera.position.set(0, -state.Dmax * 3, alturaVisible / 2);
      orthoCamera.lookAt(0, 0, alturaVisible / 2);
      orthoCamera.up.set(0, 0, 1);
    } else if (view === 'xy') {
      // Vista superior (desde el eje Z)
      const viewHeight = state.cutActive ? state.cutLevel * state.h1 : alturaVisible;
      orthoCamera.position.set(0, 0, viewHeight + state.Dmax * 2);
      orthoCamera.lookAt(0, 0, viewHeight);
      orthoCamera.up.set(0, 1, 0);
    }

    // Renderizar con tamano cuadrado (mas liviano)
    const renderSize = 1200;

    // Guardar estado visual del renderer/scene
    const originalOverride = scene.overrideMaterial;
    const originalClear = renderer.getClearColor(new THREE.Color());
    const originalClearAlpha = renderer.getClearAlpha();

    // Estilo tecnico: mantener el mismo look que a color (solido),
    // pero sin color. Para esto usamos un override solido gris.
    // (Las aristas/lines existentes se mantienen por separado.)
    renderer.setClearColor(0xffffff, 1);
    // Gris solido (sin transparencia) para que se vea como la version a color,
    // pero sin color. Mantiene el sombreado (Lambert) para que las caras se lean bien.
    scene.overrideMaterial = new THREE.MeshLambertMaterial({
      color: 0xb8b8b8,
      side: THREE.DoubleSide,
      transparent: false,
      opacity: 1.0,
      depthWrite: true
    });

    renderer.setSize(renderSize, renderSize);
    renderer.render(scene, orthoCamera);

    // Capturar imagen (JPEG mas liviano)
    const imageData = renderer.domElement.toDataURL('image/jpeg', 0.70);

    // Restaurar override/clear
    scene.overrideMaterial = originalOverride;
    renderer.setClearColor(originalClear, originalClearAlpha);

    // Restaurar tamano original
    renderer.setSize(originalSize.x, originalSize.y);

    return imageData;
  }

  /**
   * Calcula los detalles geometricos de una cara (rombo o triangulo)
   * @param {Object} face - Cara con sus vertices
   * @param {number} level - Nivel al que pertenece
   * @returns {Object} - Detalles geometricos completos
   */
  static calculateFaceDetails(face, level) {
    const vertices = face.vertices;
    const isTriangle = face.isTriangle;
    const { N } = state;

    // Encontrar el vertice superior (mayor Z)
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

    // Calcular angulos internos de los vertices
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

    // Calcular angulos diedros REALES (entre caras adyacentes usando normales)
    const dihedralAngles = this.calculateDihedralAngles(face, level);

    // Dimensiones horizontales y verticales
    let horizontalWidth = 0;
    let verticalHeight = 0;

    if (isTriangle) {
      // Para triangulo: base horizontal y altura vertical
      horizontalWidth = sideLengths[0]; // Base del triangulo
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
      
      // Determinar cual es horizontal y cual vertical comparando componentes Z
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
      levelName: isTriangle ? `Triangulo nivel ${level}` : `Rombo nivel ${level}`,
      quantity: N,
      vertices, // Incluir vertices 3D reales para el dibujo
      topVertexIndex // Incluir indice del vertice superior
    };
  }

  /**
   * Calcula los angulos diedros REALES de una cara usando las normales de caras adyacentes
   * @param {Object} face - Cara con vertices
   * @param {number} level - Nivel de la cara
   * @returns {Array} - Angulos diedros en grados para cada arista
   */

  // ---------------------------------------------------------------------------
  // Helpers geometricos (PDF tecnico de caras)
  // ---------------------------------------------------------------------------
  static _computeModelCenter() {
  try {
    if (typeof rhombiData === 'undefined' || !Array.isArray(rhombiData) || rhombiData.length === 0) {
      const z = (state && typeof state.h1 === 'number') ? state.h1 * 0.5 : 0;
      return new THREE.Vector3(0, 0, z);
    }
    const sum = new THREE.Vector3(0, 0, 0);
    let count = 0;
    for (const ld of rhombiData) {
      if (!ld || !Array.isArray(ld.rhombi)) continue;
      for (const f of ld.rhombi) {
        if (!f || !Array.isArray(f.vertices)) continue;
        for (const v of f.vertices) {
          if (v && typeof v.x === 'number') {
            sum.add(v);
            count++;
          }
        }
      }
    }
    return count > 0 ? sum.multiplyScalar(1 / count) : new THREE.Vector3(0, 0, 0);
  } catch (e) {
    return new THREE.Vector3(0, 0, 0);
  }
}

  static _getModelCenter() {
    // cache a nivel de clase
    if (!this._modelCenter) this._modelCenter = this._computeModelCenter();
    return this._modelCenter;
  }

  static _orientedFaceNormal(vertices) {
  const v0 = vertices[0];
  const v1 = vertices[1];
  const v2 = vertices[2];
  const edge1 = new THREE.Vector3().subVectors(v1, v0);
  const edge2 = new THREE.Vector3().subVectors(v2, v0);
  const n = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

  // Orientar hacia afuera usando el centro del modelo
  const c = new THREE.Vector3(0, 0, 0);
  for (const v of vertices) c.add(v);
  c.multiplyScalar(1 / vertices.length);

  const center = this._getModelCenter();
  const outward = new THREE.Vector3().subVectors(c, center);

  if (outward.lengthSq() > 1e-12 && n.dot(outward) < 0) n.negate();
  return n;
}

  static calculateDihedralAngles(face, level) {
    const vertices = face.vertices;
    const angles = [];

    const clamp = (x) => Math.max(-1, Math.min(1, x));

    // Normal de la cara actual orientada hacia afuera
    const currentNormal = this._orientedFaceNormal(vertices);

    // Plano del piso/tapa de corte: normal hacia afuera apunta hacia abajo (-Z).
    // IMPORTANTE: cuando hay corte activo, el "piso" esta en z = cutLevel*h1.
    const capNormal = new THREE.Vector3(0, 0, -1);
    const cutZ = state.cutActive ? (state.cutLevel * state.h1) : 0;
    // En la geometria real puede haber pequenas variaciones numericas,
    // por lo que usamos una tolerancia mas permisiva.
    const epsZ = 2e-3;

    // En algunos casos (especialmente en la cara triangular del nivel de corte)
    // el borde del piso no queda exactamente en z=0 por redondeos.
    // Para ser robustos, detectamos el "mejor candidato" a borde del piso.
    let capEdgeIndex = -1;
    if (state.cutActive) {
      // Solo intentar asociar con el piso si esta cara esta cerca del plano de corte
      let minZ = Infinity;
      for (const v of vertices) minZ = Math.min(minZ, Math.abs(v.z - cutZ));
      const faceNearCut = minZ < epsZ * 2;
      if (!faceNearCut) {
        // Mantener -1
      } else {
      let bestScore = Infinity;
      for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i];
        const b = vertices[(i + 1) % vertices.length];
        const score = Math.abs(a.z - cutZ) + Math.abs(b.z - cutZ);
        if (score < bestScore) {
          bestScore = score;
          capEdgeIndex = i;
        }
      }
        // Si el mejor borde esta demasiado lejos del plano de corte, no lo usamos
        if (bestScore > epsZ * 2) capEdgeIndex = -1;
      }
    }

    for (let i = 0; i < vertices.length; i++) {
      const edgeStart = vertices[i];
      const edgeEnd = vertices[(i + 1) % vertices.length];

      let adjacentFace = this.findAdjacentFace(edgeStart, edgeEnd, level, face);

      // Si hay corte activo y esta arista corresponde al plano de corte ("piso"),
      // puede existir una cara adyacente geometricamente "debajo" del corte en los datos.
      // En ese caso, el diedro relevante es con el plano del piso, no con la cara truncada.
      if (state.cutActive) {
        const isCapEdgeCandidate = (
          (Math.abs(edgeStart.z - cutZ) < epsZ && Math.abs(edgeEnd.z - cutZ) < epsZ) ||
          (i === capEdgeIndex)
        );
        if (isCapEdgeCandidate && adjacentFace) {
          let maxZAdj = -Infinity;
          for (const v of adjacentFace.vertices) maxZAdj = Math.max(maxZAdj, v.z);
          if (maxZAdj < cutZ - epsZ) {
            adjacentFace = null;
          }
        }
      }

      if (adjacentFace) {
        const adjacentNormal = this._orientedFaceNormal(adjacentFace.vertices);
        const angleRad = Math.acos(clamp(currentNormal.dot(adjacentNormal)));
        const dihedralDeg = 180 - (angleRad * 180 / Math.PI);
        angles.push(dihedralDeg / 2);
      } else {
        // Si hay corte activo, esta arista puede pertenecer al piso/tapa.
        // Detectamos por z 0 o por el candidato mas cercano al plano.
        const isCapEdge = state.cutActive && (
          (Math.abs(edgeStart.z - cutZ) < epsZ && Math.abs(edgeEnd.z - cutZ) < epsZ) ||
          (i === capEdgeIndex)
        );

        if (isCapEdge) {
          const angleRad = Math.acos(clamp(currentNormal.dot(capNormal)));
          const dihedralDeg = 180 - (angleRad * 180 / Math.PI);
          angles.push(dihedralDeg / 2);
        } else {
          angles.push(0);
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

          // Verificar si la arista coincide (en cualquier direccion)
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
   * Calcula el angulo diedro entre la base del triangulo y la tapa de corte
   * @param {number} cutLevel - Nivel del corte
   * @returns {number} - Angulo en grados (dividido por 2)
   */
  
static calculateCapAngle(cutLevel) {
    // Devuelve la MITAD del angulo diedro REAL entre la cara triangular y el piso (tapa de corte),
    // consistente con calculateDihedralAngles().
    const clamp = (x) => Math.max(-1, Math.min(1, x));
    const capNormal = new THREE.Vector3(0, 0, -1);

    const cutLevelData = rhombiData.find(ld => ld.level === cutLevel);
    if (!cutLevelData || !cutLevelData.rhombi || cutLevelData.rhombi.length === 0) return 45;

    const tri = cutLevelData.rhombi[0];
    const v0 = tri.vertices[0];
    const v1 = tri.vertices[1];
    const v2 = tri.vertices[2];

    const edge1 = new THREE.Vector3().subVectors(v1, v0);
    const edge2 = new THREE.Vector3().subVectors(v2, v0);
    let n = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

    if (n.z > 0) n.negate();

    const angleRad = Math.acos(clamp(n.dot(capNormal)));
    const dihedralDeg = 180 - (angleRad * 180 / Math.PI);
    return dihedralDeg / 2;
  }


  /**
   * Genera paginas con detalles de cada tipo de cara
   * @param {jsPDF} doc - Documento PDF
   * @param {Object} technicalData - Datos tecnicos calculados
   */
  static async addFaceDetailPages(doc, technicalData) {
    if (rhombiData.length === 0) return;

    // Determinar nivel inicial
    const startLevel = state.cutActive ? state.cutLevel : 1;

    // Contador de caras desde 1 (de abajo hacia arriba)
    let faceNumber = 1;

    // Iterar por cada nivel desde el inicio hasta el top
    for (const levelData of rhombiData) {
      if (levelData.rhombi.length === 0) continue;

      // Tomar la primera cara del nivel como representativa
      const representativeFace = levelData.rhombi[0];

      // Calcular detalles geometricos
      const faceDetails = this.calculateFaceDetails(representativeFace, levelData.level);

      // Agregar pagina
      doc.addPage();

      // Dibujar la pagina de detalle con el numero de cara
      this.drawFaceDetailPage(doc, faceDetails, levelData.level, faceNumber, technicalData.nivelesVisibles);
      
      faceNumber++;
    }
  }

  /**
   * Dibuja una pagina de detalle de una cara
   * @param {jsPDF} doc - Documento PDF
   * @param {Object} faceDetails - Detalles de la cara
   * @param {number} level - Nivel de la cara
   * @param {number} faceNumber - Numero de cara (1, 2, 3...)
   * @param {number} totalFaces - Total de caras visibles
   */
  static drawFaceDetailPage(doc, faceDetails, level, faceNumber, totalFaces) {
    const { isTriangle, levelName, quantity, sideLengths, vertexAngles, dihedralAngles, horizontalWidth, verticalHeight } = faceDetails;

    // Titulo con numero de cara
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text(`CARA ${faceNumber} DE ${totalFaces}`, 148, 15, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text(`Tipo: ${isTriangle ? 'Triangulo' : 'Rombo'} | Cantidad: ${quantity} piezas`, 148, 22, { align: 'center' });

    // Dibujar esquema de la cara mas grande y centrado
    this.drawFaceSchematic(doc, faceDetails, 75, 100);

    // Panel de datos tecnicos (derecha) - mas ancho y mejor distribuido
    const startX = 165;
    let currentY = 40;
    const lineHeight = 7;

    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('DIMENSIONES', startX, currentY);
    currentY += lineHeight + 2;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Ancho horizontal: ${horizontalWidth.toFixed(3)} m`, startX + 2, currentY);
    currentY += lineHeight;
    doc.text(`Alto vertical: ${verticalHeight.toFixed(3)} m`, startX + 2, currentY);
    currentY += lineHeight + 4;

    // Longitudes de lados
    doc.setFont(undefined, 'bold');
    doc.text('LONGITUD DE LADOS', startX, currentY);
    currentY += lineHeight + 2;
    doc.setFont(undefined, 'normal');
    sideLengths.forEach((length, i) => {
      doc.text(`Lado ${i + 1}: ${length.toFixed(3)} m`, startX + 2, currentY);
      currentY += lineHeight;
    });
    currentY += 3;

    // Angulos internos de vertices
    doc.setFont(undefined, 'bold');
    doc.text('ANGULOS INTERNOS', startX, currentY);
    currentY += lineHeight + 2;
    doc.setFont(undefined, 'normal');
    vertexAngles.forEach((angle, i) => {
      doc.text(`Vertice ${i + 1}: ${angle.toFixed(2)}deg`, startX + 2, currentY);
      currentY += lineHeight;
    });
    currentY += 3;

    // Angulos diedros (divididos por 2)
    doc.setFont(undefined, 'bold');
    doc.text('ANGULOS DIEDROS', startX, currentY);
    currentY += lineHeight + 1;
    doc.setFontSize(8);
    doc.setFont(undefined, 'italic');
    doc.text('(angulo desde plano medio)', startX + 2, currentY);
    currentY += lineHeight;
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    dihedralAngles.forEach((angle, i) => {
      if (angle > 0) {
        doc.text(`Lado ${i + 1}: ${angle.toFixed(2)}deg`, startX + 2, currentY);
        currentY += lineHeight;
      }
    });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(128);
    doc.text(`Cara ${faceNumber} de ${totalFaces} - ${levelName}`, 148, 200, { align: 'center' });
    doc.text('Vista exterior de la cara', 148, 205, { align: 'center' });
    doc.setTextColor(0);
  }

  /**
   * Dibuja el esquema de la cara con anotaciones (orientada correctamente)
   * @param {jsPDF} doc - Documento PDF
   * @param {Object} faceDetails - Detalles de la cara
   * @param {number} centerX - Posicion X del centro
   * @param {number} centerY - Posicion Y del centro
   */
  static drawFaceSchematic(doc, faceDetails, centerX, centerY) {
    const { isTriangle, sideLengths, vertexAngles, dihedralAngles } = faceDetails;
    const vertices = faceDetails.vertices; // Vertices 3D reales

    // 1. Encontrar el vertice superior (mayor Z)
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
    // El eje Z local sera la normal de la cara
    const localZ = normal.clone();
    
    // El eje Y local apuntara hacia el vertice superior
    const toTopVertex = new THREE.Vector3().subVectors(vertices[topVertexIndex], center).normalize();
    const localY = toTopVertex.clone();
    
    // El eje X local sera perpendicular a Y y Z
    const localX = new THREE.Vector3().crossVectors(localY, localZ).normalize();
    
    // Reortogonalizar Y para que sea perpendicular a X y Z
    localY.crossVectors(localZ, localX).normalize();

    // 5. Proyectar cada vertice al sistema de coordenadas local
    const points2D = [];
    vertices.forEach(v => {
      const relativePos = new THREE.Vector3().subVectors(v, center);
      // Proyectar al plano local (usando X e Y locales)
      const x = relativePos.dot(localX);
      const y = relativePos.dot(localY);
      points2D.push({ x, y });
    });

    // 6. Rotar los puntos 2D para que el vertice superior quede arriba
    // El vertice superior debe estar en la direccion +Y (arriba en el PDF)
    const topPoint = points2D[topVertexIndex];
    const angleToTop = Math.atan2(topPoint.x, topPoint.y); // Angulo desde +Y
    const rotatedPoints = points2D.map(p => {
      const cos = Math.cos(-angleToTop);
      const sin = Math.sin(-angleToTop);
      return {
        x: p.x * cos - p.y * sin,
        y: p.x * sin + p.y * cos
      };
    });

    // 7. Encontrar bounding box y calcular escala (mas grande)
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
    // Aumentar escala para hacer la cara mas grande
    const scale = maxDimension > 0 ? 100 / maxDimension : 1;

    // 8. Centrar y escalar puntos para el PDF
    const finalPoints = rotatedPoints.map(p => ({
      x: centerX + (p.x - (minX + maxX) / 2) * scale,
      y: centerY - (p.y - (minY + maxY) / 2) * scale // Invertir Y para PDF
    }));

    // 9. Dibujar el poligono (lineas mas gruesas)
    doc.setDrawColor(0);
    doc.setLineWidth(0.8);
    for (let i = 0; i < finalPoints.length; i++) {
      const p1 = finalPoints[i];
      const p2 = finalPoints[(i + 1) % finalPoints.length];
      doc.line(p1.x, p1.y, p2.x, p2.y);
    }

    // 10. Dibujar vertices (mas grandes)
    doc.setFillColor(0);
    finalPoints.forEach((p, i) => {
      // Marcar el vertice superior con circulo mas grande
      const radius = (i === topVertexIndex) ? 1.5 : 1.0;
      doc.circle(p.x, p.y, radius, 'F');
    });

    // 11. Anotar longitudes de lados con numero de arista (mas separado)
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 200);
    for (let i = 0; i < finalPoints.length; i++) {
      const p1 = finalPoints[i];
      const p2 = finalPoints[(i + 1) % finalPoints.length];
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;

      // Vector perpendicular a la linea (hacia afuera)
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        // Vector perpendicular (rotado 90deg hacia afuera)
        const perpX = -dy / len;
        const perpY = dx / len;

        // Determinar si el perpendicular apunta hacia afuera o adentro
        const toCenterX = centerX - midX;
        const toCenterY = centerY - midY;
        const dotProduct = perpX * toCenterX + perpY * toCenterY;

        // Si apunta hacia el centro, invertir
        const direction = dotProduct > 0 ? -1 : 1;
        const offsetDist = 12; // Mas separado
        const textX = midX + perpX * offsetDist * direction;
        const textY = midY + perpY * offsetDist * direction;

        // Dibujar etiqueta con numero de arista y longitud
        doc.setFont(undefined, 'bold');
        doc.text(`L${i + 1}:`, textX, textY - 1.5, { align: 'center' });
        doc.setFont(undefined, 'normal');
        doc.text(`${sideLengths[i].toFixed(3)}m`, textX, textY + 1.5, { align: 'center' });
      }
    }

    // 12. Anotar angulos internos en vertices (mas separados)
    doc.setTextColor(200, 0, 0);
    doc.setFontSize(9);
    finalPoints.forEach((p, i) => {
      // Vector desde vertice hacia el centro
      const toCenterX = centerX - p.x;
      const toCenterY = centerY - p.y;
      const centerDist = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY);
      if (centerDist > 0) {
        // Offset hacia afuera (opuesto al centro) - mas separado
        const offsetDist = (i === topVertexIndex) ? 14 : 12;
        const offsetX = -(toCenterX / centerDist) * offsetDist;
        const offsetY = -(toCenterY / centerDist) * offsetDist;
        const label = (i === topVertexIndex) ? `${vertexAngles[i].toFixed(1)}deg  ` : `${vertexAngles[i].toFixed(1)}deg`;
        doc.setFont(undefined, 'bold');
        doc.text(label, p.x + offsetX, p.y + offsetY, { align: 'center' });
      }
    });

    // 13. Anotar angulos diedros cerca de cada arista (mas visibles)
    doc.setTextColor(0, 128, 0);
    doc.setFontSize(8);
    for (let i = 0; i < finalPoints.length; i++) {
      if (dihedralAngles[i] > 0) {
        const p1 = finalPoints[i];
        const p2 = finalPoints[(i + 1) % finalPoints.length];
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        // Offset hacia el interior (cerca de la arista)
        const toCenterX = centerX - midX;
        const toCenterY = centerY - midY;
        const centerDist = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY);
        if (centerDist > 0) {
          const offsetDist = 6; // Mas cerca de la arista
          const offsetX = (toCenterX / centerDist) * offsetDist;
          const offsetY = (toCenterY / centerDist) * offsetDist;

          doc.setFont(undefined, 'bold');
          doc.text(` ${dihedralAngles[i].toFixed(1)}deg`, midX + offsetX, midY + offsetY, { align: 'center' });
        }
      }
    }

    doc.setTextColor(0);
  }
}