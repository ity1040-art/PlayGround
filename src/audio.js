// Procedural soundscape — no external audio files.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.danger = 0;
    this.nextBeat = 0;
    this.started = false;
    this._noise = null;
    this.enabled = true;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.24;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    this._noise = this._makeNoiseBuffer(3);
    this._buildAmbience();
    this.started = true;
  }

  _makeNoiseBuffer(seconds = 2) {
    const rate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, rate * seconds, rate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.2;
    }
    return buf;
  }

  _buildAmbience() {
    const ctx = this.ctx;
    // low wind bed
    const wind = ctx.createBufferSource();
    wind.buffer = this._noise;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 330;
    windFilter.Q.value = 0.6;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.06;
    wind.connect(windFilter).connect(windGain).connect(this.master);
    wind.start();

    // breath of the house
    const oscs = [41.2, 61.8, 82.4];
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.045;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 210;
    oscs.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 1 ? 'triangle' : 'sine';
      o.frequency.value = f;
      o.detune.value = (i - 1) * 7;
      const g = ctx.createGain();
      g.gain.value = i === 2 ? 0.3 : 1;
      o.connect(g).connect(lp);
      o.start();
    });
    lp.connect(droneGain).connect(this.master);

    // slow breathing tremolo
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.022;
    lfo.connect(lfoGain).connect(droneGain.gain);
    lfo.start();

    // distant dissonant string
    const high = ctx.createOscillator();
    high.type = 'sine';
    high.frequency.value = 233.1;
    const highGain = ctx.createGain();
    highGain.gain.value = 0.006;
    const trem = ctx.createOscillator();
    trem.frequency.value = 0.17;
    const tremGain = ctx.createGain();
    tremGain.gain.value = 0.005;
    trem.connect(tremGain).connect(highGain.gain);
    high.connect(highGain).connect(this.master);
    high.start();
    trem.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(m ? 0 : 0.9, this.ctx.currentTime + 0.15);
    }
  }

  _noiseBurst(duration, filterType, freq, gain, q = 1, when = 0, pan = 0, attack = 0.005) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this._noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    let node = src.connect(f).connect(g);
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      node = p;
    }
    node.connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  _tone(freq, duration, gain, type = 'sine', when = 0, slideTo = null, pan = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + Math.min(0.04, duration * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    let node = o.connect(g);
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node = g.connect(p);
    }
    node.connect(this.master);
    o.start(t);
    o.stop(t + duration + 0.06);
  }

  step(sprint = false) {
    if (!this.ctx) return;
    const pan = (Math.random() - 0.5) * 0.3;
    this._noiseBurst(sprint ? 0.08 : 0.11, 'lowpass', sprint ? 420 : 300, sprint ? 0.075 : 0.05, 0.8, 0, pan, 0.004);
    this._tone(sprint ? 88 : 66, 0.09, 0.028, 'sine', 0, 48, pan);
  }

  pickup() {
    if (!this.ctx) return;
    this._tone(392, 1.1, 0.06, 'sine', 0);
    this._tone(523.25, 1.4, 0.045, 'sine', 0.08);
    this._tone(783.99, 1.8, 0.03, 'sine', 0.16);
    this._tone(1046.5, 1.2, 0.015, 'sine', 0.24);
    this._noiseBurst(0.45, 'highpass', 3200, 0.025, 0.6, 0.02);
  }

  doorOpen() {
    if (!this.ctx) return;
    this._tone(96, 1.8, 0.05, 'sawtooth', 0, 43);
    this._noiseBurst(1.4, 'bandpass', 700, 0.035, 2.5, 0.1);
    this._tone(58, 2.2, 0.08, 'sine', 0.2, 32);
  }

  thud() {
    if (!this.ctx) return;
    this._tone(64, 0.45, 0.14, 'sine', 0, 34);
    this._noiseBurst(0.25, 'lowpass', 220, 0.09, 1, 0);
  }

  jumpscare() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // screech
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(1480, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 1.05);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(420, t + 1);
    f.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    o.connect(f).connect(g).connect(this.master);
    o.start(t); o.stop(t + 1.35);
    // impact
    this._noiseBurst(0.9, 'lowpass', 900, 0.3, 0.8, 0.01);
    this._tone(42, 1.6, 0.22, 'sine', 0, 22);
    this._noiseBurst(0.5, 'highpass', 2400, 0.12, 0.7, 0);
  }

  whisper(intensity = 1, text = '') {
    if (!this.ctx) return;
    const pan = (Math.random() - 0.5) * 1.4;
    const dur = 1.2 + Math.random() * 1.4;
    this._noiseBurst(dur, 'bandpass', 1050 + Math.random() * 900, 0.015 + intensity * 0.01, 5, 0, pan, 0.25);
    this._noiseBurst(dur * 0.7, 'bandpass', 2200 + Math.random() * 700, 0.006, 8, 0.2, -pan, 0.3);
    if (Math.random() < 0.45) this._tone(160 + Math.random() * 80, 0.6, 0.01, 'sine', 0.1, 90, pan);
  }

  screech() {
    if (!this.ctx) return;
    this._tone(880, 0.7, 0.05, 'sawtooth', 0, 220);
    this._noiseBurst(0.8, 'highpass', 2600, 0.09);
    this._tone(48, 1.4, 0.16, 'sine', 0.02, 26);
  }

  heartbeat() {
    this._tone(52, 0.2, 0.17, 'sine', 0, 34, -0.05);
    this._tone(44, 0.22, 0.11, 'sine', 0.17, 30, 0.05);
    this._noiseBurst(0.08, 'lowpass', 130, 0.05, 1, 0);
  }

  lightning() {
    if (!this.ctx) return;
    this._noiseBurst(1.8, 'lowpass', 380, 0.09, 0.8, 0.8, (Math.random() - 0.5) * 0.8, 0.2);
    this._tone(36, 2.4, 0.1, 'sine', 0.85, 24);
  }

  doorLocked() {
    if (!this.ctx) return;
    this.thud();
    this._tone(116, 0.5, 0.025, 'triangle', 0.02, 90);
  }

  chime() {
    this._tone(659.25, 1.6, 0.035, 'sine', 0);
    this._tone(987.77, 1.9, 0.02, 'sine', 0.1);
    this._tone(1318.5, 1.1, 0.01, 'sine', 0.2);
  }

  update(dt, danger = 0) {
    if (!this.ctx || this.muted) return;
    this.danger += (danger - this.danger) * Math.min(1, dt * 1.5);
    const now = this.ctx.currentTime;
    const interval = 1.05 - this.danger * 0.68;
    if (now > this.nextBeat) {
      if (this.danger > 0.08) this.heartbeat();
      this.nextBeat = now + interval;
    }
  }
}
