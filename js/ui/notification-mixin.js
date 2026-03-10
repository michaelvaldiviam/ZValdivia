import { state } from '../state.js';

export function applyNotificationMixin(proto) {

  proto._ensureNotificationStyles = function() {
    // Evitar inyección acumulativa de <style> en <head>
    if (this._notificationStyleInjected) return;
    const id = 'zv-notification-styles';
    if (document.getElementById(id)) {
      this._notificationStyleInjected = true;
      return;
    }
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translate(-50%, -60%);
        }
        to {
          opacity: 1;
          transform: translate(-50%, -50%);
        }
      }
    `;
    document.head.appendChild(style);
    this._notificationStyleInjected = true;
  };

  proto.showNotification = function(message, type = 'info') {
    // Crear notificacion temporal
    const notification = document.createElement('div');

    // Colores segun el tipo
    let borderColor = 'rgba(255, 165, 0, 0.5)'; // warning (naranja)
    let iconColor = '#f59e0b';
    let icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

    if (type === 'success') {
      borderColor = 'rgba(34, 197, 94, 0.5)'; // verde
      iconColor = '#22c55e';
      icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9 12l2 2 4-4"></path></svg>`;
    } else if (type === 'error') {
      borderColor = 'rgba(239, 68, 68, 0.5)'; // rojo
      iconColor = '#ef4444';
      icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    }

    notification.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(20, 20, 25, 0.95);
      backdrop-filter: blur(20px);
      border: 1px solid ${borderColor};
      border-radius: 12px;
      padding: 20px 28px;
      font-size: 14px;
      color: #ececec;
      z-index: 1000;
      box-shadow: 0 10px 40px rgba(0,0,0,0.6);
      animation: slideIn 0.3s ease-out;
      max-width: 90%;
      text-align: center;
    `;

    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        ${icon}
        <span>${message}</span>
      </div>
    `;

    this._ensureNotificationStyles();

    document.body.appendChild(notification);

    // Overlay invisible para permitir cerrar tocando fuera
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: transparent;
      z-index: 999;
    `;
    document.body.appendChild(overlay);

    let closed = false;
    const closeNow = () => {
      if (closed) return;
      closed = true;
      // Animación de salida
      // BUG-L1 fix: fill-mode forwards evita el flash al volver al estado "visible" antes del removeChild
      notification.style.animation = 'slideIn 0.3s ease-out reverse forwards';
      setTimeout(() => {
        try { if (notification.parentNode) notification.parentNode.removeChild(notification); } catch(e){}
        try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch(e){}
        // Nota: el <style> de animación es permanente (inyectado una sola vez por
        // _ensureNotificationStyles). No se elimina aquí.
      }, 300);
    };

    // Si el usuario toca fuera del mensaje, se cierra al instante
    overlay.addEventListener('pointerdown', closeNow, { passive: true });
    overlay.addEventListener('click', closeNow, { passive: true });

    // Remover despues de 2.5 segundos (mas tiempo para info)
    const duration = type === 'info' ? 3000 : 2500;
    setTimeout(() => {
      closeNow();
    }, duration);
  };

  proto._maybeShowStructureWarnings = function() {
    const warnings = (state && state.lastStructureWarnings) ? state.lastStructureWarnings : [];
    if (!warnings || warnings.length === 0) return;

    const tooShort = warnings.filter(w => w && w.type === 'BEAM_TOO_SHORT');
    if (tooShort.length > 0) {
      const sample = tooShort[0];
      const sampleId = (sample && sample.beamId) ? ` (${sample.beamId})` : '';
      const msg = `Advertencia: ${tooShort.length} viga(s) quedaron demasiado cortas para el bisel${sampleId}. Ajusta diametro/profundidad de conectores o dimensiones de viga.`;
      this.showNotification(msg, 'warning');
    } else {
      this.showNotification(`Advertencia: ${warnings.length} evento(s) durante la generacion de estructura.`, 'warning');
    }

    state.lastStructureWarnings = [];
  };

}