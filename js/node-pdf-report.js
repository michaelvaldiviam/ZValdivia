import { state } from './state.js';
import { NodeAnalyzer } from './node-analyzer.js';

/**
 * Reporte PDF: 1 pagina por nodo (un vertice representativo por nivel K visible),
 * incluyendo:
 * - Nombre del nodo + nivel K visible
 * - Tabla de aristas salientes con conectividad
 * - Angulos azimutales y separaciones (en el plano perpendicular al vector directriz)
 * - (Opcional) diagrama de proyeccion para orientar el conector
 *
 * Requiere jsPDF cargado (window.jspdf).
 */
export class NodePDFReporter {
  // Detecta si las keys de conectores (k#, X:#) vienen ya re-indexadas a niveles visibles con corte activo.
  static _initKeySpace(structureGroup) {
    this._keysAreVisible = null;
    const cutActive = !!state.cutActive;
    const cutLevel = Number.isFinite(state.cutLevel) ? state.cutLevel : 0;
    if (!cutActive || !structureGroup || typeof structureGroup.traverse !== "function") {
      this._keysAreVisible = false;
      return;
    }
    let minK = Infinity;
    let sawAny = false;
    structureGroup.traverse((obj) => {
      const info = (obj && obj.userData && obj.userData.beamInfo) ? obj.userData.beamInfo : null;
      if (!info) return;
      const keys = [info.aKey, info.bKey];
      for (const key of keys) {
        if (typeof key !== "string") continue;
        let m = /^k(\d+)_i\d+$/i.exec(key);
        if (m) { sawAny = true; minK = Math.min(minK, Number(m[1])); continue; }
        m = /^X:(\d+):\d+$/i.exec(key);
        if (m) { sawAny = true; minK = Math.min(minK, Number(m[1])); continue; }
      }
    });
    if (!sawAny) { this._keysAreVisible = false; return; }
    this._keysAreVisible = (minK <= 0 || minK < cutLevel);
  }

static shortTargetLabel(e) {
    // En el PDF de conectores, el nombre es SOLO el nivel visible: k0, k1, ...
    if (e && e.toDisplayId && String(e.toDisplayId).startsWith('X:')) return 'X';
    if (e && Number.isFinite(e.toVisibleKIndex)) return `k${e.toVisibleKIndex}`;
    const id = (e && e.toDisplayId) ? String(e.toDisplayId) : String((e && e.to) ? e.to : '');
    return id;
  }
  static mm(v, decimals = 3) {
    return (typeof v === 'number' ? v.toFixed(decimals) : String(v));
  }



  // -----------------------------
  // Stats de conectores basados en la estructura (vigas reales en escena)
  // -----------------------------
  static _toVisibleK(kFromKey) {
    const cutActive = !!state.cutActive;
    const cutLevel = Number.isFinite(state.cutLevel) ? state.cutLevel : 0;
    if (!cutActive) return kFromKey;
    const keysVisible = (NodePDFReporter._keysAreVisible === true);
    return keysVisible ? kFromKey : (kFromKey - cutLevel);
  }
static _parseConnectorKey(key) {
    if (typeof key !== 'string') return null;
    if (key === 'pole_low') return { type: 'pole', pole: 'low', k: 0, i: null };
    if (key === 'pole_top') return { type: 'pole', pole: 'top', k: state.N, i: null };

    let m = /^k(\d+)_i(\d+)$/i.exec(key);
    if (m) return { type: 'k', k: Number(m[1]), i: Number(m[2]) };

    m = /^X:(\d+):(\d+)$/i.exec(key);
    if (m) return { type: 'X', k: Number(m[1]), i: Number(m[2]) };

    return null;
  }

  static _displayKeyVisible(key) {
    const p = this._parseConnectorKey(key);
    if (!p) return String(key || '');
    if (p.type === 'pole') return p.pole === 'low' ? 'pole_low' : 'pole_top';
    const kVis = this._toVisibleK(p.k);
    if (p.type === 'X') return `X:${kVis}:${p.i}`;
    return `k${kVis}_i${p.i}`;
  }

