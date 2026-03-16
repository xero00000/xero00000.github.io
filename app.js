'use strict';
// ============================================================
// PVM Simulator — app.js
// ============================================================

// ---- Overlay mode state ----
let overlayMode   = false;
let overlayHudTimer = null;
const SIGNAL_NAMES = ['RGB', 'S-VIDEO', 'COMPOSITE', 'RF'];

// ---- WebGL globals ----
let gl, progPhos, progDisp, quad;
let texA, texB, fboA, fboB;
let vidTex, burnInTex;
let useA = true, beam = 0.0, frameCount = 0;
let loopTime = 0.0;

// Cached uniform locations (populated in initGL)
let pL = {}, dL = {};

// Image source
const imgCanvas = document.createElement('canvas');
const imgCtx    = imgCanvas.getContext('2d');
let   gifImage  = null;
let   gifAnimId = null;

// Audio
let audioReady = false;
let powerWhine, staticNoise, speakerEQ, videoSource;
let degaussSynth, clickSynth, thunkSynth, zipperSynth;

// Refresh rate detection
let detectedHz = 60;

// ---- DOM references ----
const bodyEl            = document.body;
const tvSetElement      = document.getElementById('tv-set');
const canvas            = document.getElementById('glcanvas');
const video             = document.getElementById('source-video');
const status            = document.getElementById('status-text');
const hzBadge           = document.getElementById('hz-badge');
const hzDetectedEl      = document.getElementById('hz-detected');
const playBtn           = document.getElementById('play-pause-btn');
const timeline          = document.getElementById('timeline-range');
const curTimeTxt        = document.getElementById('current-time');
const durTimeTxt        = document.getElementById('duration-time');
const screenShareBtn    = document.getElementById('screen-share-btn');
const crtOnToggle       = document.getElementById('crt-on-toggle');
const physicsPanel      = document.getElementById('physics-controls-panel');
const displayControls   = document.getElementById('display-controls');
const crop43Toggle      = document.getElementById('crop-43-toggle');
const fullscreenBtn     = document.getElementById('fullscreen-btn');
const fsEnterIcon       = document.getElementById('fs-enter-icon');
const fsExitIcon        = document.getElementById('fs-exit-icon');
const crtFullscreenBtn  = document.getElementById('crt-fullscreen-btn');
const crtFsEnterIcon    = document.getElementById('crt-fs-enter-icon');
const crtFsExitIcon     = document.getElementById('crt-fs-exit-icon');
const screenContainer   = document.getElementById('screen-container');
const glareOverlay      = document.getElementById('glare-overlay');
const powerBtn          = document.getElementById('power-btn');
const menuBtn           = document.getElementById('menu-btn');
const webcamBtn         = document.getElementById('webcam-btn');
const testPatternBtn    = document.getElementById('test-pattern-btn');
const trackingBtn       = document.getElementById('tracking-btn');
const degaussBtn        = document.getElementById('degauss-btn');
const presetSelect      = document.getElementById('preset-select');
const presetNameInput   = document.getElementById('preset-name');
const savePresetBtn     = document.getElementById('save-preset-btn');
const exportPresetBtn   = document.getElementById('export-preset-btn');
const importPresetFile  = document.getElementById('import-preset-file');
const fileUploader      = document.getElementById('video-uploader');
const imageUploader     = document.getElementById('image-uploader');
const urlInput          = document.getElementById('url-input');
const loadUrlBtn        = document.getElementById('load-url-btn');
const channelBtns       = document.querySelectorAll('.channel-btn');
const burnInUploader    = document.getElementById('burn-in-uploader');
const osdContainer      = document.getElementById('osd-container');
const osdTitle          = document.getElementById('osd-title');
const osdItems          = document.getElementById('osd-items');
const toastEl           = document.getElementById('toast');
const testPatternTypeSel = document.getElementById('test-pattern-type');
const bfiDutyRange      = document.getElementById('bfi-duty-range');

function allInputs() {
    return document.querySelectorAll(
        '#control-panel input, #control-panel button:not(#power-btn), #control-panel select, ' +
        '#control-panel label.btn, #control-panel label.btn-icon, ' +
        '#transport-bar input, #transport-bar button:not(#fullscreen-btn):not(#crt-fullscreen-btn)');
}

// ---- Params ----
const params = {
    powerOn: false, powerOnTime: 0.0,
    warmupT: 0.0,   warmupStartTime: 0.0,
    sourceMode: 1,   // 0=video/image, 1=snow, 2=testPattern
    decay: 0.94, glow: 1.3, bloom: 0.4, curve: 0.2,
    slowMo: false, crtOn: true,
    refreshMode: 'off',   // 'off'|'120bfi'|'180bfi'|'auto'
    bfiDuty: 0.5,
    crop43: false,

    // OSD
    osdActive: false, osdMenuIndex: 0, osdItemIndex: 0,
    brightness: 1.0, contrast: 1.0, saturation: 1.1, tint: 0.0, sharpness: 0.0,

    // Signal
    signalType: 0, signal: 1.0, ghost: 0.0, compression: 0.0, jitter: 0.0,

    // Physics
    interlace: false, convergence: 0.0, mask: 1,
    degaussActive: false, degaussTime: 0.0, degaussStartTime: 0.0,

    // Faults
    tracking: 0.0, trackingTimeout: null,
    vHold: 0.5, weakRed: false, weakGreen: false, weakBlue: false,
    burnInAmount: 0.0, vcrMode: false,

    // Test pattern type
    testPatternType: 0,
};

// ============================================================
// Toast
// ============================================================
let toastTimer = null;
function toast(msg, duration = 2200) {
    toastEl.textContent = msg;
    toastEl.classList.add('active');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('active'), duration);
}

// ============================================================
// Hz Detection
// ============================================================
function detectRefreshRate() {
    return new Promise(resolve => {
        let count = 0, t0 = 0;
        function tick(t) {
            if (count === 0) t0 = t;
            if (++count < 22) return requestAnimationFrame(tick);
            resolve(Math.round(1000 * 20 / (t - t0)));
        }
        requestAnimationFrame(tick);
    });
}

