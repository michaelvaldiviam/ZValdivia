import * as THREE from 'three';
import { state, getColorForLevel } from './state.js';

/**
 * Calcula el vertice de un anillo en la posicion (k, i)
 * @param {number} k - Nivel del anillo
 * @param {number} i - Indice del vertice en el anillo
 * @returns {THREE.Vector3} - Posicion del vertice
 */
export function getRingVertex(k, i) {
  const { Dmax, N, h1 } = state;
  const z = k * h1;
  const Rk = (Dmax / 2) * Math.sin((k * Math.PI) / N);
  const step = (2 * Math.PI) / N;
  const halfStep = Math.PI / N;
  const startAngle = -Math.PI / 2;
  
  // Antiprism twist: pares con halfStep
  const rotOffset = (k % 2 === 0) ? halfStep : 0;
  const theta = startAngle + rotOffset + i * step;
  
  return new THREE.Vector3(Rk * Math.cos(theta), Rk * Math.sin(theta), z);
}

/**
 *   OPTIMIZACION: Crear poligonos con BufferGeometry merged
 */
export function createPolygons(polygonsGroup, matPolyLine, matPolyFill) {
  const { N, h1, cutActive, cutLevel } = state;
  const startK = cutActive ? cutLevel : 1;

  // Merge todas las lineas en una sola geometria
  const allLinePoints = [];
  
  for (let k = startK; k < N; k++) {
    for (let i = 0; i <= N; i++) {
      allLinePoints.push(getRingVertex(k, i % N));
    }
  }

  if (cutActive) {
    for (let i = 0; i <= N; i++) {
      allLinePoints.push(getRingVertex(cutLevel, i % N));
    }
  }

  const lineGeom = new THREE.BufferGeometry().setFromPoints(allLinePoints);
  lineGeom.attributes.position.usage = THREE.StaticDrawUsage;
  polygonsGroup.add(new THREE.LineSegments(lineGeom, matPolyLine));

  // Fill triangulation - merged en una sola geometria
  const allFillPositions = [];
  
  for (let k = startK; k < N; k++) {
    const center = new THREE.Vector3(0, 0, k * h1);
    
    for (let i = 0; i < N; i++) {
      const a = getRingVertex(k, i);
      const b = getRingVertex(k, (i + 1) % N);
      allFillPositions.push(center.x, center.y, center.z, a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }

  if (allFillPositions.length > 0) {
    const fillGeom = new THREE.BufferGeometry();
    fillGeom.setAttribute('position', new THREE.Float32BufferAttribute(allFillPositions, 3));
    fillGeom.attributes.position.usage = THREE.StaticDrawUsage;
    polygonsGroup.add(new THREE.Mesh(fillGeom, matPolyFill));
  }
}

/**
 *   OPTIMIZACION: Crear helices con geometria merged
 */
export function createHelices(helixGroup, matHelixCCW, matHelixCW) {
  const { N, cutActive, cutLevel } = state;
  const matHelixTip = new THREE.LineBasicMaterial({ color: 0xffffff });

  function createHelicesWithSign(sign) {
    const bodyPoints = [];
    const tipPoints = [];

    for (let s = 0; s < N; s++) {
      const bodyPts = [];
      let idx = s;
      const startK = cutActive ? cutLevel : 1;

      for (let k = startK; k <= N - 1; k++) {
        bodyPts.push(getRingVertex(k, idx));
        
        if (sign > 0) {
          if (k % 2 === 0) idx = (idx + 1) % N;
        } else {
          if (k % 2 === 1) idx = (idx - 1 + N) % N;
        }
      }

      // Agregar puntos del cuerpo
      for (let i = 0; i < bodyPts.length - 1; i++) {
        bodyPoints.push(bodyPts[i], bodyPts[i + 1]);
      }

      // Tip inferior
      if (!cutActive) {
        let idxLow = s;
        const p0 = getRingVertex(0, idxLow);
        if (sign > 0) idxLow = (idxLow + 1) % N;
        const p1 = getRingVertex(1, idxLow);
        tipPoints.push(p0, p1);
      }

      // Tip superior
      const pBot = getRingVertex(N - 1, idx);
      let idxTop = idx;
      
      if (sign > 0) {
        if ((N - 1) % 2 === 0) idxTop = (idxTop + 1) % N;
      } else {
        if ((N - 1) % 2 === 1) idxTop = (idxTop - 1 + N) % N;
      }

      const pTop = getRingVertex(N, idxTop);
      tipPoints.push(pBot, pTop);
    }

    // Crear geometria merged para cuerpo
    if (bodyPoints.length > 0) {
      const bodyGeom = new THREE.BufferGeometry().setFromPoints(bodyPoints);
      bodyGeom.attributes.position.usage = THREE.StaticDrawUsage;
      const matBody = sign > 0 ? matHelixCCW : matHelixCW;
      helixGroup.add(new THREE.LineSegments(bodyGeom, matBody));
    }

    // Crear geometria merged para tips
    if (tipPoints.length > 0) {
      const tipGeom = new THREE.BufferGeometry().setFromPoints(tipPoints);
      tipGeom.attributes.position.usage = THREE.StaticDrawUsage;
      helixGroup.add(new THREE.LineSegments(tipGeom, matHelixTip));
    }
  }

  createHelicesWithSign(-1);
  createHelicesWithSign(+1);
}

/**
 *   OPTIMIZACION: Crear aristas con geometria merged
 */
export function createRhombiEdges(edgesGroup, matEdge) {
  const { N, cutActive, cutLevel } = state;
  const startK = cutActive ? cutLevel : 1;
  const allEdgePoints = [];

  for (let k = startK; k <= N - 1; k++) {
    for (let i = 0; i < N; i++) {
      let idxL, idxR;
      
      if (k % 2 === 1) {
        idxL = i;
        idxR = (i + 1) % N;
      } else {
        idxL = (i - 1 + N) % N;
        idxR = i;
      }

      const vLeft = getRingVertex(k, idxL);
      const vRight = getRingVertex(k, idxR);

      if (cutActive && k === cutLevel) {
        const vTop = getRingVertex(k + 1, i);
        allEdgePoints.push(vLeft, vRight, vRight, vTop, vTop, vLeft);
      } else {
        const vBottom = getRingVertex(k - 1, i);
        const vTop = getRingVertex(k + 1, i);
        allEdgePoints.push(
          vBottom, vRight,
          vRight, vTop,
          vTop, vLeft,
          vLeft, vBottom
        );
      }
    }
  }

  if (allEdgePoints.length > 0) {
    const edgeGeom = new THREE.BufferGeometry().setFromPoints(allEdgePoints);
    edgeGeom.attributes.position.usage = THREE.StaticDrawUsage;
    edgesGroup.add(new THREE.LineSegments(edgeGeom, matEdge));
  }
}

/**
 *   OPTIMIZACION CRITICA: Rombos con geometria merged por nivel
 */
export function createRhombi(rhombiGroup, matRhombus) {
  const { N, colorByLevel, cutActive, cutLevel } = state;
  const rhombiData = [];
  const totalLevels = N - 1;
  const startK = cutActive ? cutLevel : 1;

  for (let k = startK; k <= N - 1; k++) {
    const levelName = `R${k}`;
    const levelRhombi = [];
    const vertices = [];

    // Material por nivel
    let levelMaterial;
    if (colorByLevel) {
      const levelColor = getColorForLevel(k, totalLevels);
      levelMaterial = new THREE.MeshPhysicalMaterial({
        color: levelColor,
        metalness: 0.7,
        roughness: 0.15,
        transmission: 0.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        side: THREE.DoubleSide,
        flatShading: true,
      });
    } else {
      levelMaterial = matRhombus;
    }

    for (let i = 0; i < N; i++) {
      let idxL, idxR;
      
      if (k % 2 === 1) {
        idxL = i;
        idxR = (i + 1) % N;
      } else {
        idxL = (i - 1 + N) % N;
        idxR = i;
      }

      const vLeft = getRingVertex(k, idxL);
      const vRight = getRingVertex(k, idxR);

      if (cutActive && k === cutLevel) {
        const vTop = getRingVertex(k + 1, i);
        
        levelRhombi.push({
          vertices: [vLeft, vRight, vTop],
          isTriangle: true
        });

        vertices.push(vLeft.x, vLeft.y, vLeft.z);
        vertices.push(vRight.x, vRight.y, vRight.z);
        vertices.push(vTop.x, vTop.y, vTop.z);
      } else {
        const vBottom = getRingVertex(k - 1, i);
        const vTop = getRingVertex(k + 1, i);
        
        levelRhombi.push({
          vertices: [vBottom, vRight, vTop, vLeft],
          isTriangle: false
        });

        // Dos triangulos por rombo
        vertices.push(vBottom.x, vBottom.y, vBottom.z);
        vertices.push(vRight.x, vRight.y, vRight.z);
        vertices.push(vLeft.x, vLeft.y, vLeft.z);
        
        vertices.push(vTop.x, vTop.y, vTop.z);
        vertices.push(vLeft.x, vLeft.y, vLeft.z);
        vertices.push(vRight.x, vRight.y, vRight.z);
      }
    }

    // Un mesh por nivel
    if (vertices.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      g.computeVertexNormals();
      g.attributes.position.usage = THREE.StaticDrawUsage;
      
      const mesh = new THREE.Mesh(g, levelMaterial);
      mesh.frustumCulled = true; // Habilitar frustum culling
      rhombiGroup.add(mesh);
    }

    rhombiData.push({
      level: k,
      name: levelName,
      rhombi: levelRhombi
    });
  }

  return rhombiData;
}

/**
 * Crea la tapa de cierre del plano de corte
 */
export function createCutCap(capGroup, capMaterial) {
  const { N, h1, cutLevel } = state;
  const z = cutLevel * h1;
  const center = new THREE.Vector3(0, 0, z);
  const positions = [];

  for (let i = 0; i < N; i++) {
    const a = getRingVertex(cutLevel, i);
    const b = getRingVertex(cutLevel, (i + 1) % N);

    positions.push(center.x, center.y, center.z);
    positions.push(a.x, a.y, a.z);
    positions.push(b.x, b.y, b.z);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  geom.attributes.position.usage = THREE.StaticDrawUsage;
  
  const mesh = new THREE.Mesh(geom, capMaterial);
  mesh.frustumCulled = true;
  capGroup.add(mesh);
}

/**
 *   OPTIMIZACION: Puntos usando InstancedMesh
 */
export function createAxisAndPoints(axisGroup, geomPoint, matPoint) {
  const { N, Htotal, h1, cutActive, cutLevel } = state;
  const startZ = cutActive ? cutLevel * h1 : 0;

  const axisPts = [new THREE.Vector3(0, 0, startZ), new THREE.Vector3(0, 0, Htotal)];
  const axisGeom = new THREE.BufferGeometry().setFromPoints(axisPts);
  axisGeom.attributes.position.usage = THREE.StaticDrawUsage;
  
  axisGroup.add(new THREE.Line(
    axisGeom,
    new THREE.LineBasicMaterial({ color: 0x444444 })
  ));

  const startK = cutActive ? cutLevel : 0;
  const pointCount = N + 1 - startK;
  
  // InstancedMesh para puntos (muy eficiente)
  const pointMesh = new THREE.InstancedMesh(geomPoint, matPoint, pointCount);
  pointMesh.frustumCulled = true;
  const dummy = new THREE.Object3D();
  let instanceIndex = 0;

  for (let kk = startK; kk <= N; kk++) {
    dummy.position.set(0, 0, kk * h1);
    dummy.updateMatrix();
    pointMesh.setMatrixAt(instanceIndex, dummy.matrix);
    instanceIndex++;
  }

  pointMesh.instanceMatrix.needsUpdate = true;
  axisGroup.add(pointMesh);
}