    static _computeConnectorStatsFromStructure(structureGroup) {
    // Estadísticas basadas en la ESTRUCTURA REAL (lo que se ve en el 3D):
    // - Construimos adyacencia desde beamInfo.
    // - Clasificamos conectores por FIRMA de conectividad (no solo por grado).
    // - Por cada nivel kVisible, definimos el "baseline" como la MODA de firmas.
    // - Normales = firma == baseline; Modificados = firma != baseline (se descuentan y van al anexo).
    const stats = {
      byLevel: new Map(),             // Map<kVis, { baselineSig, baselineCount, total, modified, normal }>
      modifiedConnectors: [],         // Array<{ keyVisible, kVis, i, degree, signature, baselineSig, neighborsVisible: [] }>
      signatureByKey: new Map()       // Map<keyVisible, signature>
    };

    const N = state.N;
    const cutActive = !!state.cutActive;
    const cutLevel = Number.isFinite(state.cutLevel) ? state.cutLevel : 0;
    const visibleLevels = cutActive ? (N - cutLevel) : N; // incluye polo superior (k=visibleLevels)

    // 1) Adyacencia desde structureGroup (keys VISIBLES)
    const built = NodeAnalyzer.buildConnectivityFromStructure(structureGroup);
    const adj = (built && built.vertexToNeighbors) ? built.vertexToNeighbors : new Map();

    const keyK = function(kVis, i) { return 'k' + kVis + '_i' + i; };
    const isPoleLevel = function(kVis) { return ((kVis === 0 && !cutActive) || (kVis === visibleLevels)); };

    const parseKVis = function(key) {
      if (typeof key !== 'string') return null;
      var m = /^k(\d+)_i(\d+)$/.exec(key);
      if (m) return parseInt(m[1], 10);
      m = /^X:(\d+):(\d+)$/.exec(key);
      if (m) return parseInt(m[1], 10);
      return null;
    };

    const signatureFor = function(uKey) {
      var uK = parseKVis(uKey);
      var neighSet = adj.get(uKey);
      var tags = [];
      if (neighSet) {
        var neigh = Array.from(neighSet);
        for (var j = 0; j < neigh.length; j++) {
          var vKey = neigh[j];
          if (typeof vKey !== 'string') continue;
          if (vKey.indexOf('X:') === 0) {
            tags.push('X');
          } else {
            var vK = parseKVis(vKey);
            if (uK === null || vK === null) {
              // fallback por tipo
              tags.push('U');
            } else {
              var dk = vK - uK;
              // etiqueta canonica por delta de nivel visible
              tags.push('dk' + (dk >= 0 ? ('+' + dk) : String(dk)));
            }
          }
        }
      }
      tags.sort();
      return tags.join('|'); // firma invariante por rotación
    };

    const mode = function(arr) {
      var freq = new Map();
      for (var i = 0; i < arr.length; i++) {
        var v = arr[i];
        freq.set(v, (freq.get(v) || 0) + 1);
      }
      var bestVal = (arr.length ? arr[0] : '');
      var bestN = -1;
      freq.forEach(function(n, val) {
        if (n > bestN) { bestN = n; bestVal = val; }
      });
      return bestVal;
    };

    // 2) Por nivel visible, construir el universo de conectores externos (incluye polos)
    for (var kVis = 0; kVis <= visibleLevels; kVis++) {
      var total = isPoleLevel(kVis) ? 1 : N;
      var keys = [];
      for (var i = 0; i < total; i++) keys.push(keyK(kVis, i));

      // Solo consideramos conectores VISIBLES (grado > 0). Los conectores ocultos (grado 0)
      // NO deben aparecer en el PDF (ni afectar baseline/normal/modificado).
      var visibleKeys = [];
      var visibleSigs = [];
      var visibleDegs = [];

      for (var ii = 0; ii < keys.length; ii++) {
        var k = keys[ii];
        var deg = (adj.get(k) ? adj.get(k).size : 0);
        // Guardamos firma por compatibilidad/debug, pero si deg==0 se excluye del reporte.
        var sigAny = signatureFor(k);
        stats.signatureByKey.set(k, sigAny);
        if (deg <= 0) continue;

        visibleKeys.push(k);
        visibleSigs.push(sigAny);
        visibleDegs.push(deg);
      }

      // Si no hay conectores visibles en este nivel, omitimos el nivel en el reporte.
      if (visibleKeys.length === 0) {
        stats.byLevel.set(kVis, {
          baselineSig: null,
          baselineCount: 0,
          total: 0,
          modified: 0,
          normal: 0
        });
        continue;
      }

      var baselineSig = mode(visibleSigs);
      var baselineCount = 0;
      var modifiedItems = [];

      for (var iii = 0; iii < visibleKeys.length; iii++) {
        var kk = visibleKeys[iii];
        var sigk = visibleSigs[iii];
        var degk = visibleDegs[iii];
        if (sigk === baselineSig) baselineCount++;
        else {
          // índice i real (si aplica)
          var miMatch = /^k\d+_i(\d+)$/.exec(kk);
          var iIndex = miMatch ? parseInt(miMatch[1], 10) : iii;
          modifiedItems.push({ keyVisible: kk, kVis: kVis, i: iIndex, degree: degk, signature: sigk });
        }
      }

      stats.byLevel.set(kVis, {
        baselineSig: baselineSig,
        baselineCount: baselineCount,
        total: visibleKeys.length,     // total de conectores VISIBLES
        modified: modifiedItems.length,
        normal: baselineCount
      });

      for (var mi = 0; mi < modifiedItems.length; mi++) {
        var it = modifiedItems[mi];
        var neighArr = adj.get(it.keyVisible) ? Array.from(adj.get(it.keyVisible)) : [];
        neighArr.sort();
        stats.modifiedConnectors.push({
          keyVisible: it.keyVisible,
          kVis: it.kVis,
          i: it.i,
          degree: it.degree,
          signature: it.signature,
          baselineSig: baselineSig,
          neighborsVisible: neighArr
        });
      }
    }

    stats.modifiedConnectors.sort(function(a, b) { return (a.kVis - b.kVis) || (a.i - b.i); });
    return stats;
  }