detectRefreshRate().then(hz => {
    detectedHz = hz;
    hzBadge.textContent = `${hz}Hz`;
    const label = ` detected: ${hz}Hz`;
    hzDetectedEl.textContent = label;
});

// ============================================================
// BFI helpers
// ============================================================
function getBFIDivisor() {
    switch (params.refreshMode) {
        case '120bfi': return 2;
        case '180bfi': return 3;
        case 'auto':   return Math.max(1, Math.round(detectedHz / 60));
        default:       return 1;
    }
}

// ============================================================
// Audio
// ============================================================
async function initAudio() {
    if (audioReady) return;
    try {
        await Tone.start();
        speakerEQ = new Tone.EQ3({ low: -8, mid: -2, high: -12, lowFrequency: 500, highFrequency: 2500 }).toDestination();
        videoSource = Tone.getContext().createMediaElementSource(video);
        Tone.connect(videoSource, speakerEQ);
        powerWhine  = new Tone.Oscillator({ type: 'sine', frequency: 15734, volume: -40 }).toDestination();
        staticNoise = new Tone.Noise({ type: 'white', volume: -35, fadeIn: 0.01, fadeOut: 0.01 }).toDestination();
        clickSynth  = new Tone.MembraneSynth({ pitchDecay: 0.008, octaves: 2, envelope: { attack: 0.001, decay: 0.05, sustain: 0 } }).toDestination();
        thunkSynth  = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.1, sustain: 0 } }).toDestination();
        zipperSynth = new Tone.NoiseSynth({ noise: { type: 'white' }, volume: -20, envelope: { attack: 0.01, decay: 0.02, sustain: 0.01 } }).toDestination();
        degaussSynth = new Tone.PolySynth({
            voice: Tone.Synth,
            options: { oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.5, sustain: 0.1, release: 0.2 }, volume: -10 }
        }).toDestination();
        degaussSynth.set({ detune: 1200 });
        audioReady = true;
    } catch(err) {
        console.error('Audio init failed:', err);
        status.textContent = 'ERR: AUDIO FAILED';
    }
}

function playClick()  { if (audioReady && params.powerOn) clickSynth.triggerAttackRelease('G4',  '0.05s', Tone.now()); }
function playThunk()  { if (audioReady && params.powerOn) thunkSynth.triggerAttackRelease('0.1s', Tone.now()); }
function playZipper() { if (audioReady && params.powerOn) zipperSynth.triggerAttackRelease('0.02s', Tone.now()); }

// ============================================================
// OSD
// ============================================================
const OSD_MENUS = [
    {
        title: 'Video',
        items: [
            { name: 'Brightness', param: 'brightness', min: 0.5, max: 1.5, step: 0.01 },
            { name: 'Contrast',   param: 'contrast',   min: 0.5, max: 1.5, step: 0.01 },
            { name: 'Saturation', param: 'saturation', min: 0.0, max: 2.0, step: 0.01 },
            { name: 'Tint',       param: 'tint',       min: -0.5, max: 0.5, step: 0.01, faderId: 'hhold-range' },
            { name: 'Sharpness',  param: 'sharpness',  min: 0.0, max: 2.0, step: 0.1  },
        ]
    },
    {
        title: 'System',
        items: [
            { name: 'Reset Settings', action: 'reset'       },
            { name: 'Save Preset',    action: 'savePreset'  },
        ]
    }
];

function renderOSD() {
    if (!params.osdActive) { osdContainer.classList.remove('active'); return; }
    osdContainer.classList.add('active');
    const menu = OSD_MENUS[params.osdMenuIndex];
    osdTitle.textContent = menu.title;
    let html = '';
    menu.items.forEach((item, i) => {
        const sel = i === params.osdItemIndex ? 'selected' : '';
        html += `<div class="osd-menu-item ${sel}"><span>${item.name}</span>`;
        if (item.param) {
            const pct = ((params[item.param] - item.min) / (item.max - item.min)) * 100;
            html += `<div class="osd-value-bar"><div class="osd-value-fill" style="width:${pct}%"></div></div>`;
        }
        html += '</div>';
    });
    osdItems.innerHTML = html;
}

function handleOSDInput(type) {
    if (!params.osdActive) return;
    const menu = OSD_MENUS[params.osdMenuIndex];
    const item = menu.items[params.osdItemIndex];
    const now  = Tone.now();
    switch (type) {
        case 'up':       playClick(); params.osdItemIndex = (params.osdItemIndex - 1 + menu.items.length) % menu.items.length; break;
        case 'down':     playClick(); params.osdItemIndex = (params.osdItemIndex + 1) % menu.items.length; break;
        case 'nextMenu': playThunk(); params.osdMenuIndex  = (params.osdMenuIndex  + 1) % OSD_MENUS.length; params.osdItemIndex = 0; break;
        case 'select':
            playThunk();
            if (item.action === 'reset')      { applyPreset(defaultSettings()); toast('SETTINGS RESET'); params.osdActive = false; }
            if (item.action === 'savePreset')  { savePresetBtn.click(); params.osdActive = false; }
            break;
        case 'changeValue':
            if (item.param) {
                playZipper();
                const range  = item.max - item.min;
                let   newVal = item.min + (timeline.valueAsNumber / parseFloat(timeline.max)) * range;
                newVal = Math.round(newVal / item.step) * item.step;
                newVal = Math.max(item.min, Math.min(item.max, newVal));
                params[item.param] = newVal;
                if (item.faderId) { const f = document.getElementById(item.faderId); if(f) f.value = newVal; }
            }
            break;
        case 'left':
            if (item.param) {
                playZipper();
                params[item.param] = Math.max(item.min, parseFloat((params[item.param] - item.step).toFixed(6)));
                if (item.faderId) { const f = document.getElementById(item.faderId); if(f) f.value = params[item.param]; }
            }
            break;
        case 'right':
            if (item.param) {
                playZipper();
                params[item.param] = Math.min(item.max, parseFloat((params[item.param] + item.step).toFixed(6)));
                if (item.faderId) { const f = document.getElementById(item.faderId); if(f) f.value = params[item.param]; }
            }
            break;
    }
    renderOSD();
}

