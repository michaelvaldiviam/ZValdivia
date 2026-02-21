export const state = {
  Dmax: 6.596,
  N: 11,
  aDeg: 39.8,
  aRad: 0,
  h1: 0,
  Htotal: 0,
  rhombiVisible: true,
  polysVisible: false,
  linesVisible: true,
  colorByLevel: true,
  axisVisible: false,
  isRotating: false,
  rotationSpeed: 0.3,
  cutActive: true,
  cutLevel: 4,
  floorDiameter: 6,
  // Estructura (vigas + conectores)
  structureVisible: true,
  structureParams: null, // {cylDiameterMm,cylDepthMm,beamWidthMm,beamHeightMm}

  // Overrides por nivel para conectores cilindricos.
  // Key: kOriginal (0..N). Value: { cylDiameterMm:number, cylDepthMm:number }
  // Se usa para edicion interactiva por nivel/polo.
  structureConnectorOverrides: {},

  // Overrides por nivel SOLO para conectores de interseccion (diagonales en rombos).
  // Key: kOriginal del rombo (anillo central kFace). Value: { cylDiameterMm:number, cylDepthMm:number, offsetMm?:number }
  structureIntersectionConnectorOverrides: {},

  // Overrides por nivel para vigas (perfil BxH).
  // Key: kOriginal del nivel de la viga (usamos max(kA,kB)).
  // Value: { beamWidthMm:number, beamHeightMm:number }
  // Se usa para edicion interactiva por nivel.
  structureBeamOverrides: {},

  // Vigas extra (aristas/diagonales) definidas por el usuario.
  // Cada item: { a:{k:number,i:number}, b:{k:number,i:number}, kind?:string, scope?:string }
  // - k e i son coordenadas del anillo original (kOriginal).
  // - kind es informativo (ej: 'diagH' | 'diagV').
  structureExtraBeams: [],

  // Intersecciones habilitadas por rombo.
  // Key: `${kFace}:${iFace}` (anillo central del rombo, indice i del rombo)
  // Value: true
  // IMPORTANTE: solo se marca cuando el usuario crea la SEGUNDA diagonal (la que completa el cruce)
  // para ese rombo.
  structureIntersectionFaces: {},

  // Vigas eliminadas por el usuario.
  // Guardamos edgeKeys deterministicas: "<aKey>|<bKey>" (ordenadas)
  // para poder excluirlas de la generacion, reportes PDF y conectividad.
  structureDeletedBeams: [],


};

export let rhombiData = [];

export function setRhombiData(data) {
  rhombiData = data;
}

export function clearRhombiData() {
  rhombiData = [];
}

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

export function getColorForLevel(level, totalLevels) {
  const hue = ((level - 1) / totalLevels) * 360;
  return hslToHex(hue, 70, 60);
}

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

  return parseInt(`${toHex(r)}${toHex(g)}${toHex(b)}`, 16);
}