  // -----------------------------
  // Construcción de nodos 100% desde la estructura real (infalible)
  // -----------------------------
  static _buildNodesFromStructure(structureGroup, connectorStats) {
    const built = NodeAnalyzer.buildConnectivityFromStructure(structureGroup);
    const adj = (built && built.vertexToNeighbors) ? built.vertexToNeighbors : new Map();
    const meta = (built && built.meta) ? built.meta : { keysAreVisible: false, kShift: 0 };

    const N = state.N;
    const cutActive = !!state.cutActive;
    const cutLevel = Number.isFinite(state.cutLevel) ? state.cutLevel : 0;
    const visibleLevels = cutActive ? (N - cutLevel) : N;

    const keyK = (kVis, i) => `k${kVis}_i${i}`;
    const isPoleLevel = (kVis) => ((kVis === 0 && !cutActive) || (kVis === visibleLevels));

    const makeNode = (uKey, baselineDeg, displayOverride) => {
      const upos = NodeAnalyzer.getPositionByKeyVisible(uKey, meta);
      const neigh = adj.get(uKey) ? Array.from(adj.get(uKey)) : [];

      // vector directriz: suma de direcciones
      const dirs = [];
      for (const vKey of neigh) {
        const vpos = NodeAnalyzer.getPositionByKeyVisible(vKey, meta);
        if (!upos || !vpos) continue;
        const dx = vpos.x - upos.x;
        const dy = vpos.y - upos.y;
        const dz = vpos.z - upos.z;
        const L = Math.hypot(dx, dy, dz) || 1;
        dirs.push({ to: vKey, x: dx / L, y: dy / L, z: dz / L });
      }

      let dirSum = { x: 0, y: 0, z: 0 };
      for (const d of dirs) { dirSum.x += d.x; dirSum.y += d.y; dirSum.z += d.z; }
      const sL = Math.hypot(dirSum.x, dirSum.y, dirSum.z) || 1;
      const directive = { x: dirSum.x / sL, y: dirSum.y / sL, z: dirSum.z / sL };

      // --- Base local del conector (vista desde el exterior) ---
      //
      // Caso 1 — POLOS (radio ≈ 0):
      //   Vista de planta (paraguas). Se mira desde afuera del polo, es decir:
      //   - Polo superior (kVis = visibleLevels): vista desde arriba (+Z). right=+X, up=+Y.
      //   - Polo inferior real (kVis = 0, sin corte): vista desde abajo (-Z). right=+X, up=-Y
      //     (espejo de Y para mantener la chirality correcta al mirar desde -Z).
      //   En ambos casos az = atan2(localUp, localRight) = atan2(±dy, dx), dando un
      //   diagrama de "paraguas" visto de planta con las vigas como radios.
      //
      // Caso 2 — NIVELES INTERMEDIOS (radio > 0):
      //   Vista desde el exterior de la superficie del zonohedro.
      //   right_view = tangente horaria (CW) en XY = (sin θ, -cos θ, 0)
      //   up_view    = eje Z global               = (0, 0, 1)
      //   az = atan2(dz, d·tangente_CW)

      const rxy = upos ? Math.hypot(upos.x, upos.y) : 0;
      const isPole = rxy < 1e-6;

      // Determinar si este polo es el superior o el inferior
      let poleIsTop = false;
      if (isPole && upos) {
        // El polo superior tiene z > 0; el inferior tiene z ≈ 0 (o muy pequeño)
        poleIsTop = (upos.z > 0.001);
      }

      // Construir edges con azimut proyectado en marco local y separaciones
      const edges = dirs.map(d => {
        let az;
        if (isPole) {
          // Polo: vista de planta con eje Z del conector como eje de visión.
          // Ambos polos (superior e inferior) se ven igual desde su eje:
          // proyectamos directamente en XY global → atan2(dy, dx).
          // El polo inferior tiene Z apuntando hacia abajo en el mundo,
          // el superior hacia arriba — pero el diagrama de agujeros es el mismo
          // en ambos casos (paraguas visto desde el eje).
          az = Math.atan2(d.y, d.x) * 180 / Math.PI;
        } else {
          // Vista lateral desde el exterior: plano (tangente_CW, Z)
          const cosT = upos.x / rxy;
          const sinT = upos.y / rxy;
          // Tangente horaria (CW visto desde +Z): (sin θ, -cos θ, 0)
          const localRight =  d.x * sinT + d.y * (-cosT); // d · tangente_CW
          const localUp    =  d.z;                          // componente vertical
          az = Math.atan2(localUp, localRight) * 180 / Math.PI;
        }
        if (az < 0) az += 360;

        let toVisibleKIndex = null;
        let toDisplayId = String(d.to);
        if (typeof d.to === 'string') {
          let m = /^k(\d+)_i(\d+)$/.exec(d.to);
          if (m) {
            toVisibleKIndex = parseInt(m[1], 10);
            toDisplayId = `k${toVisibleKIndex}`;
          } else {
            m = /^X:(\d+):(\d+)$/.exec(d.to);
            if (m) {
              toVisibleKIndex = parseInt(m[1], 10);
              toDisplayId = d.to; // mantener X completo
            }
          }
        }

        const dot = (d.x * directive.x + d.y * directive.y + d.z * directive.z);
        const clamped = Math.max(-1, Math.min(1, dot));
        const angd = Math.acos(clamped) * 180 / Math.PI;

        return {
          to: d.to,
          toDisplayId,
          toVisibleKIndex,
          azimuthDeg: az,
          angleToDirectiveDeg: angd,
          separationToNextDeg: null
        };
      }).sort((a, b) => (a.azimuthDeg - b.azimuthDeg));

      for (let i = 0; i < edges.length; i++) {
        const cur = edges[i];
        const nxt = edges[(i + 1) % edges.length];
        let sep = (nxt.azimuthDeg - cur.azimuthDeg);
        if (i === edges.length - 1) sep = (nxt.azimuthDeg + 360) - cur.azimuthDeg;
        cur.separationToNextDeg = sep;
      }

      // kVisible del nodo
      let visibleKIndex = null;
      if (typeof uKey === 'string') {
        let m = /^k(\d+)_i(\d+)$/.exec(uKey);
        if (m) visibleKIndex = parseInt(m[1], 10);
        else {
          m = /^X:(\d+):(\d+)$/.exec(uKey);
          if (m) visibleKIndex = parseInt(m[1], 10);
        }
      }

      const displayId = (displayOverride != null) ? displayOverride : (uKey && uKey.startsWith('X:') ? uKey : `k${visibleKIndex}`);

      return {
        id: uKey,
        displayId,
        visibleKIndex,
        k: visibleKIndex,
        pos: upos,
        degree: edges.length,
        baselineDegree: (baselineDeg == null ? null : baselineDeg),
        edges
      };
    };

    // 1) Nodos representativos por nivel
    const nodes = [];
    for (let kVis = 0; kVis <= visibleLevels; kVis++) {
      const total = isPoleLevel(kVis) ? 1 : N;

      const levelInfo = (connectorStats && connectorStats.byLevel && connectorStats.byLevel.has(kVis))
        ? connectorStats.byLevel.get(kVis)
        : null;

      // Si este nivel no tiene conectores visibles (grado 0 ocultos), no generamos página.
      if (!levelInfo || !levelInfo.total || levelInfo.total <= 0) {
        continue;
      }

      const baselineSig = levelInfo.baselineSig || '';

      // Elegir un conector VISIBLE cuya firma == baselineSig.
      let chosen = null;
      for (let i = 0; i < total; i++) {
        const key = keyK(kVis, i);
        const deg = adj.get(key) ? adj.get(key).size : 0;
        if (deg <= 0) continue; // oculto => no entra al PDF
        const sig = (connectorStats && connectorStats.signatureByKey) ? connectorStats.signatureByKey.get(key) : null;
        if (sig !== null && sig !== undefined) {
          if (sig === baselineSig) { chosen = key; break; }
        } else if (!chosen) {
          chosen = key;
        }
      }

      // Fallback: primer conector visible del nivel
      if (!chosen) {
        for (let i = 0; i < total; i++) {
          const key = keyK(kVis, i);
          const deg = adj.get(key) ? adj.get(key).size : 0;
          if (deg > 0) { chosen = key; break; }
        }
      }
      if (!chosen) continue;

      const baselineDeg = adj.get(chosen) ? adj.get(chosen).size : 0;
      nodes.push(makeNode(chosen, baselineDeg, `k${kVis}`));
    }

    return { nodes, adj, meta, makeNode };
  }
  static async generateNodeReport(_structureGroup, _sceneManager) {
    NodePDFReporter._initKeySpace(_structureGroup);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Construimos stats y nodos desde la estructura real (lo que se ve en el 3D)
    const data = {};

    // Params desde estado
    const visibleLevels = state.cutActive ? (state.N - (Number.isFinite(state.cutLevel) ? state.cutLevel : 0)) : state.N;
    data.params = {
      N: state.N,
      Dmax: state.Dmax,
      floorDiameter: state.floorDiameter || 0,
      visibleLevels,
      visibleHeight: visibleLevels * state.h1,
      aDeg: state.aDeg,
      cutActive: !!state.cutActive,
      cutLevel: Number.isFinite(state.cutLevel) ? state.cutLevel : 0,
    };

    data.connectorStats = this._computeConnectorStatsFromStructure(_structureGroup);
    const builtNodes = this._buildNodesFromStructure(_structureGroup, data.connectorStats);
    data.nodes = builtNodes.nodes;
    data._makeNode = builtNodes.makeNode;

    // Portada
    this.addCover(doc, data);

    for (let idx = 0; idx < data.nodes.length; idx++) {
      doc.addPage();
      this.addNodePage(doc, data, data.nodes[idx], idx + 1);
    }

    // Anexo: conectores modificados (tienen grado distinto al baseline del nivel)
    if (data.connectorStats && Array.isArray(data.connectorStats.modifiedConnectors) && data.connectorStats.modifiedConnectors.length > 0) {
      // Páginas individuales
      for (let j = 0; j < data.connectorStats.modifiedConnectors.length; j++) {
        doc.addPage();
        this._addModifiedConnectorPage(doc, data, data.connectorStats.modifiedConnectors[j], j + 1, data.connectorStats.modifiedConnectors.length, _structureGroup);
      }
    }

    const filename = `Nodos_Conector_ZValdivia_N${state.N}_a${state.aDeg.toFixed(2)}.pdf`;
    doc.save(filename);
    console.log('  PDF de nodos generado');
  }