// ============================================================
// Power
// ============================================================
function setPowerState(isOn) {
    if (!audioReady) { status.textContent = 'CLICK POWER TO START'; return; }
    params.powerOn     = isOn;
    params.powerOnTime = loopTime;
    const now = Tone.now();

    if (isOn) {
        powerBtn.style.background = 'rgba(21,128,61,0.8)';
        powerBtn.style.borderColor = 'rgba(22,163,74,0.5)';
        status.textContent = 'AWAITING SIGNAL...';
        params.sourceMode  = 1;
        params.warmupStartTime = loopTime;
        params.warmupT = 0.0;
        powerWhine.start(now);
        if (staticNoise.state !== 'started') staticNoise.start(now);
        allInputs().forEach(el => { el.disabled = false; });
        crop43Toggle.disabled  = true;
        playBtn.disabled       = true;
        menuBtn.disabled       = false;
        exportPresetBtn.disabled = false;
    } else {
        powerBtn.style.background  = 'rgba(153,27,27,0.8)';
        powerBtn.style.borderColor = 'rgba(220,38,38,0.5)';
        status.textContent = 'POWER OFF';
        powerWhine.stop(now + 0.3);
        if (staticNoise.state !== 'started') staticNoise.start(now);
        staticNoise.stop(now + 0.06);
        stopAllSources();
        allInputs().forEach(el => { el.disabled = true; });
        menuBtn.disabled = true;
        exportPresetBtn.disabled = true;
        params.osdActive = false;
        renderOSD();
    }
}

powerBtn.onclick = () => {
    if (!audioReady) {
        initAudio().then(() => { if (audioReady) setPowerState(true); });
    } else {
        setPowerState(!params.powerOn);
    }
};

menuBtn.onclick = () => {
    params.osdActive = !params.osdActive;
    if (params.osdActive) { params.osdMenuIndex = 0; params.osdItemIndex = 0; }
    playThunk();
    renderOSD();
};

// ============================================================
// WebGL Init
// ============================================================
function initGL() {
    gl = canvas.getContext('webgl2');
    if (!gl) { status.textContent = 'ERROR: WebGL 2.0 Required.'; return; }
    gl.getExtension('EXT_color_buffer_float');
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    function mkShader(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
        return s;
    }
    function mkProg(vSrc, fSrc) {
        const p = gl.createProgram();
        gl.attachShader(p, mkShader(gl.VERTEX_SHADER, vSrc));
        gl.attachShader(p, mkShader(gl.FRAGMENT_SHADER, fSrc));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(p));
        return p;
    }

    const vSrc   = document.getElementById('vert-shader').text.trim();
    progPhos = mkProg(vSrc, document.getElementById('frag-phosphor').text.trim());
    progDisp = mkProg(vSrc, document.getElementById('frag-display').text.trim());

    // ---- Cache uniform locations ----
    const phosNames = [
        'u_video','u_persistence','u_time','u_decay','u_beam_glow','u_beam_progress',
        'u_slow_mo','u_crop_43','u_video_res','u_signal_strength','u_ghosting',
        'u_tracking_error','u_source_mode','u_signal_type','u_compression','u_vcr_mode',
        'u_jitter','u_test_pattern_type'
    ];
    const dispNames = [
        'u_texture','u_burn_in_tex','u_resolution','u_time','u_curvature','u_frame',
        'u_bloom','u_brightness','u_contrast','u_saturation','u_tint','u_sharpness',
        'u_res_240p','u_interlace','u_convergence','u_phosphor_mask',
        'u_power_on','u_power_on_time','u_degauss_active','u_degauss_time',
        'u_v_hold','u_weak_red','u_weak_green','u_weak_blue','u_burn_in_amount',
        'u_warmup_t'
    ];
    phosNames.forEach(n => pL[n] = gl.getUniformLocation(progPhos, n));
    dispNames.forEach(n => dL[n] = gl.getUniformLocation(progDisp, n));

    // Quad
    quad = gl.createVertexArray();
    gl.bindVertexArray(quad);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Video texture
    vidTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, vidTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,255]));

    // Burn-in texture
    burnInTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, burnInTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,0]));

    window.addEventListener('resize', resize);
    resize();
    loadPresetList();
    loop(0);
}

function initFBOs() {
    const w = canvas.width, h = canvas.height;
    function mkFBO() {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const f = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        return { t, f };
    }
    if (texA) { gl.deleteTexture(texA); gl.deleteFramebuffer(fboA); }
    if (texB) { gl.deleteTexture(texB); gl.deleteFramebuffer(fboB); }
    ({ t: texA, f: fboA } = mkFBO());
    ({ t: texB, f: fboB } = mkFBO());
}

function resize() {
    if (!gl) return;
    const dpr = window.devicePixelRatio || 1;
    const dw  = Math.round(canvas.clientWidth  * dpr);
    const dh  = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== dw || canvas.height !== dh) {
        canvas.width = dw; canvas.height = dh;
        initFBOs();
        gl.viewport(0, 0, dw, dh);
    }
}

