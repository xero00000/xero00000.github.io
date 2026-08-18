const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class VideoAnalyzer {
  constructor(sourceCanvas, scopeCanvas, readouts = {}) {
    this.sourceCanvas = sourceCanvas;
    this.canvas = scopeCanvas;
    this.ctx = scopeCanvas.getContext('2d', { alpha: false });
    this.sampleCanvas = document.createElement('canvas');
    this.sampleCanvas.width = 192;
    this.sampleCanvas.height = 108;
    this.sampleCtx = this.sampleCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
    this.mode = 'waveform';
    this.lastSample = 0;
    this.interval = 180;
    this.readouts = readouts;
    this.failed = false;
    this.lastMetrics = { min: 0, max: 100, average: 50, chroma: 0 };
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'off') this.clear();
    else this.update(performance.now(), true);
  }

  resizeDisplay() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(320, Math.round(rect.width * dpr));
    const height = Math.max(120, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  update(now = performance.now(), force = false) {
    if (this.mode === 'off' || this.failed || (!force && now - this.lastSample < this.interval)) return;
    this.lastSample = now;
    this.resizeDisplay();
    try {
      this.sampleCtx.drawImage(this.sourceCanvas, 0, 0, this.sampleCanvas.width, this.sampleCanvas.height);
      const image = this.sampleCtx.getImageData(0, 0, this.sampleCanvas.width, this.sampleCanvas.height);
      const metrics = this.measure(image.data);
      this.lastMetrics = metrics;
      this.updateReadouts(metrics);
      if (this.mode === 'vectorscope') this.drawVectorscope(image.data);
      else if (this.mode === 'histogram') this.drawHistogram(image.data);
      else this.drawWaveform(image.data);
    } catch (error) {
      this.failed = true;
      this.drawMessage(`Scope unavailable: ${error.message}`);
    }
  }

  measure(data) {
    let min = 1;
    let max = 0;
    let sum = 0;
    let chromaPeak = 0;
    let count = 0;
    for (let index = 0; index < data.length; index += 16) {
      const r = data[index] / 255;
      const g = data[index + 1] / 255;
      const b = data[index + 2] / 255;
      const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const u = b - y;
      const v = r - y;
      min = Math.min(min, y);
      max = Math.max(max, y);
      sum += y;
      chromaPeak = Math.max(chromaPeak, Math.hypot(u, v));
      count += 1;
    }
    return {
      min: Math.round(clamp(min * 100, -20, 120)),
      max: Math.round(clamp(max * 100, -20, 120)),
      average: Math.round(clamp((sum / Math.max(count, 1)) * 100, -20, 120)),
      chroma: Math.round(clamp(chromaPeak * 100, 0, 160))
    };
  }

  updateReadouts(metrics) {
    if (this.readouts.min) this.readouts.min.textContent = metrics.min;
    if (this.readouts.max) this.readouts.max.textContent = metrics.max;
    if (this.readouts.average) this.readouts.average.textContent = metrics.average;
    if (this.readouts.chroma) this.readouts.chroma.textContent = metrics.chroma;
  }

  clearBackground(title) {
    const { ctx, canvas } = this;
    ctx.save();
    ctx.fillStyle = '#020604';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(104, 255, 145, .14)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= 10; x += 1) {
      const px = Math.round((x / 10) * canvas.width) + 0.5;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, canvas.height); ctx.stroke();
    }
    for (let y = 0; y <= 4; y += 1) {
      const py = Math.round((y / 4) * canvas.height) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(canvas.width, py); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(140, 255, 172, .58)';
    ctx.font = `${Math.max(9, canvas.height * 0.045)}px ui-monospace, monospace`;
    ctx.fillText(title, 9, 15);
    ctx.restore();
  }

  drawWaveform(data) {
    this.clearBackground('LUMA WAVEFORM · 0–100 IRE');
    const { ctx, canvas } = this;
    const sw = this.sampleCanvas.width;
    const sh = this.sampleCanvas.height;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(88, 255, 132, .10)';
    const xScale = canvas.width / sw;
    for (let sy = 0; sy < sh; sy += 2) {
      for (let sx = 0; sx < sw; sx += 1) {
        const index = (sy * sw + sx) * 4;
        const y = (data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722) / 255;
        const px = sx * xScale;
        const py = (1 - y) * (canvas.height - 20) + 10;
        ctx.fillRect(px, py, Math.max(1, xScale), 1.2);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(255, 255, 255, .38)';
    ctx.setLineDash([4, 5]);
    for (const ire of [0, 7.5, 50, 100]) {
      const py = (1 - ire / 100) * (canvas.height - 20) + 10;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(canvas.width, py); ctx.stroke();
    }
    ctx.restore();
  }

  drawVectorscope(data) {
    const { ctx, canvas } = this;
    this.clearBackground('YUV VECTORSCOPE · 75% TARGETS');
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) * 0.42;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(104, 255, 145, .24)';
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-radius, 0); ctx.lineTo(radius, 0); ctx.moveTo(0, -radius); ctx.lineTo(0, radius); ctx.stroke();

    const targets = [
      ['R', .63, .38], ['Mg', .38, .63], ['B', -.19, .63],
      ['Cy', -.63, -.38], ['G', -.38, -.63], ['Yl', .19, -.63]
    ];
    ctx.font = `${Math.max(8, canvas.height * .04)}px ui-monospace, monospace`;
    ctx.fillStyle = 'rgba(180,255,198,.52)';
    for (const [label, v, u] of targets) {
      const x = v * radius;
      const y = -u * radius;
      ctx.strokeRect(x - 5, y - 5, 10, 10);
      ctx.fillText(label, x + 7, y - 5);
    }

    ctx.globalCompositeOperation = 'lighter';
    const sw = this.sampleCanvas.width;
    for (let index = 0; index < data.length; index += 20) {
      const r = data[index] / 255;
      const g = data[index + 1] / 255;
      const b = data[index + 2] / 255;
      const y = r * .299 + g * .587 + b * .114;
      const u = (b - y) * .56;
      const v = (r - y) * .71;
      const px = v * radius * 1.55;
      const py = -u * radius * 1.55;
      ctx.fillStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, .15)`;
      ctx.fillRect(px, py, 1.6, 1.6);
    }
    ctx.restore();
  }

  drawHistogram(data) {
    this.clearBackground('RGB + LUMA HISTOGRAM');
    const bins = {
      luma: new Uint32Array(256),
      red: new Uint32Array(256),
      green: new Uint32Array(256),
      blue: new Uint32Array(256)
    };
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const y = Math.round(r * .2126 + g * .7152 + b * .0722);
      bins.red[r] += 1;
      bins.green[g] += 1;
      bins.blue[b] += 1;
      bins.luma[y] += 1;
    }
    const peak = Math.max(1, ...bins.luma, ...bins.red, ...bins.green, ...bins.blue);
    const { ctx, canvas } = this;
    const top = 20;
    const height = canvas.height - top - 4;
    const draw = (values, strokeStyle, alpha = 1) => {
      ctx.beginPath();
      for (let index = 0; index < 256; index += 1) {
        const x = (index / 255) * canvas.width;
        const normalized = Math.log1p(values[index]) / Math.log1p(peak);
        const y = canvas.height - 3 - normalized * height;
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = strokeStyle;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.35;
      ctx.stroke();
    };
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    draw(bins.red, '#ff5555', .75);
    draw(bins.green, '#55ff88', .75);
    draw(bins.blue, '#5599ff', .75);
    draw(bins.luma, '#ffffff', .7);
    ctx.restore();
  }

  drawMessage(message) {
    this.clearBackground('SCOPE');
    this.ctx.fillStyle = '#ffbd66';
    this.ctx.font = '12px ui-monospace, monospace';
    this.ctx.fillText(message, 12, this.canvas.height / 2);
  }

  clear() {
    this.resizeDisplay();
    this.ctx.fillStyle = '#020604';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
