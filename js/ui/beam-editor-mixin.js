import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { state } from '../state.js';
import { BeamPDFReporter } from '../beam-pdf-report.js';
import { logger } from '../logger.js';

export function applyBeamEditorMixin(proto) {

  proto._handleBeamTap = function(hit) {
    if (!hit || !hit.mesh) return;

    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const same = (this._lastBeamMeshUuid && hit.mesh.uuid === this._lastBeamMeshUuid);
    const dt = (this._lastBeamTapTime != null) ? (now - this._lastBeamTapTime) : 1e9;

    const DOUBLE_TAP_MS = 650;

    this._lastBeamTapTime = now;

    if (same && dt <= DOUBLE_TAP_MS) {
      this._hideBeamTooltip();
      this.editBeamForSelection(hit);
      return;
    }

    this._lastBeamMeshUuid = hit.mesh.uuid;
    this._showBeamTooltip(hit);
  };

  proto.editBeamForSelection = function(hit) {
    if (!hit || !hit.mesh) return;
    if (!state.structureParams) return;
    this._openBeamEditModal(hit);
  };

  proto._initBeamTooltip = function() {
    if (this._beamTooltipEl) return;
    const el = document.createElement('div');
    el.id = 'zvBeamTooltip';
    el.className = 'zv-beam-tooltip zv-hidden';
    el.innerHTML = '<div class="zv-bt-title"></div><div class="zv-bt-sub"></div>';
    document.body.appendChild(el);
    this._beamTooltipEl = el;
    this._beamTooltipTitle = el.querySelector('.zv-bt-title');
    this._beamTooltipSub = el.querySelector('.zv-bt-sub');
  };

  proto._showBeamTooltip = function(hit) {
    if (!hit || !hit.mesh) return;
    this._initBeamTooltip();

    try {
      if (this.sceneManager && typeof this.sceneManager.setSelectedBeam === 'function') {
        this.sceneManager.setSelectedBeam(hit.mesh);
      }
    } catch (e) {}

    const kv = (hit.kVisible != null) ? hit.kVisible : hit.kLevelOriginal;
    const w = (hit.widthMm != null) ? Math.round(hit.widthMm) : null;
    const h = (hit.heightMm != null) ? Math.round(hit.heightMm) : null;

    // Info completa desde el mesh (extremos, largo, etc.)
    const bi = (hit.mesh && hit.mesh.userData && hit.mesh.userData.beamInfo) ? hit.mesh.userData.beamInfo : null;

    const safeVec = (v) => (v && v.isVector3) ? v : null;
    const distMm = (a, b) => {
      if (!a || !b) return null;
      const d = a.distanceTo(b);
      return isFinite(d) ? Math.round(d * 1000) : null;
    };

    const lenMm = (bi && isFinite(Number(bi.lenMm))) ? Math.round(Number(bi.lenMm))
      : distMm(safeVec(bi && bi.a ? bi.a.pos : null), safeVec(bi && bi.b ? bi.b.pos : null));

    const nodeLenMm = (bi && isFinite(Number(bi.nodeLenMm))) ? Math.round(Number(bi.nodeLenMm))
      : distMm(safeVec(bi && bi.a ? bi.a.nodePos : null), safeVec(bi && bi.b ? bi.b.nodePos : null));

    const aEnd = (bi && bi.a) ? bi.a : null;
    const bEnd = (bi && bi.b) ? bi.b : null;

    let aName = (aEnd && aEnd.name) ? aEnd.name : null;
    let bName = (bEnd && bEnd.name) ? bEnd.name : null;

    // Ordenar "abajo → arriba" usando datos reales del conector:
    // 1) k (nivel original), 2) z (altura del nodo), 3) i (índice estable).
    const _rankEnd = (end) => {
      const k = (end && Number.isFinite(end.k)) ? Number(end.k) : null;
      const np = safeVec(end && end.nodePos ? end.nodePos : null);
      const pp = safeVec(end && end.pos ? end.pos : null);
      const z = (np && Number.isFinite(np.z)) ? np.z : ((pp && Number.isFinite(pp.z)) ? pp.z : null);
      const i = (end && Number.isFinite(end.i)) ? Number(end.i) : null;
      return { k, z, i };
    };

    const ra = _rankEnd(aEnd);
    const rb = _rankEnd(bEnd);

    const shouldSwap =
      (ra.k != null && rb.k != null && ra.k !== rb.k) ? (ra.k > rb.k) :
      (ra.z != null && rb.z != null && Math.abs(ra.z - rb.z) > 1e-9) ? (ra.z > rb.z) :
      (ra.i != null && rb.i != null && ra.i !== rb.i) ? (ra.i > rb.i) :
      false;

    if (shouldSwap) {
      const tmp = aName; aName = bName; bName = tmp;
    }

    if (this._beamTooltipTitle) {
      const wh = (w!=null && h!=null) ? ` (${w}×${h} mm)` : '';
      const L = (lenMm!=null) ? `  L=${lenMm} mm` : '';
      this._beamTooltipTitle.textContent = `Viga k${kv}${wh}${L}`;
    }
    if (this._beamTooltipSub) {
      const nn = (nodeLenMm!=null) ? `Nodo–Nodo: ${nodeLenMm} mm` : null;
      const cn = (aName && bName) ? `Conecta: ${aName} ↔ ${bName}` : null;
      const info = [cn, nn].filter(Boolean).join(' · ');
      const hint = '2º toque: editar (aplica al nivel)';
      this._beamTooltipSub.textContent = info ? `${info} — ${hint}` : hint;
    }

    this._beamTooltipHit = hit;
    this._beamTooltipEl.classList.remove('zv-hidden');

    if (this._beamTooltipTimer) {
      try { clearTimeout(this._beamTooltipTimer); } catch (e) {}
      this._beamTooltipTimer = null;
    }
    this._beamTooltipTimer = setTimeout(() => {
      this._hideBeamTooltip(true);
    }, 2500);

    this._updateBeamTooltipPosition();
  };

  proto._hideBeamTooltip = function(keepSelection) {
    if (this._beamTooltipTimer) {
      try { clearTimeout(this._beamTooltipTimer); } catch (e) {}
      this._beamTooltipTimer = null;
    }
    if (this._beamTooltipEl) {
      this._beamTooltipEl.classList.add('zv-hidden');
    }
    this._beamTooltipHit = null;

    if (!keepSelection) {
      try {
        if (this.sceneManager && typeof this.sceneManager.setSelectedBeam === 'function') {
          this.sceneManager.setSelectedBeam(null);
        }
      } catch (e) {}
      this._lastBeamMeshUuid = null;
    }
  };

  proto._clearBeamTooltipAndSelection = function() {
    this._hideBeamTooltip(false);
    this._lastBeamTapTime = null;
  };

  proto._updateBeamTooltipPosition = function() {
    if (!this._beamTooltipEl || this._beamTooltipEl.classList.contains('zv-hidden')) return;
    if (!this._beamTooltipHit || !this._beamTooltipHit.mesh) return;
    if (!this.sceneManager || !this.sceneManager.camera || !this.sceneManager.renderer) return;

    const mesh = this._beamTooltipHit.mesh;
    const cam = this.sceneManager.camera;
    const renderer = this.sceneManager.renderer;

    const v = new THREE.Vector3();
    try { mesh.getWorldPosition(v); } catch (e) { return; }

    v.project(cam);

    const x = (v.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
    const y = (-(v.y * 0.5) + 0.5) * renderer.domElement.clientHeight;

    const rect = renderer.domElement.getBoundingClientRect();
    const left = rect.left + x;
    const top = rect.top + y;

    this._beamTooltipEl.style.left = `${left}px`;
    this._beamTooltipEl.style.top = `${top}px`;
  };

  proto._initBeamEditModal = function() {
    if (this._beamModalOverlay) return;

    const overlay = document.createElement('div');
    overlay.className = 'zv-modal-overlay zv-hidden';

    const modal = document.createElement('div');
    modal.className = 'zv-modal';
    overlay.appendChild(modal);

    const title = document.createElement('div');
    title.className = 'zv-modal-title';
    title.textContent = 'Editar viga';
    modal.appendChild(title);
    this._beamModalTitle = title;

    const subtitle = document.createElement('div');
    subtitle.className = 'zv-modal-subtitle';
    subtitle.textContent = '';
    modal.appendChild(subtitle);
    this._beamModalSubtitle = subtitle;

    const body = document.createElement('div');
    body.className = 'zv-modal-body';
    modal.appendChild(body);

    const rowW = document.createElement('div');
    rowW.className = 'zv-modal-row';
    rowW.innerHTML = '<div class="zv-modal-label">Ancho B (mm)</div>';
    const inW = document.createElement('input');
    inW.className = 'zv-modal-input';
    inW.type = 'number';
    inW.min = '1';
    inW.step = '1';
    rowW.appendChild(inW);
    body.appendChild(rowW);
    this._beamModalWidth = inW;

    const rowH = document.createElement('div');
    rowH.className = 'zv-modal-row';
    rowH.innerHTML = '<div class="zv-modal-label">Alto / Espesor H (mm)</div>';
    const inH = document.createElement('input');
    inH.className = 'zv-modal-input';
    inH.type = 'number';
    inH.min = '1';
    inH.step = '1';
    rowH.appendChild(inH);
    body.appendChild(rowH);
    this._beamModalHeight = inH;

    const rowBtns = document.createElement('div');
    rowBtns.className = 'zv-modal-row zv-modal-row-inline';

    const btnRestore = document.createElement('button');
    btnRestore.className = 'zv-btn zv-btn-secondary';
    btnRestore.textContent = 'Restaurar dimensiones del nivel';
    rowBtns.appendChild(btnRestore);

    body.appendChild(rowBtns);

    const footer = document.createElement('div');
    footer.className = 'zv-modal-footer';
    modal.appendChild(footer);

    const btnCancel = document.createElement('button');
    btnCancel.className = 'zv-btn zv-btn-secondary';
    btnCancel.textContent = 'Cancelar';

    const btnDelete = document.createElement('button');
    btnDelete.className = 'zv-btn zv-btn-danger';
    btnDelete.textContent = 'Eliminar viga';

    const btnView = document.createElement('button');
    btnView.className = 'zv-btn zv-btn-secondary';
    btnView.textContent = 'Ver viga';

    const btnApply = document.createElement('button');
    btnApply.className = 'zv-btn zv-btn-primary';
    btnApply.textContent = 'Aplicar';

    footer.appendChild(btnCancel);
    footer.appendChild(btnView);
    footer.appendChild(btnDelete);
    footer.appendChild(btnApply);

    document.body.appendChild(overlay);

    const close = () => this._closeBeamEditModal();

    overlay.addEventListener('pointerdown', (e) => {
      if (e.target === overlay) close();
    });
    btnCancel.addEventListener('click', close);
    btnApply.addEventListener('click', () => this._applyBeamEditModal());
    btnRestore.addEventListener('click', () => this._restoreBeamEditModal());
    btnDelete.addEventListener('click', () => this._deleteSelectedBeamFromModal());
    btnView.addEventListener('click', () => this._openBeamViewerFromEditModal());

    // Usar AbortController para poder remover el listener al destruir el modal
    this._beamModalAbortCtrl = new AbortController();
    document.addEventListener('keydown', (e) => {
      if (overlay.classList.contains('zv-hidden')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'Enter') this._applyBeamEditModal();
    }, { signal: this._beamModalAbortCtrl.signal });

    this._beamModalOverlay = overlay;
    this._beamModalDeleteBtn = btnDelete;
    this._beamModalViewBtn = btnView;
    this._beamModalApplyBtn = btnApply;
    this._beamModalRestoreBtn = btnRestore;
  };

  proto._toggleBeamWireframe = function() {
    const sg = this.sceneManager && this.sceneManager.structureGroup;
    if (!sg) return;

    const gen = this.sceneManager.structureGenerator;
    if (!gen) return;

    const next = !this._beamEdgeMode;
    this._beamEdgeMode = next;

    // Construir EdgesGeometry bajo demanda (primera vez) o destruir
    gen.buildBeamEdgeLines(next);

    // Mostrar/ocultar meshes sólidos de vigas
    for (const obj of sg.children) {
      if (!obj || !obj.userData) continue;
      if (obj.userData.isBeam)     obj.visible = !next;
      if (obj.userData.isBeamEdge)  obj.visible = next;
    }

    if (this.beamWireframeBtn) {
      this.beamWireframeBtn.classList.toggle('active', next);
      const statusEl = this.beamWireframeBtn.querySelector('.button-status');
      if (statusEl) statusEl.textContent = next ? '●' : '○';
    }

    if (this.sceneManager) this.sceneManager._needsRender = true;
  };

  proto._closeBeamEditModal = function() {
    if (!this._beamModalOverlay) return;
    this._beamModalOverlay.classList.add('zv-hidden');
    this._beamEditHit = null;

    // Liberar listener de teclado registrado con AbortController
    if (this._beamModalAbortCtrl) {
      this._beamModalAbortCtrl.abort();
      this._beamModalAbortCtrl = null;
    }

    // limpiar selección en escena
    try {
      if (this.sceneManager && typeof this.sceneManager.setSelectedBeam === 'function') {
        this.sceneManager.setSelectedBeam(null);
      }
    } catch (e) {}

    // también ocultar tooltip si estaba visible
    try { this._hideBeamTooltip(true); } catch (e) {}
  };

  proto._openBeamViewerFromEditModal = function() {
    const hit = this._beamEditHit;
    if (!hit || !hit.mesh) return;
    // Ocultar modal de edición (pero mantener el estado) y abrir visor aislado
    if (this._beamModalOverlay) this._beamModalOverlay.classList.add('zv-hidden');
    this._beamViewerReturnToEdit = true;
    this._openBeamViewerModal(hit);
  };

  proto._initBeamViewerModal = function() {
    if (this._beamViewerOverlay) return;

    const overlay = document.createElement('div');
    overlay.className = 'zv-modal-overlay zv-hidden';
    overlay.id = 'beamViewerOverlay';

    const modal = document.createElement('div');
    modal.className = 'zv-modal zv-modal-wide';
    overlay.appendChild(modal);

    const header = document.createElement('div');
    header.className = 'zv-beamviewer-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'zv-beamviewer-titlewrap';

    const title = document.createElement('div');
    title.className = 'zv-modal-title zv-beamviewer-title';
    title.textContent = 'Viga';
    titleWrap.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.className = 'zv-modal-subtitle zv-beamviewer-subtitle';
    subtitle.textContent = '';
    titleWrap.appendChild(subtitle);

    const btnClose = document.createElement('button');
    btnClose.className = 'zv-btn zv-btn-secondary zv-beamviewer-close';
    btnClose.textContent = 'Cerrar';

    header.appendChild(titleWrap);
    header.appendChild(btnClose);
    modal.appendChild(header);

    const toolbar = document.createElement('div');
    toolbar.className = 'zv-beamviewer-toolbar';

    const mkBtn = (label) => {
      const b = document.createElement('button');
      b.className = 'zv-btn zv-btn-secondary zv-beamviewer-viewbtn';
      b.textContent = label;
      return b;
    };

    const btnPlan = mkBtn('Planta');
    const btnSide = mkBtn('Lateral');
    const btnIso = mkBtn('Isométrica');
    const btnFree = mkBtn('Rotación libre');
    const btnConn = mkBtn('Mostrar conectores');

    const spacer = document.createElement('div');
    spacer.className = 'zv-beamviewer-spacer';

    const btnPdf = document.createElement('button');
    btnPdf.className = 'zv-btn zv-btn-primary';
    btnPdf.textContent = 'Descargar PDF';

    toolbar.appendChild(btnPlan);
    toolbar.appendChild(btnSide);
    toolbar.appendChild(btnIso);
    toolbar.appendChild(btnFree);
    toolbar.appendChild(btnConn);
    toolbar.appendChild(spacer);
    toolbar.appendChild(btnPdf);

    modal.appendChild(toolbar);

    const body = document.createElement('div');
    body.className = 'zv-beamviewer-body';

    const canvas = document.createElement('canvas');
    canvas.className = 'zv-beamviewer-canvas';
    canvas.setAttribute('aria-label', 'Visor de viga');
    body.appendChild(canvas);

    modal.appendChild(body);

    document.body.appendChild(overlay);

    const close = () => this._closeBeamViewerModal();

    overlay.addEventListener('pointerdown', (e) => {
      if (e.target === overlay) close();
    });
    btnClose.addEventListener('click', close);

    // View buttons
    btnPlan.addEventListener('click', () => this._beamViewerSetView('plan'));
    btnSide.addEventListener('click', () => this._beamViewerSetView('side'));
    btnIso.addEventListener('click', () => this._beamViewerSetView('iso'));
    btnFree.addEventListener('click', () => this._beamViewerSetView('free'));
    btnConn.addEventListener('click', () => this._beamViewerToggleConnectors());

    btnPdf.addEventListener('click', async () => {
      const hit = this._beamViewerHit;
      if (!hit || !hit.mesh) return;
      try {
        this.showNotification('Generando PDF de la viga...', 'info');
        await new Promise(r => setTimeout(r, 120));
        await BeamPDFReporter.generateSingleBeamReport(hit.mesh, this.sceneManager);
        this.showNotification('PDF generado', 'success');
      } catch (err) {
        console.error(err);
        this.showNotification('Error generando PDF de la viga', 'error');
      }
    });

    // Keydown (Esc)
    this._beamViewerAbortCtrl = new AbortController();
    document.addEventListener('keydown', (e) => {
      if (overlay.classList.contains('zv-hidden')) return;
      if (e.key === 'Escape') close();
    }, { signal: this._beamViewerAbortCtrl.signal });

    // Refs
    this._beamViewerOverlay = overlay;
    this._beamViewerCanvas = canvas;
    this._beamViewerTitleEl = title;
    this._beamViewerSubtitleEl = subtitle;
    this._beamViewerBtnPlan = btnPlan;
    this._beamViewerBtnSide = btnSide;
    this._beamViewerBtnIso = btnIso;
    this._beamViewerBtnFree = btnFree;
    this._beamViewerBtnConn = btnConn;
    this._beamViewerBtnPdf = btnPdf;

    // Resize handler (solo mientras esté abierto)
    this._beamViewerResizeHandler = () => {
      if (!this._beamViewerOverlay || this._beamViewerOverlay.classList.contains('zv-hidden')) return;
      this._beamViewerResize();
    };
    window.addEventListener('resize', this._beamViewerResizeHandler);
  };

  proto._openBeamViewerModal = function(hit) {
    if (!hit || !hit.mesh) return;
    if (!this._beamViewerOverlay) this._initBeamViewerModal();

    this._beamViewerHit = hit;
    this._beamViewerReturnToEdit = !!this._beamViewerReturnToEdit;

    // Título / subtítulo informativo
    const mesh = hit.mesh;
    const info = (mesh && mesh.userData && mesh.userData.beamInfo) ? mesh.userData.beamInfo : {};

    // Mostrar conectores en el mismo orden que el PDF de vigas:
    // izquierda = nivel mas abajo (kLo), derecha = nivel mas arriba (kHi).
    // Para kLo==kHi (vigas horizontales / piso con corte) el PDF muestra kX ↔ kX.
    const aNameRaw = info && info.a ? info.a.name : null;
    const bNameRaw = info && info.b ? info.b.name : null;
    const pair = (typeof BeamPDFReporter !== 'undefined' && BeamPDFReporter && typeof BeamPDFReporter._normalizeConnPair === 'function')
      ? BeamPDFReporter._normalizeConnPair(info)
      : null;

    // Mostrar niveles VISIBLES al usuario (misma logica que PDF de vigas).
    // - Con corte activo: kVisible = kOriginal - cutLevel (clamp a >=0)
    // - Sin corte: kVisible = kOriginal
    // Para conectores especiales (X / polos) usamos el formateador visible del PDF.
    const aKey = info ? info.aKey : null;
    const bKey = info ? info.bKey : null;
    const hasPdfFormat = (typeof BeamPDFReporter !== 'undefined' && BeamPDFReporter && typeof BeamPDFReporter._formatConnectorKeyVisible === 'function');
    const isSpecialA = (typeof aKey === 'string') && (aKey.startsWith('X:') || aKey === 'pole_low' || aKey === 'pole_top');
    const isSpecialB = (typeof bKey === 'string') && (bKey.startsWith('X:') || bKey === 'pole_low' || bKey === 'pole_top');

    const leftName = (pair && Number.isFinite(pair.kLo) && typeof BeamPDFReporter._toVisibleK === 'function')
      ? `k${BeamPDFReporter._toVisibleK(pair.kLo)}`
      : (isSpecialA && hasPdfFormat ? BeamPDFReporter._formatConnectorKeyVisible(aKey) : (aNameRaw || ''));

    const rightName = (pair && Number.isFinite(pair.kHi) && typeof BeamPDFReporter._toVisibleK === 'function')
      ? `k${BeamPDFReporter._toVisibleK(pair.kHi)}`
      : (isSpecialB && hasPdfFormat ? BeamPDFReporter._formatConnectorKeyVisible(bKey) : (bNameRaw || ''));
    const connectTxt = (leftName && rightName) ? `${leftName} ↔ ${rightName}` : '';
    const lenMm = (mesh && typeof BeamPDFReporter._beamLengthWorld === 'function') ? Math.round(BeamPDFReporter._beamLengthWorld(mesh) * 1000) : null;

    if (this._beamViewerTitleEl) this._beamViewerTitleEl.textContent = 'Ver viga (aislada)';
    if (this._beamViewerSubtitleEl) {
      this._beamViewerSubtitleEl.textContent = `${connectTxt}${lenMm != null ? `  •  L=${lenMm} mm` : ''}`;
    }

    // Construir escena del visor
    try {
      this._beamViewerBuild(mesh);
      // Estado inicial: conectores ocultos
      if (this._beamViewer) {
        this._beamViewer.connectorsVisible = false;
      }
      if (this._beamViewerBtnConn) {
        this._beamViewerBtnConn.textContent = 'Mostrar conectores';
        this._beamViewerBtnConn.classList.remove('zv-btn-primary');
        this._beamViewerBtnConn.classList.add('zv-btn-secondary');
      }
    } catch (err) {
      console.error(err);
      this.showNotification('No se pudo abrir el visor de la viga', 'error');
      return;
    }

    this._beamViewerOverlay.classList.remove('zv-hidden');
    // Vista por defecto: rotación libre
    this._beamViewerSetView('free');
    // Ajuste final a tamaño
    this._beamViewerResize();
  };

  proto._closeBeamViewerModal = function() {
    if (!this._beamViewerOverlay) return;
    this._beamViewerOverlay.classList.add('zv-hidden');

    // Liberar GPU / listeners del visor
    try { this._beamViewerDispose(); } catch (e) {}

    // Volver al modal de edición si veníamos desde ahí
    const shouldReturn = !!this._beamViewerReturnToEdit;
    this._beamViewerReturnToEdit = false;
    if (shouldReturn && this._beamEditHit && this._beamModalOverlay) {
      // Re-mostrar sin recalcular
      this._beamModalOverlay.classList.remove('zv-hidden');
      try {
        if (this.sceneManager && typeof this.sceneManager.setSelectedBeam === 'function') {
          this.sceneManager.setSelectedBeam(this._beamEditHit.mesh || null);
        }
      } catch (e) {}
    }

    this._beamViewerHit = null;
  };

  proto._beamViewerDispose = function() {
    const v = this._beamViewer;
    if (!v) return;

    // Remover el resize handler del visor antes de liberar GPU
    if (this._beamViewerResizeHandler) {
      window.removeEventListener('resize', this._beamViewerResizeHandler);
      this._beamViewerResizeHandler = null;
    }

    // Liberar listener de teclado del visor
    if (this._beamViewerAbortCtrl) {
      this._beamViewerAbortCtrl.abort();
      this._beamViewerAbortCtrl = null;
    }

    try {
      if (v.controls) v.controls.dispose();
    } catch (e) {}

    try {
      if (v.scene) {
        v.scene.traverse((obj) => {
          if (!obj) return;
          if (obj.geometry && typeof obj.geometry.dispose === 'function') obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach(m => m && m.dispose && m.dispose());
            } else if (obj.material.dispose) {
              obj.material.dispose();
            }
          }
        });
      }
    } catch (e) {}

    try {
      if (v.renderer) v.renderer.dispose();
    } catch (e) {}

    this._beamViewer = null;
  };

  proto._beamViewerBuild = function(mesh) {
    if (!mesh || !this._beamViewerCanvas) return;

    // Re-crear (si existía)
    if (this._beamViewer) this._beamViewerDispose();

    const canvas = this._beamViewerCanvas;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    const scene = new THREE.Scene();
    scene.background = null;

    // Luces
    scene.add(new THREE.AmbientLight(0xffffff, 0.95));
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(2.2, -3.5, 4.2);
    scene.add(dir);

    // Construcción de la viga en sistema canónico (mismas transformaciones lineales que PDF)
    const info = (mesh.userData && mesh.userData.beamInfo) ? mesh.userData.beamInfo : {};
    const widthMm = Number.isFinite(info.widthMm) ? info.widthMm : null;
    const heightMm = Number.isFinite(info.heightMm) ? info.heightMm : null;

    const vertsW = BeamPDFReporter._getBeamVerticesWorld(mesh);
    if (!vertsW) throw new Error('No se pudieron leer los vértices de la viga.');

    // Inferir cara exterior si hay objFaces/objQuads (igual que PDF)
    const eDir = (info && info.edgeDir && info.edgeDir.isVector3) ? info.edgeDir
      : (info && info.a && info.b && info.a.pos && info.b.pos ? new THREE.Vector3().subVectors(info.b.pos, info.a.pos) : null);

    const outer = BeamPDFReporter._inferOuterFaceFromObjFaces(mesh, info, vertsW, eDir);
    if (outer) {
      if (!info.faces) info.faces = {};
      info.faces.outer = outer;
    }

    const basis = BeamPDFReporter._computeBeamBasis(vertsW, info, { widthMm, heightMm });
    if (!basis) throw new Error('No se pudo calcular la base local de la viga.');

    const pair = BeamPDFReporter._normalizeConnPair(info);
    BeamPDFReporter._ensureBasisDirectionByLevels(basis, info, pair);

    // Matriz mundo->canónico (x=e, y=w, z=t) y centrado en el centroide
    const mBasis = new THREE.Matrix4().makeBasis(basis.e, basis.w, basis.t);
    const mInv = mBasis.clone().invert();
    const mT = new THREE.Matrix4().makeTranslation(-basis.c.x, -basis.c.y, -basis.c.z);
    const mWorldToCanon = mInv.clone().multiply(mT);

    // Determinar qué lado (±Z canónico) corresponde al ANCHO EXTERIOR (cara por donde pasa la arista).
    // En el sistema canónico: x=e, y=w, z=t. El "exterior" debe quedar hacia la cámara en Planta,
    // y hacia arriba en Lateral / Rotación libre.
    let _outerSign = -1;
    try {
      const outerIdx = (info && info.faces && Array.isArray(info.faces.outer)) ? info.faces.outer
        : (Array.isArray(outer) ? outer : null);
      if (outerIdx && outerIdx.length >= 4 && Array.isArray(vertsW) && vertsW.length >= 8) {
        const vertsCanon = vertsW.map(p => p.clone().applyMatrix4(mWorldToCanon));
        const zAvg = (vertsCanon[outerIdx[0]].z + vertsCanon[outerIdx[1]].z + vertsCanon[outerIdx[2]].z + vertsCanon[outerIdx[3]].z) / 4;
        _outerSign = (zAvg >= 0) ? 1 : -1;
      }
    } catch (e) {}

    // Clonar geometría y llevarla a mundo antes de canonizar
    const geom = mesh.geometry.clone();
    // Asegurar matrixWorld actualizada (por seguridad)
    try { mesh.updateWorldMatrix(true, false); } catch (e) {}
    // Transformación a mundo (por seguridad)
    try { geom.applyMatrix4(mesh.matrixWorld); } catch (e) {}
    geom.applyMatrix4(mWorldToCanon);
    geom.computeBoundingBox();
    geom.computeBoundingSphere();

    const mat = new THREE.MeshStandardMaterial({
      color: 0x7CFF9A, // verde claro para mejor lectura
      
      roughness: 0.45,
      metalness: 0.05,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide
    });
    const beam = new THREE.Mesh(geom, mat);
    beam.renderOrder = 1;

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geom),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthTest: true })
    );
    edges.renderOrder = 2;

    const group = new THREE.Group();
    group.add(beam);
    group.add(edges);
    scene.add(group);

    // Camera ortográfica (permite vistas ortogonales reales + zoom)
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 5000);

    const controls = new OrbitControls(camera, renderer.domElement);

    // Controles (igual que antes): amortiguación simple y gestos por defecto
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.enableZoom = true;
    const bb = geom.boundingBox;
    const center = bb.getCenter(new THREE.Vector3());
    const size = bb.getSize(new THREE.Vector3());
    const radius = geom.boundingSphere ? geom.boundingSphere.radius : size.length() * 0.5;

    controls.target.copy(center);

    this._beamViewer = {
      renderer,
      scene,
      camera,
      controls,
      outerSign: _outerSign,
      group,
      beamName: (mesh && mesh.name) ? mesh.name : null,
      center,
      size,
      radius,
      worldToCanon: mWorldToCanon.clone(),
      connectorKeys: [info && info.aKey ? info.aKey : null, info && info.bKey ? info.bKey : null].filter(Boolean),
      connectorsVisible: false,
      connectorsGroup: null,
      baseHalfHeight: Math.max(0.01, radius * 1.2),
      mode: 'free'
    };

    // Render-on-demand
    controls.addEventListener('change', () => this._beamViewerRender());
    this._beamViewerRender();
  };

  proto._beamViewerResize = function() {
    const v = this._beamViewer;
    if (!v || !v.renderer || !v.camera || !this._beamViewerCanvas) return;

    const canvas = this._beamViewerCanvas;
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;

    v.renderer.setSize(w, h, false);

    const aspect = w / h;
    const halfH = v.baseHalfHeight;

    v.camera.left = -halfH * aspect;
    v.camera.right = halfH * aspect;
    v.camera.top = halfH;
    v.camera.bottom = -halfH;
    v.camera.updateProjectionMatrix();

    this._beamViewerRender();
  };

  proto._beamViewerSetView = function(mode) {
    const v = this._beamViewer;
    if (!v) return;
    v.mode = mode;

    // Estado visual de botones
    const setActive = (btn, active) => {
      if (!btn) return;
      btn.classList.toggle('zv-btn-primary', !!active);
      btn.classList.toggle('zv-btn-secondary', !active);
    };
    setActive(this._beamViewerBtnPlan, mode === 'plan');
    setActive(this._beamViewerBtnSide, mode === 'side');
    setActive(this._beamViewerBtnIso, mode === 'iso');
    setActive(this._beamViewerBtnFree, mode === 'free');

    const c = v.center || new THREE.Vector3();
    const dist = Math.max(0.2, v.radius * 3.0);

    // Por defecto: permitir zoom/pan. En vistas fijas deshabilitamos rotación.
    v.controls.enableRotate = (mode === 'free');

    if (mode === 'plan') {
      v.camera.up.set(0, 1, 0);
      // Planta: mirar desde el ANCHO EXTERIOR hacia el interior.
      const os = (Number.isFinite(v.outerSign) ? v.outerSign : -1);
      v.camera.position.set(c.x, c.y, c.z + os * dist);
    } else if (mode === 'side') {
      // Lateral (Largo vs Alto): mirar en el ancho (±Y) y dejar el ANCHO EXTERIOR hacia ARRIBA.
      const os = (Number.isFinite(v.outerSign) ? v.outerSign : -1);
      v.camera.up.set(0, 0, os);
      v.camera.position.set(c.x, c.y - dist, c.z);
    } else if (mode === 'iso') {
      const os = (Number.isFinite(v.outerSign) ? v.outerSign : -1);
      v.camera.up.set(0, 0, os);
      v.camera.position.set(c.x + dist, c.y + dist, c.z + dist);
    } else { // free
      // Rotación libre: mantener el ANCHO EXTERIOR hacia ARRIBA (evitar que se invierta).
      const os = (Number.isFinite(v.outerSign) ? v.outerSign : -1);
      v.camera.up.set(0, 0, os);
      if (v.camera.position.distanceToSquared(c) < 1e-6) {
        v.camera.position.set(c.x + dist, c.y + dist, c.z + dist);
      }
    }

    v.camera.lookAt(c);
    v.controls.target.copy(c);
    v.controls.update();
    this._beamViewerRender();
  };

  proto._beamViewerRender = function() {
    const v = this._beamViewer;
    if (!v || !v.renderer || !v.scene || !v.camera) return;
    try {
      v.renderer.render(v.scene, v.camera);
    } catch (e) {}
  };

  proto._beamViewerToggleConnectors = function() {
    const v = this._beamViewer;
    if (!v) return;

    const next = !v.connectorsVisible;

    try {
      if (next) this._beamViewerAddConnectors();
      else this._beamViewerRemoveConnectors();
    } catch (e) {
      console.error(e);
    }

    v.connectorsVisible = next;

    if (this._beamViewerBtnConn) {
      this._beamViewerBtnConn.textContent = next ? 'Ocultar conectores' : 'Mostrar conectores';
      this._beamViewerBtnConn.classList.toggle('zv-btn-primary', !!next);
      this._beamViewerBtnConn.classList.toggle('zv-btn-secondary', !next);
    }

    // Si activamos conectores, asegurar que el encuadre incluya el cilindro completo
    if (next) {
      try {
        const box = new THREE.Box3().setFromObject(v.group);
        const size = box.getSize(new THREE.Vector3());
        const r = size.length() * 0.5;
        if (isFinite(r) && r > 0) {
          v.baseHalfHeight = Math.max(v.baseHalfHeight || 0.01, r * 1.25);
        }
        this._beamViewerResize();
      } catch (e) {}
    }

    this._beamViewerRender();
  };

  proto._beamViewerAddConnectors = function() {
    const v = this._beamViewer;
    if (!v || !v.scene || !v.group || !v.worldToCanon) return;
    if (!this.sceneManager || !this.sceneManager.structureGroup) return;
    if (v.connectorsGroup) return;

    const keys = Array.isArray(v.connectorKeys) ? v.connectorKeys : [];
    if (!keys.length) return;

    const src = this._beamViewerFindConnectorMeshesByKeys(keys);
    if (!src.length) return;

    const cg = new THREE.Group();
    cg.name = 'beamViewerConnectors';

    for (const obj of src) {
      if (!obj || !obj.isMesh || !obj.geometry) continue;

      // Añadir el conector
      const objectsToAdd = [obj];

      // Añadir TODAS las pletinas que pertenecen a ESTE conector (no a todo el nivel).
      // Las pletinas en esta app están creadas por viga (plat_A_<beam>, plat_B_<beam>), por lo que para
      // reconstruir el conector completo en el visor aislado debemos tomar todas las pletinas que estén
      // físicamente cerca del cilindro del conector.
      try {
        const sg = this.sceneManager.structureGroup;

        // Centro del conector en mundo
        const cpos = new THREE.Vector3();
        if (obj.userData && obj.userData._isInstanceProxy && obj.userData._worldPos) {
          // La geometría del proxy ya está pre-transformada a mundo; _worldPos es el centro
          cpos.copy(obj.userData._worldPos);
        } else {
          obj.getWorldPosition(cpos);
        }

        // Radio aproximado del conector: desde la bbox de la geometría (ya en mundo para proxies)
        let rConn = 0.05;
        try {
          const bb = new THREE.Box3();
          if (obj.userData && obj.userData._isInstanceProxy) {
            bb.setFromBufferAttribute(obj.geometry.attributes.position);
          } else {
            bb.setFromObject(obj);
          }
          if (!bb.isEmpty()) {
            const sz = bb.getSize(new THREE.Vector3());
            rConn = Math.max(sz.x, sz.y, sz.z) * 0.35;
          }
        } catch (e) {}
        // heurística estable

        // Umbral: radio con margen + largo típico de pletina
        const thresh = Math.max(rConn * 4.0, 0.25);

        for (const child of sg.children) {
          if (!child || !child.isMesh || !child.userData || !child.userData.isPlate) continue;

          // Centro de la pletina en mundo
          const pbb = new THREE.Box3().setFromObject(child);
          const pc = pbb.getCenter(new THREE.Vector3());

          if (pc.distanceTo(cpos) <= thresh) objectsToAdd.push(child);
        }
      } catch (e) {}


      for (const srcObj of objectsToAdd) {
      const g = srcObj.geometry.clone();
      if (srcObj.userData && srcObj.userData._isInstanceProxy) {
        // Geometría ya en espacio mundo (iMesh.matrixWorld × instanceMatrix aplicado en find).
        // Solo falta llevar a canónico.
        try { g.applyMatrix4(v.worldToCanon); } catch (e) {}
      } else {
        try { srcObj.updateWorldMatrix(true, false); } catch (e) {}
        try { g.applyMatrix4(srcObj.matrixWorld); } catch (e) {}
        try { g.applyMatrix4(v.worldToCanon); } catch (e) {}
      }
      try { g.computeBoundingBox(); g.computeBoundingSphere(); } catch (e) {}

      // Material (clonado para no afectar el original)
      let mat = srcObj.material;
      let matClone = null;
      if (Array.isArray(mat)) {
        matClone = mat.map(m => (m && m.clone) ? m.clone() : m);
      } else {
        matClone = (mat && mat.clone) ? mat.clone() : new THREE.MeshStandardMaterial({ color: 0xffa500 });
      }

      const cm = new THREE.Mesh(g, matClone);
      cm.renderOrder = 3;

      // Un poco de transparencia para leer bien la viga
      try {
        if (Array.isArray(cm.material)) {
          for (const m2 of cm.material) {
            if (!m2) continue;
            m2.transparent = true;
            const baseOp = (m2.opacity != null) ? m2.opacity : 1;
            m2.opacity = Math.min(0.92, baseOp);
          }
        } else if (cm.material) {
          cm.material.transparent = true;
          const baseOp = (cm.material.opacity != null) ? cm.material.opacity : 1;
          cm.material.opacity = Math.min(0.92, baseOp);
        }
      } catch (e) {}

      cg.add(cm);

      // Contorno para mayor legibilidad
      try {
        const e = new THREE.LineSegments(
          new THREE.EdgesGeometry(g),
          new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })
        );
        e.renderOrder = 4;
        cg.add(e);
      } catch (e) {}
      } // fin loop objectsToAdd
    }

    v.connectorsGroup = cg;
    v.group.add(cg);
  };

  proto._beamViewerRemoveConnectors = function() {
    const v = this._beamViewer;
    if (!v || !v.connectorsGroup) return;

    try { v.group.remove(v.connectorsGroup); } catch (e) {}

    try {
      v.connectorsGroup.traverse((obj) => {
        if (!obj) return;
        if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m && m.dispose && m.dispose());
          else if (obj.material.dispose) obj.material.dispose();
        }
      });
    } catch (e) {}

    v.connectorsGroup = null;
  };

  proto._beamViewerFindConnectorMeshesByKeys = function(keys) {
    const g = this.sceneManager && this.sceneManager.structureGroup ? this.sceneManager.structureGroup : null;
    if (!g || !Array.isArray(keys) || !keys.length) return [];
    const want = new Set(keys);
    const out = [];

    // Caso 1: Meshes individuales (proxies, legacy)
    g.traverse((obj) => {
      if (!obj || !obj.userData || !obj.userData.isConnector) return;
      const ci = obj.userData.connectorInfo;
      const key = this._beamViewerKeyForConnector(ci);
      if (key && want.has(key)) out.push(obj);
    });
    if (out.length) return out;

    // Caso 2: InstancedMesh — extraer geometría + instanceMatrix directamente del batch.
    // Usamos iMesh.matrixWorld × instanceMatrix para obtener el transform en mundo,
    // exactamente igual a como Three.js renderiza cada instancia.
    const sg2 = this.sceneManager && this.sceneManager.structureGenerator;
    const iMap = sg2 && sg2._instanceConnectorMap;
    if (!iMap) return out;

    const _m4 = new THREE.Matrix4();

    for (const [iMesh, infoArray] of iMap) {
      if (!iMesh || !iMesh.geometry) continue;
      try { iMesh.updateWorldMatrix(true, false); } catch (e) {}

      for (let instanceId = 0; instanceId < infoArray.length; instanceId++) {
        const ci = infoArray[instanceId];
        if (!ci) continue;
        const key = this._beamViewerKeyForConnector(ci);
        if (!key || !want.has(key)) continue;

        // Matriz de la instancia en espacio local del InstancedMesh
        iMesh.getMatrixAt(instanceId, _m4);
        // Llevar a mundo: matrixWorld × instanceMatrix
        const mWorld = iMesh.matrixWorld.clone().multiply(_m4);

        // Clonar geometría del batch y aplicar el transform de mundo
        const geom = iMesh.geometry.clone();
        geom.applyMatrix4(mWorld);

        const mat = iMesh.material
          ? (Array.isArray(iMesh.material) ? iMesh.material[0].clone() : iMesh.material.clone())
          : new THREE.MeshStandardMaterial({ color: 0x888888 });

        const proxy = new THREE.Mesh(geom, mat);
        // proxy ya está en espacio mundo — matrix = Identity, worldToCanon se aplicará luego
        proxy.userData.isConnector = true;
        proxy.userData.connectorInfo = ci;
        proxy.userData._isInstanceProxy = true;
        proxy.userData._worldPos = new THREE.Vector3().setFromMatrixPosition(mWorld);
        out.push(proxy);
      }
    }
    return out;
  };

  proto._beamViewerKeyForConnector = function(ci) {
    if (!ci) return null;
    const k = Number(ci.kOriginal);
    const i = Number(ci.i);

    // Conector de intersección (cruce de diagonales)
    if (ci.id && String(ci.id).charAt(0) === 'X') {
      if (isFinite(k) && isFinite(i)) return `X:${k}:${i}`;
    }


    // BUG-M3 fix: identificar polos por kOriginal (0 = polo bajo, N = polo alto).
    // Antes se comparaba ci.id con 'pole_low'/'pole_top' pero el generador asigna 'C0-0'.
    const N = state ? state.N : null;
    if (k === 0) return 'pole_low';
    if (N != null && k === N) return 'pole_top';

    if (!isFinite(k) || !isFinite(i)) return null;
    return `k${k}_i${i}`;
  };

  proto._edgeKeyFromBeamInfo = function(bi) {
    if (!bi) return null;
    const aKey = bi.aKey;
    const bKey = bi.bKey;
    if (aKey && bKey) return (aKey < bKey) ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
    // Fallback (sin conectores centrales): derivar desde (k,i)
    const vKey = (k, i) => {
      // BUG-M4 fix: colapsar k==0/N a polos para que el fallback sea consistente con los conectores reales.
      const _N = (state && state.N) ? state.N : null;
      if (k === 0) return 'pole_low';
      if (_N != null && k === _N) return 'pole_top';
      return `k${k}_i${i}`;
    };
    const ak = (bi && bi.a) ? bi.a.k : null;
    const ai = (bi && bi.a) ? bi.a.i : null;
    const bk = (bi && bi.b) ? bi.b.k : null;
    const bi2 = (bi && bi.b) ? bi.b.i : null;
    if (!isFinite(ak) || !isFinite(ai) || !isFinite(bk) || !isFinite(bi2)) return null;
    const A = vKey(ak, ai);
    const B = vKey(bk, bi2);
    return (A < B) ? `${A}|${B}` : `${B}|${A}`;
  };

  proto._openBeamEditModal = function(hit) {
    if (!hit || !hit.mesh) return;
    if (!state.structureParams) return;
    if (!this._beamModalOverlay) this._initBeamEditModal();

    const kLevelOriginal = hit.kLevelOriginal;
    const baseW = Number(state.structureParams.beamWidthMm) || 1;
    const baseH = Number(state.structureParams.beamHeightMm ?? state.structureParams.beamThicknessMm) || 1;

    const ov = (state.structureBeamOverrides && (state.structureBeamOverrides[String(kLevelOriginal)] || state.structureBeamOverrides[kLevelOriginal])) || null;
    const currentW = ov && ov.beamWidthMm != null ? Number(ov.beamWidthMm) : (hit.widthMm != null ? Number(hit.widthMm) : baseW);
    const currentH = ov && ov.beamHeightMm != null ? Number(ov.beamHeightMm) : (hit.heightMm != null ? Number(hit.heightMm) : baseH);

    this._beamEditHit = hit;
    // Reset UI estado
    if (this._beamModalDeleteBtn) this._beamModalDeleteBtn.disabled = false;
    if (this._beamModalApplyBtn) this._beamModalApplyBtn.disabled = false;
    if (this._beamModalRestoreBtn) this._beamModalRestoreBtn.disabled = false;
    this._beamModalWidth.disabled = false;
    this._beamModalHeight.disabled = false;

    try {
      if (this.sceneManager && typeof this.sceneManager.setSelectedBeam === 'function') {
        this.sceneManager.setSelectedBeam(hit.mesh || null);
      }
    } catch (e) {}

    const kv = (hit.kVisible != null) ? hit.kVisible : kLevelOriginal;
    this._beamModalTitle.textContent = `Editar viga (nivel k${kv})`;
    if (this._beamModalSubtitle) {
      this._beamModalSubtitle.textContent = 'Se aplicará a todas las vigas del mismo nivel';
    }

    this._beamModalWidth.value = String(Math.round(currentW));
    this._beamModalHeight.value = String(Math.round(currentH));

    this._beamModalOverlay.classList.remove('zv-hidden');
    setTimeout(() => {
      // No auto-focus on mobile (prevents keyboard popping).
      try {
        const fine = window.matchMedia && window.matchMedia('(pointer:fine)').matches;
        if (fine) { this._beamModalWidth.focus(); this._beamModalWidth.select(); }
      } catch (e) {}
    }, 0);
  };

  proto._deleteSelectedBeamFromModal = function() {
    const hit = this._beamEditHit;
    if (!hit || !hit.mesh) return;
    if (!state.structureParams) return;

    const bi = hit.mesh.userData && hit.mesh.userData.beamInfo ? hit.mesh.userData.beamInfo : null;
    const ek = this._edgeKeyFromBeamInfo(bi);
    if (!ek) {
      this.showNotification('No se pudo identificar la viga para eliminar.', 'error');
      return;
    }

    if (!Array.isArray(state.structureDeletedBeams)) state.structureDeletedBeams = [];
    if (state.structureDeletedBeams.indexOf(ek) === -1) {
      state.structureDeletedBeams.push(ek);
    }

    try {
      this.sceneManager.generateConnectorStructure(state.structureParams);
      this._maybeShowStructureWarnings();
    } catch (err) {
      console.error(err);
      this.showNotification('No se pudo eliminar la viga (error al regenerar).', 'error');
      return;
    }

    // Cerrar modal inmediatamente (evita estados UI confusos)
    this.showNotification('Viga eliminada', 'success');
    this._closeBeamEditModal();
  };

  proto._applyBeamEditModal = function() {
    const hit = this._beamEditHit;
    if (!hit || !hit.mesh) return;
    if (!state.structureParams) return;

    const wMm = Number(this._beamModalWidth.value);
    const hMm = Number(this._beamModalHeight.value);

    if (!isFinite(wMm) || wMm <= 0 || !isFinite(hMm) || hMm <= 0) {
      this.showNotification('Valores inválidos. Usa números positivos en mm.', 'error');
      return;
    }

    const k = hit.kLevelOriginal;
    if (!state.structureBeamOverrides || typeof state.structureBeamOverrides !== 'object') {
      state.structureBeamOverrides = {};
    }

    state.structureBeamOverrides[String(k)] = {
      beamWidthMm: wMm,
      beamHeightMm: hMm,
    };

    try {
      this.sceneManager.generateConnectorStructure(state.structureParams);
      this._maybeShowStructureWarnings();
      this.showNotification('Vigas actualizadas', 'success');
      this._closeBeamEditModal();
    } catch (err) {
      console.error(err);
      this.showNotification('No se pudo actualizar la estructura', 'error');
    }
  };

  proto._restoreBeamEditModal = function() {
    const hit = this._beamEditHit;
    if (!hit || !hit.mesh) return;
    if (!state.structureParams) return;

    const k = hit.kLevelOriginal;
    const keyStr = String(k);

    // Si no hay override, nada que restaurar
    if (!state.structureBeamOverrides || !state.structureBeamOverrides[keyStr]) {
      this.showNotification('Esta viga ya usa los valores globales.', 'info');
      return;
    }

    // Eliminar override del nivel
    delete state.structureBeamOverrides[keyStr];

    // Actualizar inputs del modal a los valores base
    const baseW = Number(state.structureParams.beamWidthMm) || 1;
    const baseH = Number(state.structureParams.beamHeightMm ?? state.structureParams.beamThicknessMm) || 1;
    if (this._beamModalWidth) this._beamModalWidth.value = String(Math.round(baseW));
    if (this._beamModalHeight) this._beamModalHeight.value = String(Math.round(baseH));

    try {
      this.sceneManager.generateConnectorStructure(state.structureParams);
      this._maybeShowStructureWarnings();
      this.showNotification('Dimensiones restauradas a valores globales.', 'success');
      this._closeBeamEditModal();
    } catch (err) {
      console.error(err);
      this.showNotification('No se pudo restaurar la estructura.', 'error');
    }
  };

}