// ============================================================
// Render Loop
// ============================================================
function loop(now) {
    requestAnimationFrame(loop);
    loopTime = now * 0.001;

    if (!audioReady) return;
    if (!params.powerOn && (loopTime - params.powerOnTime > 0.9)) return;
    if (!params.crtOn || !gl) return;

    // Warmup
    if (params.powerOn) {
        params.warmupT = Math.min(1.0, (loopTime - params.warmupStartTime) / 30.0);
    }

    // BFI gating — always run Pass 1 (phosphor decay), gate Pass 2
    const divisor  = getBFIDivisor();
    const litCount = divisor <= 1 ? 1 : Math.max(1, Math.round(params.bfiDuty * divisor));
    const slot     = frameCount % Math.max(1, divisor);
    const isLit    = divisor <= 1 || slot < litCount;

    frameCount++;

    // Video / Image texture upload
    if (params.sourceMode === 0 && video.readyState >= 2) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, vidTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    } else if (params.sourceMode === 3) {
        // Image / GIF mode
        if (gifImage) imgCtx.drawImage(gifImage, 0, 0, imgCanvas.width, imgCanvas.height);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, vidTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgCanvas);
    }

    const vidW = (params.sourceMode === 3) ? imgCanvas.width  : (video.videoWidth  || 1);
    const vidH = (params.sourceMode === 3) ? imgCanvas.height : (video.videoHeight || 1);

    beam = (beam + (params.slowMo ? 0.008 : 1.0)) % 1.0;
    if (params.degaussActive) params.degaussTime = loopTime - params.degaussStartTime;

    // ---- Pass 1: Phosphor ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, useA ? fboB : fboA);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(progPhos);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, useA ? texA : texB);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, vidTex);
    gl.uniform1i(pL.u_persistence, 0);
    gl.uniform1i(pL.u_video,       1);
    gl.uniform1f(pL.u_time,            loopTime);
    gl.uniform1f(pL.u_decay,           params.decay);
    gl.uniform1f(pL.u_beam_glow,       params.glow);
    gl.uniform1f(pL.u_beam_progress,   beam);
    gl.uniform1i(pL.u_slow_mo,         params.slowMo  ? 1 : 0);
    gl.uniform1i(pL.u_crop_43,         params.crop43  ? 1 : 0);
    gl.uniform2f(pL.u_video_res,       vidW, vidH);
    gl.uniform1f(pL.u_signal_strength, params.signal);
    gl.uniform1f(pL.u_ghosting,        params.ghost);
    gl.uniform1f(pL.u_tracking_error,  params.tracking);
    gl.uniform1i(pL.u_source_mode,     params.sourceMode === 3 ? 0 : params.sourceMode);
    gl.uniform1i(pL.u_signal_type,     params.signalType);
    gl.uniform1f(pL.u_compression,     params.compression);
    gl.uniform1i(pL.u_vcr_mode,        params.vcrMode ? 1 : 0);
    gl.uniform1f(pL.u_jitter,          params.jitter);
    gl.uniform1i(pL.u_test_pattern_type, params.testPatternType);
    gl.bindVertexArray(quad);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ---- Pass 2: Display (only on lit frames) ----
    if (isLit) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(progDisp);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, useA ? texB : texA);
        // FIX: explicitly rebind burn-in texture every frame
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, burnInTex);
        gl.uniform1i(dL.u_texture,    0);
        gl.uniform1i(dL.u_burn_in_tex, 2);
        gl.uniform2f(dL.u_resolution,  canvas.width, canvas.height);
        gl.uniform1f(dL.u_time,        loopTime);
        gl.uniform1f(dL.u_curvature,   params.curve);
        gl.uniform1i(dL.u_frame,       frameCount);
        gl.uniform1f(dL.u_bloom,       params.bloom);
        gl.uniform1f(dL.u_brightness,  params.brightness);
        gl.uniform1f(dL.u_contrast,    params.contrast);
        gl.uniform1f(dL.u_saturation,  params.saturation);
        gl.uniform1f(dL.u_tint,        params.tint);
        gl.uniform1f(dL.u_sharpness,   params.sharpness);
        gl.uniform1i(dL.u_res_240p,    params.res240p  ? 1 : 0);
        gl.uniform1i(dL.u_interlace,   params.interlace ? 1 : 0);
        gl.uniform1f(dL.u_convergence, params.convergence);
        gl.uniform1i(dL.u_phosphor_mask, params.mask);
        gl.uniform1i(dL.u_power_on,    params.powerOn  ? 1 : 0);
        // FIX: pass raw powerOnTime — shader computes elapsed as u_time - u_power_on_time
        gl.uniform1f(dL.u_power_on_time, params.powerOnTime);
        gl.uniform1i(dL.u_degauss_active, params.degaussActive ? 1 : 0);
        gl.uniform1f(dL.u_degauss_time,   params.degaussTime);
        gl.uniform1f(dL.u_v_hold,      params.vHold);
        gl.uniform1i(dL.u_weak_red,    params.weakRed   ? 1 : 0);
        gl.uniform1i(dL.u_weak_green,  params.weakGreen ? 1 : 0);
        gl.uniform1i(dL.u_weak_blue,   params.weakBlue  ? 1 : 0);
        gl.uniform1f(dL.u_burn_in_amount, params.burnInAmount);
        gl.uniform1f(dL.u_warmup_t,    params.warmupT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else {
        // Black frame
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    useA = !useA;
}

// ============================================================
// Utility
// ============================================================
function formatTime(s) {
    if (isNaN(s)) return '00:00';
    const m = Math.floor(s / 60); s = Math.floor(s % 60);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function stopAllSources() {
    video.pause();
    if (video.src || video.srcObject) {
        video.removeAttribute('src');
        if (video.srcObject) { video.srcObject.getTracks().forEach(t => t.stop()); video.srcObject = null; }
    }
    gifImage = null;
    params.sourceMode = 1;
    webcamBtn.classList.remove('active');
    testPatternBtn.classList.remove('active');
    testPatternTypeSel.classList.remove('visible');

    if (params.powerOn) {
        playBtn.disabled = true; timeline.disabled = true;
        status.textContent = 'AWAITING SIGNAL...';
        if (audioReady && staticNoise.state !== 'started') staticNoise.start(Tone.now());
    }
    crop43Toggle.disabled = true; crop43Toggle.checked = false; params.crop43 = false;
    curTimeTxt.textContent = '00:00'; durTimeTxt.textContent = '00:00'; timeline.value = 0;
}

function onVideoReady() {
    stopAllSources();
    params.sourceMode = 0;
    status.textContent = 'SIGNAL LOCKED';
    playBtn.disabled = false; timeline.disabled = false;
    durTimeTxt.textContent = formatTime(video.duration || 0);
    timeline.max = video.duration || 100;
    if (audioReady && staticNoise.state === 'started') staticNoise.stop(Tone.now() + 0.01);
    video.play().catch(() => status.textContent = 'PRESS PLAY');
}

function loadUrl(url) {
    if (!url) return;
    if (url.includes('youtube.com') || url.includes('youtu.be')) { status.textContent = 'ERR: YOUTUBE NOT SUPPORTED'; return; }
    stopAllSources();
    video.crossOrigin = 'anonymous';
    video.src = url;
    video.oncanplay = onVideoReady;
    status.textContent = 'TUNING...';
}

function loadImageSource(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        imgCanvas.width  = img.naturalWidth  || 640;
        imgCanvas.height = img.naturalHeight || 480;
        imgCtx.drawImage(img, 0, 0);
        gifImage = (file.type === 'image/gif') ? img : null;
        stopAllSources();
        params.sourceMode = 3;
        status.textContent = 'SIGNAL LOCKED // IMAGE';
        if (audioReady && staticNoise.state === 'started') staticNoise.stop(Tone.now() + 0.01);
    };
    img.src = url;
}

// ============================================================
// Video listeners
// ============================================================
video.addEventListener('loadedmetadata', () => {
    if (video.duration !== Infinity) {
        durTimeTxt.textContent = formatTime(video.duration || 0);
        timeline.max = video.duration || 100; timeline.disabled = false;
    }
});
video.addEventListener('timeupdate', () => {
    if (params.osdActive) return;
    if (!timeline.matches(':active') && video.duration !== Infinity) {
        timeline.value = video.currentTime;
        curTimeTxt.textContent = formatTime(video.currentTime);
    }
});
video.addEventListener('play',  () => { document.getElementById('play-icon').classList.add('hidden');    document.getElementById('pause-icon').classList.remove('hidden'); });
video.addEventListener('pause', () => { document.getElementById('play-icon').classList.remove('hidden'); document.getElementById('pause-icon').classList.add('hidden');    });
video.addEventListener('error', e => {
    if (status.textContent.startsWith('ERR:')) return;
    const err = video.error;
    status.textContent = `ERR: CODE ${err ? err.code : '?'} (CORS?)`;
    stopAllSources();
});
video.addEventListener('ended', stopAllSources);

playBtn.onclick = () => {
    if (params.osdActive) { handleOSDInput('select'); return; }
    video.paused ? video.play() : video.pause();
};
timeline.oninput = e => {
    if (params.osdActive) { handleOSDInput('changeValue'); return; }
    video.currentTime = e.target.value;
};
document.getElementById('volume-range').oninput = e => video.volume = +e.target.value;

// ============================================================
// Fullscreen
// ============================================================
fullscreenBtn.onclick    = () => document.fullscreenElement === tvSetElement ? document.exitFullscreen() : tvSetElement.requestFullscreen();
crtFullscreenBtn.onclick = () => document.fullscreenElement === screenContainer ? document.exitFullscreen() : screenContainer.requestFullscreen();

function updateTheatreIcons() {
    const inTv  = document.fullscreenElement === tvSetElement;
    const inCrt = document.fullscreenElement === screenContainer;
    fsEnterIcon.classList.toggle('hidden', inTv);   fsExitIcon.classList.toggle('hidden', !inTv);
    crtFsEnterIcon.classList.toggle('hidden', inCrt); crtFsExitIcon.classList.toggle('hidden', !inCrt);
}
document.addEventListener('fullscreenchange', updateTheatreIcons);

// ============================================================
// Input source listeners
// ============================================================
fileUploader.onchange  = e => { if (e.target.files[0]) { stopAllSources(); video.src = URL.createObjectURL(e.target.files[0]); video.oncanplay = onVideoReady; status.textContent = 'LOADING FILE...'; } };
imageUploader.onchange = e => { if (e.target.files[0]) loadImageSource(e.target.files[0]); };
loadUrlBtn.onclick = () => loadUrl(urlInput.value.trim());

async function startScreenShare() {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: true });
        stopAllSources(); params.sourceMode = 0; video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play(); status.textContent = 'SIGNAL LOCKED // SCREEN SHARE';
            playBtn.disabled = false; timeline.disabled = true;
            curTimeTxt.textContent = '--:--'; durTimeTxt.textContent = 'LIVE';
            crop43Toggle.disabled = false;
            if (audioReady) staticNoise.stop(Tone.now() + 0.01);
        };
        stream.getVideoTracks()[0].onended = stopAllSources;
    } catch(e) { status.textContent = 'ERR: SCREEN SHARE FAILED'; stopAllSources(); }
}
async function startWebcam() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stopAllSources(); params.sourceMode = 0; video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play(); status.textContent = 'SIGNAL LOCKED // WEBCAM';
            playBtn.disabled = false; timeline.disabled = true;
            curTimeTxt.textContent = '--:--'; durTimeTxt.textContent = 'LIVE';
            webcamBtn.classList.add('active');
            if (audioReady) staticNoise.stop(Tone.now() + 0.01);
        };
        stream.getVideoTracks()[0].onended = stopAllSources;
    } catch(e) { status.textContent = 'ERR: WEBCAM FAILED'; stopAllSources(); }
}
screenShareBtn.onclick = startScreenShare;
webcamBtn.onclick      = startWebcam;

