export const DEFAULT_STATE = {
  sourceMode: 2,
  testPattern: 0,
  signalType: 0,
  fitMode: 1,
  signalStrength: 1.0,
  noise: 0.012,
  chromaBleed: 0.025,
  lumaBlur: 0.015,
  ghosting: 0.0,
  dotCrawl: 0.02,
  jitter: 0.0004,
  tracking: 0.0,
  dropout: 0.0,
  verticalRoll: 0.0,
  persistence: 0.16,

  brightness: 1.02,
  contrast: 1.08,
  saturation: 1.02,
  gamma: 1.0,
  blackLevel: 0.0,
  temperature: 0.04,
  sharpness: 0.16,
  scanlines: 0.34,
  maskType: 1,
  maskStrength: 0.28,
  maskScale: 1.0,
  resolutionMode: 1,
  bloom: 0.22,
  halation: 0.10,
  vignette: 0.18,

  curvature: 0.085,
  overscan: 0.025,
  hSize: 1.0,
  vSize: 1.0,
  hPos: 0.0,
  vPos: 0.0,
  convergence: 0.00075,
  rotation: 0.0,

  colorMode: 0,
  focus: 0.05,
  interlace: false,
  warmup: true,
  glare: 0.22,
  roomGlow: 0.32,
  humVolume: 0.03,
  performanceScale: 1.0,

  power: true,
  bypass: false
};

export const PRESETS = [
  {
    id: 'pvm-rgb',
    name: 'PVM RGB',
    subtitle: 'Clean 240p',
    patch: {
      signalType: 0, signalStrength: 1, noise: 0.008, chromaBleed: 0.018,
      lumaBlur: 0.01, ghosting: 0, dotCrawl: 0, jitter: 0.00025, tracking: 0,
      dropout: 0, persistence: 0.16, sharpness: 0.2, scanlines: 0.36,
      maskType: 1, maskStrength: 0.3, resolutionMode: 1, bloom: 0.2,
      halation: 0.08, curvature: 0.08, convergence: 0.0006, temperature: 0.03
    }
  },
  {
    id: 'consumer-composite',
    name: 'Composite',
    subtitle: 'Consumer TV',
    patch: {
      signalType: 3, signalStrength: 0.86, noise: 0.045, chromaBleed: 0.22,
      lumaBlur: 0.13, ghosting: 0.035, dotCrawl: 0.27, jitter: 0.0012,
      tracking: 0.02, persistence: 0.13, sharpness: 0.04, scanlines: 0.26,
      maskType: 2, maskStrength: 0.22, bloom: 0.34, halation: 0.16,
      curvature: 0.13, convergence: 0.0014, temperature: 0.10, saturation: 1.08
    }
  },
  {
    id: 'rf-1989',
    name: 'RF 1989',
    subtitle: 'Weak aerial',
    patch: {
      signalType: 4, signalStrength: 0.58, noise: 0.18, chromaBleed: 0.33,
      lumaBlur: 0.18, ghosting: 0.095, dotCrawl: 0.38, jitter: 0.0033,
      tracking: 0.12, dropout: 0.08, persistence: 0.12, sharpness: 0,
      scanlines: 0.20, maskType: 2, maskStrength: 0.16, bloom: 0.40,
      halation: 0.20, curvature: 0.15, convergence: 0.0022, saturation: 0.86
    }
  },
  {
    id: 'vhs-sp',
    name: 'VHS SP',
    subtitle: 'Tape playback',
    patch: {
      signalType: 5, signalStrength: 0.76, noise: 0.085, chromaBleed: 0.42,
      lumaBlur: 0.24, ghosting: 0.055, dotCrawl: 0.09, jitter: 0.0022,
      tracking: 0.28, dropout: 0.12, persistence: 0.14, sharpness: 0,
      scanlines: 0.22, maskType: 1, maskStrength: 0.20, bloom: 0.32,
      halation: 0.15, saturation: 0.82, temperature: 0.12
    }
  },
  {
    id: 'arcade',
    name: 'Arcade 15k',
    subtitle: 'Hot raster',
    patch: {
      signalType: 0, signalStrength: 1, noise: 0.012, chromaBleed: 0.025,
      lumaBlur: 0.01, ghosting: 0, dotCrawl: 0, jitter: 0.0006,
      persistence: 0.21, sharpness: 0.26, scanlines: 0.52, maskType: 2,
      maskStrength: 0.36, resolutionMode: 1, bloom: 0.31, halation: 0.16,
      curvature: 0.11, convergence: 0.0009, saturation: 1.14, contrast: 1.14
    }
  },
  {
    id: 'green-terminal',
    name: 'Green Tube',
    subtitle: 'P31 phosphor',
    patch: {
      signalType: 0, signalStrength: 1, noise: 0.025, chromaBleed: 0,
      lumaBlur: 0.025, ghosting: 0.015, dotCrawl: 0, jitter: 0.0007,
      persistence: 0.36, sharpness: 0.12, scanlines: 0.40, maskType: 0,
      maskStrength: 0, bloom: 0.36, halation: 0.08, colorMode: 1,
      temperature: 0, saturation: 0, contrast: 1.15
    }
  }
];

