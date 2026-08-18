const pct = value => `${Math.round(value * 100)}%`;
const signedPct = value => `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`;
const fixed = (digits = 2, suffix = '') => value => `${Number(value).toFixed(digits)}${suffix}`;
const degrees = value => `${Number(value).toFixed(2)}°`;
const pixels = value => `${Number(value).toFixed(2)} px`;
const kelvin = value => `${Math.round(value)} K`;
const milliseconds = value => `${Math.round(value)} ms`;
const lines = value => Number(value) === 0 ? 'NATIVE' : `${Math.round(value)} LINES`;

const TEST_PATTERNS = [
  { name: 'SMPTE RP 219', short: 'SMPTE', detail: '75% bars, PLUGE and reference patches' },
  { name: 'EBU Color Bars', short: 'EBU', detail: 'European 75% color bars' },
  { name: 'PLUGE / Black', short: 'PLUGE', detail: 'Below-black and near-black setup' },
  { name: 'Grayscale Steps', short: 'GRAY', detail: 'Continuous ramp and 16-step wedge' },
  { name: 'Crosshatch', short: 'GRID', detail: 'Geometry and convergence grid' },
  { name: 'Multiburst', short: 'BURST', detail: 'Horizontal bandwidth wedges' },
  { name: 'Zone Plate', short: 'ZONE', detail: 'Aliasing, comb filter and focus test' },
  { name: 'Monoscope', short: 'MONO', detail: 'Circle, safe area and resolution wedges' },
  { name: 'Color Checker', short: 'COLOR', detail: 'Saturation and hue reference patches' },
  { name: 'Convergence Dots', short: 'DOTS', detail: 'White point matrix for RGB alignment' },
  { name: 'White Field', short: 'WHITE', detail: 'Purity, blooming and uniformity' },
  { name: 'Black Field', short: 'BLACK', detail: 'Glow, leakage and room reflection' }
];

const DEFAULT_STATE = Object.freeze({
  version: 3,
  sourceMode: 2,
  testPattern: 0,
  signalType: 0,
  fitMode: 0,
  sourceZoom: 1,
  sourcePanX: 0,
  sourcePanY: 0,
  sourceRotation: 0,
  mirrorX: false,
  mirrorY: false,

  signalStrength: 0.99,
  noise: 0.008,
  jitter: 0.00035,
  horizontalTear: 0,
  ghosting: 0,
  chromaBleed: 0.025,
  chromaDelay: 0,
  dotCrawl: 0.025,
  ringing: 0.02,
  lumaBandwidth: 0.98,
  chromaBandwidth: 0.92,
  rfMultipath: 0,
  humBar: 0,
  tracking: 0,
  dropout: 0,
  agcPumping: 0,
  colorBurstPhase: 0,
  combFilter: 2,
  vhsSpeed: 0,

  resolutionLines: 0,
  interlace: false,
  fieldOrder: 0,
  scanlineStrength: 0.28,
  scanlineSharpness: 0.62,
  maskType: 1,
  maskStrength: 0.34,
  maskScale: 1,
  brightness: 1,
  contrast: 1.04,
  saturation: 1,
  hue: 0,
  gamma: 2.2,
  blackLevel: 0,
  whiteLevel: 1,
  temperature: 6500,
  sharpness: 0.18,
  bloom: 0.16,
  halation: 0.08,
  vignette: 0.18,

  curvatureX: 0.07,
  curvatureY: 0.055,
  overscanX: 0.015,
  overscanY: 0.015,
  hSize: 1,
  vSize: 1,
  hPosition: 0,
  vPosition: 0,
  rasterRotation: 0,
  pincushion: 0,
  trapezoid: 0,
  cornerPin: 0,
  hLinearity: 0,
  vLinearity: 0,

  phosphorType: 0,
  phosphorDecayR: 18,
  phosphorDecayG: 28,
  phosphorDecayB: 14,
  persistenceStrength: 0.46,
  beamWidth: 0.85,
  beamBloom: 0.18,
  beamScan: false,
  focusCenter: 0.06,
  focusEdge: 0.28,
  convergenceRX: 0,
  convergenceRY: 0,
  convergenceBX: 0,
  convergenceBY: 0,
  cornerConvergence: 0.12,
  moire: 0.035,
  burnIn: 0,
  tubeAge: 0.06,
  weakRed: 0,
  weakGreen: 0,
  weakBlue: 0,

  glare: 0.14,
  roomGlow: 0.22,
  humVolume: 0.025,
  renderScale: 1,
  adaptiveQuality: true,
  targetFPS: 55,
  maxDPR: 1.5,
  pauseWhenHidden: true,
  reducedMotion: false,

  power: true,
  bypass: false,
  compareMode: 0,
  comparePosition: 0.5,
  freeze: false,
  scopeMode: 'waveform',
  recordFPS: 60,
  recordBitrate: 12
});

