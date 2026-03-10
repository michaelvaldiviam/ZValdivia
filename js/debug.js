/**
 * Utilidades de depuración opt-in (reemplazado por logger.js para uso interno).
 * Este módulo se mantiene por compatibilidad y para usar directamente en devtools.
 *
 * Activa logs agregando ?debug en la URL.
 *
 * USO en cualquier módulo:
 *   import { logger } from './logger.js';   ← PREFERIDO
 *
 * o directamente:
 *   import { dlog } from './debug.js';
 *   dlog('valor', value);
 */
export const DEBUG = (() => {
  try { return new URLSearchParams(window.location.search).has('debug'); }
  catch (_) { return false; }
})();

export function dlog(...args) {
  if (DEBUG) console.log('[ZValdivia:debug]', ...args);
}

export function dwarn(...args) {
  if (DEBUG) console.warn('[ZValdivia:debug]', ...args);
}
