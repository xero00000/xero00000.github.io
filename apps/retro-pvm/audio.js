const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

class CRTAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.humGain = null;
    this.humOscillators = [];
    this.volume = 0;
  }

  ensure() {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
      return this.context;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    const context = new AudioContextClass();
    const master = context.createGain();
    const humGain = context.createGain();
    master.gain.value = 0.7;
    humGain.gain.value = 0;
    humGain.connect(master);
    master.connect(context.destination);

    const components = [
      [59.94, 0.55, 'sine'],
      [119.88, 0.23, 'sine'],
      [179.82, 0.10, 'triangle'],
      [15734, 0.018, 'sine']
    ];
    for (const [frequency, gainValue, type] of components) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.value = gainValue;
      oscillator.connect(gain).connect(humGain);
      oscillator.start();
      this.humOscillators.push(oscillator);
    }
    this.context = context;
    this.master = master;
    this.humGain = humGain;
    this.setVolume(this.volume);
    return context;
  }

  setVolume(value) {
    this.volume = clamp(Number(value) || 0, 0, 0.25);
    if (!this.context || !this.humGain) return;
    this.humGain.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.04);
  }

  chirp(kind = 'power') {
    const context = this.ensure();
    if (!context || !this.master) return;
    const now = context.currentTime;
    const gain = context.createGain();
    gain.connect(this.master);
    gain.gain.setValueAtTime(0.0001, now);

    if (kind === 'degauss') {
      const oscillator = context.createOscillator();
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(95, now);
      oscillator.frequency.exponentialRampToValueAtTime(38, now + 1.05);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
      oscillator.connect(gain);
      oscillator.start(now);
      oscillator.stop(now + 1.12);

      const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 1.05), context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.8);
      const noise = context.createBufferSource();
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      noise.buffer = buffer;
      noise.connect(filter).connect(gain);
      noise.start(now);
      return;
    }

    const oscillator = context.createOscillator();
    oscillator.type = kind === 'fault' ? 'square' : 'sine';
    oscillator.frequency.setValueAtTime(kind === 'fault' ? 120 : 210, now);
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'fault' ? 52 : 65, now + 0.16);
    gain.gain.exponentialRampToValueAtTime(kind === 'fault' ? 0.08 : 0.045, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    oscillator.connect(gain);
    oscillator.start(now);
    oscillator.stop(now + 0.24);
  }
}

export { CRTAudio };