const section = label => ({ type: 'section', label });
const range = (key, label, min, max, step, format = fixed(2), extra = {}) => ({ key, label, type: 'range', min, max, step, format, ...extra });
const toggle = (key, label, extra = {}) => ({ key, label, type: 'toggle', ...extra });
const select = (key, label, options, extra = {}) => ({ key, label, type: 'select', options, ...extra });

const CONTROL_GROUPS = Object.freeze({
  signal: [
    section('FORMAT & SOURCE'),
    select('signalType', 'Signal path', [
      ['RGB / HDMI clean', 0], ['YPbPr component', 1], ['S-Video Y/C', 2], ['NTSC composite', 3], ['RF modulated', 4], ['VHS tape', 5], ['PAL composite', 6]
    ]),
    select('testPattern', 'Built-in pattern', TEST_PATTERNS.map((pattern, index) => [pattern.name, index])),
    select('fitMode', 'Source framing', [['Fit / letterbox', 0], ['Crop / fill', 1], ['Stretch', 2], ['4:3 center crop', 3]]),
    range('sourceZoom', 'Source zoom', 0.5, 3, 0.01, fixed(2, '×')),
    range('sourcePanX', 'Horizontal pan', -1, 1, 0.001, signedPct),
    range('sourcePanY', 'Vertical pan', -1, 1, 0.001, signedPct),
    range('sourceRotation', 'Source rotation', -180, 180, 0.1, degrees),
    toggle('mirrorX', 'Mirror horizontally'),
    toggle('mirrorY', 'Mirror vertically'),
    section('ANALOG CHANNEL'),
    range('signalStrength', 'Signal strength', 0, 1, 0.001, pct),
    range('noise', 'Broadband noise', 0, 1, 0.001, pct),
    range('jitter', 'H-sync jitter', 0, 0.02, 0.00005, fixed(4)),
    range('horizontalTear', 'Horizontal tearing', 0, 1, 0.001, pct),
    range('ghosting', 'Multipath ghost', 0, 0.08, 0.0001, fixed(4)),
    range('rfMultipath', 'RF multipath', 0, 1, 0.001, pct),
    range('humBar', 'Mains hum bar', 0, 1, 0.001, pct),
    range('agcPumping', 'AGC pumping', 0, 1, 0.001, pct),
    section('ENCODING / TAPE'),
    range('lumaBandwidth', 'Luma bandwidth', 0.05, 1, 0.001, pct),
    range('chromaBandwidth', 'Chroma bandwidth', 0.02, 1, 0.001, pct),
    range('chromaBleed', 'Chroma bleed', 0, 1, 0.001, pct),
    range('chromaDelay', 'Chroma delay', -8, 8, 0.01, pixels),
    range('dotCrawl', 'Dot crawl / rainbows', 0, 1, 0.001, pct),
    range('ringing', 'Edge ringing', 0, 1, 0.001, pct),
    range('colorBurstPhase', 'Burst phase / hue', -0.5, 0.5, 0.001, fixed(3, ' cyc')),
    select('combFilter', 'Composite decoder', [['Notch', 0], ['2-line comb', 1], ['3-line adaptive', 2]]),
    range('tracking', 'VHS tracking', 0, 1, 0.001, pct),
    range('dropout', 'Tape dropouts', 0, 1, 0.001, pct),
    select('vhsSpeed', 'Tape speed', [['SP', 0], ['LP', 1], ['EP / SLP', 2]])
  ],
  display: [
    section('RASTER'),
    select('resolutionLines', 'Raster resolution', [['Native', 0], ['240p', 240], ['288p PAL', 288], ['480-line', 480], ['576-line PAL', 576], ['720-line', 720], ['1080-line', 1080]]),
    toggle('interlace', 'Interlaced fields'),
    select('fieldOrder', 'Field dominance', [['Top field first', 0], ['Bottom field first', 1]]),
    range('scanlineStrength', 'Scanline darkness', 0, 1, 0.001, pct),
    range('scanlineSharpness', 'Scanline sharpness', 0.05, 4, 0.01, fixed(2)),
    section('PHOSPHOR STRUCTURE'),
    select('maskType', 'Mask type', [['None', 0], ['Aperture grille', 1], ['Shadow mask', 2], ['Slot mask', 3], ['PC dot triad', 4]]),
    range('maskStrength', 'Mask strength', 0, 1, 0.001, pct),
    range('maskScale', 'Mask pitch', 0.25, 4, 0.01, fixed(2, '×')),
    range('moire', 'Moiré coupling', 0, 1, 0.001, pct),
    section('PICTURE'),
    range('brightness', 'Brightness', 0, 2, 0.001, pct),
    range('contrast', 'Contrast', 0, 2, 0.001, pct),
    range('blackLevel', 'Black level', -0.25, 0.25, 0.001, signedPct),
    range('whiteLevel', 'White clip', 0.25, 2, 0.001, pct),
    range('gamma', 'Display gamma', 1, 3.2, 0.01, fixed(2)),
    range('saturation', 'Saturation', 0, 2, 0.001, pct),
    range('hue', 'Hue', -0.5, 0.5, 0.001, fixed(3, ' cyc')),
    range('temperature', 'White temperature', 2500, 11000, 10, kelvin),
    range('sharpness', 'Aperture correction', -1, 1, 0.001, signedPct),
    range('bloom', 'Optical bloom', 0, 1, 0.001, pct),
    range('halation', 'Glass halation', 0, 1, 0.001, pct),
    range('vignette', 'Edge vignette', 0, 1, 0.001, pct)
  ],
  geometry: [
    section('SIZE & POSITION'),
    range('hSize', 'Horizontal size', 0.5, 1.5, 0.001, pct),
    range('vSize', 'Vertical size', 0.5, 1.5, 0.001, pct),
    range('hPosition', 'Horizontal position', -0.5, 0.5, 0.001, signedPct),
    range('vPosition', 'Vertical position', -0.5, 0.5, 0.001, signedPct),
    range('overscanX', 'Horizontal overscan', -0.2, 0.25, 0.001, signedPct),
    range('overscanY', 'Vertical overscan', -0.2, 0.25, 0.001, signedPct),
    range('rasterRotation', 'Raster rotation', -5, 5, 0.001, degrees),
    section('DEFLECTION'),
    range('curvatureX', 'Horizontal curvature', 0, 0.5, 0.001, pct),
    range('curvatureY', 'Vertical curvature', 0, 0.5, 0.001, pct),
    range('pincushion', 'Pincushion / barrel', -0.5, 0.5, 0.001, signedPct),
    range('trapezoid', 'Trapezoid', -0.5, 0.5, 0.001, signedPct),
    range('cornerPin', 'Corner pin', -0.5, 0.5, 0.001, signedPct),
    range('hLinearity', 'Horizontal linearity', -0.5, 0.5, 0.001, signedPct),
    range('vLinearity', 'Vertical linearity', -0.5, 0.5, 0.001, signedPct),
    section('CONVERGENCE'),
    range('convergenceRX', 'Red horizontal', -4, 4, 0.01, pixels),
    range('convergenceRY', 'Red vertical', -4, 4, 0.01, pixels),
    range('convergenceBX', 'Blue horizontal', -4, 4, 0.01, pixels),
    range('convergenceBY', 'Blue vertical', -4, 4, 0.01, pixels),
    range('cornerConvergence', 'Corner convergence', 0, 4, 0.01, pixels)
  ],
  tube: [
    section('PHOSPHOR & BEAM'),
    select('phosphorType', 'Phosphor set', [['Color P22', 0], ['P31 green', 1], ['P3 amber', 2], ['P4 white', 3], ['Cool blue-white', 4]]),
    range('phosphorDecayR', 'Red decay', 0, 160, 1, milliseconds),
    range('phosphorDecayG', 'Green decay', 0, 160, 1, milliseconds),
    range('phosphorDecayB', 'Blue decay', 0, 160, 1, milliseconds),
    range('persistenceStrength', 'Persistence blend', 0, 1, 0.001, pct),
    toggle('beamScan', 'Visible scanning beam'),
    range('beamWidth', 'Electron beam width', 0.1, 4, 0.01, fixed(2, ' px')),
    range('beamBloom', 'High-APL beam bloom', 0, 1, 0.001, pct),
    range('focusCenter', 'Center defocus', 0, 2, 0.001, pixels),
    range('focusEdge', 'Edge defocus', 0, 4, 0.001, pixels),
    section('AGE & FAULTS'),
    range('tubeAge', 'Tube age', 0, 1, 0.001, pct),
    range('burnIn', 'Burn-in visibility', 0, 1, 0.001, pct),
    range('weakRed', 'Weak red gun', 0, 1, 0.001, pct),
    range('weakGreen', 'Weak green gun', 0, 1, 0.001, pct),
    range('weakBlue', 'Weak blue gun', 0, 1, 0.001, pct),
    section('CABINET & PERFORMANCE'),
    range('glare', 'Glass reflection', 0, 1, 0.001, pct),
    range('roomGlow', 'Room phosphor glow', 0, 1, 0.001, pct),
    range('humVolume', 'Transformer hum', 0, 0.25, 0.001, pct),
    range('renderScale', 'GPU render scale', 0.35, 2, 0.05, fixed(2, '×')),
    range('maxDPR', 'Maximum pixel ratio', 0.75, 3, 0.05, fixed(2, '×')),
    toggle('adaptiveQuality', 'Adaptive render quality'),
    range('targetFPS', 'Adaptive target', 24, 120, 1, fixed(0, ' FPS')),
    range('recordFPS', 'Recording frame rate', 15, 120, 1, fixed(0, ' FPS')),
    range('recordBitrate', 'Recording bitrate', 1, 80, 1, fixed(0, ' Mbps')),
    toggle('pauseWhenHidden', 'Pause while page hidden'),
    toggle('reducedMotion', 'Reduce animated faults')
  ]
});

