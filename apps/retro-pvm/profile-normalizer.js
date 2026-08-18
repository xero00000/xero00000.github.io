import { DEFAULT_STATE, PRESETS } from './presets.js';

// Monitor profiles should be deterministic. These settings belong to the user/session
// rather than the simulated monitor, so profile changes intentionally leave them alone.
export const PROFILE_PRESERVE_KEYS = new Set([
  'version',
  'sourceMode', 'testPattern',
  'fitMode', 'sourceZoom', 'sourcePanX', 'sourcePanY', 'sourceRotation', 'mirrorX', 'mirrorY',
  'glare', 'roomGlow', 'humVolume',
  'renderScale', 'adaptiveQuality', 'targetFPS', 'maxDPR', 'pauseWhenHidden', 'reducedMotion',
  'recordFPS', 'recordBitrate',
  'power', 'bypass', 'compareMode', 'comparePosition', 'freeze', 'scopeMode'
]);

export const PROFILE_DEFAULTS = Object.freeze(Object.fromEntries(
  Object.entries(DEFAULT_STATE).filter(([key]) => !PROFILE_PRESERVE_KEYS.has(key))
));

export function normalizePresetPatch(patch = {}) {
  return { ...PROFILE_DEFAULTS, ...patch };
}

// PRESETS is a frozen array, but the preset records themselves are intentionally plain
// objects. Expand every built-in patch once during module evaluation so the existing
// controller can keep using Object.assign() without leaking values from the previous
// profile.
for (const preset of PRESETS) {
  preset.patch = normalizePresetPatch(preset.patch);
}