testPatternBtn.onclick = () => {
    stopAllSources();
    params.sourceMode = 2;
    status.textContent = 'SIGNAL LOCKED // TEST PATTERN';
    testPatternBtn.classList.add('active');
    testPatternTypeSel.classList.add('visible');
    if (audioReady) staticNoise.stop(Tone.now() + 0.01);
};

channelBtns.forEach((btn, index) => {
    btn.onclick = () => {
        if (params.osdActive) {
            if (index === 0) handleOSDInput('up');
            if (index === 1) handleOSDInput('down');
            if (index === 3) handleOSDInput('nextMenu');
            return;
        }
        if (btn.id === 'test-pattern-btn') testPatternBtn.onclick();
        else loadUrl(btn.dataset.url);
    };
});

document.querySelectorAll('input[name="test-pattern"]').forEach(r => {
    r.onchange = e => { params.testPatternType = +e.target.value; };
});

// ============================================================
// Parameter sliders & toggles
// ============================================================
document.getElementById('decay-range').oninput    = e => params.decay       = +e.target.value;
document.getElementById('glow-range').oninput     = e => params.glow        = +e.target.value;
document.getElementById('bloom-range').oninput    = e => params.bloom       = +e.target.value;
document.getElementById('curve-range').oninput    = e => params.curve       = +e.target.value;
document.getElementById('slow-beam-toggle').onchange = e => params.slowMo   = e.target.checked;
document.getElementById('res-240p-toggle').onchange  = e => params.res240p  = e.target.checked;
crop43Toggle.onchange                               = e => params.crop43     = e.target.checked;