export const CONTROL_GROUPS = {
  signal: [
    { key: 'signalType', label: 'Input path', type: 'select', options: [['RGB / YPbPr',0],['Component',1],['S-Video',2],['Composite',3],['RF',4],['VHS',5]] },
    { key: 'testPattern', label: 'Test pattern', type: 'select', options: [['SMPTE bars',0],['Crosshatch',1],['Grayscale',2],['Multiburst',3],['Color checker',4]] },
    { key: 'fitMode', label: 'Source framing', type: 'select', options: [['Contain',0],['Crop 4:3',1],['Stretch',2]] },
    { key: 'signalStrength', label: 'Signal strength', min: 0, max: 1, step: .01, format: v => `${Math.round(v*100)}%` },
    { key: 'noise', label: 'Noise', min: 0, max: .5, step: .005, format: pct },
    { key: 'chromaBleed', label: 'Chroma bleed', min: 0, max: .6, step: .005, format: pct },
    { key: 'lumaBlur', label: 'Luma bandwidth', min: 0, max: .5, step: .005, format: pct },
    { key: 'ghosting', label: 'Multipath ghost', min: 0, max: .25, step: .0025, format: pct },
    { key: 'dotCrawl', label: 'Dot crawl', min: 0, max: .6, step: .005, format: pct },
    { key: 'jitter', label: 'H-sync jitter', min: 0, max: .008, step: .0001, format: v => v.toFixed(4) },
    { key: 'tracking', label: 'Tracking error', min: 0, max: .8, step: .005, format: pct },
    { key: 'dropout', label: 'Tape dropout', min: 0, max: .5, step: .005, format: pct },
    { key: 'verticalRoll', label: 'Vertical hold', min: -.5, max: .5, step: .005, format: signed },
    { key: 'persistence', label: 'Phosphor persistence', min: 0, max: .8, step: .005, format: pct }
  ],
  display: [
    { key: 'brightness', label: 'Brightness', min: .4, max: 1.8, step: .01, format: x2 },
    { key: 'contrast', label: 'Contrast', min: .5, max: 1.8, step: .01, format: x2 },
    { key: 'saturation', label: 'Saturation', min: 0, max: 1.8, step: .01, format: x2 },
    { key: 'gamma', label: 'Gamma', min: .6, max: 1.6, step: .01, format: x2 },
    { key: 'blackLevel', label: 'Black level', min: -.2, max: .2, step: .005, format: signed },
    { key: 'temperature', label: 'Color temperature', min: -.5, max: .5, step: .01, format: signed },
    { key: 'sharpness', label: 'Aperture / sharpness', min: 0, max: .8, step: .005, format: pct },
    { key: 'scanlines', label: 'Scanline depth', min: 0, max: .8, step: .005, format: pct },
    { key: 'maskType', label: 'Phosphor mask', type: 'select', options: [['None',0],['Aperture grille',1],['Shadow mask',2],['Slot mask',3]] },
    { key: 'maskStrength', label: 'Mask strength', min: 0, max: .8, step: .005, format: pct },
    { key: 'maskScale', label: 'Mask pitch', min: .5, max: 2.5, step: .01, format: x2 },
    { key: 'resolutionMode', label: 'Raster mode', type: 'select', options: [['Native',0],['240p',1],['480i',2]] },
    { key: 'bloom', label: 'Bloom', min: 0, max: 1, step: .005, format: pct },
    { key: 'halation', label: 'Halation', min: 0, max: 1, step: .005, format: pct },
    { key: 'vignette', label: 'Vignette', min: 0, max: .8, step: .005, format: pct }
  ],
  geometry: [
    { key: 'curvature', label: 'Tube curvature', min: 0, max: .28, step: .002, format: pct },
    { key: 'overscan', label: 'Overscan', min: -.08, max: .16, step: .002, format: pct },
    { key: 'hSize', label: 'Horizontal size', min: .85, max: 1.15, step: .002, format: x2 },
    { key: 'vSize', label: 'Vertical size', min: .85, max: 1.15, step: .002, format: x2 },
    { key: 'hPos', label: 'Horizontal position', min: -.12, max: .12, step: .002, format: signed },
    { key: 'vPos', label: 'Vertical position', min: -.12, max: .12, step: .002, format: signed },
    { key: 'rotation', label: 'Raster rotation', min: -2, max: 2, step: .02, format: v => `${Number(v).toFixed(2)}°` },
    { key: 'convergence', label: 'RGB convergence', min: 0, max: .008, step: .0001, format: v => Number(v).toFixed(4) }
  ],
  tube: [
    { key: 'colorMode', label: 'Phosphor chemistry', type: 'select', options: [['Color',0],['P31 green',1],['Amber',2],['Monochrome',3]] },
    { key: 'focus', label: 'Beam focus', min: 0, max: .6, step: .005, format: pct },
    { key: 'interlace', label: 'Force interlace', type: 'toggle' },
    { key: 'warmup', label: 'Tube warm-up', type: 'toggle' },
    { key: 'glare', label: 'Glass glare', min: 0, max: 1, step: .01, format: pct },
    { key: 'roomGlow', label: 'Room spill', min: 0, max: 1, step: .01, format: pct },
    { key: 'humVolume', label: '60 Hz transformer hum', min: 0, max: .15, step: .0025, format: pct },
    { key: 'performanceScale', label: 'Render scale', type: 'select', options: [['50%',.5],['75%',.75],['100%',1],['125%',1.25]] }
  ]
};

function pct(v) { return `${Math.round(Number(v) * 100)}%`; }
function x2(v) { return `${Number(v).toFixed(2)}×`; }
function signed(v) { const n = Number(v); return `${n >= 0 ? '+' : ''}${n.toFixed(3)}`; }