  static addCover(doc, data) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('ZValdivia - Reporte de Nodos (Conectores)', 105, 30, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);

     const z = (data && data.params) ? data.params : { N: state.N, Dmax: state.Dmax, floorDiameter: state.floorDiameter||0, visibleLevels: (state.cutActive ? (state.N - (Number.isFinite(state.cutLevel)?state.cutLevel:0)) : state.N), visibleHeight: ((state.cutActive ? (state.N - (Number.isFinite(state.cutLevel)?state.cutLevel:0)) : state.N) * state.h1), aDeg: state.aDeg, cutActive: !!state.cutActive, cutLevel: Number.isFinite(state.cutLevel)?state.cutLevel:0 };
    const kVis = z.visibleLevels; // cantidad de niveles K visibles (incluye polo superior)
    const lines = [
      `N = ${z.N}`,
      `K visibles = ${kVis}`,
      `Dmax = ${this.mm(z.Dmax, 3)} m`,
      `Diametro del piso = ${this.mm(z.floorDiameter || 0, 3)} m`,
      `Altura total visible = ${this.mm(z.visibleHeight, 3)} m`,
      `Angulo a = ${this.mm(z.aDeg, 2)}°`,
      // Mostrar solo niveles visibles (K). Con corte activo, el suelo visible se considera K=0.
      z.cutActive ? 'Corte activo: suelo en K=0 (vista: z=0)' : 'Corte inactivo',
    ];