document.querySelectorAll('input[name="refresh"]').forEach(r => {
    r.onchange = e => { params.refreshMode = e.target.value; };
});
bfiDutyRange.oninput = e => { params.bfiDuty = +e.target.value; };

document.querySelectorAll('input[name="signal-type"]').forEach(r => {
    r.onchange = e => {
        params.signalType = +e.target.value;
        if (params.signalType === 3)      { params.signal = 0.85; params.ghost = 0.05; }
        else if (params.signalType === 2) { params.signal = 0.95; params.ghost = 0.01; }
        else                              { params.signal = 1.0;  params.ghost = 0.0;  }
        document.getElementById('signal-range').value = params.signal;
        document.getElementById('ghost-range').value  = params.ghost;
    };
});
document.getElementById('signal-range').oninput   = e => params.signal      = +e.target.value;
document.getElementById('ghost-range').oninput    = e => params.ghost       = +e.target.value;
document.getElementById('compress-range').oninput = e => params.compression = +e.target.value;
document.getElementById('jitter-range').oninput   = e => params.jitter      = +e.target.value;

document.getElementById('interlace-toggle').onchange = e => params.interlace = e.target.checked;
document.getElementById('converge-range').oninput    = e => params.convergence = +e.target.value;
document.querySelectorAll('input[name="mask"]').forEach(r => { r.onchange = e => params.mask = +e.target.value; });

trackingBtn.onclick = () => {
    if (params.trackingTimeout) clearTimeout(params.trackingTimeout);
    params.tracking = 1.0;
    params.trackingTimeout = setTimeout(() => { params.tracking = 0.0; }, 500);
};
degaussBtn.onclick = () => {
    if (params.degaussActive) return;
    params.degaussActive = true; params.degaussStartTime = loopTime; params.degaussTime = 0.0;
    const now = Tone.now();
    degaussSynth.triggerAttackRelease('C2', '0.5s', now);
    degaussSynth.triggerAttackRelease('G2', '0.4s', now + 0.05);
    degaussSynth.triggerAttackRelease('C3', '0.3s', now + 0.1);
    degaussSynth.set({ detune: 1200 });
    degaussSynth.detune.rampTo(0, 1.0, now + 0.01);
    setTimeout(() => { params.degaussActive = false; }, 1000);
};

document.getElementById('vhold-range').oninput  = e => params.vHold   = +e.target.value;
document.getElementById('hhold-range').oninput  = e => { params.tint  = +e.target.value; renderOSD(); };
document.getElementById('weak-red-toggle').onchange   = e => params.weakRed   = e.target.checked;
document.getElementById('weak-green-toggle').onchange = e => params.weakGreen = e.target.checked;
document.getElementById('weak-blue-toggle').onchange  = e => params.weakBlue  = e.target.checked;
document.getElementById('vcr-mode-toggle').onchange   = e => params.vcrMode   = e.target.checked;
document.getElementById('burn-in-range').oninput      = e => params.burnInAmount = +e.target.value;

burnInUploader.onchange = e => {
    if (!e.target.files[0]) return;
    const reader = new FileReader();
    reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, burnInTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            toast('BURN-IN IMAGE LOADED');
        };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(e.target.files[0]);
};

document.querySelectorAll('input[name="environment"]').forEach(r => {
    r.onchange = e => {
        bodyEl.classList.remove('env-den', 'env-arcade');
        if (e.target.value === 'den')    bodyEl.classList.add('env-den');
        if (e.target.value === 'arcade') bodyEl.classList.add('env-arcade');
    };
});

crtOnToggle.onchange = e => {
    params.crtOn = e.target.checked;
    canvas.classList.toggle('hidden', !params.crtOn);
    video.classList.toggle('hidden',   params.crtOn);
    physicsPanel.classList.toggle('opacity-50',         !params.crtOn);
    physicsPanel.classList.toggle('pointer-events-none',!params.crtOn);
    displayControls.classList.toggle('opacity-50',         !params.crtOn);
    displayControls.classList.toggle('pointer-events-none',!params.crtOn);
    if (params.crtOn) resize();
};

// Glare
document.getElementById('screen-viewport').onmousemove = e => {
    const r = e.currentTarget.getBoundingClientRect();
    glareOverlay.style.backgroundPosition = `${((e.clientX - r.left)/r.width)*100}% ${((e.clientY - r.top)/r.height)*100}%`;
};

// ============================================================
// Audio feedback on UI interaction
// ============================================================
document.querySelectorAll('.btn, .btn-icon, .channel-btn').forEach(b => {
    b.addEventListener('click', playClick);
});
document.querySelectorAll('input[type=checkbox], input[type=radio]').forEach(t => {
    t.addEventListener('change', playThunk);
});
document.querySelectorAll('input[type=range]').forEach(f => {
    f.addEventListener('input', () => { if (f.matches(':active')) playZipper(); });
});

