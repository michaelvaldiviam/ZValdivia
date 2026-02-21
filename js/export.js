import * as THREE from 'three';
import { state, rhombiData } from './state.js';

/**
 * Maneja la exportacion del modelo a formato OBJ
 */
export class OBJExporter {
  /**
   * Exporta el zonohedro a formato OBJ
   */
  static exportToOBJ() {
    // La validacion ahora se hace en main.js antes de llamar a este metodo
    
    let objContent = '# Zonohedro Polar (Zome) - ZValdivia Export\n';
    objContent += `# Generated: ${new Date().toISOString()}\n`;
    objContent += `# Parameters: Dmax=${state.Dmax}, N=${state.N}, Angle=${state.aDeg}deg\n`;
    if (state.cutActive) {
      objContent += `# Cut plane active at level K=${state.cutLevel}\n`;
    }
    objContent += `# Total faces: ${rhombiData.reduce((sum, level) => sum + level.rhombi.length, 0)}\n\n`;

    let vertexOffset = 1; // OBJ usa indices basados en 1

    for (const levelData of rhombiData) {
      objContent += `# Level ${levelData.level} - ${levelData.name}\n`;
      objContent += `# Faces in this level: ${levelData.rhombi.length}\n`;
      objContent += `o ${levelData.name}\n`;
      objContent += `g ${levelData.name}\n\n`;

      const levelVertices = [];
      const levelNormals = [];

      // Recolectar todos los vertices
      for (const face of levelData.rhombi) {
        for (const v of face.vertices) {
          levelVertices.push(v);
        }
      }

      // Escribir vertices
      objContent += `# Vertices for ${levelData.name}\n`;
      for (const v of levelVertices) {
        objContent += `v ${v.x.toFixed(6)} ${v.y.toFixed(6)} ${v.z.toFixed(6)}\n`;
      }
      objContent += '\n';

      // Calcular normales para cada cara
      objContent += `# Normals for ${levelData.name}\n`;
      for (const face of levelData.rhombi) {
        const v0 = face.vertices[0];
        const v1 = face.vertices[1];
        const v2 = face.vertices[2];

        // Calcular normal usando los primeros 3 vertices
        const edge1 = new THREE.Vector3().subVectors(v1, v0);
        const edge2 = new THREE.Vector3().subVectors(v2, v0);
        const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

        // Una normal por cara, repetida para cada vertice
        const vertexCount = face.isTriangle ? 3 : 4;
        for (let i = 0; i < vertexCount; i++) {
          levelNormals.push(normal);
        }
      }

      // Escribir normales
      for (const n of levelNormals) {
        objContent += `vn ${n.x.toFixed(6)} ${n.y.toFixed(6)} ${n.z.toFixed(6)}\n`;
      }
      objContent += '\n';

      // Escribir caras (triangulos o quads segun corresponda)
      objContent += `# Faces for ${levelData.name}\n`;
      let currentVertex = vertexOffset;
      
      for (const face of levelData.rhombi) {
        if (face.isTriangle) {
          // Triangulo: 3 vertices
          const v1 = currentVertex;
          const v2 = currentVertex + 1;
          const v3 = currentVertex + 2;
          objContent += `f ${v1}//${v1} ${v2}//${v2} ${v3}//${v3}\n`;
          currentVertex += 3;
        } else {
          // Rombo (quad): 4 vertices
          const v1 = currentVertex;     // Bottom
          const v2 = currentVertex + 1; // Right
          const v3 = currentVertex + 2; // Top
          const v4 = currentVertex + 3; // Left
          objContent += `f ${v1}//${v1} ${v2}//${v2} ${v3}//${v3} ${v4}//${v4}\n`;
          currentVertex += 4;
        }
      }

      objContent += '\n';
      vertexOffset = currentVertex;
    }

    // Si hay corte activo, agregar la tapa de cierre
    if (state.cutActive) {
      objContent += `# Cut cap at level K=${state.cutLevel}\n`;
      objContent += `o CutCap\n`;
      objContent += `g CutCap\n\n`;

      const { N, h1, cutLevel } = state;
      const z = cutLevel * h1;
      
      // Vertice central
      objContent += `v 0.000000 0.000000 ${z.toFixed(6)}\n`;
      
      // Vertices del perimetro
      const Rk = (state.Dmax / 2) * Math.sin((cutLevel * Math.PI) / N);
      const step = (2 * Math.PI) / N;
      const halfStep = Math.PI / N;
      const startAngle = -Math.PI / 2;
      const rotOffset = (cutLevel % 2 === 0) ? halfStep : 0;
      
      for (let i = 0; i < N; i++) {
        const theta = startAngle + rotOffset + i * step;
        const x = Rk * Math.cos(theta);
        const y = Rk * Math.sin(theta);
        objContent += `v ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}\n`;
      }
      objContent += '\n';

      // Normales (hacia abajo)
      const capVertexCount = N + 1;
      for (let i = 0; i < capVertexCount * N; i++) {
        objContent += `vn 0.000000 0.000000 -1.000000\n`;
      }
      objContent += '\n';

      // Caras triangulares
      objContent += `# Cap triangular faces\n`;
      for (let i = 0; i < N; i++) {
        const vCenter = vertexOffset;
        const v1 = vertexOffset + 1 + i;
        const v2 = vertexOffset + 1 + ((i + 1) % N);
        
        const nCenter = vertexOffset;
        const n1 = vertexOffset + 1 + i;
        const n2 = vertexOffset + 1 + ((i + 1) % N);
        
        objContent += `f ${vCenter}//${nCenter} ${v1}//${n1} ${v2}//${n2}\n`;
      }
      objContent += '\n';
    }

    // Agregar resumen al final
    objContent += '# Export Summary\n';
    objContent += `# Total Levels: ${rhombiData.length}\n`;
    objContent += `# Total Faces: ${rhombiData.reduce((sum, level) => sum + level.rhombi.length, 0)}\n`;
    if (state.cutActive) {
      objContent += `# Cut plane: Active at K=${state.cutLevel}\n`;
      objContent += `# Geometry is closed with triangular cap\n`;
    }

    // Descargar archivo
    this.downloadOBJ(objContent);
  }

