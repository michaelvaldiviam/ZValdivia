import * as THREE from 'three';
import { state, rhombiData } from './state.js';

/**
 * Maneja la exportacion del modelo a formato OBJ
 * Usa array de líneas + join() en lugar de concatenación para evitar O(n²) en modelos grandes.
 */
export class OBJExporter {
  static exportToOBJ() {
    const lines = [];
    lines.push('# Zonohedro Polar (Zome) - ZValdivia Export');
    lines.push(`# Generated: ${new Date().toISOString()}`);
    lines.push(`# Parameters: Dmax=${state.Dmax}, N=${state.N}, Angle=${state.aDeg}deg`);
    if (state.cutActive) {
      lines.push(`# Cut plane active at level K=${state.cutLevel}`);
    }
    lines.push(`# Total faces: ${rhombiData.reduce((sum, level) => sum + level.rhombi.length, 0)}`);
    lines.push('');

    let vertexOffset = 1;

    for (const levelData of rhombiData) {
      lines.push(`# Level ${levelData.level} - ${levelData.name}`);
      lines.push(`# Faces in this level: ${levelData.rhombi.length}`);
      lines.push(`o ${levelData.name}`);
      lines.push(`g ${levelData.name}`);
      lines.push('');

      const levelVertices = [];
      const levelNormals = [];

      for (const face of levelData.rhombi) {
        for (const v of face.vertices) {
          levelVertices.push(v);
        }
      }

      lines.push(`# Vertices for ${levelData.name}`);
      for (const v of levelVertices) {
        lines.push(`v ${v.x.toFixed(6)} ${v.y.toFixed(6)} ${v.z.toFixed(6)}`);
      }
      lines.push('');

      lines.push(`# Normals for ${levelData.name}`);
      const _e1 = new THREE.Vector3();
      const _e2 = new THREE.Vector3();
      const _n  = new THREE.Vector3();
      for (const face of levelData.rhombi) {
        const v0 = face.vertices[0];
        const v1 = face.vertices[1];
        const v2 = face.vertices[2];

        _e1.subVectors(v1, v0);
        _e2.subVectors(v2, v0);
        _n.crossVectors(_e1, _e2).normalize();

        const vertexCount = face.isTriangle ? 3 : 4;
        for (let i = 0; i < vertexCount; i++) {
          levelNormals.push(_n.clone());
        }
      }

      for (const n of levelNormals) {
        lines.push(`vn ${n.x.toFixed(6)} ${n.y.toFixed(6)} ${n.z.toFixed(6)}`);
      }
      lines.push('');

      lines.push(`# Faces for ${levelData.name}`);
      let currentVertex = vertexOffset;

      for (const face of levelData.rhombi) {
        if (face.isTriangle) {
          const v1 = currentVertex;
          const v2 = currentVertex + 1;
          const v3 = currentVertex + 2;
          lines.push(`f ${v1}//${v1} ${v2}//${v2} ${v3}//${v3}`);
          currentVertex += 3;
        } else {
          const v1 = currentVertex;
          const v2 = currentVertex + 1;
          const v3 = currentVertex + 2;
          const v4 = currentVertex + 3;
          lines.push(`f ${v1}//${v1} ${v2}//${v2} ${v3}//${v3} ${v4}//${v4}`);
          currentVertex += 4;
        }
      }

      lines.push('');
      vertexOffset = currentVertex;
    }

        if (state.cutActive) {
      lines.push(`# Cut cap at level K=${state.cutLevel}`);
      lines.push(`o CutCap`);
      lines.push(`g CutCap`);
      lines.push('');

      const { N, h1, cutLevel } = state;
      const z = cutLevel * h1;

      // Radio del polígono regular de N lados para el nivel del corte
      const Rk = (state.Dmax / 2) * Math.sin((cutLevel * Math.PI) / N);

      // La tapa es un polígono regular: exportamos un solo "face" con N vértices (ngon).
      // Nota: ordenamos los vértices para que la normal apunte hacia -Z (abajo).
      const step = (2 * Math.PI) / N;
      const halfStep = Math.PI / N;
      const startAngle = -Math.PI / 2;
      const rotOffset = (cutLevel % 2 === 0) ? halfStep : 0;

      // 1) Vertices (solo anillo, sin punto central)
      lines.push(`# Cap vertices (regular N-gon)`);
      const capVertexStart = vertexOffset; // índice 1-based en OBJ
      for (let i = 0; i < N; i++) {
        const theta = startAngle + rotOffset + i * step;
        lines.push(`v ${(Rk * Math.cos(theta)).toFixed(6)} ${(Rk * Math.sin(theta)).toFixed(6)} ${z.toFixed(6)}`);
      }
      lines.push('');

      // 2) Normales (una por vértice, siguiendo el mismo esquema de índices v<->vn)
      lines.push(`# Cap normals`);
      for (let i = 0; i < N; i++) {
        lines.push(`vn 0.000000 0.000000 -1.000000`);
      }
      lines.push('');

      // 3) Cara (ngon)
      lines.push(`# Cap face (ngon)`);
      // BUG-L5: índices en orden inverso (CCW visto desde -Z) → normal -Z es correcta por regla de mano derecha
      const faceIdx = [];
      for (let i = N - 1; i >= 0; i--) {
        const vi = capVertexStart + i;
        faceIdx.push(`${vi}//${vi}`);
      }
      lines.push(`f ${faceIdx.join(' ')}`);
      lines.push('');

      vertexOffset = capVertexStart + N;
    }

    lines.push('# Export Summary');
    lines.push(`# Total Levels: ${rhombiData.length}`);
    lines.push(`# Total Faces: ${rhombiData.reduce((sum, level) => sum + level.rhombi.length, 0)}`);
    if (state.cutActive) {
      lines.push(`# Cut plane: Active at K=${state.cutLevel}`);
      lines.push(`# Geometry is closed with triangular cap`);
    }

    this.downloadOBJ(lines.join('\n'));
  }


