const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4;codecs=h264,aac',
  'video/mp4'
];

function chooseMimeType() {
  if (!window.MediaRecorder) return '';
  return MIME_CANDIDATES.find(type => MediaRecorder.isTypeSupported?.(type)) || '';
}

export class OutputRecorder {
  constructor(canvas, sourceVideo = null) {
    this.canvas = canvas;
    this.sourceVideo = sourceVideo;
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.startedAt = 0;
    this.mimeType = chooseMimeType();
    this.borrowedAudioTracks = [];
    this.ownTracks = [];
    this.onStateChange = null;
    this.lastError = '';
  }

  get supported() {
    return Boolean(window.MediaRecorder && this.canvas?.captureStream);
  }

  get recording() {
    return this.recorder?.state === 'recording' || this.recorder?.state === 'paused';
  }

  get elapsedSeconds() {
    return this.recording ? Math.max(0, (performance.now() - this.startedAt) / 1000) : 0;
  }

  collectSourceAudioTracks() {
    const tracks = [];
    const video = this.sourceVideo;
    if (!video) return tracks;
    try {
      if (video.srcObject instanceof MediaStream) tracks.push(...video.srcObject.getAudioTracks());
      else {
        const capture = video.captureStream?.() || video.mozCaptureStream?.();
        if (capture) tracks.push(...capture.getAudioTracks());
      }
    } catch {
      // Some browsers block captureStream for a paused or unsupported media element.
    }
    return tracks.filter(track => track.readyState === 'live');
  }

  start({ fps = 60, bitrateMbps = 12, includeAudio = true } = {}) {
    if (!this.supported) throw new Error('This browser cannot record canvas output with MediaRecorder.');
    if (this.recording) return;
    const safeFPS = Math.max(15, Math.min(120, Number(fps) || 60));
    const safeBitrate = Math.max(1, Math.min(80, Number(bitrateMbps) || 12)) * 1_000_000;
    const canvasStream = this.canvas.captureStream(safeFPS);
    this.ownTracks = [...canvasStream.getTracks()];
    this.borrowedAudioTracks = includeAudio ? this.collectSourceAudioTracks() : [];
    for (const track of this.borrowedAudioTracks) {
      if (!canvasStream.getAudioTracks().includes(track)) canvasStream.addTrack(track);
    }
    this.stream = canvasStream;
    this.chunks = [];
    this.startedAt = performance.now();
    this.lastError = '';

    const options = { videoBitsPerSecond: safeBitrate };
    if (this.mimeType) options.mimeType = this.mimeType;
    this.recorder = new MediaRecorder(canvasStream, options);
    this.recorder.addEventListener('dataavailable', event => {
      if (event.data?.size) this.chunks.push(event.data);
    });
    this.recorder.addEventListener('error', event => {
      this.lastError = event.error?.message || 'Unknown MediaRecorder error';
      this.onStateChange?.('error', this.lastError);
    });
    this.recorder.addEventListener('start', () => this.onStateChange?.('recording'));
    this.recorder.addEventListener('pause', () => this.onStateChange?.('paused'));
    this.recorder.addEventListener('resume', () => this.onStateChange?.('recording'));
    this.recorder.start(1000);
  }

  pause() {
    if (this.recorder?.state === 'recording') this.recorder.pause();
  }

  resume() {
    if (this.recorder?.state === 'paused') this.recorder.resume();
  }

  stop() {
    if (!this.recorder || this.recorder.state === 'inactive') return Promise.resolve(null);
    return new Promise(resolve => {
      const recorder = this.recorder;
      recorder.addEventListener('stop', () => {
        const type = recorder.mimeType || this.mimeType || 'video/webm';
        const blob = this.chunks.length ? new Blob(this.chunks, { type }) : null;
        for (const track of this.ownTracks) track.stop();
        this.ownTracks = [];
        this.borrowedAudioTracks = [];
        this.stream = null;
        this.recorder = null;
        this.chunks = [];
        this.onStateChange?.('stopped', blob);
        resolve(blob);
      }, { once: true });
      recorder.stop();
    });
  }

  extensionFor(blob) {
    const type = blob?.type || this.mimeType;
    return type.includes('mp4') ? 'mp4' : 'webm';
  }
}
