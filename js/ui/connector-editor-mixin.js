import { state } from '../state.js';
import { logger } from '../logger.js';

export function applyConnectorEditorMixin(proto) {

  proto.editConnectorForSelection = function(hit) {
    if (!hit || typeof hit.kOriginal !== 'number') return;
    if (!state.structureParams) return;
    this._openConnectorEditModal(hit);
  };

  proto._handleConnectorTap = function(hit) {
  if (!hit || !hit.mesh) return;

  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const dt = (this._lastConnectorTapTime != null) ? (now - this._lastConnectorTapTime) : 1e9;

  // ID estable: con InstancedMesh el proxy se crea nuevo en cada tap (uuid diferente).
  // Usamos iMesh.uuid + instanceId como identificador estable. Para Meshes legacy: mesh.uuid.
  const stableId = (hit.iMesh != null && hit.instanceId != null)
    ? (hit.iMesh.uuid + '_' + hit.instanceId)
    : hit.mesh.uuid;

  const same = (this._lastConnectorStableId != null && stableId === this._lastConnectorStableId);

  // Primer tap: tooltip + resaltado. Segundo tap rapido en el mismo conector: abrir modal.
  const DOUBLE_TAP_MS = 650;

  this._lastConnectorTapTime = now;

  if (same && dt <= DOUBLE_TAP_MS) {
    // Segundo tap: abrir modal
    this._hideConnectorTooltip();
    this.editConnectorForSelection(hit);
    this._lastConnectorStableId = null; // reset para no triple-abrir
    return;
  }

  // Primer tap: guardar ID estable, mostrar tooltip
  this._lastConnectorStableId = stableId;
  this._showConnectorTooltip(hit);
  };

  proto._initConnectorTooltip = function() {
  if (this._connectorTooltipEl) return;
  const el = document.createElement('div');
  el.id = 'zvConnectorTooltip';
  el.className = 'zv-connector-tooltip zv-hidden';
  el.innerHTML = '<div class="zv-ct-title"></div><div class="zv-ct-sub"></div>';
  document.body.appendChild(el);
  this._connectorTooltipEl = el;
  this._connectorTooltipTitle = el.querySelector('.zv-ct-title');
  this._connectorTooltipSub = el.querySelector('.zv-ct-sub');
  };

  proto._showConnectorTooltip = function(hit) {
  if (!hit || !hit.mesh) return;
  this._initConnectorTooltip();

  // Resaltar seleccionado (sin abrir modal)
  try {
    if (this.sceneManager && typeof this.sceneManager.setSelectedConnector === 'function') {
      this.sceneManager.setSelectedConnector(hit.mesh);
    }
  } catch (e) {}

  // Texto tooltip
  const kv = (hit.kVisible != null) ? hit.kVisible : hit.kOriginal;
  const isPoleLow = (hit.kOriginal === 0);
  const isPoleTop = (hit.kOriginal === state.N);
  let typeLabel = 'Nivel intermedio';
  if (state.cutActive) {
    // Con corte activo, el nivel visible mas bajo (kVisible=0) es el "suelo".
    if (kv === 0) typeLabel = 'Suelo';
    else if (isPoleTop) typeLabel = 'Polo superior';
  } else {
    if (isPoleLow) typeLabel = 'Polo inferior';
    else if (isPoleTop) typeLabel = 'Polo superior';
  }

  if (this._connectorTooltipTitle) {
    this._connectorTooltipTitle.textContent = `Conector k${kv} (${typeLabel})`;
  }
  if (this._connectorTooltipSub) {
    this._connectorTooltipSub.textContent = 'Toca nuevamente para editar';
  }

  this._connectorTooltipHit = hit;
  this._connectorTooltipEl.classList.remove('zv-hidden');

  // Auto-ocultar si no hay segundo tap
  if (this._connectorTooltipTimer) {
    try { clearTimeout(this._connectorTooltipTimer); } catch (e) {}
    this._connectorTooltipTimer = null;
  }
  this._connectorTooltipTimer = setTimeout(() => {
    // Si el usuario no edito, ocultar solo el tooltip (mantener resaltado puede ser util)
    this._hideConnectorTooltip(true);
  }, 2500);

  this._updateConnectorTooltipPosition();
  };

  proto._hideConnectorTooltip = function(keepSelection) {
  if (this._connectorTooltipTimer) {
    try { clearTimeout(this._connectorTooltipTimer); } catch (e) {}
    this._connectorTooltipTimer = null;
  }
  if (this._connectorTooltipEl) {
    this._connectorTooltipEl.classList.add('zv-hidden');
  }
  this._connectorTooltipHit = null;

  if (!keepSelection) {
    try {
      if (this.sceneManager && typeof this.sceneManager.setSelectedConnector === 'function') {
        this.sceneManager.setSelectedConnector(null);
      }
    } catch (e) {}
    this._lastConnectorMeshUuid = null;
  }
  };

  proto._clearConnectorTooltipAndSelection = function() {
  this._hideConnectorTooltip(false);
  this._lastConnectorTapTime = null;
  };

  proto._initConnectorEditModal = function() {
    // Modal para editar un conector seleccionado.
    // Se crea una sola vez y se reutiliza.
    if (this._connectorModalOverlay) return;

    const overlay = document.createElement('div');
    overlay.id = 'connectorEditOverlay';
    overlay.className = 'zv-modal-overlay zv-hidden';

    const dialog = document.createElement('div');
    dialog.className = 'zv-modal';

    const title = document.createElement('div');
    title.className = 'zv-modal-title';
    title.textContent = 'Editar conector';

    const subtitle = document.createElement('div');
    subtitle.className = 'zv-modal-subtitle';
    subtitle.textContent = '';

    const body = document.createElement('div');
    body.className = 'zv-modal-body';

    const row1 = document.createElement('div');
    row1.className = 'zv-modal-row';
    const labD = document.createElement('label');
    labD.textContent = 'Diametro (mm)';
    labD.className = 'zv-modal-label';
    const inpD = document.createElement('input');
    inpD.type = 'number';
    inpD.min = '1';
    inpD.step = '1';
    inpD.className = 'zv-modal-input';
    inpD.id = 'connectorEditDiameterMm';
    row1.appendChild(labD);
    row1.appendChild(inpD);

    const row2 = document.createElement('div');
    row2.className = 'zv-modal-row';
    const labP = document.createElement('label');
    labP.textContent = 'Profundidad (mm)';
    labP.className = 'zv-modal-label';
    const inpP = document.createElement('input');
    inpP.type = 'number';
    inpP.min = '1';
    inpP.step = '1';
    inpP.className = 'zv-modal-input';
    inpP.id = 'connectorEditDepthMm';
    row2.appendChild(labP);
    row2.appendChild(inpP);

    // Row 3: Offset hacia el interior (a lo largo de la directriz)
    const row3 = document.createElement('div');
    row3.className = 'zv-modal-row';
    const labO = document.createElement('label');
    labO.textContent = 'Traslado hacia interior (mm)';
    labO.className = 'zv-modal-label';
    const inpO = document.createElement('input');
    inpO.type = 'number';
    inpO.min = '0';
    inpO.step = '1';
    inpO.className = 'zv-modal-input';
    inpO.id = 'connectorEditOffsetMm';
    row3.appendChild(labO);
    row3.appendChild(inpO);

    // Presets: borde / centro de testa / posicion inicial
    const rowPreset = document.createElement('div');
    rowPreset.className = 'zv-modal-row zv-modal-row-inline';
    const btnEdge = document.createElement('button');
    btnEdge.type = 'button';
    btnEdge.className = 'zv-btn zv-btn-secondary';
    btnEdge.textContent = 'Al borde (max bisel)';

    const btnMid = document.createElement('button');
    btnMid.type = 'button';
    btnMid.className = 'zv-btn zv-btn-secondary';
    btnMid.textContent = 'Centro de testa';

    const btnZero = document.createElement('button');
    btnZero.type = 'button';
    btnZero.className = 'zv-btn zv-btn-secondary';
    btnZero.textContent = 'Posicion inicial';
    rowPreset.appendChild(btnEdge);
    rowPreset.appendChild(btnMid);
    rowPreset.appendChild(btnZero);

    body.appendChild(row1);
    body.appendChild(row2);
    body.appendChild(row3);
    body.appendChild(rowPreset);

    const footer = document.createElement('div');
    footer.className = 'zv-modal-footer';

    const btnRestore = document.createElement('button');
    btnRestore.className = 'zv-btn zv-btn-secondary';
    btnRestore.textContent = 'Restaurar global';

    const btnCancel = document.createElement('button');
    btnCancel.className = 'zv-btn zv-btn-secondary';
    btnCancel.textContent = 'Cancelar';

    const btnApply = document.createElement('button');
    btnApply.className = 'zv-btn zv-btn-primary';
    btnApply.textContent = 'Aplicar';

    footer.appendChild(btnRestore);
    footer.appendChild(btnCancel);
    footer.appendChild(btnApply);

    dialog.appendChild(title);
    dialog.appendChild(subtitle);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Guardar refs
    this._connectorModalOverlay = overlay;
    this._connectorModalTitle = title;
    this._connectorModalSubtitle = subtitle;
    this._connectorModalDiameter = inpD;
    this._connectorModalDepth = inpP;
    this._connectorModalOffset = inpO;
    this._connectorModalRestoreBtn = btnRestore;
    this._connectorModalPresetEdgeBtn = btnEdge;
    this._connectorModalPresetMidBtn = btnMid;
    this._connectorModalPresetZeroBtn = btnZero;

    const close = () => this._closeConnectorEditModal();
    overlay.addEventListener('click', (e) => {
      // Cerrar al tocar fuera del dialogo
      if (e.target === overlay) close();
    });
    btnCancel.addEventListener('click', close);
    btnApply.addEventListener('click', () => this._applyConnectorEditModal());
    btnRestore.addEventListener('click', () => this._restoreConnectorEditModal());

    // Presets (no aplican hasta que el usuario toque "Aplicar")
    // Se calculan desde la geometria real: la cara exterior del cilindro queda a ras con
    // la punta de la viga cuyo bisel es mas pronunciado en ese conector.
    const computePresets = () => {
      try {
        if (!this.sceneManager || typeof this.sceneManager.getConnectorOffsetPresetsMm !== 'function') return null;
        return this.sceneManager.getConnectorOffsetPresetsMm(this._connectorEditHit || null);
      } catch (e) {
        return null;
      }
    };
    btnEdge.addEventListener('click', () => {
      const p = computePresets();
      if (p && isFinite(p.edgeMm)) {
        try { this._connectorModalOffset.value = String(Math.max(0, Math.round(p.edgeMm))); } catch (e) {}
      }
    });

    btnMid.addEventListener('click', () => {
      const p = computePresets();
      if (p && isFinite(p.midMm)) {
        try { this._connectorModalOffset.value = String(Math.max(0, Math.round(p.midMm))); } catch (e) {}
      }
    });

    btnZero.addEventListener('click', () => {
      try { this._connectorModalOffset.value = '0'; } catch (e) {}
    });

    // Usar AbortController para poder remover el listener al destruir el modal
    this._connectorModalAbortCtrl = new AbortController();
    document.addEventListener('keydown', (e) => {
      if (overlay.classList.contains('zv-hidden')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'Enter') this._applyConnectorEditModal();
    }, { signal: this._connectorModalAbortCtrl.signal });
  };

  proto._openConnectorEditModal = function(hit) {
    if (!hit || typeof hit.kOriginal !== 'number') return;
    if (!state.structureParams) return;
    if (!this._connectorModalOverlay) this._initConnectorEditModal();

    const k = hit.kOriginal;
    const baseD = Number(state.structureParams.cylDiameterMm) || 1;
    const baseP = Number(state.structureParams.cylDepthMm) || 1;
    const isIntersection = !!hit.isIntersection;
    const mapName = isIntersection ? 'structureIntersectionConnectorOverrides' : 'structureConnectorOverrides';
    const ov = (state[mapName] && (state[mapName][String(k)] || state[mapName][k])) || null;
    const currentD = ov && ov.cylDiameterMm != null ? Number(ov.cylDiameterMm) : baseD;
    const currentP = ov && ov.cylDepthMm != null ? Number(ov.cylDepthMm) : baseP;
    const currentO = ov && ov.offsetMm != null ? Number(ov.offsetMm) : 0;

    const labelK = (hit.kVisible != null) ? hit.kVisible : k;
    this._connectorEditHit = hit;

    // Resaltar conector seleccionado
    try {
      if (this.sceneManager && typeof this.sceneManager.setSelectedConnector === 'function') {
        this.sceneManager.setSelectedConnector(hit.mesh || null);
      }
    } catch (e) {}

    this._connectorModalTitle.textContent = `${isIntersection ? 'Editar conector de interseccion' : 'Editar conector'} (nivel k${labelK})`;

    // Subtitulo: k visible + tipo (polo/suelo/intermedio)
    const isPoleLow = (hit.kOriginal === 0);
    const isPoleTop = (hit.kOriginal === state.N);
    const isFloorVisible = (state.cutActive && (hit.kVisible != null) && Number(hit.kVisible) === 0);
    let typeLabel = 'Nivel intermedio';
    if (state.cutActive) {
      if (isPoleTop) typeLabel = 'Polo superior (unico polo visible)';
      else if (isFloorVisible) typeLabel = 'Suelo (nivel inferior visible)';
    } else {
      if (isPoleLow) typeLabel = 'Polo inferior';
      else if (isPoleTop) typeLabel = 'Polo superior';
    }
    if (this._connectorModalSubtitle) {
      const kv = (hit.kVisible != null) ? hit.kVisible : '—';
      // El usuario siempre trabaja con niveles visibles (K). Evitar mostrar "k original" para no confundir.
      this._connectorModalSubtitle.textContent = `k: ${kv} | ${typeLabel}`;
    }

    this._connectorModalDiameter.value = String(Math.round(currentD));
    this._connectorModalDepth.value = String(Math.round(currentP));
    if (this._connectorModalOffset) this._connectorModalOffset.value = String(Math.round(isFinite(currentO) ? Math.max(0, currentO) : 0));

    this._connectorModalOverlay.classList.remove('zv-hidden');
    // Foco al primer input
    setTimeout(() => {
      // No auto-focus on mobile (prevents keyboard popping).
      try {
        const fine = window.matchMedia && window.matchMedia('(pointer:fine)').matches;
        if (fine) { this._connectorModalDiameter.focus(); this._connectorModalDiameter.select(); }
      } catch (e) {}
    }, 0);
  };

  proto._closeConnectorEditModal = function() {
    if (!this._connectorModalOverlay) return;
    this._connectorModalOverlay.classList.add('zv-hidden');
    this._connectorEditHit = null;

    // Liberar listener de teclado registrado con AbortController
    if (this._connectorModalAbortCtrl) {
      this._connectorModalAbortCtrl.abort();
      this._connectorModalAbortCtrl = null;
    }

    // Quitar resaltado
    try {
      if (this.sceneManager && typeof this.sceneManager.setSelectedConnector === 'function') {
        this.sceneManager.setSelectedConnector(null);
      }
    } catch (e) {}
  };

  proto._restoreConnectorEditModal = function() {
    const hit = this._connectorEditHit;
    if (!hit || typeof hit.kOriginal !== 'number') return;
    if (!state.structureParams) return;

    const k = hit.kOriginal;
    const isIntersection = !!hit.isIntersection;
    const targets = [];
    if (isIntersection) targets.push(k);
    else {
      const isPoleLow = k === 0;
      const isPoleTop = k === state.N;
      if ((isPoleLow || isPoleTop) && !state.cutActive) targets.push(0, state.N);
      else targets.push(k);
    }

    const mapName = isIntersection ? 'structureIntersectionConnectorOverrides' : 'structureConnectorOverrides';
    if (state[mapName] && typeof state[mapName] === 'object') {
      for (const kk of targets) {
        delete state[mapName][String(kk)];
      }
    }

    // Refrescar inputs a valores globales (offset global = 0)
    const baseD = Number(state.structureParams.cylDiameterMm) || 1;
    const baseP = Number(state.structureParams.cylDepthMm) || 1;
    this._connectorModalDiameter.value = String(Math.round(baseD));
    this._connectorModalDepth.value = String(Math.round(baseP));
    if (this._connectorModalOffset) this._connectorModalOffset.value = '0';

    try {
      this.sceneManager.generateConnectorStructure(state.structureParams);
      this._maybeShowStructureWarnings();
      this.showNotification('Nivel restaurado a valores globales', 'success');
    } catch (err) {
      console.error(err);
      this.showNotification('No se pudo restaurar la estructura', 'error');
    }
  };

  proto._applyConnectorEditModal = function() {
    const hit = this._connectorEditHit;
    if (!hit || typeof hit.kOriginal !== 'number') return;
    if (!state.structureParams) return;

    const dMm = Number(this._connectorModalDiameter.value);
    const pMm = Number(this._connectorModalDepth.value);
    const oMm = this._connectorModalOffset ? Number(this._connectorModalOffset.value) : 0;

    if (!isFinite(dMm) || dMm <= 0 || !isFinite(pMm) || pMm <= 0 || !isFinite(oMm) || oMm < 0) {
      this.showNotification('Valores invalidos. Usa numeros positivos en mm.', 'error');
      return;
    }

    const k = hit.kOriginal;
    const isIntersection = !!hit.isIntersection;
    const targets = [];
    if (isIntersection) {
      // Conectores de interseccion: se editan por nivel del rombo (kFace) y NO se acoplan polos.
      targets.push(k);
    } else {
      const isPoleLow = k === 0;
      const isPoleTop = k === state.N;
      if ((isPoleLow || isPoleTop) && !state.cutActive) targets.push(0, state.N);
      else targets.push(k);
    }

    const mapName = isIntersection ? 'structureIntersectionConnectorOverrides' : 'structureConnectorOverrides';
    if (!state[mapName] || typeof state[mapName] !== 'object') state[mapName] = {};
    for (const kk of targets) {
      state[mapName][String(kk)] = { cylDiameterMm: dMm, cylDepthMm: pMm, offsetMm: oMm };
    }

    try {
      // Regenerar SIN tocar la camara. Solo reemplaza los meshes de estructura.
      this.sceneManager.generateConnectorStructure(state.structureParams);
      this._maybeShowStructureWarnings();
      this.showNotification('Conectores actualizados', 'success');
      this._closeConnectorEditModal();
    } catch (err) {
      console.error(err);
      this.showNotification('No se pudo actualizar la estructura', 'error');
    }
  };

}