  /**
   * Exporta la malla del zonohedro a OBJ colocando CADA cara (rombo o triángulo) en su propio grupo `g`.
   * - Un solo archivo OBJ
   * - Cada cara duplica sus vértices (simple y robusto; evita deduplicación compleja)
   * - Incluye triángulos de tapa de corte (CutCap) si el corte está activo
   */
  static exportMeshFacesGroupedToOBJ() {
    const lines = [];
    lines.push('# ZValdivia - Zonohedro Mesh OBJ (Faces Grouped)');
    lines.push(`# Generated: ${new Date().toISOString()}`);
    lines.push(`# Parameters: Dmax=${state.Dmax}, N=${state.N}, Angle=${state.aDeg}deg`);
    if (state.cutActive) lines.push(`# Cut plane active at level K=${state.cutLevel}`);
    lines.push('');

    let vOffset = 1;

    const _e1 = new THREE.Vector3();
    const _e2 = new THREE.Vector3();
    const _n  = new THREE.Vector3();

    for (const levelData of rhombiData) {
      const faces = levelData && levelData.rhombi ? levelData.rhombi : [];
      let localIdx = 0;
      for (const face of faces) {
        const isTri = !!face.isTriangle;
        const vCount = isTri ? 3 : 4;

        // Grupo por cara
        const gName = `${levelData.name || ('Level_' + levelData.level)}_${isTri ? 'tri' : 'rh'}_${localIdx++}`;
        lines.push(`g ${gName}`);

        // Vértices (duplicados por cara)
        for (let i = 0; i < vCount; i++) {
          const v = face.vertices[i];
          lines.push(`v ${v.x.toFixed(6)} ${v.y.toFixed(6)} ${v.z.toFixed(6)}`);
        }

        // Normal por vértice
        const v0 = face.vertices[0];
        const v1 = face.vertices[1];
        const v2 = face.vertices[2];
        _e1.subVectors(v1, v0);
        _e2.subVectors(v2, v0);
        _n.crossVectors(_e1, _e2).normalize();

        for (let i = 0; i < vCount; i++) {
          lines.push(`vn ${_n.x.toFixed(6)} ${_n.y.toFixed(6)} ${_n.z.toFixed(6)}`);
        }

        // Cara (v//vn), índices alineados porque duplicamos 1:1
        const idxs = [];
        for (let i = 0; i < vCount; i++) {
          const vi = vOffset + i;
          idxs.push(`${vi}//${vi}`);
        }
        lines.push(`f ${idxs.join(' ')}`);
        lines.push('');
        vOffset += vCount;
      }
    }

    // Tapa de corte como triángulos (opcional) cada uno en su grupo
    if (state.cutActive) {
      const { N, h1, cutLevel } = state;
      const z = cutLevel * h1;

      const Rk = (state.Dmax / 2) * Math.sin((cutLevel * Math.PI) / N);
      const step = (2 * Math.PI) / N;
      const halfStep = Math.PI / N;
      const startAngle = -Math.PI / 2;
      const rotOffset = (cutLevel % 2 === 0) ? halfStep : 0;

      // Centro
      const center = new THREE.Vector3(0, 0, z);
      const ring = [];
      for (let i = 0; i < N; i++) {
        const theta = startAngle + rotOffset + i * step;
        ring.push(new THREE.Vector3(Rk * Math.cos(theta), Rk * Math.sin(theta), z));
      }

      // BUG-L5 fix: normal del cap coherente con el winding de vértices.
      // El ring se construye en orden CCW visto desde +Z, por lo que por regla de la mano derecha
      // la normal apunta hacia +Z. El código anterior declaraba -Z pero el winding producía +Z.
      const capN = new THREE.Vector3(0, 0, 1);

      for (let i = 0; i < N; i++) {
        const gName = `CutCap_tri_${i}`;
        lines.push(`g ${gName}`);

        const v1 = ring[i];
        const v2 = ring[(i + 1) % N];

        // v
        for (const v of [center, v1, v2]) {
          lines.push(`v ${v.x.toFixed(6)} ${v.y.toFixed(6)} ${v.z.toFixed(6)}`);
        }
        // vn
        for (let k = 0; k < 3; k++) {
          lines.push(`vn ${capN.x.toFixed(6)} ${capN.y.toFixed(6)} ${capN.z.toFixed(6)}`);
        }
        // f
        const a = vOffset;
        const b = vOffset + 1;
        const c = vOffset + 2;
        lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
        lines.push('');
        vOffset += 3;
      }
    }

    this.downloadOBJ(lines.join('\n'));
  }


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
  }
}