// ============================================================
// Keyboard shortcuts
// ============================================================
document.addEventListener('keydown', e => {
    // Ignore when typing in inputs
    if (e.target.tagName === 'INPUT' && e.target.type === 'text') return;

    switch (e.key) {
        case 'p': case 'P':
            powerBtn.click(); break;
        case 'm': case 'M':
            if (params.powerOn) menuBtn.click(); break;
        case ' ':
            e.preventDefault();
            if (params.osdActive) handleOSDInput('select');
            else if (!playBtn.disabled) playBtn.click();
            break;
        case 'f': case 'F':
            fullscreenBtn.click(); break;
        case 'c': case 'C':
            crtFullscreenBtn.click(); break;
        case 't': case 'T':
            if (params.powerOn) testPatternBtn.click(); break;
        case 'd': case 'D':
            if (params.powerOn && !degaussBtn.disabled) degaussBtn.click(); break;
        case '1': if (params.powerOn) loadUrl(document.querySelector('.channel-btn[data-url]')?.dataset.url); break;
        case '2': if (params.powerOn) loadUrl(document.querySelectorAll('.channel-btn[data-url]')[1]?.dataset.url); break;
        case '3': if (params.powerOn) loadUrl(document.querySelectorAll('.channel-btn[data-url]')[2]?.dataset.url); break;
        case 'ArrowUp':    e.preventDefault(); handleOSDInput('up');    break;
        case 'ArrowDown':  e.preventDefault(); handleOSDInput('down');  break;
        case 'ArrowLeft':  e.preventDefault(); handleOSDInput('left');  break;
        case 'ArrowRight': e.preventDefault(); handleOSDInput('right'); break;
        case 'Tab':
            if (params.osdActive) { e.preventDefault(); handleOSDInput('nextMenu'); }
            break;
        case 'Escape':
            if (params.osdActive) { params.osdActive = false; renderOSD(); }
            else if (overlayMode) exitOverlayMode();
            break;
        case 'o': case 'O':
            if (params.powerOn) overlayMode ? exitOverlayMode() : enterOverlayMode();
            break;
    }
});

// Mobile OSD swipe
let swipeStartY = 0;
osdContainer.addEventListener('touchstart', e => { swipeStartY = e.touches[0].clientY; }, { passive: true });
osdContainer.addEventListener('touchend',   e => {
    const dy = swipeStartY - e.changedTouches[0].clientY;
    if (Math.abs(dy) > 30) handleOSDInput(dy > 0 ? 'up' : 'down');
});

// ============================================================
// Preset management
// ============================================================
function defaultSettings() {
    return {
        decay: 0.94, glow: 1.3, bloom: 0.4, curve: 0.2,
        slowMo: false, refreshMode: 'off', bfiDuty: 0.5, res240p: false, crtOn: true,
        signal: 1.0, ghost: 0.0, signalType: 0, compression: 0.0, jitter: 0.0,
        interlace: false, convergence: 0.0, mask: 1,
        vHold: 0.5, tint: 0.0,
        weakRed: false, weakGreen: false, weakBlue: false,
        vcrMode: false, burnInAmount: 0.0,
        brightness: 1.0, contrast: 1.0, saturation: 1.1, sharpness: 0.0,
        testPatternType: 0,
    };
}

function getSettings() {
    return {
        decay: params.decay, glow: params.glow, bloom: params.bloom, curve: params.curve,
        slowMo: params.slowMo, refreshMode: params.refreshMode, bfiDuty: params.bfiDuty,
        res240p: params.res240p, crtOn: params.crtOn,
        signal: params.signal, ghost: params.ghost, signalType: params.signalType,
        compression: params.compression, jitter: params.jitter,
        interlace: params.interlace, convergence: params.convergence, mask: params.mask,
        vHold: params.vHold, tint: params.tint,
        weakRed: params.weakRed, weakGreen: params.weakGreen, weakBlue: params.weakBlue,
        vcrMode: params.vcrMode, burnInAmount: params.burnInAmount,
        brightness: params.brightness, contrast: params.contrast,
        saturation: params.saturation, sharpness: params.sharpness,
        testPatternType: params.testPatternType,
    };
}

function applyPreset(s) {
    if (!s) return;
    Object.assign(params, s);
    document.getElementById('decay-range').value   = params.decay;
    document.getElementById('glow-range').value    = params.glow;
    document.getElementById('bloom-range').value   = params.bloom;
    document.getElementById('curve-range').value   = params.curve;
    document.getElementById('slow-beam-toggle').checked = params.slowMo;
    const rr = document.querySelector(`input[name="refresh"][value="${params.refreshMode}"]`);
    if (rr) rr.checked = true;
    bfiDutyRange.value = params.bfiDuty;
    document.getElementById('res-240p-toggle').checked = params.res240p;
    crtOnToggle.checked = params.crtOn;
    crtOnToggle.dispatchEvent(new Event('change'));
    const st = document.querySelector(`input[name="signal-type"][value="${params.signalType}"]`);
    if (st) st.checked = true;
    document.getElementById('signal-range').value   = params.signal;
    document.getElementById('ghost-range').value    = params.ghost;
    document.getElementById('compress-range').value = params.compression;
    document.getElementById('jitter-range').value   = params.jitter;
    document.getElementById('interlace-toggle').checked = params.interlace;
    document.getElementById('converge-range').value = params.convergence;
    const mk = document.querySelector(`input[name="mask"][value="${params.mask}"]`);
    if (mk) mk.checked = true;
    document.getElementById('vhold-range').value   = params.vHold;
    document.getElementById('hhold-range').value   = params.tint;
    document.getElementById('weak-red-toggle').checked   = params.weakRed;
    document.getElementById('weak-green-toggle').checked = params.weakGreen;
    document.getElementById('weak-blue-toggle').checked  = params.weakBlue;
    document.getElementById('vcr-mode-toggle').checked   = params.vcrMode;
    document.getElementById('burn-in-range').value = params.burnInAmount;
    renderOSD();
}

function loadPresetList() {
    presetSelect.innerHTML = '<option value="">-- Select Preset --</option>';
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('pvm_preset_')) keys.push(k);
    }
    keys.sort().forEach(k => {
        const name = k.replace('pvm_preset_', '');
        presetSelect.add(new Option(name, k));
    });
}

savePresetBtn.onclick = () => {
    const name = presetNameInput.value.trim();
    if (!name) { toast('ERR: NAME REQUIRED'); return; }
    const key = `pvm_preset_${name}`;
    try {
        localStorage.setItem(key, JSON.stringify(getSettings()));
        loadPresetList();
        presetSelect.value = key;
        presetNameInput.value = '';
        toast(`PRESET '${name}' SAVED`);
    } catch(e) { toast('ERR: STORAGE FULL'); }
};

