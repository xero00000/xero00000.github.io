import { CRTAudio, CRTGL } from './renderer.js';
import { DEFAULT_STATE, PRESETS, CONTROL_GROUPS, TEST_PATTERNS, CALIBRATION_STEPS, FAULT_BURSTS } from './presets.js';
import { VideoAnalyzer } from './analyzer.js';
import { OutputRecorder } from './recorder.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const STORAGE_KEY = 'xero-crt-lab-v3';
const LEGACY_STORAGE_KEY = 'xero-crt-lab-v2';
const CUSTOM_PRESETS_KEY = 'xero-crt-lab-custom-presets-v1';
const MAX_HISTORY = 80;
const TRANSIENT_KEYS = new Set(['power', 'bypass', 'freeze']);
const PROFILE_EXCLUDE = new Set(['version', 'sourceMode', 'testPattern', 'power', 'bypass', 'freeze', 'compareMode', 'comparePosition', 'scopeMode']);
const CONTROL_DEFS = Object.values(CONTROL_GROUPS).flat().filter(definition => definition.key);
const CONTROL_BY_KEY = new Map(CONTROL_DEFS.map(definition => [definition.key, definition]));

function formatTime(seconds, includeHours = true) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (!includeHours && hours === 0) return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function timestamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }

function downloadBlob(blob, filename) {
  if (!blob) return;
  const anchor = document.createElement('a');
  const url = URL.createObjectURL(blob);
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

function safeJSONParse(text, fallback = null) { try { return JSON.parse(text); } catch { return fallback; } }
function encodeSharePayload(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function decodeSharePayload(encoded) {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - encoded.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function sanitizeState(candidate = {}) {
  const output = { ...DEFAULT_STATE };
  for (const [key, fallback] of Object.entries(DEFAULT_STATE)) {
    if (!(key in candidate)) continue;
    const value = candidate[key];
    const definition = CONTROL_BY_KEY.get(key);
    if (typeof fallback === 'boolean') output[key] = Boolean(value);
    else if (typeof fallback === 'number') {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) continue;
      output[key] = definition?.min !== undefined ? clamp(numeric, definition.min, definition.max) : numeric;
    } else if (typeof fallback === 'string') output[key] = typeof value === 'string' ? value : fallback;
  }
  output.version = 3;
  output.power = true;
  output.bypass = false;
  output.freeze = false;
  if (output.sourceMode === 0) output.sourceMode = 2;
  if (!['waveform', 'vectorscope', 'histogram', 'off'].includes(output.scopeMode)) output.scopeMode = 'waveform';
  return output;
}

function loadStoredState() {
  const current = safeJSONParse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (current && typeof current === 'object') return sanitizeState(current);
  const legacy = safeJSONParse(localStorage.getItem(LEGACY_STORAGE_KEY) || 'null');
  if (legacy && typeof legacy === 'object') return sanitizeState(legacy);
  const fresh = sanitizeState(DEFAULT_STATE);
  if (matchMedia?.('(prefers-reduced-motion: reduce)').matches) fresh.reducedMotion = true;
  return fresh;
}
function cleanForStorage(state) {
  const clean = sanitizeState(state);
  clean.power = true; clean.bypass = false; clean.freeze = false;
  if (clean.sourceMode === 0) clean.sourceMode = 2;
  return clean;
}
function stateSnapshot(state) {
  const snapshot = {};
  for (const key of Object.keys(DEFAULT_STATE)) if (!TRANSIENT_KEYS.has(key)) snapshot[key] = state[key];
  return snapshot;
}
function profileSnapshot(state) {
  const snapshot = {};
  for (const key of Object.keys(DEFAULT_STATE)) if (!PROFILE_EXCLUDE.has(key)) snapshot[key] = state[key];
  return snapshot;
}
function normalizeCustomPresets(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 80).flatMap(item => {
    if (!item || typeof item !== 'object' || typeof item.name !== 'string' || !item.state) return [];
    const name = item.name.trim().slice(0, 48);
    if (!name) return [];
    return [{ id: String(item.id || `custom-${crypto.randomUUID?.() || Date.now()}`), name, created: String(item.created || new Date().toISOString()), state: profileSnapshot(sanitizeState(item.state)) }];
  });
}

class CRTLabApp {
  constructor() {
    this.state = loadStoredState();
    this.audio = new CRTAudio();
    this.video = $('#sourceVideo');
    this.video.loop = true;
    this.video.volume = Number($('#volume').value);
    this.stream = null;
    this.objectURL = null;
    this.sourceType = 'test';
    this.sourceName = 'Built-in SMPTE RP 219';
    this.activePreset = 'pvm-rgb';
    this.customPresets = normalizeCustomPresets(safeJSONParse(localStorage.getItem(CUSTOM_PRESETS_KEY) || '[]', []));
    this.osdTimer = null;
    this.saveTimer = null;
    this.destroyed = false;
    this.lastStatsUpdate = 0;
    this.lastDiagnosticsUpdate = 0;
    this.estimatedVideoFPS = 30;
    this.previousVideoMediaTime = null;
    this.installPrompt = null;
    this.history = [];
    this.historyIndex = -1;
    this.faultToken = 0;
    this.calibrationIndex = -1;
    this.calibrationRestore = null;
    this.dragDepth = 0;
    this.recordStopping = false;
    try { this.renderer = new CRTGL($('#glcanvas'), this.state); }
    catch (error) { this.showFatalError(error); return; }
    this.renderer.setVideo(this.video);
    const loadedSharedSetup = this.applySharedSetupFromHash();
    this.renderer.onStatus = (type, message) => this.handleRendererStatus(type, message);
    this.analyzer = new VideoAnalyzer($('#glcanvas'), $('#scopeCanvas'), { min: $('#ireMin'), max: $('#ireMax'), average: $('#lumaAvg'), chroma: $('#chromaPeak') });
    this.recorder = new OutputRecorder($('#glcanvas'), this.video);
    this.recorder.onStateChange = (state, payload) => this.handleRecorderState(state, payload);
    this.bind();
    this.buildControls();
    this.buildPresets();
    this.syncAllControls();
    this.setScopeMode(this.state.scopeMode, false);
    if (this.state.sourceMode === 1) this.selectSnow(false); else this.selectTest(this.state.testPattern, false);
    this.updateVisualState();
    this.commitHistory('Initial state', true);
    this.collectDiagnostics();
    this.registerPWA();
    this.trackVideoFrames();
    if (loadedSharedSetup) setTimeout(() => this.showOSD('SHARED SETUP', 'CALIBRATION LOADED', 'URL PROFILE APPLIED'), 180);
    requestAnimationFrame(now => this.loop(now));
  }

  bind() {
    $('#loadMediaBtn').addEventListener('click', () => { this.audio.ensure(); $('#mediaInput').click(); });
    $('#mediaInput').addEventListener('change', event => { const [file] = event.target.files || []; this.loadFile(file); event.target.value = ''; });
    $('#cameraBtn').addEventListener('click', () => this.useCamera());
    $('#screenBtn').addEventListener('click', () => this.useScreenCapture());
    $('#testBtn').addEventListener('click', () => { const next = this.sourceType === 'test' ? (this.state.testPattern + 1) % TEST_PATTERNS.length : this.state.testPattern; this.selectTest(next, true); });
    $('#snowBtn').addEventListener('click', () => this.selectSnow(true));
    $('#playBtn').addEventListener('click', () => this.togglePlayback());
    $('#stepBackBtn').addEventListener('click', () => this.stepFrame(-1));
    $('#stepForwardBtn').addEventListener('click', () => this.stepFrame(1));
    $('#timeline').addEventListener('input', event => { if (this.sourceType === 'video' && Number.isFinite(this.video.duration) && this.video.duration > 0) this.video.currentTime = Number(event.target.value) / 100 * this.video.duration; });
    $('#volume').addEventListener('input', event => { this.video.volume = Number(event.target.value); });
    $('#powerBtn').addEventListener('click', () => this.togglePower());
    $('#degaussBtn').addEventListener('click', () => this.degauss());
    $('#compareBtn').addEventListener('click', () => this.toggleCompare());
    $('#compareSlider').addEventListener('input', event => { this.state.comparePosition = Number(event.target.value); this.updateCompareUI(); this.saveStateDebounced(); });
    $('#freezeBtn').addEventListener('click', () => this.toggleFreeze());
    $('#recordBtn').addEventListener('click', () => this.toggleRecording());
    $('#screenshotBtn').addEventListener('click', () => this.screenshot());
    $('#fullscreenBtn').addEventListener('click', () => this.toggleFullscreen());
    $('#undoBtn').addEventListener('click', () => this.undo());
    $('#redoBtn').addEventListener('click', () => this.redo());
    $('#savePresetBtn').addEventListener('click', () => this.saveCustomPreset());
    $('#managePresetsBtn').addEventListener('click', () => this.openPresetManager());
    $('#presetDialog').addEventListener('close', () => this.buildPresets());
    $('#helpBtn').addEventListener('click', () => $('#helpDialog').showModal());
    $$('.tab').forEach(button => button.addEventListener('click', () => this.activateTab(button.dataset.tab)));
    $$('#scopeTabs button').forEach(button => button.addEventListener('click', () => this.setScopeMode(button.dataset.scope)));
    $('#calibrateBtn').addEventListener('click', () => this.startCalibration());
    $('#calibrationPrev').addEventListener('click', () => this.moveCalibration(-1));
    $('#calibrationNext').addEventListener('click', () => this.moveCalibration(1));
    $('#calibrationExit').addEventListener('click', () => this.exitCalibration());
    $('#toolScreenshotBtn').addEventListener('click', () => this.screenshot());
    $('#toolRecordBtn').addEventListener('click', () => this.toggleRecording());
    $('#copyFrameBtn').addEventListener('click', () => this.copyFrame());
    $('#shareFrameBtn').addEventListener('click', () => this.shareFrame());
    $('#shareSetupBtn').addEventListener('click', () => this.shareSetup());
    $('#copyDiagnosticsBtn').addEventListener('click', () => this.copyDiagnostics());
    $('#exportBtn').addEventListener('click', () => this.exportSettings());
    $('#importBtn').addEventListener('click', () => $('#settingsInput').click());
    $('#settingsInput').addEventListener('change', event => { const [file] = event.target.files || []; this.importSettings(file); event.target.value = ''; });
    $('#resetBtn').addEventListener('click', () => this.reset());
    $('#clearStorageBtn').addEventListener('click', () => this.clearLocalData());
    $('#randomFaultBtn').addEventListener('click', () => this.triggerFaultBurst());
    $('#safeModeBtn').addEventListener('click', () => this.enableSafeQuality());
    document.addEventListener('keydown', event => this.hotkey(event, true));
    document.addEventListener('keyup', event => this.hotkey(event, false));
    document.addEventListener('paste', event => this.handlePaste(event));
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) document.body.classList.remove('crt-fullscreen'); });
    window.addEventListener('resize', () => this.renderer.resize(false), { passive: true });
    window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); this.installPrompt = event; $('#installBtn').classList.remove('hidden'); });
    $('#installBtn').addEventListener('click', () => this.installPWA());
    const stage = $('#screenStage');
    stage.addEventListener('dragenter', event => { event.preventDefault(); this.dragDepth += 1; $('#dropHint').classList.add('show'); });
    stage.addEventListener('dragover', event => event.preventDefault());
    stage.addEventListener('dragleave', event => { event.preventDefault(); this.dragDepth = Math.max(0, this.dragDepth - 1); if (!this.dragDepth) $('#dropHint').classList.remove('show'); });
    stage.addEventListener('drop', event => { event.preventDefault(); this.dragDepth = 0; $('#dropHint').classList.remove('show'); const [file] = event.dataTransfer?.files || []; this.loadFile(file); });
    this.video.addEventListener('loadedmetadata', () => this.updateSourceResolution());
    this.video.addEventListener('play', () => this.updateTransport());
    this.video.addEventListener('pause', () => this.updateTransport());
    this.video.addEventListener('durationchange', () => this.updateTransport());
    this.video.addEventListener('error', () => this.showOSD('ERROR', 'MEDIA PLAYBACK', this.video.error?.message || 'DECODER FAILURE'));
    window.addEventListener('pagehide', () => this.destroy(), { once: true });
  }

  buildControls() {
    for (const [page, definitions] of Object.entries(CONTROL_GROUPS)) {
      const root = $(`#${page}Controls`); if (!root) continue; root.textContent = '';
      for (const definition of definitions) {
        if (definition.type === 'section') { const heading = document.createElement('div'); heading.className = 'control-section-title'; heading.textContent = definition.label; root.appendChild(heading); continue; }
        const row = document.createElement('div'); row.className = 'control-row'; row.dataset.key = definition.key;
        if (definition.type === 'toggle') row.innerHTML = `<div class="toggle"><span class="control-label">${definition.label}</span><label class="toggle-switch"><input type="checkbox" data-control="${definition.key}" aria-label="${definition.label}"><span class="toggle-track"></span></label></div>`;
        else if (definition.type === 'select') row.innerHTML = `<div class="control-row-head"><span class="control-label">${definition.label}</span></div><select data-control="${definition.key}" aria-label="${definition.label}">${definition.options.map(([name, value]) => `<option value="${value}">${name}</option>`).join('')}</select>`;
        else row.innerHTML = `<div class="control-row-head"><span class="control-label">${definition.label}</span><output class="control-value" data-value="${definition.key}"></output></div><input type="range" min="${definition.min}" max="${definition.max}" step="${definition.step}" data-control="${definition.key}" aria-label="${definition.label}">`;
        root.appendChild(row);
        const input = $(`[data-control="${definition.key}"]`, row);
        input.addEventListener('input', () => { const fallback = DEFAULT_STATE[definition.key]; const value = definition.type === 'toggle' ? input.checked : (typeof fallback === 'number' ? Number(input.value) : input.value); this.setState(definition.key, value, definition, false, false); });
        input.addEventListener('change', () => { this.commitHistory(`Adjust ${definition.label}`); this.saveState(); });
      }
    }
  }

  buildPresets() {
    const strip = $('#presetStrip'); strip.textContent = '';
    for (const preset of PRESETS) strip.appendChild(this.makePresetButton(preset, false));
    for (const preset of this.customPresets) strip.appendChild(this.makePresetButton({ id: preset.id, name: preset.name, subtitle: 'Saved local profile', patch: preset.state }, true));
    this.updatePresetButtons();
  }
  makePresetButton(preset, custom) {
    const button = document.createElement('button'); button.className = `preset-btn${custom ? ' custom' : ''}`; button.dataset.preset = preset.id;
    button.innerHTML = `<strong>${preset.name}</strong><span>${preset.subtitle || 'Custom profile'}</span>`;
    button.addEventListener('click', () => this.applyPreset(preset)); return button;
  }
  syncAllControls() { for (const definition of CONTROL_DEFS) this.updateControl(definition.key, definition); $('#compareSlider').value = this.state.comparePosition; this.updatePresetButtons(); this.updateContextualControls(); }
  updateControl(key, definition = CONTROL_BY_KEY.get(key)) {
    const input = $(`[data-control="${key}"]`); if (input) { if (input.type === 'checkbox') input.checked = Boolean(this.state[key]); else input.value = this.state[key]; }
    const output = $(`[data-value="${key}"]`); if (output) { const value = definition?.format ? definition.format(this.state[key]) : String(this.state[key]); output.value = value; output.textContent = value; }
  }
  setState(key, value, definition = CONTROL_BY_KEY.get(key), show = true, commit = false) {
    if (!(key in DEFAULT_STATE)) return;
    if (definition?.min !== undefined) value = clamp(Number(value), definition.min, definition.max);
    this.state[key] = value; this.activePreset = null; this.updateControl(key, definition);
    if (key === 'testPattern' && this.state.sourceMode === 2) this.updateSourceMeta();
    if (['renderScale', 'maxDPR'].includes(key)) this.renderer.resize(true);
    if (key === 'freeze') this.renderer.setFreeze(value);
    this.updateVisualState();
    if (show) { const label = definition?.label || key; const formatted = definition?.format ? definition.format(value) : String(value); this.showOSD('ADJUST', label.toUpperCase(), formatted); }
    if (commit) this.commitHistory(`Adjust ${definition?.label || key}`);
    this.saveStateDebounced();
  }
  updateContextualControls() {
    const signal = Number(this.state.signalType); const compositeEncoded = [3, 4, 5, 6].includes(signal);
    const visibility = { rfMultipath: signal === 4, humBar: signal === 4 || signal === 5, agcPumping: signal === 4 || signal === 5, combFilter: compositeEncoded, dotCrawl: compositeEncoded, colorBurstPhase: compositeEncoded, tracking: signal === 5, dropout: signal === 5, vhsSpeed: signal === 5 };
    for (const [key, visible] of Object.entries(visibility)) $(`.control-row[data-key="${key}"]`)?.classList.toggle('context-hidden', !visible);
  }
  updateVisualState() {
    document.documentElement.style.setProperty('--glare', String(this.state.glare)); document.documentElement.style.setProperty('--room-glow', String(this.state.roomGlow));
    $('#powerDot').classList.toggle('off', !this.state.power); $('#signalLed').classList.toggle('off', !this.state.power); $('#compareBtn').classList.toggle('active', this.state.compareMode !== 0); $('#freezeBtn').classList.toggle('active', this.state.freeze); $('#freezeBtn').textContent = this.state.freeze ? 'FROZEN' : 'FREEZE';
    this.renderer.setFreeze(this.state.freeze); this.audio.setVolume(this.state.power ? this.state.humVolume : 0);
    const signalNames = ['RGB', 'COMPONENT', 'S-VIDEO', 'NTSC', 'RF', 'VHS', 'PAL']; $('#signalLabel').textContent = signalNames[this.state.signalType] || 'RGB';
    this.updateCompareUI(); this.updatePresetButtons(); this.updateContextualControls(); this.updateSourceButtons(); this.updateHistoryButtons();
  }
  updateCompareUI() { const active = this.state.compareMode === 1; $('#screenStage').classList.toggle('comparing', active); $('#compareLine').style.setProperty('--split', `${this.state.comparePosition * 100}%`); $('#compareSlider').value = this.state.comparePosition; }
  updatePresetButtons() { $$('.preset-btn').forEach(button => button.classList.toggle('active', button.dataset.preset === this.activePreset)); }
  updateSourceButtons() {
    const map = { '#loadMediaBtn': ['image', 'video'], '#cameraBtn': ['camera'], '#screenBtn': ['screen'], '#testBtn': ['test', 'calibration'], '#snowBtn': ['snow'] };
    for (const [selector, types] of Object.entries(map)) $(selector)?.classList.toggle('active', types.includes(this.sourceType));
  }
  applyPreset(preset) { Object.assign(this.state, preset.patch); this.activePreset = preset.id; this.syncAllControls(); this.renderer.clearFeedback(); this.updateVisualState(); this.commitHistory(`Preset ${preset.name}`); this.saveState(); this.showOSD('MONITOR PROFILE', preset.name.toUpperCase(), (preset.subtitle || 'CUSTOM PROFILE').toUpperCase()); }
  saveCustomPreset() {
    const name = prompt('Name this monitor profile:', `CRT Profile ${this.customPresets.length + 1}`)?.trim().slice(0, 48); if (!name) return;
    const preset = { id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, created: new Date().toISOString(), state: profileSnapshot(this.state) };
    this.customPresets.push(preset); this.saveCustomPresets(); this.activePreset = preset.id; this.buildPresets(); this.showOSD('PROFILE', 'SAVED', name.toUpperCase());
  }
  saveCustomPresets() { localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(this.customPresets)); }
  openPresetManager() {
    const root = $('#customPresetList'); root.textContent = '';
    if (!this.customPresets.length) { const empty = document.createElement('p'); empty.textContent = 'No custom profiles have been saved on this device.'; empty.style.color = 'var(--muted)'; root.appendChild(empty); }
    for (const preset of this.customPresets) {
      const row = document.createElement('div'); row.className = 'custom-preset-item'; const name = document.createElement('strong'); name.textContent = preset.name;
      const load = document.createElement('button'); load.type = 'button'; load.textContent = 'LOAD'; load.addEventListener('click', () => { this.applyPreset({ id: preset.id, name: preset.name, subtitle: 'Saved local profile', patch: preset.state }); $('#presetDialog').close(); });
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'DELETE'; remove.addEventListener('click', () => { if (!confirm(`Delete “${preset.name}”?`)) return; this.customPresets = this.customPresets.filter(item => item.id !== preset.id); this.saveCustomPresets(); this.openPresetManager(); });
      row.append(name, load, remove); root.appendChild(row);
    }
    if (!$('#presetDialog').open) $('#presetDialog').showModal();
  }
  reset() {
    if (!confirm('Restore factory CRT settings? The loaded source and custom profiles will be kept.')) return;
    const sourceMode = this.state.sourceMode, testPattern = this.state.testPattern;
    Object.assign(this.state, DEFAULT_STATE, { sourceMode, testPattern, power: true, bypass: false, freeze: false });
    this.renderer.setPower(true); this.activePreset = null; this.syncAllControls(); this.renderer.clearFeedback(); this.updateVisualState(); this.commitHistory('Factory reset'); this.saveState(); this.showOSD('SYSTEM', 'FACTORY RESET', 'REFERENCE CALIBRATION RESTORED');
  }
  saveStateDebounced() { clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.saveState(), 180); }
  saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanForStorage(this.state))); }
  commitHistory(label = 'Adjustment', force = false) {
    const snapshot = stateSnapshot(this.state), serialized = JSON.stringify(snapshot), current = this.history[this.historyIndex];
    if (!force && current?.serialized === serialized) return;
    this.history = this.history.slice(0, this.historyIndex + 1); this.history.push({ label, snapshot, serialized }); if (this.history.length > MAX_HISTORY) this.history.shift(); this.historyIndex = this.history.length - 1; this.updateHistoryButtons();
  }
  applyHistoryEntry(entry, direction) {
    if (!entry) return;
    Object.assign(this.state, sanitizeState({ ...this.state, ...entry.snapshot }), { power: this.state.power, bypass: false, freeze: false, sourceMode: this.state.sourceMode, testPattern: this.state.testPattern });
    this.syncAllControls(); this.renderer.clearFeedback(); this.updateVisualState(); this.saveState(); this.showOSD('HISTORY', direction, entry.label.toUpperCase());
  }
  undo() { if (this.historyIndex <= 0) return; this.historyIndex -= 1; this.applyHistoryEntry(this.history[this.historyIndex], 'UNDO'); this.updateHistoryButtons(); }
  redo() { if (this.historyIndex >= this.history.length - 1) return; this.historyIndex += 1; this.applyHistoryEntry(this.history[this.historyIndex], 'REDO'); this.updateHistoryButtons(); }
  updateHistoryButtons() { $('#undoBtn').disabled = this.historyIndex <= 0; $('#redoBtn').disabled = this.historyIndex >= this.history.length - 1; }
  showOSD(kicker, main, sub = '', duration = 1650) { $('#osdKicker').textContent = kicker; $('#osdMain').textContent = main; $('#osdSub').textContent = sub; $('#osd').classList.add('show'); clearTimeout(this.osdTimer); this.osdTimer = setTimeout(() => $('#osd').classList.remove('show'), duration); }
  showFatalError(error) { const stage = $('#screenStage'); if (!stage) { alert(error.message); return; } stage.innerHTML = `<div style="padding:32px;color:#ffb56b;font:14px/1.55 ui-monospace,monospace"><h2>CRT GPU PIPELINE FAILED</h2><p>${String(error.message).replace(/[<>]/g, '')}</p><p>Enable hardware acceleration and WebGL2, then reload the page.</p></div>`; }
  handleRendererStatus(type, message) { if (type === 'lost' || type === 'restored' || type === 'error') this.showOSD('GPU', type.toUpperCase(), message.toUpperCase(), 2600); if (type === 'quality') $('#gpuLabel').textContent = message.toUpperCase(); }
  stopStream(selectFallback = false) { if (this.stream) { for (const track of this.stream.getTracks()) track.stop(); this.stream = null; } if (this.video.srcObject) this.video.srcObject = null; if (selectFallback) this.selectTest(this.state.testPattern, false); }
  clearObjectURL() { if (this.objectURL) { URL.revokeObjectURL(this.objectURL); this.objectURL = null; } }

  async loadFile(file) {
    if (!file) return; this.audio.ensure(); if (this.calibrationIndex >= 0) this.exitCalibration();
    if (file.type.startsWith('image/')) {
      try { const bitmap = await createImageBitmap(file); this.stopStream(false); this.clearObjectURL(); this.video.pause(); this.video.removeAttribute('src'); this.video.load(); this.renderer.setImage(bitmap); this.state.sourceMode = 0; this.sourceType = 'image'; this.sourceName = file.name; $('#sourceName').textContent = file.name; $('#sourceResolution').textContent = `${bitmap.width} × ${bitmap.height} · STILL`; this.renderer.clearFeedback(); this.showOSD('INPUT', 'IMAGE', file.name.toUpperCase()); }
      catch (error) { this.showOSD('ERROR', 'IMAGE FAILED', (error.message || 'UNSUPPORTED FORMAT').toUpperCase(), 2600); return; }
    } else if (file.type.startsWith('video/')) {
      try {
        this.stopStream(false); this.clearObjectURL(); this.objectURL = URL.createObjectURL(file); this.video.srcObject = null; this.video.src = this.objectURL; this.video.muted = false; this.video.volume = Number($('#volume').value);
        await new Promise((resolve, reject) => { if (this.video.readyState >= 1) resolve(); else { this.video.addEventListener('loadedmetadata', resolve, { once: true }); this.video.addEventListener('error', reject, { once: true }); } });
        await this.video.play().catch(() => {}); this.renderer.setVideo(this.video); this.state.sourceMode = 0; this.sourceType = 'video'; this.sourceName = file.name; this.updateSourceResolution(); this.renderer.clearFeedback(); this.showOSD('INPUT', 'VIDEO', file.name.toUpperCase());
      } catch (error) { this.showOSD('ERROR', 'VIDEO FAILED', (error.message || 'DECODER FAILURE').toUpperCase(), 2600); return; }
    } else { this.showOSD('ERROR', 'UNSUPPORTED MEDIA', (file.type || file.name || 'UNKNOWN').toUpperCase()); return; }
    this.updateSourceStatus(); this.updateTransport(); this.updateVisualState();
  }
  async useCamera() {
    if (!navigator.mediaDevices?.getUserMedia) { this.showOSD('ERROR', 'CAMERA UNAVAILABLE', 'GETUSERMEDIA IS NOT AVAILABLE'); return; }
    this.audio.ensure();
    try { const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60, max: 60 } }, audio: false }); await this.useStream(stream, 'camera', 'Live camera'); this.showOSD('INPUT', 'LIVE CAMERA', 'REAL-TIME CRT PROCESSING'); }
    catch (error) { this.showOSD('ERROR', 'CAMERA DENIED', (error.name || error.message || 'PERMISSION ERROR').toUpperCase(), 2600); }
  }
  async useScreenCapture() {
    if (!navigator.mediaDevices?.getDisplayMedia) { this.showOSD('ERROR', 'SCREEN CAPTURE UNAVAILABLE', 'BROWSER DOES NOT EXPOSE GETDISPLAYMEDIA'); return; }
    this.audio.ensure();
    try { const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 60, max: 60 } }, audio: true, preferCurrentTab: false, selfBrowserSurface: 'exclude' }); await this.useStream(stream, 'screen', 'Shared screen'); this.showOSD('INPUT', 'SCREEN CAPTURE', 'LIVE DESKTOP / TAB SOURCE'); }
    catch (error) { if (error.name !== 'NotAllowedError') this.showOSD('ERROR', 'SCREEN CAPTURE FAILED', (error.name || error.message).toUpperCase(), 2600); }
  }
  async useStream(stream, type, name) {
    if (this.calibrationIndex >= 0) this.exitCalibration(); this.stopStream(false); this.clearObjectURL(); this.stream = stream; this.video.pause(); this.video.removeAttribute('src'); this.video.srcObject = stream; this.video.muted = true; await this.video.play(); this.renderer.setVideo(this.video); this.state.sourceMode = 0; this.sourceType = type; this.sourceName = name;
    const videoTrack = stream.getVideoTracks()[0]; videoTrack?.addEventListener('ended', () => { if (this.stream === stream) { this.stopStream(false); this.selectTest(this.state.testPattern, true); } }, { once: true });
    this.updateSourceResolution(); this.renderer.clearFeedback(); this.updateSourceStatus(); this.updateVisualState();
  }
  selectTest(pattern = 0, notify = true) {
    if (this.calibrationIndex >= 0) this.exitCalibration(false); this.stopStream(false); this.video.pause(); this.state.sourceMode = 2; this.state.testPattern = clamp(Number(pattern) || 0, 0, TEST_PATTERNS.length - 1); this.sourceType = 'test'; this.sourceName = `Built-in ${TEST_PATTERNS[this.state.testPattern].name}`; this.updateControl('testPattern'); this.updateSourceMeta(); this.updateSourceStatus(); this.updateVisualState(); this.renderer.clearFeedback();
    if (notify) this.showOSD('TEST GENERATOR', TEST_PATTERNS[this.state.testPattern].short, TEST_PATTERNS[this.state.testPattern].detail.toUpperCase());
  }
  selectSnow(notify = true) {
    if (this.calibrationIndex >= 0) this.exitCalibration(false); this.stopStream(false); this.video.pause(); this.state.sourceMode = 1; this.sourceType = 'snow'; this.sourceName = 'RF snow generator'; $('#sourceName').textContent = this.sourceName; $('#sourceResolution').textContent = 'PROCEDURAL · UNLOCKED SYNC'; this.updateSourceStatus(); this.updateVisualState(); this.renderer.clearFeedback(); if (notify) this.showOSD('INPUT', 'NO SIGNAL', 'RF NOISE GENERATOR');
  }
  updateSourceMeta() { if (this.state.sourceMode !== 2) return; const pattern = TEST_PATTERNS[this.state.testPattern] || TEST_PATTERNS[0]; this.sourceName = `Built-in ${pattern.name}`; $('#sourceName').textContent = this.sourceName; $('#sourceResolution').textContent = '640 × 480 · 59.94p'; }
  updateSourceResolution() { const width = this.video.videoWidth || 0, height = this.video.videoHeight || 0; $('#sourceName').textContent = this.sourceName; $('#sourceResolution').textContent = width && height ? `${width} × ${height} · ${Math.round(this.estimatedVideoFPS)} FPS` : 'NEGOTIATING SOURCE…'; }
  updateSourceStatus() { const status = { test: 'TEST PATTERN', calibration: 'CALIBRATION', snow: 'NO SIGNAL', image: 'IMAGE', video: 'VIDEO', camera: 'CAMERA', screen: 'SCREEN' }[this.sourceType] || 'SOURCE'; $('#sourceStatus').textContent = status; this.updateSourceButtons(); }
  trackVideoFrames() {
    if (!this.video.requestVideoFrameCallback) return;
    const callback = (_now, metadata) => { if (this.destroyed) return; if (this.previousVideoMediaTime !== null) { const delta = metadata.mediaTime - this.previousVideoMediaTime; if (delta > 0.001 && delta < 0.25) this.estimatedVideoFPS = this.estimatedVideoFPS * 0.85 + (1 / delta) * 0.15; } this.previousVideoMediaTime = metadata.mediaTime; this.video.requestVideoFrameCallback(callback); };
    this.video.requestVideoFrameCallback(callback);
  }
  togglePlayback() { if (this.sourceType !== 'video') return; if (this.video.paused) this.video.play().catch(() => {}); else this.video.pause(); this.updateTransport(); }
  stepFrame(direction) { if (this.sourceType !== 'video') return; this.video.pause(); const step = 1 / clamp(this.estimatedVideoFPS || 30, 12, 120); this.video.currentTime = clamp(this.video.currentTime + direction * step, 0, Number.isFinite(this.video.duration) ? this.video.duration : Infinity); this.updateTransport(); this.showOSD('TRANSPORT', direction > 0 ? 'FRAME +1' : 'FRAME -1', `${Math.round(1 / step)} FPS ASSUMED`, 750); }
  updateTransport() {
    const isVideo = this.sourceType === 'video', duration = isVideo && Number.isFinite(this.video.duration) ? this.video.duration : 0, current = isVideo ? this.video.currentTime : 0;
    $('#currentTime').textContent = formatTime(current); $('#durationTime').textContent = formatTime(duration); $('#timeline').value = duration ? current / duration * 100 : 0; $('#timeline').disabled = !isVideo; $('#playBtn').textContent = isVideo && !this.video.paused ? '❚❚' : '▶'; $('#playBtn').disabled = !isVideo; $('#stepBackBtn').disabled = !isVideo; $('#stepForwardBtn').disabled = !isVideo;
  }
  togglePower() { this.audio.ensure(); const on = !this.state.power; this.renderer.setPower(on); this.audio.chirp('power'); this.updateVisualState(); this.showOSD('POWER', on ? 'ON' : 'STANDBY', on ? 'HEATER WARM-UP / RASTER EXPANSION' : 'RASTER COLLAPSE'); }
  degauss() { if (!this.state.power) return; this.audio.chirp('degauss'); this.renderer.degauss(); this.showOSD('SERVICE', 'DEGAUSS', 'DEMAGNETIZING MASK AND CABINET'); }
  toggleCompare() { this.state.compareMode = this.state.compareMode === 1 ? 0 : 1; this.updateVisualState(); this.saveStateDebounced(); this.showOSD('A/B', this.state.compareMode ? 'SPLIT COMPARE' : 'COMPARE OFF', this.state.compareMode ? 'DRAG DIVIDER · RAW LEFT / CRT RIGHT' : 'FULL CRT PIPELINE'); }
  setBypass(active) { this.state.bypass = Boolean(active); $('#compareBtn').classList.toggle('active', this.state.bypass || this.state.compareMode !== 0); }
  toggleFreeze() { this.state.freeze = !this.state.freeze; this.renderer.setFreeze(this.state.freeze); this.updateVisualState(); this.showOSD('RASTER', this.state.freeze ? 'FROZEN' : 'LIVE', this.state.freeze ? 'SOURCE AND SIGNAL TIME HELD' : 'PROCESSING RESUMED'); }
  async screenshot(silent = false) {
    try { const blob = await this.renderer.captureBlob('image/png'); if (!blob) throw new Error('Canvas export returned no data.'); downloadBlob(blob, `crt-lab-${timestamp()}.png`); if (!silent) this.showOSD('CAPTURE', 'PNG SAVED', `${this.renderer.canvas.width} × ${this.renderer.canvas.height} PROCESSED OUTPUT`); return blob; }
    catch (error) { this.showOSD('ERROR', 'CAPTURE FAILED', error.message.toUpperCase(), 2600); return null; }
  }
  applySharedSetupFromHash() {
    const match = location.hash.match(/^#preset=([A-Za-z0-9_-]+)$/); if (!match) return false;
    try { const payload = decodeSharePayload(match[1]); const incoming = payload?.state || payload; if (!incoming || typeof incoming !== 'object') return false; const sanitized = sanitizeState(incoming); Object.assign(this.state, sanitized, { power: true, bypass: false, freeze: false, sourceMode: 2 }); this.activePreset = null; return true; }
    catch (error) { console.warn('CRT Lab shared setup could not be decoded:', error); return false; }
  }
  async shareSetup() {
    try {
      const payload = { format: 'xero-crt-lab-share', version: 3, state: cleanForStorage({ ...this.state, sourceMode: 2, power: true, bypass: false, freeze: false }) };
      const base = `${location.origin}${location.pathname}`, url = `${base}#preset=${encodeSharePayload(payload)}`;
      if (navigator.share) { try { await navigator.share({ title: 'CRT Lab Pro calibration', text: 'Open this exact CRT Lab Pro setup', url }); return; } catch (error) { if (error?.name === 'AbortError') return; } }
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url); else prompt('Copy this CRT Lab Pro setup URL:', url);
      this.showOSD('SHARE SETUP', 'LINK COPIED', 'EXACT CALIBRATION ENCODED IN URL');
    } catch (error) { this.showOSD('ERROR', 'SHARE SETUP FAILED', error.message.toUpperCase(), 2800); }
  }
  async copyFrame() {
    try { if (!window.ClipboardItem || !navigator.clipboard?.write) throw new Error('Image clipboard is unavailable in this browser.'); const blob = await this.renderer.captureBlob('image/png'); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); this.showOSD('CAPTURE', 'COPIED', 'PROCESSED FRAME ON CLIPBOARD'); }
    catch (error) { this.showOSD('ERROR', 'COPY FAILED', error.message.toUpperCase(), 2600); }
  }
  async shareFrame() {
    try { const blob = await this.renderer.captureBlob('image/png'); const file = new File([blob], `crt-lab-${timestamp()}.png`, { type: 'image/png' }); if (!navigator.canShare?.({ files: [file] })) throw new Error('File sharing is unavailable in this browser.'); await navigator.share({ title: 'CRT Lab Pro frame', text: 'Processed with CRT Lab Pro', files: [file] }); }
    catch (error) { if (error.name !== 'AbortError') this.showOSD('ERROR', 'SHARE FAILED', error.message.toUpperCase(), 2600); }
  }
  async toggleRecording() {
    if (this.recordStopping) return;
    if (this.recorder.recording) {
      this.recordStopping = true; const blob = await this.recorder.stop().catch(error => { this.showOSD('ERROR', 'RECORDING FAILED', error.message.toUpperCase(), 2600); return null; }); this.recordStopping = false;
      if (blob) { const extension = this.recorder.extensionFor(blob); downloadBlob(blob, `crt-lab-${timestamp()}.${extension}`); this.showOSD('RECORDER', 'FILE SAVED', `${(blob.size / 1_000_000).toFixed(1)} MB ${extension.toUpperCase()}`); }
      return;
    }
    try { this.audio.ensure(); this.recorder.start({ fps: this.state.recordFPS, bitrateMbps: this.state.recordBitrate, includeAudio: true }); this.showOSD('RECORDER', 'RECORDING', `${this.state.recordFPS} FPS · ${this.state.recordBitrate} MBPS`); }
    catch (error) { this.showOSD('ERROR', 'RECORDER UNAVAILABLE', error.message.toUpperCase(), 2800); }
  }
  handleRecorderState(state, payload) { const recording = state === 'recording' || state === 'paused'; $('#recordBtn').classList.toggle('recording', recording); $('#recordBtn').textContent = recording ? '■ STOP' : '● REC'; $('#recordIndicator').classList.toggle('show', recording); $('#toolRecordBtn').textContent = recording ? 'STOP RECORDING' : 'RECORD WEBM'; if (state === 'error') this.showOSD('ERROR', 'RECORDER', String(payload).toUpperCase(), 2600); }
  toggleFullscreen() { if (document.body.classList.contains('crt-fullscreen')) { document.body.classList.remove('crt-fullscreen'); document.exitFullscreen?.().catch(() => {}); return; } document.body.classList.add('crt-fullscreen'); document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {}); this.showOSD('VIEW', 'CRT FULLSCREEN', 'PRESS ESC TO EXIT'); setTimeout(() => this.renderer.resize(true), 120); }
  activateTab(name) { $$('.tab').forEach(button => button.classList.toggle('active', button.dataset.tab === name)); $$('.control-page').forEach(page => page.classList.toggle('active', page.dataset.page === name)); if (name === 'tools') this.collectDiagnostics(); }
  setScopeMode(mode, save = true) { this.state.scopeMode = mode; this.analyzer.setMode(mode); $$('#scopeTabs button').forEach(button => button.classList.toggle('active', button.dataset.scope === mode)); $('#scopesPanel').classList.toggle('scope-off', mode === 'off'); if (save) this.saveStateDebounced(); }
  startCalibration() {
    if (this.calibrationIndex >= 0) return;
    this.calibrationRestore = { sourceMode: this.state.sourceMode, sourceType: this.sourceType, testPattern: this.state.testPattern, activeTab: $('.tab.active')?.dataset.tab || 'signal' };
    this.calibrationIndex = 0; this.state.sourceMode = 2; this.sourceType = 'calibration'; $('#calibrationCard').classList.add('show'); this.applyCalibrationStep(); this.updateSourceStatus();
  }
  applyCalibrationStep() {
    const step = CALIBRATION_STEPS[this.calibrationIndex]; if (!step) return; this.state.sourceMode = 2; this.state.testPattern = step.pattern; this.updateControl('testPattern'); this.activateTab(step.tab); $('#calibrationStep').textContent = `STEP ${this.calibrationIndex + 1} OF ${CALIBRATION_STEPS.length}`; $('#calibrationTitle').textContent = step.title; $('#calibrationText').textContent = step.text; $('#calibrationPrev').disabled = this.calibrationIndex === 0; $('#calibrationNext').textContent = this.calibrationIndex === CALIBRATION_STEPS.length - 1 ? 'FINISH' : 'NEXT'; this.renderer.clearFeedback(); this.updateSourceMeta(); this.showOSD('CALIBRATION', step.title.toUpperCase(), TEST_PATTERNS[step.pattern].name.toUpperCase(), 1400);
  }
  moveCalibration(direction) { if (this.calibrationIndex < 0) return; if (direction > 0 && this.calibrationIndex === CALIBRATION_STEPS.length - 1) { this.exitCalibration(); return; } this.calibrationIndex = clamp(this.calibrationIndex + direction, 0, CALIBRATION_STEPS.length - 1); this.applyCalibrationStep(); }
  exitCalibration(notify = true) {
    if (this.calibrationIndex < 0) return; const restore = this.calibrationRestore; this.calibrationIndex = -1; this.calibrationRestore = null; $('#calibrationCard').classList.remove('show');
    if (restore) { this.state.sourceMode = restore.sourceMode; this.state.testPattern = restore.testPattern; this.sourceType = restore.sourceType; this.activateTab(restore.activeTab); }
    this.updateControl('testPattern'); if (this.state.sourceMode === 2) this.updateSourceMeta(); else this.updateSourceResolution(); this.updateSourceStatus(); this.renderer.clearFeedback(); if (notify) this.showOSD('CALIBRATION', 'COMPLETE', 'SETTINGS SAVED LOCALLY'); this.commitHistory('Guided calibration'); this.saveState();
  }
  triggerFaultBurst() {
    const fault = FAULT_BURSTS[Math.floor(Math.random() * FAULT_BURSTS.length)], token = ++this.faultToken, restore = Object.fromEntries(Object.keys(fault.patch).map(key => [key, this.state[key]]));
    Object.assign(this.state, fault.patch); this.syncAllControls(); this.audio.chirp('fault'); this.showOSD('FAULT INJECTOR', fault.name.toUpperCase(), `${(fault.duration / 1000).toFixed(1)} SECOND TRANSIENT`);
    setTimeout(() => { if (token !== this.faultToken || this.destroyed) return; Object.assign(this.state, restore); this.syncAllControls(); this.renderer.clearFeedback(); this.updateVisualState(); this.showOSD('FAULT INJECTOR', 'RECOVERED', 'NOMINAL SIGNAL RESTORED'); }, fault.duration);
  }
  enableSafeQuality() { Object.assign(this.state, { renderScale: 0.65, maxDPR: 1, adaptiveQuality: true, targetFPS: 55, reducedMotion: true }); this.syncAllControls(); this.renderer.adaptiveScale = 1; this.renderer.resize(true); this.updateVisualState(); this.commitHistory('Safe quality mode'); this.saveState(); this.showOSD('PERFORMANCE', 'SAFE QUALITY', 'LOWER GPU LOAD · ADAPTIVE 55 FPS'); }
  exportSettings() { const payload = { format: 'xero-crt-lab', version: 3, created: new Date().toISOString(), state: cleanForStorage(this.state), customPresets: this.customPresets }; downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `crt-lab-profile-${timestamp()}.json`); this.showOSD('SETTINGS', 'EXPORTED', 'STATE AND CUSTOM PROFILES'); }
  async importSettings(file) {
    if (!file) return;
    try { const data = safeJSONParse(await file.text()); if (!data || typeof data !== 'object') throw new Error('Invalid JSON document.'); const incoming = data.state || data, sanitized = sanitizeState(incoming); Object.assign(this.state, sanitized, { power: true, bypass: false, freeze: false, sourceMode: this.state.sourceMode, testPattern: this.state.testPattern }); if (Array.isArray(data.customPresets)) { this.customPresets = normalizeCustomPresets(data.customPresets); this.saveCustomPresets(); this.buildPresets(); } this.syncAllControls(); this.renderer.clearFeedback(); this.updateVisualState(); this.commitHistory('Imported settings'); this.saveState(); this.showOSD('SETTINGS', 'IMPORTED', `CRT LAB FORMAT V${data.version || '?'}`); }
    catch (error) { this.showOSD('ERROR', 'IMPORT FAILED', error.message.toUpperCase(), 2800); }
  }
  clearLocalData() { if (!confirm('Delete saved CRT settings and all custom profiles from this browser?')) return; localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(LEGACY_STORAGE_KEY); localStorage.removeItem(CUSTOM_PRESETS_KEY); this.customPresets = []; this.buildPresets(); this.showOSD('LOCAL DATA', 'CLEARED', 'RELOAD TO RESTORE FACTORY STATE'); }
  async collectDiagnostics() {
    const gpu = this.renderer.getDiagnostics();
    const lines = [
      'CRT LAB PRO 3 · DIAGNOSTICS', `Generated: ${new Date().toISOString()}`, `Secure context: ${window.isSecureContext ? 'yes' : 'no'}`, `User agent: ${navigator.userAgent}`, `Logical CPUs: ${navigator.hardwareConcurrency || 'unknown'}`, `Device memory: ${navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'not exposed'}`, `WebGL: ${gpu.webgl}`, `GLSL: ${gpu.shadingLanguage}`, `GPU: ${gpu.renderer}`, `Vendor: ${gpu.vendor}`, `Max texture: ${gpu.maxTextureSize}`, `Draw buffers: ${gpu.maxDrawBuffers}`, `Color attachments: ${gpu.maxColorAttachments}`, `Render: ${gpu.renderResolution}`, `Source: ${gpu.sourceResolution}`, `Adaptive scale: ${gpu.adaptiveScale}`, `Frame time: ${gpu.frameTime}`, `Canvas recording: ${this.recorder.supported ? `yes (${this.recorder.mimeType || 'browser default'})` : 'no'}`, `Camera input: ${navigator.mediaDevices?.getUserMedia ? 'yes' : 'no'}`, `Screen input: ${navigator.mediaDevices?.getDisplayMedia ? 'yes' : 'no'}`, `Image clipboard: ${window.ClipboardItem && navigator.clipboard?.write ? 'yes' : 'no'}`, `Service worker: ${'serviceWorker' in navigator ? 'supported' : 'no'}`, `Shareable calibration URLs: ${window.TextEncoder && window.TextDecoder ? 'yes' : 'no'}`, `Last renderer error: ${gpu.lastError}`
    ];
    try { const estimate = await navigator.storage?.estimate?.(); if (estimate) lines.push(`Storage: ${((estimate.usage || 0) / 1_000_000).toFixed(1)} / ${((estimate.quota || 0) / 1_000_000).toFixed(0)} MB`); } catch {}
    this.diagnostics = lines.join('\n'); $('#diagnosticsText').textContent = this.diagnostics; const shortGPU = String(gpu.renderer || 'GPU CRT PIPELINE').replace(/ANGLE \(|\)/g, '').slice(0, 28); $('#gpuLabel').textContent = shortGPU.toUpperCase();
  }
  async copyDiagnostics() { await this.collectDiagnostics(); try { await navigator.clipboard.writeText(this.diagnostics); this.showOSD('DIAGNOSTICS', 'COPIED', 'SYSTEM REPORT ON CLIPBOARD'); } catch { downloadBlob(new Blob([this.diagnostics], { type: 'text/plain' }), `crt-lab-diagnostics-${timestamp()}.txt`); this.showOSD('DIAGNOSTICS', 'DOWNLOADED', 'CLIPBOARD UNAVAILABLE'); } }
  handlePaste(event) { if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return; const items = [...(event.clipboardData?.items || [])], imageItem = items.find(item => item.type.startsWith('image/')); if (imageItem) { event.preventDefault(); this.loadFile(imageItem.getAsFile()); } }
  hotkey(event, down) {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName) || $('dialog[open]')) return;
    if (event.code === 'KeyB') { this.setBypass(down); event.preventDefault(); return; }
    if (!down || event.repeat) return;
    const command = event.ctrlKey || event.metaKey;
    if (command && event.code === 'KeyZ') { event.shiftKey ? this.redo() : this.undo(); event.preventDefault(); return; }
    if (command && event.code === 'KeyY') { this.redo(); event.preventDefault(); return; }
    const actions = { Space: () => this.togglePlayback(), KeyP: () => this.togglePower(), KeyD: () => this.degauss(), KeyS: () => this.screenshot(), KeyR: () => this.toggleRecording(), KeyF: () => this.toggleFreeze(), KeyC: () => this.toggleCompare(), ArrowLeft: () => this.stepFrame(-1), ArrowRight: () => this.stepFrame(1) };
    const action = actions[event.code]; if (action) { action(); event.preventDefault(); }
  }
  async registerPWA() { if (!('serviceWorker' in navigator)) return; try { const registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' }); registration.update().catch(() => {}); } catch (error) { console.warn('CRT Lab service worker registration failed:', error); } }
  async installPWA() { if (!this.installPrompt) return; await this.installPrompt.prompt(); await this.installPrompt.userChoice.catch(() => {}); this.installPrompt = null; $('#installBtn').classList.add('hidden'); }
  updateStats(now) {
    if (now - this.lastStatsUpdate < 600) return; this.lastStatsUpdate = now; const stats = this.renderer.getStats(); $('#fpsLabel').textContent = `${stats.fps} FPS`; $('#renderLabel').textContent = `${stats.width} × ${stats.height}`; if (this.recorder.recording) $('#recordTime').textContent = formatTime(this.recorder.elapsedSeconds, false);
    if (now - this.lastDiagnosticsUpdate > 8000 && $('.control-page[data-page="tools"]')?.classList.contains('active')) { this.lastDiagnosticsUpdate = now; this.collectDiagnostics(); }
  }
  loop(now) { if (this.destroyed) return; this.renderer.render(now); this.analyzer.update(now); this.updateTransport(); this.updateStats(now); requestAnimationFrame(next => this.loop(next)); }
  destroy() { if (this.destroyed) return; this.destroyed = true; clearTimeout(this.osdTimer); clearTimeout(this.saveTimer); this.stopStream(false); this.clearObjectURL(); if (this.recorder?.recording) this.recorder.stop().catch(() => {}); this.renderer?.destroy(); }
}

window.addEventListener('DOMContentLoaded', () => new CRTLabApp());