/**
 * Exporta SOLO la estructura de conectores (cilindros + vigas) a OBJ.
 * Usa array de líneas + join() en lugar de concatenación para mejor rendimiento.
 */
export class StructureOBJExporter {
  static exportStructureToOBJ(structureGroup) {
    if (!structureGroup) throw new Error('No structure group');
    if (!structureGroup.children || structureGroup.children.length === 0) {
      throw new Error('Structure is empty');
    }

    structureGroup.updateMatrixWorld(true);

    const lines = [];
    lines.push('# ZValdivia - Connector Structure OBJ');
    lines.push(`# Generated: ${new Date().toISOString()}`);
    lines.push(`# Parameters: Dmax=${state.Dmax}, N=${state.N}, a=${state.aDeg}deg`);
    if (state.cutActive) lines.push(`# Cut active at K=${state.cutLevel}`);
    lines.push('');

    let vOffset = 1;
    let meshCounter = 0;

    structureGroup.traverse((child) => {
      if (!child) return;

      // ── InstancedMesh (batch de conectores) ────────────────────────────────
      if (child.isInstancedMesh && child.userData && child.userData.isConnectorBatch) {
        if (child.visible === false) return;
        try { child.updateWorldMatrix(true, false); } catch(e) {}
        const count = child.count;
        const geom = child.geometry;
        const pos = geom && geom.attributes && geom.attributes.position;
        if (!pos) return;

        for (let inst = 0; inst < count; inst++) {
          const m4 = new THREE.Matrix4();
          child.getMatrixAt(inst, m4);
          // Combinar con matrixWorld del grupo
          const worldM4 = child.matrixWorld.clone().multiply(m4);

          const instVerts = [];
          for (let vi = 0; vi < pos.count; vi++) {
            const p = new THREE.Vector3().fromBufferAttribute(pos, vi).applyMatrix4(worldM4);
            instVerts.push(p);
          }

          const instName = `connector_inst_${meshCounter++}`;
          lines.push(`o ${instName}`);
          lines.push(`g ${instName}`);
          for (const p of instVerts) {
            lines.push(`v ${p.x.toFixed(6)} ${p.y.toFixed(6)} ${p.z.toFixed(6)}`);
          }
          lines.push('');

          const idx = geom.index;
          if (idx && idx.count >= 3) {
            for (let i = 0; i < idx.count; i += 3) {
              lines.push(`f ${vOffset + idx.getX(i)} ${vOffset + idx.getX(i+1)} ${vOffset + idx.getX(i+2)}`);
            }
          } else {
            for (let i = 0; i + 2 < instVerts.length; i += 3) {
              lines.push(`f ${vOffset + i} ${vOffset + i + 1} ${vOffset + i + 2}`);
            }
          }
          lines.push('');
          vOffset += instVerts.length;
        }
        return;
      }

      if (!child.isMesh) return;
      if (child.userData && child.userData.isBeamEdge) return; // skip edge-only lines
      if (child.visible === false) return; // skip hidden meshes (orphan connectors, etc.)
      const mesh = child;
      const name = (mesh.name && mesh.name.trim()) ? mesh.name : `mesh_${meshCounter++}`;
      lines.push(`o ${name}`);
      lines.push(`g ${name}`);

      // Pletinas: geometría en espacio structureGroup, exportar igual que cualquier mesh
      if (mesh.userData && mesh.userData.isPlate) {
        try { mesh.updateWorldMatrix(true, false); } catch(e) {}
        const gd = mesh.geometry && mesh.geometry.userData;
        if (gd && Array.isArray(gd.objVertices) && Array.isArray(gd.objFaces)) {
          for (const v of gd.objVertices) {
            const w = v.clone().applyMatrix4(mesh.matrixWorld);
            lines.push(`v ${w.x.toFixed(6)} ${w.y.toFixed(6)} ${w.z.toFixed(6)}`);
          }
          lines.push('');
          for (const face of gd.objFaces) {
            lines.push(`f ${face.map(vi => vOffset + vi).join(' ')}`);
          }
          lines.push('');
          vOffset += gd.objVertices.length;
        }
        return;
      }

      const verts = [];
      const ud = mesh && mesh.userData ? mesh.userData : null;
      const hasObjFaces = !!ud && Array.isArray(ud.objFaces) && Array.isArray(ud.objVertices);

      if (hasObjFaces) {
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
        lines.push(`v ${p.x.toFixed(6)} ${p.y.toFixed(6)} ${p.z.toFixed(6)}`);
      }
      lines.push('');

      if (hasObjFaces) {
        const faces = (Array.isArray(mesh.userData.objFaces) && mesh.userData.objFaces.length)
          ? mesh.userData.objFaces
          : (Array.isArray(mesh.userData.objQuads) ? mesh.userData.objQuads : []);
        for (const face of faces) {
          if (!face || !face.length) continue;
          lines.push(`f ${face.map((vi) => vOffset + vi).join(' ')}`);
        }
        lines.push('');
        vOffset += verts.length;
        return;
      }

      const geom = mesh.geometry;
      const idx = geom && geom.index ? geom.index : null;
      if (idx && idx.count >= 3) {
        for (let i = 0; i < idx.count; i += 3) {
          lines.push(`f ${vOffset + idx.getX(i)} ${vOffset + idx.getX(i + 1)} ${vOffset + idx.getX(i + 2)}`);
        }
        lines.push('');
        vOffset += verts.length;
        return;
      }

      for (let i = 0; i + 2 < verts.length; i += 3) {
        lines.push(`f ${vOffset + i} ${vOffset + i + 1} ${vOffset + i + 2}`);
      }
      lines.push('');
      vOffset += verts.length;
    });

    this._downloadOBJ(lines.join('\n'));
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