const PRESETS = Object.freeze([
  {
    id: 'pvm-rgb', name: 'PVM RGB', subtitle: 'Clean 15 kHz studio monitor',
    patch: { signalType: 0, resolutionLines: 480, interlace: false, scanlineStrength: .36, maskType: 1, maskStrength: .4, curvatureX: .065, curvatureY: .05, bloom: .12, halation: .06, noise: .004, jitter: .0002, sharpness: .23, temperature: 6500, phosphorType: 0 }
  },
  {
    id: 'bvm-master', name: 'BVM Master', subtitle: 'Sharp broadcast reference tube',
    patch: { signalType: 1, resolutionLines: 720, scanlineStrength: .17, maskType: 1, maskStrength: .28, curvatureX: .025, curvatureY: .02, bloom: .07, halation: .03, noise: 0, jitter: 0, sharpness: .38, focusEdge: .09, cornerConvergence: .03, temperature: 6500 }
  },
  {
    id: 'consumer-composite', name: 'Consumer TV', subtitle: 'Warm composite living-room set',
    patch: { signalType: 3, resolutionLines: 480, interlace: true, scanlineStrength: .22, maskType: 3, maskStrength: .48, curvatureX: .16, curvatureY: .13, overscanX: .055, overscanY: .045, noise: .045, jitter: .0013, chromaBleed: .25, dotCrawl: .34, ringing: .15, lumaBandwidth: .72, chromaBandwidth: .35, bloom: .29, halation: .18, sharpness: .05, temperature: 7200 }
  },
  {
    id: 'rf-1989', name: 'RF 1989', subtitle: 'Channel 3 coax and multipath',
    patch: { signalType: 4, resolutionLines: 480, interlace: true, scanlineStrength: .19, maskType: 2, maskStrength: .5, signalStrength: .7, noise: .18, jitter: .003, horizontalTear: .08, ghosting: .018, rfMultipath: .32, humBar: .18, agcPumping: .18, chromaBleed: .32, dotCrawl: .48, ringing: .2, lumaBandwidth: .54, chromaBandwidth: .22, combFilter: 0, overscanX: .07, overscanY: .06 }
  },
  {
    id: 'vhs-sp', name: 'VHS SP', subtitle: 'Clean consumer tape playback',
    patch: { signalType: 5, vhsSpeed: 0, resolutionLines: 480, interlace: true, signalStrength: .86, noise: .06, jitter: .0017, horizontalTear: .06, chromaBleed: .36, chromaDelay: 1.2, dotCrawl: .12, ringing: .1, lumaBandwidth: .55, chromaBandwidth: .22, tracking: .12, dropout: .06, bloom: .2, sharpness: -.12 }
  },
  {
    id: 'vhs-ep', name: 'VHS EP', subtitle: 'Six-hour tape with worn tracking',
    patch: { signalType: 5, vhsSpeed: 2, resolutionLines: 480, interlace: true, signalStrength: .62, noise: .16, jitter: .004, horizontalTear: .18, chromaBleed: .55, chromaDelay: 2.6, dotCrawl: .2, ringing: .2, lumaBandwidth: .3, chromaBandwidth: .12, tracking: .38, dropout: .24, agcPumping: .12, bloom: .24, sharpness: -.35 }
  },
  {
    id: 'arcade-15k', name: 'Arcade 15 kHz', subtitle: 'Bright low-persistence raster',
    patch: { signalType: 0, resolutionLines: 240, interlace: false, scanlineStrength: .53, scanlineSharpness: 1.25, maskType: 3, maskStrength: .5, maskScale: 1.15, curvatureX: .12, curvatureY: .095, saturation: 1.18, contrast: 1.16, bloom: .3, halation: .12, beamBloom: .32, phosphorDecayR: 12, phosphorDecayG: 18, phosphorDecayB: 9, persistenceStrength: .32, sharpness: .12 }
  },
  {
    id: 'pc-vga', name: 'VGA Diamondtron', subtitle: '31 kHz aperture-grille PC CRT',
    patch: { signalType: 0, resolutionLines: 1080, interlace: false, scanlineStrength: .08, maskType: 1, maskStrength: .3, maskScale: .72, curvatureX: .035, curvatureY: .025, sharpness: .42, bloom: .06, halation: .025, focusCenter: .03, focusEdge: .11, cornerConvergence: .06, temperature: 9300 }
  },
  {
    id: 'green-terminal', name: 'P31 Terminal', subtitle: 'Long-persistence green phosphor',
    patch: { signalType: 0, phosphorType: 1, resolutionLines: 480, scanlineStrength: .42, maskType: 0, maskStrength: 0, saturation: 0, temperature: 6500, phosphorDecayR: 45, phosphorDecayG: 115, phosphorDecayB: 45, persistenceStrength: .82, bloom: .24, halation: .18, sharpness: .12, curvatureX: .14, curvatureY: .11, vignette: .3 }
  },
  {
    id: 'amber-terminal', name: 'Amber Terminal', subtitle: 'Warm P3 business display',
    patch: { signalType: 0, phosphorType: 2, resolutionLines: 480, scanlineStrength: .38, maskType: 0, maskStrength: 0, saturation: 0, phosphorDecayR: 80, phosphorDecayG: 95, phosphorDecayB: 18, persistenceStrength: .76, bloom: .22, halation: .16, curvatureX: .13, curvatureY: .1, vignette: .28 }
  },
  {
    id: 'worn-tube', name: 'Worn Tube', subtitle: 'High hours, dim guns and burn-in',
    patch: { signalType: 3, tubeAge: .78, burnIn: .46, weakRed: .22, weakGreen: .08, weakBlue: .31, brightness: .82, contrast: .88, saturation: .74, focusEdge: 1.1, convergenceRX: .45, convergenceBX: -.7, cornerConvergence: 1.05, maskStrength: .43, noise: .055, jitter: .0014, bloom: .27, blackLevel: .035 }
  },
  {
    id: 'studio-480i', name: 'Studio 480i', subtitle: 'Interlaced NTSC broadcast composite',
    patch: { signalType: 3, resolutionLines: 480, interlace: true, fieldOrder: 0, combFilter: 2, signalStrength: .97, noise: .012, jitter: .00045, chromaBleed: .11, dotCrawl: .08, lumaBandwidth: .88, chromaBandwidth: .65, scanlineStrength: .16, maskType: 1, maskStrength: .32, overscanX: .025, overscanY: .025, temperature: 6500 }
  },
  {
    id: 'studio-pal', name: 'Studio PAL', subtitle: '576i PAL broadcast composite',
    patch: { signalType: 6, resolutionLines: 576, interlace: true, fieldOrder: 0, combFilter: 2, signalStrength: .98, noise: .01, jitter: .0004, chromaBleed: .09, dotCrawl: .055, colorBurstPhase: 0, lumaBandwidth: .9, chromaBandwidth: .68, scanlineStrength: .15, maskType: 1, maskStrength: .31, overscanX: .024, overscanY: .024, temperature: 6500 }
  }
]);

