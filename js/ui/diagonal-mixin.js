import * as THREE from 'three';
import { state } from '../state.js';
import { logger } from '../logger.js';

export function applyDiagonalMixin(proto) {

  proto._structureIsGenerated = function() {
  try {
    return !!(this.sceneManager && this.sceneManager.structureGroup && this.sceneManager.structureGroup.children && this.sceneManager.structureGroup.children.some(o => o && o.userData && (o.userData.isConnector || o.userData.isConnectorBatch)));
  } catch (e) {
    return false;
  }
  };

  proto._toggleDiagonalMode = function() {
  const willEnable = !this._diagModeActive;

  // Evitar activar sin estructura generada (confunde al usuario y no hay conectores para seleccionar)
  if (willEnable && !this._structureIsGenerated()) {
    this._diagModeActive = false;
    if (this.toggleDiagonalModeBtn) {
      this.toggleDiagonalModeBtn.classList.remove('active');
    }
    this.showNotification('Genera la estructura (vigas + conectores) antes de usar vigas extra.', 'error');
    this._setExitExtraModeButtonVisible(false);
    this._setExtraModeToastVisible(false, '');
    return;
  }

  // Modos exclusivos: salir de selección múltiple si se activa diagonal
  if (willEnable && this._multiSelectModeActive) {
    this._exitMultiSelectBeamsMode(false);
  }

  this._diagModeActive = willEnable;
  if (this.toggleDiagonalModeBtn) {
    this.toggleDiagonalModeBtn.classList.toggle('active', this._diagModeActive);
  }
  this._diagFirstHit = null;

  this._setExitExtraModeButtonVisible(this._diagModeActive);
  this._setExtraModeToastVisible(this._diagModeActive, this._diagModeActive ? 'Toca 2 conectores del mismo rombo (arista o diagonal)' : '');

  if (this._diagModeActive) {
    this.showNotification('Modo vigas extra: toca 2 conectores del mismo rombo (arista o diagonal).', 'success');
  } else {
    this.showNotification('Modo vigas extra desactivado.', 'success');
  }
  };

  proto._ensureExitExtraModeButton = function() {
  if (this._exitExtraModeBtn) return;
  const btn = document.createElement('button');
  btn.id = 'zvExitExtraModeBtn';
  btn.className = 'zv-exit-extra-mode-btn';
  btn.type = 'button';
  btn.title = 'Salir del modo vigas extra';
  btn.textContent = 'Salir';
  btn.addEventListener('click', () => {
    if (this._diagModeActive) this._toggleDiagonalMode();
  });
  document.body.appendChild(btn);
  this._exitExtraModeBtn = btn;
  };

  proto._setExitExtraModeButtonVisible = function(isVisible) {
  this._ensureExitExtraModeButton();
  if (!this._exitExtraModeBtn) return;
  this._exitExtraModeBtn.style.display = isVisible ? '' : 'none';
  };

  proto._ensureExtraModeToast = function() {
    if (this._extraModeToastEl) return;
    const el = document.createElement('div');
    el.id = 'zvExtraModeToast';
    el.className = 'zv-extra-mode-toast zv-hidden';
    el.innerHTML = `
      <div class="zv-extra-mode-toast-title">Modo vigas extra</div>
      <div class="zv-extra-mode-toast-sub">Toca 2 conectores del mismo rombo</div>
    `;
    document.body.appendChild(el);
    this._extraModeToastEl = el;
  };

  proto._setExtraModeToastVisible = function(isVisible, subText) {
    this._ensureExtraModeToast();
    if (!this._extraModeToastEl) return;
    const sub = this._extraModeToastEl.querySelector('.zv-extra-mode-toast-sub');
    if (sub && typeof subText === 'string') sub.textContent = subText;
    this._extraModeToastEl.classList.toggle('zv-hidden', !isVisible);
  };

  proto._clearExtraBeams = function() {
  state.structureExtraBeams = [];
  state.structureIntersectionFaces = {};
  // Mantener overrides de conectores normales y vigas, pero limpiar overrides de interseccion
  // ya que los nodos centrales dependen de las diagonales.
  state.structureIntersectionConnectorOverrides = {};
  this._diagFirstHit = null;
  try {
    // Regenerar estructura conservando params y overrides
    if (state.structureParams) {
      this.sceneManager.generateConnectorStructure({ ...state.structureParams });
      this._maybeShowStructureWarnings();
    }
  } catch (e) {
    console.error(e);
  }
  this.showNotification('Vigas extra eliminadas.', 'success');
  };

  proto._toggleMultiSelectBeamsMode = function() {
  if (this._multiSelectModeActive) {
    // Salir del modo — cancelar todo
    this._exitMultiSelectBeamsMode(false);
    return;
  }

  // Validar que haya estructura generada
  if (!this._structureIsGenerated()) {
    this.showNotification('Genera la estructura antes de usar la selección múltiple.', 'error');
    return;
  }

  // Entrar en modo
  this._multiSelectModeActive = true;
  this._multiSelectedBeams = [];

  // Actualizar botón del menú → "Cancelar"
  this._updateMultiSelectBtn();

  // Mostrar botón flotante (inicialmente oculto, se muestra con ≥1 selección)
  this._ensureMultiSelectFloat();
  this._updateMultiSelectFloat();

  // Mostrar toast instruccional
  this._ensureMultiSelectToast();
  this._setMultiSelectToastVisible(true);

  // Desactivar el modo diagonal si estaba activo (modos exclusivos)
  if (this._diagModeActive) this._toggleDiagonalMode();
  };

  proto._exitMultiSelectBeamsMode = function(deleted) {
  this._multiSelectModeActive = false;

  // Quitar outlines de todas las vigas seleccionadas
  this._clearMultiSelectOutlines();
  this._multiSelectedBeams = [];

  // Actualizar botón del menú → texto original
  this._updateMultiSelectBtn();

  // Ocultar flotante y toast
  this._updateMultiSelectFloat();
  this._setMultiSelectToastVisible(false);

  if (!deleted) {
    this.showNotification('Selección múltiple cancelada.', 'info');
  }
  };

  proto._handleMultiSelectBeamTap = function(hit) {
  if (!hit || !hit.mesh) return;

  const ek = this._edgeKeyFromBeamInfo(
    hit.mesh.userData && hit.mesh.userData.beamInfo ? hit.mesh.userData.beamInfo : null
  );
  if (!ek) return;

  // Buscar si ya estaba seleccionada
  const existingIdx = this._multiSelectedBeams.findIndex(s => s.edgeKey === ek);

  if (existingIdx !== -1) {
    // Ya estaba seleccionada → deseleccionar SOLO esa viga
    const removed = this._multiSelectedBeams.splice(existingIdx, 1)[0];
    try {
      if (removed.outlineMesh) {
        if (removed.outlineMesh.parent) removed.outlineMesh.parent.remove(removed.outlineMesh);
        if (removed.outlineMesh.geometry) removed.outlineMesh.geometry.dispose();
        if (removed.outlineMesh.material) removed.outlineMesh.material.dispose();
      }
    } catch (e) { /* noop */ }
    if (this.sceneManager) this.sceneManager.markDirty();
  } else {
    // No estaba → agregar a selección
    const outlineMesh = this._createBeamSelectionOutline(hit.mesh);
    this._multiSelectedBeams.push({ mesh: hit.mesh, edgeKey: ek, outlineMesh });
  }

  // Actualizar botón flotante (count + visibilidad)
  this._updateMultiSelectFloat();
  };

  proto._createBeamSelectionOutline = function(mesh) {
  if (!mesh || !mesh.geometry) return null;
  try {
    const edges = new THREE.EdgesGeometry(mesh.geometry);
    const mat = new THREE.LineBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
    });
    const outline = new THREE.LineSegments(edges, mat);
    outline.name = 'zvMultiSelectOutline';
    outline.renderOrder = 9998;
    outline.frustumCulled = false;
    mesh.add(outline);
    if (this.sceneManager) this.sceneManager.markDirty();
    return outline;
  } catch (e) {
    return null;
  }
  };

  proto._clearMultiSelectOutlines = function() {
  for (const s of this._multiSelectedBeams) {
    try {
      if (s.outlineMesh) {
        if (s.outlineMesh.parent) s.outlineMesh.parent.remove(s.outlineMesh);
        if (s.outlineMesh.geometry) s.outlineMesh.geometry.dispose();
        if (s.outlineMesh.material) s.outlineMesh.material.dispose();
      }
    } catch (e) { /* noop */ }
  }
  if (this.sceneManager) this.sceneManager.markDirty();
  };

  proto._deleteMultiSelectedBeams = function() {
  if (!this._multiSelectedBeams.length) return;
  if (!state.structureParams) return;

  const keys = this._multiSelectedBeams.map(s => s.edgeKey).filter(Boolean);
  if (!keys.length) return;

  // Quitar outlines antes de regenerar (para evitar referencias a meshes destruidos)
  this._clearMultiSelectOutlines();

  if (!Array.isArray(state.structureDeletedBeams)) state.structureDeletedBeams = [];
  for (const ek of keys) {
    if (state.structureDeletedBeams.indexOf(ek) === -1) {
      state.structureDeletedBeams.push(ek);
    }
  }

  const n = keys.length;
  try {
    this.sceneManager.generateConnectorStructure(state.structureParams);
    this._maybeShowStructureWarnings();
  } catch (err) {
    console.error(err);
    this.showNotification('Error al eliminar las vigas seleccionadas.', 'error');
    this._multiSelectedBeams = [];
    this._exitMultiSelectBeamsMode(false);
    return;
  }

  this._multiSelectedBeams = [];
  this._exitMultiSelectBeamsMode(true);
  this.showNotification(`${n} viga${n !== 1 ? 's' : ''} eliminada${n !== 1 ? 's' : ''}.`, 'success');
  };

  proto._updateMultiSelectBtn = function() {
  if (!this.multiSelectBeamsBtn || !this.multiSelectBeamsBtnLabel) return;
  if (this._multiSelectModeActive) {
    this.multiSelectBeamsBtnLabel.textContent = 'Cancelar';
    this.multiSelectBeamsBtn.classList.add('zv-multiselect-active');
  } else {
    this.multiSelectBeamsBtnLabel.textContent = 'Selección múltiple';
    this.multiSelectBeamsBtn.classList.remove('zv-multiselect-active');
  }
  };

  proto._ensureMultiSelectFloat = function() {
  if (this._multiSelectFloatEl) return;

  const btn = document.createElement('button');
  btn.id = 'zvMultiSelectFloatBtn';
  btn.className = 'zv-multiselect-float zv-hidden';
  btn.type = 'button';
  btn.innerHTML = `
    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6l-1 14H6L5 6"></path>
      <path d="M10 11v6M14 11v6"></path>
    </svg>
    Eliminar selección
    <span class="zv-multiselect-count" id="zvMultiSelectCount">0</span>
  `;
  btn.addEventListener('click', () => {
    if (this._multiSelectedBeams.length === 0) return;
    this._deleteMultiSelectedBeams();
  });
  document.body.appendChild(btn);
  this._multiSelectFloatEl = btn;
  this._multiSelectCountEl = btn.querySelector('#zvMultiSelectCount');
  };

  proto._updateMultiSelectFloat = function() {
  this._ensureMultiSelectFloat();
  if (!this._multiSelectFloatEl) return;

  const count = this._multiSelectedBeams.length;
  const shouldShow = this._multiSelectModeActive && count > 0;

  this._multiSelectFloatEl.classList.toggle('zv-hidden', !shouldShow);
  if (this._multiSelectCountEl) {
    this._multiSelectCountEl.textContent = String(count);
  }
  };

  proto._ensureMultiSelectToast = function() {
  if (this._multiSelectToastEl) return;
  const el = document.createElement('div');
  el.id = 'zvMultiSelectToast';
  el.className = 'zv-multiselect-toast zv-hidden';
  el.innerHTML = 'Toca vigas para seleccionarlas<br>Toca una seleccionada para quitarla';
  document.body.appendChild(el);
  this._multiSelectToastEl = el;
  };

  proto._setMultiSelectToastVisible = function(visible) {
  this._ensureMultiSelectToast();
  if (!this._multiSelectToastEl) return;
  this._multiSelectToastEl.classList.toggle('zv-hidden', !visible);
  };

  proto._handleDiagonalConnectorTap = function(hit) {
  if (!hit || !hit.mesh) return;

  // Primer conector
  if (!this._diagFirstHit) {
    this._diagFirstHit = hit;
    // Reusar tooltip/resaltado existente
    this._showConnectorTooltip(hit);
    if (this._connectorTooltipSub) {
      this._connectorTooltipSub.textContent = 'Ahora toca un segundo conector del mismo rombo';
    }
    return;
  }

  // Segundo conector
  const a = this._diagFirstHit;
  const b = hit;
  this._diagFirstHit = null;

  // Evitar seleccionar el mismo
  if (a.mesh.uuid === b.mesh.uuid) {
    this.showNotification('Selecciona un segundo conector distinto.', 'error');
    return;
  }


  // ✅ Caso especial: si el usuario eliminó una viga (arista, diagonal o tramo con conector central)
  // y ahora selecciona exactamente los mismos 2 conectores, restauramos la viga removiéndola del
  // blacklist (structureDeletedBeams). Esto funciona incluso con conectores centrales "X".
  try {
    if (Array.isArray(state.structureDeletedBeams) && state.structureDeletedBeams.length && state.structureParams) {
      const keyForHit = (h) => {
        const ci = h && h.mesh && h.mesh.userData && h.mesh.userData.connectorInfo ? h.mesh.userData.connectorInfo : null;
        const k = ci && isFinite(ci.kOriginal) ? Number(ci.kOriginal) : Number(h.kOriginal);
        const i = ci && isFinite(ci.i) ? Number(ci.i) : Number(h.i);

        // Conector central/interseccion (X)
        if (ci && typeof ci.id === 'string' && ci.id.indexOf('X') === 0) {
          // Debe coincidir con StructureGenerator: X:<kOriginal>:<iFace>
          return `X:${k}:${i}`;
        }

        if (!isFinite(k)) return null;
        if (k === 0) return 'pole_low';
        if (k === state.N) return 'pole_top';
        return `k${k}_i${i}`;
      };

      const aKey = keyForHit(a);
      const bKey = keyForHit(b);
      if (aKey && bKey && aKey !== bKey) {
        const ek = (aKey < bKey) ? (aKey + '|' + bKey) : (bKey + '|' + aKey);
        const idx = state.structureDeletedBeams.indexOf(ek);
        if (idx !== -1) {
          state.structureDeletedBeams.splice(idx, 1);
          this.sceneManager.generateConnectorStructure({ ...state.structureParams });
          this._maybeShowStructureWarnings();
          this.showNotification('Viga restaurada.', 'success');
          return;
        }
      }
    }
  } catch (e) {
    console.error(e);
  }

  // Encontrar un rombo (cara quad) que contenga ambos conectores
  const face = this._findQuadFaceContaining(a, b);
  if (!face) {
    this.showNotification('Estos conectores no estan dentro del mismo rombo visible (o estas tocando un triangulo del corte).', 'error');
    return;
  }

  // Guardar seleccion para permitir crear una ARISTA entre los conectores elegidos
  this._diagModalSel = {
    a: { k: Number(a.kOriginal), i: Number(a.i) },
    b: { k: Number(b.kOriginal), i: Number(b.i) },
    aId: (a.mesh && a.mesh.userData && a.mesh.userData.connectorInfo) ? a.mesh.userData.connectorInfo.id : null,
    bId: (b.mesh && b.mesh.userData && b.mesh.userData.connectorInfo) ? b.mesh.userData.connectorInfo.id : null,
  };

  this._openDiagonalModal(face);
  };

  proto._findQuadFaceContaining = function(hitA, hitB) {
  const { N, cutActive, cutLevel } = state;

  const vA = { k: Number(hitA.kOriginal), i: Number(hitA.i) };
  const vB = { k: Number(hitB.kOriginal), i: Number(hitB.i) };
  if (!isFinite(vA.k) || !isFinite(vB.k) || !isFinite(vA.i) || !isFinite(vB.i)) return null;

  // Build visible faces using the same rules as StructureGenerator._buildVisibleFaces()
  const startK = cutActive ? cutLevel : 1;

  const same = (p, q) => (p.k === q.k && p.i === q.i) || (p.k === q.k && (p.k === 0 || p.k === N));
  const inFace = (verts, p) => verts.some(v => same(v, p));

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

      const vLeft = { k, i: idxL };
      const vRight = { k, i: idxR };

      if (cutActive && k === cutLevel) {
        // Triangulo del corte (no admite diagonales internas)
        continue;
      }

      const vBottom = { k: k - 1, i };
      const vTop = { k: k + 1, i };
      const verts = [vBottom, vRight, vTop, vLeft];

      if (inFace(verts, vA) && inFace(verts, vB)) {
        return {
          kFace: k,
          iFace: i,
          verts,
          diagH: { a: vLeft, b: vRight },
          diagV: { a: vBottom, b: vTop },
          label: `Rombo (k${cutActive ? Math.max(0, k - cutLevel) : k}, i${i})`,
        };
      }
    }
  }
  return null;
  };

  proto._ensureDiagonalModal = function() {
  if (this._diagModalEl) return;

  const overlay = document.createElement('div');
  overlay.className = 'zv-modal-overlay zv-hidden';
  overlay.id = 'zvExtraBeamModalOverlay';
  overlay.innerHTML = `
    <div class="zv-modal" role="dialog" aria-modal="true">
      <div class="zv-modal-header">
        <div class="zv-modal-title" id="zvDiagModalTitle">Crear viga extra</div>
        <button class="zv-modal-close" id="zvDiagModalClose" aria-label="Cerrar">✕</button>
      </div>
      <div class="zv-modal-body">
        <div class="zv-modal-section" style="margin-top:6px;">
          <div style="font-size:12px; color: rgba(255,255,255,0.75);" id="zvDiagModalSubtitle"></div>
        </div>

        <div class="zv-modal-section" style="margin-top:14px;">
          <div class="zv-modal-label">Tipo</div>
          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:8px;">
            <label class="zv-pill"><input type="radio" name="zvDiagKind" value="edge" checked> Arista</label>
            <label class="zv-pill"><input type="radio" name="zvDiagKind" value="diagH"> Diagonal horizontal</label>
            <label class="zv-pill"><input type="radio" name="zvDiagKind" value="diagV"> Diagonal vertical</label>
          </div>
        </div>

        <div class="zv-modal-section" style="margin-top:14px;">
          <div class="zv-modal-label">Aplicar</div>
          <select class="param-number" id="zvDiagScope" style="width:100%; margin-top:8px;">
            <option value="one">Solo esta seleccion</option>
            <option value="level">Todo este nivel</option>
            <option value="all">Todos los niveles visibles</option>
          </select>
        </div>
      </div>
      <div class="zv-modal-footer">
        <button class="action-button" id="zvDiagCancelBtn">Cancelar</button>
        <button class="action-button primary" id="zvDiagApplyBtn">Aplicar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  this._diagModalEl = overlay;

  const close = () => this._hideDiagonalModal();

  const btnClose = overlay.querySelector('#zvDiagModalClose');
  const btnCancel = overlay.querySelector('#zvDiagCancelBtn');
  if (btnClose) btnClose.addEventListener('click', close);
  if (btnCancel) btnCancel.addEventListener('click', close);

  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay) close();
  });

  const btnApply = overlay.querySelector('#zvDiagApplyBtn');
  if (btnApply) {
    btnApply.addEventListener('click', () => {
      if (!this._diagModalFace) return;

      const kindEl = overlay.querySelector('input[name="zvDiagKind"]:checked');
      const kind = kindEl ? kindEl.value : 'edge';
      const scopeEl = overlay.querySelector('#zvDiagScope');
      const scope = scopeEl ? scopeEl.value : 'one';

      this._applyExtraBeam(kind, scope, this._diagModalFace);
      this._hideDiagonalModal();
    });
  }
  };

  proto._openDiagonalModal = function(face) {
  this._ensureDiagonalModal();
  this._diagModalFace = face;

  const title = this._diagModalEl.querySelector('#zvDiagModalTitle');
  const sub = this._diagModalEl.querySelector('#zvDiagModalSubtitle');
  if (title) title.textContent = 'Crear viga extra';

  // Seleccion actual (2 conectores tocados)
  const sel = this._diagModalSel;
  const selA = sel && sel.a ? sel.a : null;
  const selB = sel && sel.b ? sel.b : null;

  const keyOf = (a, b) => {
    const A = `${a.k}:${a.i}`;
    const B = `${b.k}:${b.i}`;
    return (A < B) ? `${A}|${B}` : `${B}|${A}`;
  };

  // Detectar si la seleccion corresponde a una ARISTA del rombo
  const v = face.verts; // [bottom, right, top, left]
  const edges = [
    { id: 'edgeBR', a: v[0], b: v[1] },
    { id: 'edgeRT', a: v[1], b: v[2] },
    { id: 'edgeTL', a: v[2], b: v[3] },
    { id: 'edgeLB', a: v[3], b: v[0] },
  ];

  let selEdgeId = null;
  if (selA && selB) {
    const sKey = keyOf(selA, selB);
    for (let j = 0; j < edges.length; j++) {
      if (keyOf(edges[j].a, edges[j].b) === sKey) {
        selEdgeId = edges[j].id;
        break;
      }
    }
  }
  this._diagModalSelEdgeId = selEdgeId;

  // Radios
  const rEdge = this._diagModalEl.querySelector('input[name="zvDiagKind"][value="edge"]');
  const rH = this._diagModalEl.querySelector('input[name="zvDiagKind"][value="diagH"]');
  const rV = this._diagModalEl.querySelector('input[name="zvDiagKind"][value="diagV"]');

  // Arista solo si seleccion es adyacente
  if (rEdge) rEdge.disabled = !selEdgeId;

  // Si el rombo ya tiene una diagonal aplicada, solo permitir la otra (para completar cruce)
  const extra = Array.isArray(state.structureExtraBeams) ? state.structureExtraBeams : [];
  const hKey = keyOf(face.diagH.a, face.diagH.b);
  const vKey = keyOf(face.diagV.a, face.diagV.b);
  const hasH = extra.some(it => it && it.kind === 'diagH' && it.a && it.b && keyOf(it.a, it.b) === hKey);
  const hasV = extra.some(it => it && it.kind === 'diagV' && it.a && it.b && keyOf(it.a, it.b) === vKey);

  // ✅ Detectar si hay tramos/diagonales eliminados para este rombo.
  // Si existen eliminaciones, permitimos "restaurar" una diagonal aunque ya exista en structureExtraBeams.
  const deleted = Array.isArray(state.structureDeletedBeams) ? state.structureDeletedBeams : [];
  const deletedSet = new Set(deleted);
  const edgeKey2 = (aKey, bKey) => (aKey < bKey) ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
  const vKey2 = (k, i) => {
    k = Number(k);
    i = Number(i);
    if (k === 0) return 'pole_low';
    if (k === state.N) return 'pole_top';
    return `k${k}_i${i}`;
  };
  const faceId = `${face.kFace}:${face.iFace}`;
  const intersectionFaces = state.structureIntersectionFaces || {};
  const hasCross = !!intersectionFaces[faceId] && hasH && hasV;
  const xKey = `X:${face.kFace}:${face.iFace}`;

  const lKey = vKey2(face.diagH.a.k, face.diagH.a.i);
  const rKey = vKey2(face.diagH.b.k, face.diagH.b.i);
  const bKey = vKey2(face.diagV.a.k, face.diagV.a.i);
  const tKey = vKey2(face.diagV.b.k, face.diagV.b.i);

  const missingH = hasCross
    ? (deletedSet.has(edgeKey2(lKey, xKey)) || deletedSet.has(edgeKey2(xKey, rKey)) || deletedSet.has(edgeKey2(lKey, rKey)))
    : deletedSet.has(edgeKey2(lKey, rKey));
  const missingV = hasCross
    ? (deletedSet.has(edgeKey2(bKey, xKey)) || deletedSet.has(edgeKey2(xKey, tKey)) || deletedSet.has(edgeKey2(bKey, tKey)))
    : deletedSet.has(edgeKey2(bKey, tKey));

  const selKey = (selA && selB) ? keyOf(selA, selB) : null;
  const selIsDiagH = !!selKey && selKey === hKey;
  const selIsDiagV = !!selKey && selKey === vKey;

  if (rH) rH.disabled = false;
  if (rV) rV.disabled = false;

  if (hasH && !hasV) {
    if (!missingH) {
      if (rH) rH.disabled = true;
      if (rV) rV.checked = true;
      if (sub) sub.textContent = `${face.label}. Ya existe diagonal horizontal; puedes crear la vertical, o una arista (si corresponde).`;
    } else {
      // Hay eliminaciones: permitir restaurar diagonal horizontal.
      if (rH) rH.disabled = false;
      if (rV) rV.disabled = false;
      if (rH && selIsDiagH) rH.checked = true;
      else if (rV) rV.checked = true;
      if (sub) sub.textContent = `${face.label}. Diagonal horizontal existe pero tiene tramos eliminados; puedes restaurarla o crear la vertical.`;
    }
  } else if (hasV && !hasH) {
    if (!missingV) {
      if (rV) rV.disabled = true;
      if (rH) rH.checked = true;
      if (sub) sub.textContent = `${face.label}. Ya existe diagonal vertical; puedes crear la horizontal, o una arista (si corresponde).`;
    } else {
      // Hay eliminaciones: permitir restaurar diagonal vertical.
      if (rH) rH.disabled = false;
      if (rV) rV.disabled = false;
      if (rV && selIsDiagV) rV.checked = true;
      else if (rH) rH.checked = true;
      if (sub) sub.textContent = `${face.label}. Diagonal vertical existe pero tiene tramos eliminados; puedes restaurarla o crear la horizontal.`;
    }
  } else if (hasH && hasV) {
    // Ya estan ambas; no tiene sentido abrir modal para diagonales.
    // Pero igual podríamos permitir aristas. Si no es arista, avisar.
    if (!selEdgeId) {
      if (!(missingH || missingV)) {
        this.showNotification('Este rombo ya tiene diagonal horizontal y vertical.', 'error');
        this._diagModalFace = null;
        return;
      }
      // Hay eliminaciones: permitir restaurar.
      if (rEdge) rEdge.disabled = true;
      if (rH) rH.disabled = !missingH;
      if (rV) rV.disabled = !missingV;
      // Priorizar la restauración según la selección del usuario.
      if (missingH && selIsDiagH && rH) rH.checked = true;
      else if (missingV && selIsDiagV && rV) rV.checked = true;
      else if (missingH && rH) rH.checked = true;
      else if (missingV && rV) rV.checked = true;
      else if (rH) rH.checked = true;
      if (sub) sub.textContent = `${face.label}. Este rombo ya tiene ambas diagonales, pero hay tramos eliminados; puedes restaurar la diagonal faltante.`;
      this._diagModalEl.classList.remove('zv-hidden');
      return;
    }
    if (rEdge) rEdge.checked = true;
    if (rH) rH.disabled = true;
    if (rV) rV.disabled = true;
    if (sub) sub.textContent = `${face.label}. Ya existen ambas diagonales; puedes crear una arista.`;
  } else {
    // Ninguna diagonal
    if (selEdgeId) {
      if (rEdge) rEdge.checked = true;
      if (sub) sub.textContent = `${face.label}. Puedes crear arista o diagonal.`;
    } else {
      // Si la selección coincide exactamente con una diagonal del rombo, preseleccionarla.
      if (selIsDiagV && rV && !rV.disabled) {
        rV.checked = true;
      } else if (selIsDiagH && rH && !rH.disabled) {
        rH.checked = true;
      } else {
        if (rH) rH.checked = true;
      }
      if (sub) sub.textContent = `${face.label}. Seleccion no es una arista; puedes crear diagonal.`;
    }
  }

  this._diagModalEl.classList.remove('zv-hidden');
  };

  proto._hideDiagonalModal = function() {
  if (!this._diagModalEl) return;
  this._diagModalEl.classList.add('zv-hidden');
  this._diagModalFace = null;
  };

  proto._applyExtraBeam = function(kind, scope, face) {
  if (!face) return;

  const extra = Array.isArray(state.structureExtraBeams) ? state.structureExtraBeams.slice() : [];

// Edges ya existentes en la estructura actual (para evitar duplicados al crear vigas extra)
const existingEdges = new Set();
try {
  const sg = this.sceneManager && this.sceneManager.structureGroup;
  if (sg && sg.children && sg.children.length) {
    for (let ci = 0; ci < sg.children.length; ci++) {
      const obj = sg.children[ci];
      if (obj && obj.userData && obj.userData.beamInfo) {
        const bi = obj.userData.beamInfo;
        const aK = bi.aKey;
        const bK = bi.bKey;
        if (aK && bK) {
          const ek = (aK < bK) ? (aK + '|' + bK) : (bK + '|' + aK);
          existingEdges.add(ek);
        }
      }
    }
  }
} catch (e) {
  // noop
}

  const keyOf = (a, b) => {
    const A = `${a.k}:${a.i}`;
    const B = `${b.k}:${b.i}`;
    return (A < B) ? `${A}|${B}` : `${B}|${A}`;
  };
  const has = new Set(extra.map(it => (it && it.a && it.b) ? keyOf(it.a, it.b) : null).filter(Boolean));

  // Helper para keys de vertices (debe coincidir con StructureGenerator._keyForVertex)
  const vKey = (k, i, idMaybe) => {
    // Conector central
    if (idMaybe && typeof idMaybe === 'string' && idMaybe.indexOf('X') === 0) {
      return `X:${k}:${i}`;
    }
    // Polos
    if (k === 0) return 'pole_low';
    if (k === state.N) return 'pole_top';
    return `k${k}_i${i}`;
  };
  const edgeKey2 = (aKey, bKey) => (aKey < bKey) ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;

  // Marcas para conectores centrales: solo cuando se crea la SEGUNDA diagonal de un rombo.
  const intersectionFaces = state.structureIntersectionFaces || (state.structureIntersectionFaces = {});

  const removeFromDeletedIfExists = (a, b, aId, bId) => {
    if (!Array.isArray(state.structureDeletedBeams) || state.structureDeletedBeams.length === 0) return;
    const aK = vKey(a.k, a.i, aId);
    const bK = vKey(b.k, b.i, bId);
    const ek = edgeKey2(aK, bK);
    const idx = state.structureDeletedBeams.indexOf(ek);
    if (idx !== -1) {
      state.structureDeletedBeams.splice(idx, 1);
    }
  };

  const addEdge = (a, b, meta, faceId, oppositeEdgeKey, aId, bId) => {
    const k = keyOf(a, b);
    if (has.has(k)) return false;

    // EdgeKey deterministica (incluye conectores centrales)
    const aK = vKey(a.k, a.i, aId);
    const bK = vKey(b.k, b.i, bId);
    const ek = edgeKey2(aK, bK);

    // Si ya existe una viga en esta arista/diagonal (en la estructura actual), NO permitir duplicar.
    // (Solo se permite si estaba "eliminada" y la estamos restaurando.)
    const deleted = Array.isArray(state.structureDeletedBeams) ? state.structureDeletedBeams : [];
    const isDeleted = deleted.indexOf(ek) !== -1;
    if (existingEdges.has(ek) && !isDeleted) {
      return false;
    }

    // Caso especial: ARISTA del rombo (edge) => esa viga ya existe por defecto.
    // Si el usuario la habia eliminado, la "reponemos" removiendola del blacklist,
    // sin agregarla como viga extra.
    if ((meta.kind === 'edge') && isDeleted) {
      removeFromDeletedIfExists(a, b, aId, bId);
      return true;
    }

    // Para diagonales u otras vigas extra:
    has.add(k);

    // Si la viga estaba eliminada antes, restaurarla (mismo nombre deterministico)
    removeFromDeletedIfExists(a, b, aId, bId);

    // Si el rombo tiene (o tendrá) cruce con conector central (X),
    // la diagonal se dibuja como 2 tramos (a<->X y X<->b). Si esos tramos
    // fueron eliminados antes, restaurarlos aquí para que al "Aplicar"
    // realmente aparezca la diagonal en 3D.
    if (meta.kind === 'diagH' || meta.kind === 'diagV') {
      const cross = !!faceId && (
        (oppositeEdgeKey && has.has(oppositeEdgeKey)) ||
        (intersectionFaces && intersectionFaces[faceId])
      );
      if (cross && faceId) {
        const parts = String(faceId).split(':');
        const kF = Number(parts[0]);
        const iF = Number(parts[1]);
        if (isFinite(kF) && isFinite(iF)) {
          const vX = { k: kF, i: iF };
          removeFromDeletedIfExists(a, vX, null, 'X');
          removeFromDeletedIfExists(vX, b, 'X', null);
        }
      }
    }

    extra.push({ a: { k: a.k, i: a.i }, b: { k: b.k, i: b.i }, kind: meta.kind || 'extra', scope: meta.scope || 'one', edgeSel: meta.edgeSel || null });

    // Si el rombo ya tenia la diagonal opuesta, entonces esta es la 2da diagonal: habilitar conector central.
    if (meta.kind && (meta.kind === 'diagH' || meta.kind === 'diagV')) {
      if (faceId && oppositeEdgeKey && has.has(oppositeEdgeKey)) {
        intersectionFaces[faceId] = true;
      }
    }
    return true;
  };

  // === 1) Arista segun seleccion ===
  if (kind === 'edge') {
    const sel = this._diagModalSel;
    if (!sel || !sel.a || !sel.b) {
      this.showNotification('No hay seleccion valida para crear arista.', 'error');
      return;
    }
    if (!this._diagModalSelEdgeId) {
      this.showNotification('La seleccion no corresponde a una arista del rombo.', 'error');
      return;
    }

    const edgeById = (faceObj, edgeId) => {
      const v = faceObj.verts; // [bottom,right,top,left]
      if (edgeId === 'edgeBR') return { a: v[0], b: v[1] };
      if (edgeId === 'edgeRT') return { a: v[1], b: v[2] };
      if (edgeId === 'edgeTL') return { a: v[2], b: v[3] };
      return { a: v[3], b: v[0] }; // edgeLB
    };

    if (scope === 'one') {
      const faceId = `${face.kFace}:${face.iFace}`;
      const t = edgeById(face, this._diagModalSelEdgeId);
      // Mantener ids si los seleccionados son exactamente este edge; si no, null
      const ok = addEdge(t.a, t.b, { kind: 'edge', scope: 'one', edgeSel: this._diagModalSelEdgeId }, null, null, sel.aId, sel.bId);
      if (!ok) {
        this.showNotification('Ya existe una viga en esa arista (o no se puede duplicar).', 'error');
        return;
      }
    } else {
      const { N, cutActive, cutLevel } = state;
      const startK = cutActive ? cutLevel : 1;
      const applyAllLevels = (scope === 'all');

      for (let k = startK; k <= N - 1; k++) {
        if (!applyAllLevels && k !== face.kFace) continue;
        if (cutActive && k === cutLevel) continue;

        for (let i = 0; i < N; i++) {
          let idxL, idxR;
          if (k % 2 === 1) {
            idxL = i;
            idxR = (i + 1) % N;
          } else {
            idxL = (i - 1 + N) % N;
            idxR = i;
          }
          const vLeft = { k, i: idxL };
          const vRight = { k, i: idxR };
          const vBottom = { k: k - 1, i };
          const vTop = { k: k + 1, i };
          const verts = [vBottom, vRight, vTop, vLeft];

          const f = { verts };
          const t = edgeById(f, this._diagModalSelEdgeId);
          addEdge(t.a, t.b, { kind: 'edge', scope, edgeSel: this._diagModalSelEdgeId }, null, null, null, null);
        }
      }
    }

    state.structureExtraBeams = extra;

    try {
      if (state.structureParams) {
        this.sceneManager.generateConnectorStructure(state.structureParams);
        this._maybeShowStructureWarnings();
      }
    } catch (e) {
      console.error(e);
      this.showNotification('No se pudo crear la arista. Revisa consola.', 'error');
      return;
    }

    this.showNotification('Arista creada como viga extra.', 'success');
    return;
  }

  // === 2) Diagonales H/V ===
  if (!face.diagH || !face.diagV) return;
  const target = (kind === 'diagV') ? face.diagV : face.diagH;
  const opposite = (kind === 'diagV') ? face.diagH : face.diagV;
  const oppositeKind = (kind === 'diagV') ? 'diagH' : 'diagV';

  // Helper: restaurar tramos/diagonal eliminados para un rombo específico.
  const _restoreDiagonalForFace = (f, faceId, knd, oppExists) => {
    if (!Array.isArray(state.structureDeletedBeams) || state.structureDeletedBeams.length === 0) return false;
    const before = state.structureDeletedBeams.length;

    // Siempre intentar restaurar la diagonal directa (a<->b)
    removeFromDeletedIfExists(f.a, f.b, null, null);

    // Si existe la diagonal opuesta, este rombo puede tener conector central X y 2 tramos.
    if (oppExists) {
      const vX = { k: Number(face.kFace), i: Number(face.iFace) };
      // Tramo 1: a <-> X
      removeFromDeletedIfExists(f.a, vX, null, 'X');
      // Tramo 2: X <-> b
      removeFromDeletedIfExists(vX, f.b, 'X', null);

      // Asegurar marca de intersección si ambas diagonales existen.
      if (!state.structureIntersectionFaces) state.structureIntersectionFaces = {};
      state.structureIntersectionFaces[faceId] = true;
    }

    return state.structureDeletedBeams.length < before;
  };

  // Para notificar: en scopes "nivel"/"todos" puede que no haya cambios.
  let anyChange = 0;

  if (scope === 'one') {
    const faceId = `${face.kFace}:${face.iFace}`;
    const oppKey = keyOf(opposite.a, opposite.b);
    const diagKey = keyOf(target.a, target.b);
    const already = extra.some(it => it && it.kind === kind && it.a && it.b && keyOf(it.a, it.b) === diagKey);
    const oppExists = extra.some(it => it && it.kind === oppositeKind && it.a && it.b && keyOf(it.a, it.b) === oppKey);

    if (already) {
      // ✅ Restaurar si había tramos/diagonal eliminados.
      const restored = _restoreDiagonalForFace(target, faceId, kind, oppExists);
      if (!restored) {
        this.showNotification('Este rombo ya tiene esa diagonal y no hay tramos eliminados para restaurar.', 'error');
        return;
      }
      anyChange++;
    } else {
      const ok = addEdge(target.a, target.b, { kind, scope: 'one' }, faceId, oppKey, null, null);
      if (!ok) {
        this.showNotification('Ya existe una viga en esa diagonal (o no se puede duplicar).', 'error');
        return;
      }
      anyChange++;
    }
  } else {
    const { N, cutActive, cutLevel } = state;
    const startK = cutActive ? cutLevel : 1;
    const applyAllLevels = (scope === 'all');

    // El rombo seleccionado debe poder "forzar" restauración incluso si estaba suprimido.
    const selectedFaceId = `${face.kFace}:${face.iFace}`;

    // Si el usuario eliminó tramos en un rombo, NO los reponemos automáticamente al aplicar "en todos".
    const isSuppressed = (k, i, knd) => {
      if (!Array.isArray(state.structureDeletedBeams) || state.structureDeletedBeams.length === 0) return false;
      const del = new Set(state.structureDeletedBeams);
      // Construir llaves de vertices (incluye posibilidad de X)
      let idxL, idxR;
      if (k % 2 === 1) { idxL = i; idxR = (i + 1) % N; }
      else { idxL = (i - 1 + N) % N; idxR = i; }
      const lKey = vKey(k, idxL, null);
      const rKey = vKey(k, idxR, null);
      const bKey = vKey(k - 1, i, null);
      const tKey = vKey(k + 1, i, null);
      const xKey = vKey(k, i, 'X');

      // ⚠️ Importante: usar el mismo formateo determinístico de keys.
      // Aquí no existía edgeKey() (bug), lo que hacía que "Aplicar" no funcionara en scope nivel/todos.
      if (knd === 'diagH') {
        return del.has(edgeKey2(lKey, rKey)) || del.has(edgeKey2(lKey, xKey)) || del.has(edgeKey2(xKey, rKey));
      }
      return del.has(edgeKey2(bKey, tKey)) || del.has(edgeKey2(bKey, xKey)) || del.has(edgeKey2(xKey, tKey));
    };

    for (let k = startK; k <= N - 1; k++) {
      if (!applyAllLevels && k !== face.kFace) continue;
      if (cutActive && k === cutLevel) continue;
      for (let i = 0; i < N; i++) {
        const faceId = `${k}:${i}`;
        const suppressed = isSuppressed(k, i, kind);
        if (suppressed && faceId !== selectedFaceId) {
          // Respetar aperturas/vanos hechos por el usuario (excepto el rombo tocado).
          continue;
        }
        let idxL, idxR;
        if (k % 2 === 1) {
          idxL = i;
          idxR = (i + 1) % N;
        } else {
          idxL = (i - 1 + N) % N;
          idxR = i;
        }
        const vLeft = { k, i: idxL };
        const vRight = { k, i: idxR };
        const vBottom = { k: k - 1, i };
        const vTop = { k: k + 1, i };
        const t = (kind === 'diagV') ? { a: vBottom, b: vTop } : { a: vLeft, b: vRight };
        const o = (kind === 'diagV') ? { a: vLeft, b: vRight } : { a: vBottom, b: vTop };
        const oppKey = keyOf(o.a, o.b);

        // Si es el rombo seleccionado y la diagonal ya existe, intentar restaurar.
        if (faceId === selectedFaceId) {
          const diagKey = keyOf(t.a, t.b);
          const alreadyHere = extra.some(it => it && it.kind === kind && it.a && it.b && keyOf(it.a, it.b) === diagKey);
          const oppExists = extra.some(it => it && it.kind === oppositeKind && it.a && it.b && keyOf(it.a, it.b) === oppKey);
          if (alreadyHere) {
            const restored = _restoreDiagonalForFace(t, faceId, kind, oppExists);
            if (restored) anyChange++;
            continue;
          }
        }

        const ok = addEdge(t.a, t.b, { kind, scope }, faceId, oppKey, null, null);
        if (ok) anyChange++;
      }
    }
  }

  state.structureExtraBeams = extra;

  try {
    if (state.structureParams) {
      this.sceneManager.generateConnectorStructure(state.structureParams);
      this._maybeShowStructureWarnings();
    }
  } catch (e) {
    console.error(e);
    this.showNotification('No se pudo aplicar la diagonal. Revisa consola.', 'error');
    return;
  }

  if (anyChange <= 0) {
    this.showNotification('No se realizaron cambios: está suprimido por eliminaciones. Para restaurar, toca el rombo y usa "Solo esta seleccion".', 'info');
  } else {
    this.showNotification('Viga extra aplicada.', 'success');
  }
  };

  proto._updateConnectorTooltipPosition = function() {
  if (!this._connectorTooltipEl || this._connectorTooltipEl.classList.contains('zv-hidden')) return;
  if (!this._connectorTooltipHit || !this._connectorTooltipHit.mesh) return;
  if (!this.sceneManager || !this.sceneManager.camera || !this.sceneManager.renderer) return;

  const mesh = this._connectorTooltipHit.mesh;
  const cam = this.sceneManager.camera;
  const renderer = this.sceneManager.renderer;

  // Posicion en mundo: centro del conector
  const v = new THREE.Vector3();
  try { mesh.getWorldPosition(v); } catch (e) { return; }

  // Proyectar a NDC
  v.project(cam);

  // Si esta detras de la camara, ocultar
  if (v.z > 1) {
    this._connectorTooltipEl.classList.add('zv-hidden');
    return;
  }

  const rect = renderer.domElement.getBoundingClientRect();
  const x = rect.left + (v.x * 0.5 + 0.5) * rect.width;
  const y = rect.top + (-v.y * 0.5 + 0.5) * rect.height;

  // Si fuera de pantalla, ocultar
  const margin = 6;
  if (x < rect.left - margin || x > rect.right + margin || y < rect.top - margin || y > rect.bottom + margin) {
    this._connectorTooltipEl.classList.add('zv-hidden');
    return;
  } else {
    this._connectorTooltipEl.classList.remove('zv-hidden');
  }

  this._connectorTooltipEl.style.left = `${x}px`;
  this._connectorTooltipEl.style.top = `${y}px`;
  };

}