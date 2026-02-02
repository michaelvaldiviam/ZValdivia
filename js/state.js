/**
 * Estado global de la aplicación
 */
export const state = {
  Dmax: 10,
  N: 11,
  aDeg: 39.8,
  aRad: 0,
  h1: 0,
  Htotal: 0,
  rhombiVisible: false,
  polysVisible: true,
  linesVisible: true,
  colorByLevel: true, // ✨ CAMBIO: Ahora inicia con Arcoíris (true = colores por nivel)
  axisVisible: true,
  isRotating: false,
  rotationSpeed: 0.3,
  cutActive: false,
  cutLevel: 5,
  floorDiameter: 0, // ✅ NUEVO: Diámetro del piso de corte
};

/**
 * Almacena la geometría de cada rombo con su identidad
 */
export let rhombiData = [];

/**
 * Actualiza el array de datos de rombos
 */
export function setRhombiData(data) {
  rhombiData = data;
}

/**
 * Limpia el array de datos de rombos
 */
export function clearRhombiData() {
  rhombiData = [];
}

/**
 * Actualiza los valores calculados del estado
 */
export function updateStateCalculations() {
  state.aRad = (state.aDeg * Math.PI) / 180;
  state.h1 = (state.Dmax / 2) * Math.tan(state.aRad) * Math.sin(Math.PI / state.N);
  state.Htotal = state.h1 * state.N;
  
  // ✅ NUEVO: Calcular diámetro del piso de corte
  if (state.cutActive && state.cutLevel > 0) {
    const Rk = (state.Dmax / 2) * Math.sin((state.cutLevel * Math.PI) / state.N);
    state.floorDiameter = 2 * Rk;
  } else {
    state.floorDiameter = 0;
  }
}

/**
 * Genera un color único basado en el nivel
 * @param {number} level - Nivel del rombo (1 a N-1)
 * @param {number} totalLevels - Total de niveles (N-1)
 * @returns {number} - Color en formato hexadecimal
 */
export function getColorForLevel(level, totalLevels) {
  const hue = ((level - 1) / totalLevels) * 360;
  return hslToHex(hue, 70, 60);
}

/**
 * Convierte HSL a hexadecimal
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-100)
 * @param {number} l - Lightness (0-100)
 * @returns {number} - Color en formato hexadecimal
 */
function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (0 <= h && h < 60) {
    r = c; g = x; b = 0;
  } else if (60 <= h && h < 120) {
    r = x; g = c; b = 0;
  } else if (120 <= h && h < 180) {
    r = 0; g = c; b = x;
  } else if (180 <= h && h < 240) {
    r = 0; g = x; b = c;
  } else if (240 <= h && h < 300) {
    r = x; g = 0; b = c;
  } else if (300 <= h && h < 360) {
    r = c; g = 0; b = x;
  }

  const toHex = (val) => {
    const hex = Math.round((val + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return parseInt(`0x${toHex(r)}${toHex(g)}${toHex(b)}`);
}