const CALIBRATION_STEPS = Object.freeze([
  { pattern: 2, tab: 'display', title: 'Black level / PLUGE', text: 'Lower Black level until the below-black patch disappears, then raise it just enough that the near-black patch remains barely visible.' },
  { pattern: 10, tab: 'display', title: 'White level and blooming', text: 'Raise Contrast and White clip without losing detail or causing excessive expansion of the white field. Use Beam bloom to model tube regulation.' },
  { pattern: 4, tab: 'geometry', title: 'Size, position and linearity', text: 'Center the grid, set equal overscan on every edge, then correct line spacing with H/V linearity before touching pincushion or corner pin.' },
  { pattern: 7, tab: 'geometry', title: 'Curvature and safe area', text: 'Use the monoscope circle to correct H/V size, raster rotation, curvature, trapezoid and pincushion. The central circle should remain circular.' },
  { pattern: 9, tab: 'geometry', title: 'Static convergence', text: 'Align the red and blue dot matrices to the green reference at the center first, then use Corner convergence for the outer screen.' },
  { pattern: 8, tab: 'display', title: 'Color and white balance', text: 'Set temperature, hue and saturation so neutral patches remain gray and the primary/secondary patches are distinct without clipping.' },
  { pattern: 6, tab: 'tube', title: 'Focus, mask and bandwidth', text: 'Use the zone plate to balance focus, scanline sharpness, mask pitch and signal bandwidth. Stop before moiré overwhelms fine detail.' }
]);

const FAULT_BURSTS = Object.freeze([
  { name: 'Sync hunt', duration: 2200, patch: { jitter: .012, horizontalTear: .72, signalStrength: .48 } },
  { name: 'RF interference', duration: 2600, patch: { noise: .45, rfMultipath: .75, humBar: .7, signalStrength: .4 } },
  { name: 'Tape damage', duration: 3000, patch: { signalType: 5, tracking: .9, dropout: .85, jitter: .009, horizontalTear: .45 } },
  { name: 'Gun drift', duration: 2400, patch: { convergenceRX: 2.2, convergenceRY: -.8, convergenceBX: -2.5, convergenceBY: 1.1, cornerConvergence: 2.8 } },
  { name: 'Power sag', duration: 2100, patch: { brightness: .5, hSize: .91, vSize: .94, humBar: .82, bloom: .5 } }
]);

export { DEFAULT_STATE, PRESETS, CONTROL_GROUPS, TEST_PATTERNS, CALIBRATION_STEPS, FAULT_BURSTS };
