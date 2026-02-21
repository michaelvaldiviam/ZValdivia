// Debug utilities (opt-in)
// Activa logs agregando ?debug en la URL.
export const DEBUG = (() => {
  try {
    return new URLSearchParams(window.location.search).has('debug');
  } catch (_e) {
    return false;
  }
})();

export function dlog(...args) {
  if (DEBUG) console.log(...args);
}