  /**
   * Descarga el archivo OBJ
   * @param {string} content - Contenido del archivo OBJ
   */
  static downloadOBJ(content) {
    const blob = new Blob([content], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    let filename = `zome_D${state.Dmax.toFixed(1)}_N${state.N}_a${state.aDeg.toFixed(2)}`;
    if (state.cutActive) {
      filename += `_cut${state.cutLevel}`;
    }
    filename += '.obj';
    
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('OBJ exportado exitosamente');
    console.log(`Total caras: ${rhombiData.reduce((sum, level) => sum + level.rhombi.length, 0)}`);
    if (state.cutActive) {
      console.log(`Corte activo en nivel K=${state.cutLevel}`);
    }
  }
}

/**
 * Exporta SOLO la estructura de conectores (cilindros + vigas) a OBJ.
 *
 * Nota:
 * - Las vigas se exportan como QUADS (6 caras) usando metadata guardada en userData.
 * - Los cilindros se exportan tal como estan en THREE (triangulacion de la geometria).
 */
export class StructureOBJExporter {
  /**
   * @param {THREE.Group} structureGroup
   */
  static exportStructureToOBJ(structureGroup) {
    if (!structureGroup) throw new Error('No structure group');
    if (!structureGroup.children || structureGroup.children.length === 0) {
      throw new Error('Structure is empty');
    }

    structureGroup.updateMatrixWorld(true);

    let obj = '# ZValdivia - Connector Structure OBJ\n';
    obj += `# Generated: ${new Date().toISOString()}\n`;
    obj += `# Parameters: Dmax=${state.Dmax}, N=${state.N}, a=${state.aDeg}deg\n`;
    if (state.cutActive) obj += `# Cut active at K=${state.cutLevel}\n`;
    obj += '\n';

    let vOffset = 1; // OBJ 1-based
    let meshCounter = 0;

    structureGroup.traverse((child) => {
      if (!child || !child.isMesh) return;
      const mesh = child;
      const name = (mesh.name && mesh.name.trim()) ? mesh.name : `mesh_${meshCounter++}`;
      obj += `o ${name}\n`;
      obj += `g ${name}\n`;

      // --- Vertices ---
      const verts = [];
      const ud = mesh && mesh.userData ? mesh.userData : null;
      const hasObjFaces = !!ud && Array.isArray(ud.objFaces) && Array.isArray(ud.objVertices);
      if (hasObjFaces) {
        // Viga: 8 vertices definidos por el generador
        for (const v of mesh.userData.objVertices) {
          const p = v.clone().applyMatrix4(mesh.matrixWorld);
          verts.push(p);
        }
      } else {
        const pos = (mesh && mesh.geometry && mesh.geometry.attributes) ? mesh.geometry.attributes.position : null;
        if (!pos) return;
        for (let i = 0; i < pos.count; i++) {
          const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
          verts.push(p);
        }
      }

      for (const p of verts) {
        obj += `v ${p.x.toFixed(6)} ${p.y.toFixed(6)} ${p.z.toFixed(6)}\n`;
      }
      obj += '\n';

      // --- Faces ---
      if (hasObjFaces) {
        // Faces definidos por el generador: puede ser QUAD o N-gon
        const faces = (Array.isArray(mesh.userData.objFaces) && mesh.userData.objFaces.length)
          ? mesh.userData.objFaces
          : (Array.isArray(mesh.userData.objQuads) ? mesh.userData.objQuads : []);
        for (const face of faces) {
          if (!face || !face.length) continue;
          const idxs = face.map((vi) => vOffset + vi);
          obj += `f ${idxs.join(' ')}\n`;
        }
        obj += '\n';
        vOffset += verts.length;
        return;
      }


      // Triangulacion (CylinderGeometry u otras)
      const geom = mesh.geometry;
      const idx = geom && geom.index ? geom.index : null;
      if (idx && idx.count >= 3) {
        for (let i = 0; i < idx.count; i += 3) {
          const a = vOffset + idx.getX(i);
          const b = vOffset + idx.getX(i + 1);
          const c = vOffset + idx.getX(i + 2);
          obj += `f ${a} ${b} ${c}\n`;
        }
        obj += '\n';
        vOffset += verts.length;
        return;
      }

      // No indexed: asumir trios consecutivos
      for (let i = 0; i + 2 < verts.length; i += 3) {
        obj += `f ${vOffset + i} ${vOffset + i + 1} ${vOffset + i + 2}\n`;
      }
      obj += '\n';
      vOffset += verts.length;
    });

    this._downloadOBJ(obj);
  }

  static _downloadOBJ(content) {
    const blob = new Blob([content], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    let filename = `structure_D${state.Dmax.toFixed(1)}_N${state.N}_a${state.aDeg.toFixed(2)}`;
    if (state.cutActive) filename += `_cut${state.cutLevel}`;
    filename += '.obj';
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}