    let y = 55;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Datos del zonohedro', 20, y);
    y += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    lines.forEach(t => {
      doc.text(t, 24, y);
      y += 7;
    });

    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Creador', 20, y);
    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text('Michael Valdivia', 24, y); y += 7;
    doc.text('michaelvaldiviamunoz@gmail.com', 24, y); y += 7;
    doc.text('Chile', 24, y); y += 7;

    // Nota: Portada sin texto explicativo adicional (solo variables y autor).

    let _y = y; // preserve variable for consistency
    // (no extra lines rendering) 
    return; 

  }

  static addNodePage(doc, data, node, pageIndex) {
    const margin = 14;
    const W = 210, H = 297;
    const x0 = margin, y0 = margin;

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`Conector ${node.displayId || node.id}`, x0, y0);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const kLabel = `Nivel: k${node.visibleKIndex}`;
    // No mostrar "K original" para evitar confusión; el reporte trabaja con niveles visibles.
    const extra = '';
    doc.text(`${kLabel}${extra}`, x0, y0 + 6);

    // Cantidad de conectores
    // Regla robusta (coherente con el 3D):
    // - Conectores X (interseccion): 1
    // - Polos visibles: 1 (k=0 SOLO si no hay corte; y k=KmaxVisible siempre)
    // - Niveles normales (incluye k=0 cuando hay corte activo): N menos los modificados (según stats)
    let qty = data.params.N;
    const isX = (node && typeof node.id === 'string' && node.id.indexOf('X:') === 0);
    const cutActive = !!data.params.cutActive;
    const kMaxVis = Number.isFinite(data.params.visibleLevels) ? data.params.visibleLevels : data.params.N;

    if (isX) {
      qty = 1;
    } else if (!cutActive && node.k === 0) {
      // polo inferior real (sin corte)
      qty = 1;
    } else if (node.k === kMaxVis) {
      // polo superior visible
      qty = 1;
    } else {
      // nivel normal (incluye k=0 con corte activo)
      const kVis = Number.isFinite(node.visibleKIndex) ? node.visibleKIndex : (Number.isFinite(node.k) ? node.k : null);
      const stats = (data && data.connectorStats && data.connectorStats.byLevel) ? data.connectorStats.byLevel : null;
      if (kVis != null && stats && stats.has(kVis)) {
        qty = stats.get(kVis).normal;
      } else {
        qty = data.params.N;
      }
    }

    doc.setFontSize(10);
    doc.text(`Cantidad conector: ${qty}`, x0, y0 + 14);

    // Reservamos espacio superior (sin imprimir directriz/normales)
    const normals = node.incidentFaceNormalsInward || [];
    let ny = y0 + 20;

    // Diagrama (proyeccion) - caja superior derecha
    const diagramX = 120, diagramY = y0 + 18;

    // Tamano adaptativo (evita apretar demasiado cuando hay mucho texto)
    let diagramSize = 64;
    const edgeCount = (node.edges || []).length;
    if (edgeCount > 10 || normals.length > 4) diagramSize = 56;
    if (edgeCount > 14) diagramSize = 50;

    this.drawEdgeDiagram(doc, node, diagramX, diagramY, diagramSize);

    // Tabla de aristas - comienza debajo de lo que termine mas abajo (normales o diagrama)
    const diagramBottom = diagramY + diagramSize;
    const tableTop = Math.max(ny + 8, diagramBottom + 6);
    this.drawEdgesTable(doc, node, x0, tableTop, W - 2 * margin);
  }

  static drawEdgeDiagram(doc, node, x, y, size) {
    const cx = x + size / 2;
    const cy = y + size / 2;
    const R = size * 0.40;

    doc.setDrawColor(40);
    doc.setLineWidth(0.3);

    // Sin marco (evita "recuadro" alrededor del conector)
    // Circulo guia
    doc.circle(cx, cy, R, 'S');

    // Determinar si este nodo es un polo (radio ≈ 0 en XY)
    const nodePos = node.pos;
    const nodeRxy = nodePos ? Math.hypot(nodePos.x || 0, nodePos.y || 0) : 0;
    const nodeIsPole = nodeRxy < 1e-6;
    const nodeIsTopPole = nodeIsPole && nodePos && (nodePos.z > 0.001);

    // Título del diagrama: indica el tipo de vista
    const diagramLabel = nodeIsPole
      ? (nodeIsTopPole ? 'Planta polo superior' : 'Planta polo inferior')
      : 'Proyeccion (exterior)';

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(diagramLabel, cx, y - 2, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    const edges = node.edges || [];
    const n = edges.length;

    // Prepara angulos (azimuth) y ordena para una lectura consistente.
    const fallbackAngles = [];
    for (let i = 0; i < n; i++) fallbackAngles.push((360 * i) / Math.max(1, n));

    const items = edges.map((e, i) => {
      const ang = (typeof e.azimuthDeg === 'number') ? e.azimuthDeg : fallbackAngles[i];
      return { e, ang };
    }).sort((a, b) => a.ang - b.ang);

    // Rotacion canónica del diagrama:
    // - Polos: sin rotación (los radios ya están en el plano XY correcto).
    // - Niveles intermedios: rotar para que las conexiones dk>0 queden arriba.
    var rotDeg = 0;
    if (!nodeIsPole) {
      var targetUpDeg = 90;
      var sumCos = 0, sumSin = 0, hasUp = false;
      var kU = (node && typeof node.visibleKIndex === 'number') ? node.visibleKIndex : null;
      for (var ri = 0; ri < items.length; ri++) {
        var it = items[ri];
        var toK = (it && it.e && typeof it.e.toVisibleKIndex === 'number') ? it.e.toVisibleKIndex : null;
        if (kU != null && toK != null) {
          var dk = toK - kU;
          if (dk > 0) {
            var w = dk; if (w < 1) w = 1;
            var rad0 = (it.ang * Math.PI) / 180;
            sumCos += w * Math.cos(rad0);
            sumSin += w * Math.sin(rad0);
            hasUp = true;
          }
        }
      }
      if (hasUp) {
        var theta = Math.atan2(sumSin, sumCos) * 180 / Math.PI;
        if (theta < 0) theta += 360;
        rotDeg = targetUpDeg - theta;
      }
    }

    // Aplica rotacion solo al diagrama (no cambia los datos del nodo)
    for (var rj = 0; rj < items.length; rj++) {
      var a = items[rj].ang + rotDeg;
      a = ((a % 360) + 360) % 360;
      items[rj].angRot = a;
    }
    items.sort(function(a, b) { return a.angRot - b.angRot; });


    // 1) Dibuja rayos + etiquetas de conectividad
    for (let i = 0; i < items.length; i++) {
      const e = items[i].e;
      const ang = (typeof items[i].angRot === 'number') ? items[i].angRot : items[i].ang;
      const rad = (ang * Math.PI) / 180;

      const x2 = cx + R * Math.cos(rad);
      const y2 = cy - R * Math.sin(rad);

      doc.line(cx, cy, x2, y2);

      const label = this.shortTargetLabel(e);
      const lx = cx + (R + 6) * Math.cos(rad);
      const ly = cy - (R + 6) * Math.sin(rad);

      doc.text(label, lx, ly, { align: 'center' });
    }

    // 2) Angulos   entre aristas: dibujar el valor en el medio de cada par consecutivo
    // (en el mismo orden azimutal usado para separacionToNextDeg)
    if (items.length >= 2) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);

      const rText = R * 0.62; // dentro del circulo para evitar chocar con etiquetas

      for (let i = 0; i < items.length; i++) {
        const cur = items[i];
        const nxt = items[(i + 1) % items.length];

        // Usar los angulos ROTADOS (mismo orden visual que los rayos)
        let a1 = (typeof cur.angRot === 'number') ? cur.angRot : cur.ang;
        let a2 = (typeof nxt.angRot === 'number') ? nxt.angRot : nxt.ang;

        // Normalizar para que a2 quede "después" de a1 en sentido horario
        if (a2 < a1) a2 += 360;

        const mid = (a1 + a2) / 2;
        const midRad = (mid * Math.PI) / 180;

        // Separación angular real entre rayos (invariante a la rotación)
        let sep = null;
        if (typeof cur.e.separationToNextDeg === 'number') sep = cur.e.separationToNextDeg;
        else sep = (a2 - a1);

        const text = `${sep.toFixed(1)}°`;

        const tx = cx + rText * Math.cos(midRad);
        const ty = cy - rText * Math.sin(midRad);

        // "halo" blanco para legibilidad sobre lineas
        doc.setFillColor(255);
        doc.circle(tx, ty, 2.7, 'F');
        doc.setTextColor(0);
        doc.text(text, tx, ty + 0.7, { align: 'center' });
      }
    }

    // Centro del nodo
    doc.setFillColor(0);
    doc.setTextColor(0);
    doc.circle(cx, cy, 1.2, 'F');
  }


  static drawEdgesTable(doc, node, x, y, width) {
    const col = {
      idx: x,
      to: x + 14,
      k: x + 44,
      az: x + 64,
      sep: x + 84,
      angd: x + 104,
    };

    const rowH = 5.5;
    const maxRows = 28; // compacto: entra en A4
    const edges = node.edges || [];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Aristas salientes (conectividad y angulos)', x, y);

    y += 6;
    doc.setFontSize(8);

    // Header row
    doc.text('#', col.idx, y);
    doc.text('Conecta a', col.to, y);
    doc.text('Nivel dest', col.k, y);
    doc.text('Az[°]', col.az, y);
    doc.text(' [°]', col.sep, y);
    doc.text('Ang(d)[°]', col.angd, y);

    doc.setLineWidth(0.2);
    doc.line(x, y + 1.5, x + width, y + 1.5);

    doc.setFont('helvetica', 'normal');
    let yy = y + 6;

    for (let i = 0; i < Math.min(edges.length, maxRows); i++) {
      const e = edges[i];
      const az = (typeof e.azimuthDeg === 'number') ? this.mm(e.azimuthDeg, 1) : '-';
      const sep = (typeof e.separationToNextDeg === 'number') ? this.mm(e.separationToNextDeg, 1) : '-';

      doc.text(String(i + 1), col.idx, yy);
      doc.text(String(((e.toDisplayId !== undefined && e.toDisplayId !== null) ? e.toDisplayId : e.to)), col.to, yy);
      const kdest = Number.isFinite(e.toVisibleKIndex) ? `k${e.toVisibleKIndex}` : String(((e.toK !== undefined && e.toK !== null) ? e.toK : '-'));
      doc.text(kdest, col.k, yy);
      doc.text(String(az), col.az, yy);
      doc.text(String(sep), col.sep, yy);
      const angd = (typeof e.angleToDirectiveDeg === 'number') ? this.mm(e.angleToDirectiveDeg, 1) : '-';
      doc.text(String(angd), col.angd, yy);

      yy += rowH;

      // Linea suave cada 5 filas
      if ((i + 1) % 5 === 0) {
        doc.setDrawColor(220);
        doc.line(x, yy - 3.5, x + width, yy - 3.5);
        doc.setDrawColor(40);
      }
    }

    // (Sin nota al pie)
  }


  // -----------------------------
  // Anexo: conectores modificados
  // -----------------------------
  static _addModifiedConnectorsCover(doc, stats) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('ANEXO - Conectores modificados', 105, 30, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Estos conectores NO se contabilizan en el conteo simétrico por nivel (porque su conectividad difiere).', 20, 45);

    let y = 60;
    doc.setFont('helvetica', 'bold');
    doc.text('Resumen por nivel visible', 20, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    const rows = [];
    for (const [kVis, rec] of stats.byLevel.entries()) {
      if (!rec || !Number.isFinite(rec.modified) || rec.modified <= 0) continue;
      rows.push({ kVis, rec });
    }
    rows.sort((a, b) => a.kVis - b.kVis);

    rows.forEach(r => {
      const { kVis, rec } = r;
      doc.text(`k${kVis}: total=${rec.total}, baseline=${rec.baselineCount}, modificados=${rec.modified}, normales=${rec.normal}`, 20, y);
      y += 6;
      if (y > 270) {
        doc.addPage();
        y = 30;
      }
    });

    if (rows.length === 0) {
      doc.text('No se detectaron conectores modificados.', 20, y);
    }
  }

  static _addModifiedConnectorPage(doc, data, item, idx, total, structureGroup) {
    // Intentar dibujar el conector completo (igual que una pagina normal),
    // usando el nodo real del conector (k#_i#) en niveles visibles.
    const baseline = null;
    const node = (data && typeof data._makeNode === 'function') ? data._makeNode(item.keyVisible, baseline, item.keyVisible) : null;

    // Header especial
    const margin = 14;
    const x0 = margin, y0 = margin;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`Conector modificado (${idx}/${total})`, 105, 18, { align: 'center' });

    doc.setFontSize(12);
    doc.text(`${item.keyVisible}`, x0, y0 + 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Nivel visible: k${item.kVis}`, x0, y0 + 26);
    doc.text(`Grado: ${item.degree}`, x0, y0 + 32);
    doc.setFontSize(10);
    doc.text(`Cantidad conector: ${item.count || 1}`, x0, y0 + 38);

    // Si no podemos construir nodo, dejamos solo texto (fallback)
    if (!node) {
      doc.setFont('helvetica', 'bold');
      doc.text('Conecta con:', x0, y0 + 44);
      doc.setFont('helvetica', 'normal');
      let y = y0 + 52;
      const neigh = Array.isArray(item.neighborsVisible) ? item.neighborsVisible : [];
      neigh.forEach((n) => {
        doc.text(`- ${n}`, x0 + 4, y);
        y += 5;
        if (y > 275) {
          doc.addPage();
          y = 20;
        }
      });
      if (neigh.length === 0) doc.text('(sin vecinos detectados)', x0 + 4, y);
      return;
    }

    // Normalizar displayId (usa niveles visibles) y reusar las rutinas de dibujo de la pagina normal
    node.displayId = item.keyVisible;
    node.visibleKIndex = item.kVis;

    // Dibujar diagrama + tabla (mismo estilo que addNodePage)
    const diagramX = 120, diagramY = y0 + 42;
    let diagramSize = 64;
    const edgeCount = (node.edges || []).length;
    if (edgeCount > 10) diagramSize = 56;
    if (edgeCount > 14) diagramSize = 50;

    this.drawEdgeDiagram(doc, node, diagramX, diagramY, diagramSize);

    // Cantidad conector: en el anexo es 1 (este conector especifico)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Cantidad conector: 1', x0, y0 + 38);

    const diagramBottom = diagramY + diagramSize;
    const tableTop = diagramBottom + 10;
    this.drawEdgesTable(doc, node, x0, tableTop, 210 - 2 * margin);
  }
}


// Compat: avoid class static fields in older browsers
NodePDFReporter._keysAreVisible = null;