presetSelect.onchange = e => {
    const key = e.target.value; if (!key) return;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const s = JSON.parse(raw);
        // Basic sanity check
        if (typeof s !== 'object' || s === null) throw new Error('bad preset');
        applyPreset(s);
        toast(`PRESET '${key.replace('pvm_preset_','')}' LOADED`);
    } catch(e) { toast('ERR: FAILED TO LOAD PRESET'); }
};

// Export presets
exportPresetBtn.onclick = () => {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('pvm_preset_')) {
            try { data[k] = JSON.parse(localStorage.getItem(k)); } catch(_) {}
        }
    }
    if (Object.keys(data).length === 0) { toast('NO PRESETS TO EXPORT'); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pvm_presets.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('PRESETS EXPORTED');
};

// Import presets
importPresetFile.onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            const data = JSON.parse(ev.target.result);
            let count = 0;
            for (const [k, v] of Object.entries(data)) {
                if (k.startsWith('pvm_preset_') && typeof v === 'object') {
                    localStorage.setItem(k, JSON.stringify(v));
                    count++;
                }
            }
            loadPresetList();
            toast(`${count} PRESET(S) IMPORTED`);
        } catch(_) { toast('ERR: INVALID PRESET FILE'); }
    };
    reader.readAsText(file);
    e.target.value = '';
};

// ============================================================
// Overlay Mode
// ============================================================
const overlayHud       = document.getElementById('overlay-hud');
const overlayBtn       = document.getElementById('overlay-btn');
const overlayCycleBtn  = document.getElementById('overlay-cycle-signal');
const overlayCrtBtn    = document.getElementById('overlay-crt-btn');
const overlayDecayBtn  = document.getElementById('overlay-decay-btn');
const overlayExitBtn   = document.getElementById('overlay-exit-btn');

function showOverlayHud() {
    overlayHud.classList.add('visible');
    clearTimeout(overlayHudTimer);
    overlayHudTimer = setTimeout(() => overlayHud.classList.remove('visible'), 3200);
}

function updateOverlayHudState() {
    overlayCycleBtn.textContent = `SIG: ${SIGNAL_NAMES[params.signalType] || 'RGB'}`;
    overlayCrtBtn.textContent   = `CRT: ${params.crtOn ? 'ON' : 'OFF'}`;
    const decayOn = params.decay > 0.91;
    overlayDecayBtn.textContent = `PHOS: ${decayOn ? 'ON' : 'LOW'}`;
}

async function enterOverlayMode() {
    if (!params.powerOn) { toast('POWER ON FIRST'); return; }

    // If no live source, auto-start screen capture
    if (params.sourceMode !== 0) {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always', displaySurface: 'monitor' },
                audio: true
            });
            stopAllSources();
            params.sourceMode = 0;
            video.srcObject = stream;
            await new Promise(resolve => { video.onloadedmetadata = resolve; });
            video.play();
            if (audioReady && staticNoise.state === 'started') staticNoise.stop(Tone.now() + 0.01);
            crop43Toggle.disabled = false;
            stream.getVideoTracks()[0].onended = () => { if (overlayMode) exitOverlayMode(); };
        } catch(e) {
            toast('ERR: SCREEN CAPTURE FAILED'); return;
        }
    }

    overlayMode = true;
    bodyEl.classList.add('overlay-mode');
    updateOverlayHudState();

    try {
        await document.documentElement.requestFullscreen();
    } catch(e) { /* fullscreen may be denied — overlay still works windowed */ }

    // Draw with full-viewport canvas immediately
    resize();
    showOverlayHud();
    toast('CRT OVERLAY ACTIVE  ·  O to exit');
}

function exitOverlayMode() {
    overlayMode = false;
    bodyEl.classList.remove('overlay-mode');
    overlayHud.classList.remove('visible');
    clearTimeout(overlayHudTimer);
    if (document.fullscreenElement) document.exitFullscreen();
    resize();
    toast('OVERLAY EXITED');
}

// Show HUD on mouse move while in overlay mode
document.addEventListener('mousemove', () => { if (overlayMode) showOverlayHud(); });
// Also show on touch
document.addEventListener('touchstart', () => { if (overlayMode) showOverlayHud(); }, { passive: true });

// Auto-exit overlay when fullscreen is dismissed (Esc)
document.addEventListener('fullscreenchange', () => {
    updateTheatreIcons();
    if (overlayMode && !document.fullscreenElement) {
        // Don't call exitOverlayMode (fullscreen already gone) — just clean CSS
        overlayMode = false;
        bodyEl.classList.remove('overlay-mode');
        overlayHud.classList.remove('visible');
        clearTimeout(overlayHudTimer);
        resize();
    }
});

// HUD button wiring
overlayBtn.onclick   = () => overlayMode ? exitOverlayMode() : enterOverlayMode();
overlayExitBtn.onclick = exitOverlayMode;

overlayCycleBtn.onclick = () => {
    params.signalType = (params.signalType + 1) % 4;
    const el = document.querySelector(`input[name="signal-type"][value="${params.signalType}"]`);
    if (el) el.checked = true;
    // Auto-adjust presets for signal type
    if (params.signalType === 3)      { params.signal = 0.85; params.ghost = 0.05; }
    else if (params.signalType === 2) { params.signal = 0.95; params.ghost = 0.01; }
    else                              { params.signal = 1.0;  params.ghost = 0.0;  }
    updateOverlayHudState();
};

overlayCrtBtn.onclick = () => {
    params.crtOn = !params.crtOn;
    crtOnToggle.checked = params.crtOn;
    crtOnToggle.dispatchEvent(new Event('change'));
    updateOverlayHudState();
};

overlayDecayBtn.onclick = () => {
    // Toggle between high persistence (0.94) and low (0.85)
    params.decay = params.decay > 0.91 ? 0.85 : 0.94;
    document.getElementById('decay-range').value = params.decay;
    updateOverlayHudState();
};

// ============================================================
// Boot
// ============================================================
initGL();
