import { VERTEX_SHADER, SIGNAL_FRAGMENT_SHADER, DISPLAY_FRAGMENT_SHADER } from './shaders.js';
import { clamp, linkProgram, makeUniformTable, setUniforms, createTexture, allocateTexture } from './gl-utils.js';

class CRTGL {
  constructor(canvas, state) {
    if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError('CRTGL requires a canvas element.');
    this.canvas = canvas;
    this.state = state;
    this.video = null;
    this.imageSource = null;
    this.sourceResolution = [640, 480];
    this.sourceTextureReady = false;
    this.sourceTextureSize = [2, 2];
    this.sourceDirty = true;
    this.videoFrameToken = 0;
    this.lastVideoTime = -1;
    this.contextLost = false;
    this.onStatus = null;
    this.powerChangedAt = performance.now();
    this.lastPowerState = Boolean(state.power);
    this.degaussStartedAt = -Infinity;
    this.degaussDuration = 1150;
    this.startedAt = performance.now();
    this.lastRenderAt = this.startedAt;
    this.frame = 0;
    this.ping = 0;
    this.width = 0;
    this.height = 0;
    this.maxTextureSize = 4096;
    this.maxRenderPixels = 5_500_000;
    this.adaptiveScale = 1;
    this.frameTimeEMA = 16.67;
    this.fpsEMA = 60;
    this.lastQualityChange = 0;
    this.lastResizeAt = 0;
    this.lastError = '';
    this.effectiveTime = 0;
    this.frozenAt = null;
    this.resources = [];

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      desynchronized: true,
      powerPreference: 'high-performance'
    });
    if (!gl) throw new Error('WebGL2 is unavailable. CRT Lab Pro requires a WebGL2-capable browser and GPU driver.');
    this.gl = gl;

    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.contextLost = true;
      this.onStatus?.('lost', 'GPU context lost. Waiting for browser recovery…');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      try {
        this.contextLost = false;
        this.initResources();
        if (this.imageSource) this.uploadImage(this.imageSource);
        this.onStatus?.('restored', 'GPU context restored.');
      } catch (error) {
        this.lastError = error.message;
        this.onStatus?.('error', error.message);
      }
    });

    this.initResources();
  }

  initResources() {
    const gl = this.gl;
    this.disposeResources();
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    this.signalProgram = linkProgram(gl, VERTEX_SHADER, SIGNAL_FRAGMENT_SHADER, 'Signal pipeline');
    this.displayProgram = linkProgram(gl, VERTEX_SHADER, DISPLAY_FRAGMENT_SHADER, 'Display pipeline');
    this.signalUniforms = makeUniformTable(gl, this.signalProgram);
    this.displayUniforms = makeUniformTable(gl, this.displayProgram);
    this.resources.push(this.signalProgram, this.displayProgram);

    this.vao = gl.createVertexArray();
    this.quadBuffer = gl.createBuffer();
    this.resources.push(this.vao, this.quadBuffer);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.sourceTexture = createTexture(gl, 2, 2, new Uint8Array([
      0, 0, 0, 255, 0, 0, 0, 255,
      0, 0, 0, 255, 0, 0, 0, 255
    ]));
    this.resources.push(this.sourceTexture);
    this.sourceTextureSize = [2, 2];
    this.sourceTextureReady = false;
    this.sourceDirty = true;

    this.processedTextures = [createTexture(gl), createTexture(gl)];
    this.rawTextures = [createTexture(gl), createTexture(gl)];
    this.framebuffers = [gl.createFramebuffer(), gl.createFramebuffer()];
    this.resources.push(...this.processedTextures, ...this.rawTextures, ...this.framebuffers);
    this.width = 0;
    this.height = 0;
    this.resize(true);
    this.clearFeedback();
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
  }

  disposeResources() {
    if (!this.gl || !this.resources.length) return;
    const gl = this.gl;
    for (const resource of this.resources) {
      if (!resource) continue;
      if (gl.isProgram(resource)) gl.deleteProgram(resource);
      else if (gl.isShader(resource)) gl.deleteShader(resource);
      else if (gl.isTexture(resource)) gl.deleteTexture(resource);
      else if (gl.isFramebuffer(resource)) gl.deleteFramebuffer(resource);
      else if (gl.isBuffer(resource)) gl.deleteBuffer(resource);
      else if (gl.isVertexArray(resource)) gl.deleteVertexArray(resource);
    }
    this.resources = [];
  }

  setVideo(video) {
    this.video = video;
    this.imageSource = null;
    this.sourceDirty = true;
    this.lastVideoTime = -1;
    const token = ++this.videoFrameToken;
    if (video?.requestVideoFrameCallback) {
      const onFrame = () => {
        if (token !== this.videoFrameToken || this.video !== video) return;
        this.sourceDirty = true;
        video.requestVideoFrameCallback(onFrame);
      };
      video.requestVideoFrameCallback(onFrame);
    }
  }

  setImage(imageBitmap) {
    if (this.imageSource && this.imageSource !== imageBitmap && typeof this.imageSource.close === 'function') {
      this.imageSource.close();
    }
    this.videoFrameToken += 1;
    this.imageSource = imageBitmap;
    this.video = null;
    this.uploadImage(imageBitmap);
  }

  uploadImage(imageBitmap) {
    const gl = this.gl;
    if (!imageBitmap || this.contextLost) return;
    const width = imageBitmap.width || 1;
    const height = imageBitmap.height || 1;
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageBitmap);
    this.sourceResolution = [width, height];
    this.sourceTextureSize = [width, height];
    this.sourceTextureReady = true;
    this.sourceDirty = false;
    this.clearFeedback();
  }

  updateSourceTexture() {
    if (this.contextLost || this.state.freeze || !this.video || this.video.readyState < 2 || !this.video.videoWidth) return;
    const hasFrameCallback = typeof this.video.requestVideoFrameCallback === 'function';
    const mediaTime = Number(this.video.currentTime) || 0;
    if (!this.sourceDirty && (hasFrameCallback || Math.abs(mediaTime - this.lastVideoTime) < 1e-6)) return;
    const gl = this.gl;
    try {
      const width = this.video.videoWidth || 1;
      const height = this.video.videoHeight || 1;
      gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      if (!this.sourceTextureReady || this.sourceTextureSize[0] !== width || this.sourceTextureSize[1] !== height) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
        this.sourceTextureSize = [width, height];
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
      }
      this.sourceResolution = [width, height];
      this.sourceTextureReady = true;
      this.sourceDirty = false;
      this.lastVideoTime = mediaTime;
    } catch (error) {
      this.lastError = `Source texture upload failed: ${error.message}`;
      this.sourceDirty = true;
    }
  }

  setFreeze(frozen) {
    this.state.freeze = Boolean(frozen);
    if (this.state.freeze && this.frozenAt === null) this.frozenAt = this.effectiveTime;
    if (!this.state.freeze) this.frozenAt = null;
  }

  setPower(powered) {
    const next = Boolean(powered);
    if (next === this.lastPowerState) {
      this.state.power = next;
      return;
    }
    this.lastPowerState = next;
    this.state.power = next;
    this.powerChangedAt = performance.now();
  }

  degauss() {
    this.degaussStartedAt = performance.now();
  }

  resize(force = false) {
    if (this.contextLost) return false;
    const gl = this.gl;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;

    const dpr = Math.min(window.devicePixelRatio || 1, Number(this.state.maxDPR) || 1.5);
    let scale = Math.max(0.2, Number(this.state.renderScale) || 1) * this.adaptiveScale;
    let width = Math.max(256, Math.round(rect.width * dpr * scale));
    let height = Math.max(192, Math.round(rect.height * dpr * scale));
    const dimensionScale = Math.min(1, this.maxTextureSize / width, this.maxTextureSize / height);
    width = Math.max(2, Math.floor(width * dimensionScale));
    height = Math.max(2, Math.floor(height * dimensionScale));
    const pixels = width * height;
    if (pixels > this.maxRenderPixels) {
      const pixelScale = Math.sqrt(this.maxRenderPixels / pixels);
      width = Math.max(2, Math.floor(width * pixelScale));
      height = Math.max(2, Math.floor(height * pixelScale));
    }

    if (!force && width === this.width && height === this.height) return false;
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    for (let index = 0; index < 2; index += 1) {
      allocateTexture(gl, this.processedTextures[index], width, height);
      allocateTexture(gl, this.rawTextures[index], width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[index]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.processedTextures[index], 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.rawTextures[index], 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`CRT framebuffer is incomplete (0x${status.toString(16)}).`);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.clearFeedback();
    this.lastResizeAt = performance.now();
    return true;
  }

  clearFeedback() {
    if (this.contextLost || !this.framebuffers) return;
    const gl = this.gl;
    const zero = new Float32Array([0, 0, 0, 1]);
    for (const framebuffer of this.framebuffers) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.clearBufferfv(gl.COLOR, 0, zero);
      gl.clearBufferfv(gl.COLOR, 1, zero);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.ping = 0;
  }

  renderSignal(timeSeconds, deltaSeconds) {
    const gl = this.gl;
    const writeIndex = 1 - this.ping;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[writeIndex]);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.signalProgram);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.processedTextures[this.ping]);

    const state = this.state;
    setUniforms(gl, this.signalUniforms, {
      u_source: 0,
      u_previous: 1,
      u_sourceRes: this.sourceResolution,
      u_outputRes: [this.width, this.height],
      u_time: timeSeconds,
      u_delta: deltaSeconds,
      u_frame: this.frame,
      u_sourceMode: state.sourceMode,
      u_testPattern: state.testPattern,
      u_signalType: state.signalType,
      u_fitMode: state.fitMode,
      u_combFilter: state.combFilter,
      u_vhsSpeed: state.vhsSpeed,
      u_sourceZoom: state.sourceZoom,
      u_sourcePanX: state.sourcePanX,
      u_sourcePanY: state.sourcePanY,
      u_sourceRotation: state.sourceRotation,
      u_mirrorX: state.mirrorX,
      u_mirrorY: state.mirrorY,
      u_signalStrength: state.signalStrength,
      u_noise: state.noise,
      u_jitter: state.jitter,
      u_horizontalTear: state.horizontalTear,
      u_ghosting: state.ghosting,
      u_chromaBleed: state.chromaBleed,
      u_chromaDelay: state.chromaDelay,
      u_dotCrawl: state.dotCrawl,
      u_ringing: state.ringing,
      u_lumaBandwidth: state.lumaBandwidth,
      u_chromaBandwidth: state.chromaBandwidth,
      u_rfMultipath: state.rfMultipath,
      u_humBar: state.humBar,
      u_tracking: state.tracking,
      u_dropout: state.dropout,
      u_agcPumping: state.agcPumping,
      u_colorBurstPhase: state.colorBurstPhase,
      u_phosphorDecayR: state.phosphorDecayR,
      u_phosphorDecayG: state.phosphorDecayG,
      u_phosphorDecayB: state.phosphorDecayB,
      u_persistenceStrength: state.persistenceStrength,
      u_beamWidth: state.beamWidth,
      u_beamScan: state.beamScan,
      u_reducedMotion: state.reducedMotion
    });
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.ping = writeIndex;
  }

  renderDisplay(timeSeconds, deltaSeconds, now) {
    const gl = this.gl;
    const state = this.state;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.displayProgram);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.processedTextures[this.ping]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.rawTextures[this.ping]);

    const powerAge = Math.max(0, (now - this.powerChangedAt) / 1000);
    const degaussAgeMs = now - this.degaussStartedAt;
    const degaussActive = degaussAgeMs >= 0 && degaussAgeMs < this.degaussDuration;
    setUniforms(gl, this.displayUniforms, {
      u_processed: 0,
      u_raw: 1,
      u_resolution: [this.width, this.height],
      u_time: timeSeconds,
      u_delta: deltaSeconds,
      u_frame: this.frame,
      u_power: state.power,
      u_powerAge: powerAge,
      u_degauss: degaussActive,
      u_degaussAge: Math.max(0, degaussAgeMs / 1000),
      u_bypass: state.bypass,
      u_compareMode: state.compareMode,
      u_comparePosition: state.comparePosition,
      u_reducedMotion: state.reducedMotion,
      u_brightness: state.brightness,
      u_contrast: state.contrast,
      u_saturation: state.saturation,
      u_hue: state.hue,
      u_gamma: state.gamma,
      u_blackLevel: state.blackLevel,
      u_whiteLevel: state.whiteLevel,
      u_temperature: state.temperature,
      u_sharpness: state.sharpness,
      u_bloom: state.bloom,
      u_halation: state.halation,
      u_vignette: state.vignette,
      u_scanlineStrength: state.scanlineStrength,
      u_scanlineSharpness: state.scanlineSharpness,
      u_resolutionLines: state.resolutionLines,
      u_interlace: state.interlace,
      u_fieldOrder: state.fieldOrder,
      u_maskType: state.maskType,
      u_maskStrength: state.maskStrength,
      u_maskScale: state.maskScale,
      u_moire: state.moire,
      u_curvatureX: state.curvatureX,
      u_curvatureY: state.curvatureY,
      u_overscanX: state.overscanX,
      u_overscanY: state.overscanY,
      u_hSize: state.hSize,
      u_vSize: state.vSize,
      u_hPosition: state.hPosition,
      u_vPosition: state.vPosition,
      u_rasterRotation: state.rasterRotation,
      u_pincushion: state.pincushion,
      u_trapezoid: state.trapezoid,
      u_cornerPin: state.cornerPin,
      u_hLinearity: state.hLinearity,
      u_vLinearity: state.vLinearity,
      u_phosphorType: state.phosphorType,
      u_beamWidth: state.beamWidth,
      u_beamBloom: state.beamBloom,
      u_focusCenter: state.focusCenter,
      u_focusEdge: state.focusEdge,
      u_convergenceRX: state.convergenceRX,
      u_convergenceRY: state.convergenceRY,
      u_convergenceBX: state.convergenceBX,
      u_convergenceBY: state.convergenceBY,
      u_cornerConvergence: state.cornerConvergence,
      u_tubeAge: state.tubeAge,
      u_burnIn: state.burnIn,
      u_weakRed: state.weakRed,
      u_weakGreen: state.weakGreen,
      u_weakBlue: state.weakBlue
    });
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  updateAdaptiveQuality(now) {
    if (!this.state.adaptiveQuality || now - this.lastQualityChange < 1400) return;
    const target = clamp(Number(this.state.targetFPS) || 55, 24, 120);
    if (this.fpsEMA < target - 6 && this.adaptiveScale > 0.48) {
      this.adaptiveScale = Math.max(0.45, this.adaptiveScale * 0.88);
      this.lastQualityChange = now;
      this.resize(true);
      this.onStatus?.('quality', `Adaptive quality ${Math.round(this.adaptiveScale * 100)}%`);
    } else if (this.fpsEMA > target + 9 && this.adaptiveScale < 0.995) {
      this.adaptiveScale = Math.min(1, this.adaptiveScale * 1.07 + 0.01);
      this.lastQualityChange = now;
      this.resize(true);
      this.onStatus?.('quality', `Adaptive quality ${Math.round(this.adaptiveScale * 100)}%`);
    }
  }

  render(now = performance.now()) {
    if (this.contextLost || document.hidden && this.state.pauseWhenHidden) return false;
    const start = performance.now();
    this.resize(false);
    const wallDelta = clamp((now - this.lastRenderAt) / 1000, 1 / 240, 0.1);
    this.lastRenderAt = now;
    if (!this.state.freeze) this.effectiveTime += wallDelta;
    const timeSeconds = this.state.freeze && this.frozenAt !== null ? this.frozenAt : this.effectiveTime;
    const deltaSeconds = this.state.freeze ? 1 / 60 : wallDelta;

    this.updateSourceTexture();
    if (!this.state.freeze || this.frame === 0) this.renderSignal(timeSeconds, deltaSeconds);
    this.renderDisplay(timeSeconds, deltaSeconds, now);
    this.frame += 1;

    const elapsed = Math.max(0.01, performance.now() - start);
    this.frameTimeEMA = this.frameTimeEMA * 0.92 + elapsed * 0.08;
    const instantaneousFPS = 1000 / Math.max(1, now - (this.previousFrameAt || now - 16.67));
    this.previousFrameAt = now;
    this.fpsEMA = this.fpsEMA * 0.9 + instantaneousFPS * 0.1;
    this.updateAdaptiveQuality(now);
    return true;
  }

  async captureBlob(type = 'image/png', quality = 0.95) {
    this.render(performance.now());
    return new Promise(resolve => this.canvas.toBlob(resolve, type, quality));
  }

  getStats() {
    return {
      width: this.width,
      height: this.height,
      fps: Math.round(this.fpsEMA),
      frameTime: this.frameTimeEMA,
      adaptiveScale: this.adaptiveScale,
      sourceWidth: this.sourceResolution[0],
      sourceHeight: this.sourceResolution[1],
      contextLost: this.contextLost
    };
  }

  getDiagnostics() {
    const gl = this.gl;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const vendor = debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const extensions = gl.getSupportedExtensions() || [];
    const stats = this.getStats();
    return {
      webgl: gl.getParameter(gl.VERSION),
      shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      renderer,
      vendor,
      maxTextureSize: this.maxTextureSize,
      maxDrawBuffers: gl.getParameter(gl.MAX_DRAW_BUFFERS),
      maxColorAttachments: gl.getParameter(gl.MAX_COLOR_ATTACHMENTS),
      renderResolution: `${stats.width} × ${stats.height}`,
      sourceResolution: `${stats.sourceWidth} × ${stats.sourceHeight}`,
      adaptiveScale: `${Math.round(stats.adaptiveScale * 100)}%`,
      frameTime: `${stats.frameTime.toFixed(2)} ms`,
      extensions: extensions.join(', '),
      lastError: this.lastError || 'none'
    };
  }

  destroy() {
    this.videoFrameToken += 1;
    if (this.imageSource && typeof this.imageSource.close === 'function') this.imageSource.close();
    this.disposeResources();
  }
}

export { CRTGL };
