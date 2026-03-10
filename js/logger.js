/**
 * Logger centralizado con niveles de severidad.
 * Activar logs detallados añadiendo ?debug en la URL.
 *
 * Niveles: debug < info < warn < error
 *
 * USO:
 *   import { logger } from './logger.js';
 *   logger.debug('valor calculado', value);
 *   logger.warn('geometría inválida', context);
 *   logger.error('fallo crítico', err);
 *
 * En producción solo se muestran warn y error.
 * Con ?debug también se muestran debug e info.
 */

const DEBUG_MODE = (() => {
  try {
    return new URLSearchParams(window.location.search).has('debug');
  } catch (_) {
    return false;
  }
})();

const PREFIX = '[ZValdivia]';

export const logger = {
  /** Solo visible con ?debug */
  debug(...args) {
    if (DEBUG_MODE) console.log(PREFIX, '[DBG]', ...args);
  },

  /** Solo visible con ?debug */
  info(...args) {
    if (DEBUG_MODE) console.info(PREFIX, '[INF]', ...args);
  },

  /** Siempre visible — problemas recuperables */
  warn(...args) {
    console.warn(PREFIX, '[WRN]', ...args);
  },

  /** Siempre visible — errores que el usuario debe conocer */
  error(...args) {
    console.error(PREFIX, '[ERR]', ...args);
  },

  /** ¿Está activo el modo debug? */
  get isDebug() {
    return DEBUG_MODE;
  }
};
