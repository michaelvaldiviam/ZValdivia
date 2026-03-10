/**
 * Estado global de la aplicación ZValdivia.
 *
 * Organizado en slices lógicos (marcados con comentarios):
 *   GEOMETRY  — parámetros geométricos del zonohedro
 *   VIEW      — visibilidad y opciones de renderizado
 *   STRUCTURE — estructura fabricable (vigas + conectores)
 *   EDIT      — overrides y ediciones del usuario
 *   RUNTIME   — flags de interacción (no se serializan)
 */

// ── SLICE: GEOMETRY ───────────────────────────────────────────────────────────
export const state = {
  Dmax: 6.596,
  N: 11,
  aDeg: 39.8,
  aRad: 0,
  h1: 0,
  Htotal: 0,
  cutActive: true,
  cutLevel: 4,
  floorDiameter: 6,

  // ── SLICE: VIEW ─────────────────────────────────────────────────────────────
  rhombiVisible: true,
  polysVisible: false,
  linesVisible: true,
  colorByLevel: true,
  axisVisible: false,
  isRotating: false,
  rotationSpeed: 0.3,
  structureVisible: true,

  // ── SLICE: STRUCTURE ────────────────────────────────────────────────────────
  structureParams: null,

  // ── SLICE: EDIT ─────────────────────────────────────────────────────────────
  structureConnectorOverrides: {},
  structureIntersectionConnectorOverrides: {},
  structureBeamOverrides: {},
  structureExtraBeams: [],
  structureIntersectionFaces: {},
  structureDeletedBeams: [],

  // ── RUNTIME ─────────────────────────────────────────────────────────────────
  lastStructureWarnings: [],
};

// ── Datos de rombos ──────────────────────────────────────────────────────────
export let rhombiData = [];
export function setRhombiData(data) { rhombiData = data; }
export function clearRhombiData() { rhombiData = []; }

// ── Cálculos derivados ───────────────────────────────────────────────────────
export function updateStateCalculations() {
  state.aRad = (state.aDeg * Math.PI) / 180;
  state.h1 = (state.Dmax / 2) * Math.tan(state.aRad) * Math.sin(Math.PI / state.N);
  state.Htotal = state.h1 * state.N;
  if (state.cutActive && state.cutLevel > 0) {
    const Rk = (state.Dmax / 2) * Math.sin((state.cutLevel * Math.PI) / state.N);
    state.floorDiameter = 2 * Rk;
  } else {
    state.floorDiameter = 0;
  }
}

// ── Reset helpers por slice ──────────────────────────────────────────────────
/** Resetea todos los overrides y ediciones de la estructura. */
export function resetEditState() {
  state.structureConnectorOverrides = {};
  state.structureIntersectionConnectorOverrides = {};
  state.structureBeamOverrides = {};
  state.structureExtraBeams = [];
  state.structureIntersectionFaces = {};
  state.structureDeletedBeams = [];
}

/** Devuelve true si hay ediciones del usuario sobre la estructura actual. */
export function hasEditState() {
  return (
    Object.keys(state.structureConnectorOverrides).length > 0 ||
    Object.keys(state.structureBeamOverrides).length > 0 ||
    Object.keys(state.structureIntersectionFaces).length > 0 ||
    Object.keys(state.structureIntersectionConnectorOverrides).length > 0 ||
    state.structureExtraBeams.length > 0 ||
    state.structureDeletedBeams.length > 0
  );
}

// ── Color helpers ────────────────────────────────────────────────────────────
export function getColorForLevel(level, totalLevels) {
  const hue = ((level - 1) / totalLevels) * 360;
  return hslToHex(hue, 70, 60);
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (0 <= h && h < 60)        { r = c; g = x; b = 0; }
  else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
  else if (120 <= h && h < 180){ r = 0; g = c; b = x; }
  else if (180 <= h && h < 240){ r = 0; g = x; b = c; }
  else if (240 <= h && h < 300){ r = x; g = 0; b = c; }
  else if (300 <= h && h < 360){ r = c; g = 0; b = x; }
  const toHex = (val) => {
    const hex = Math.round((val + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return parseInt(`${toHex(r)}${toHex(g)}${toHex(b)}`, 16);
}
