const SHOTS = {
  rifle: { lp: 3600, end: 300, dur: 0.2, vol: 0.75, boom: 150, boomVol: 0.8 },
  smg: { lp: 4200, end: 500, dur: 0.12, vol: 0.5, boom: 190, boomVol: 0.5 },
  shotgun: { lp: 2200, end: 150, dur: 0.42, vol: 1.1, boom: 95, boomVol: 1.1, tail: 0.25 },
  revolver: { lp: 2800, end: 200, dur: 0.35, vol: 1.0, boom: 115, boomVol: 1.0, tail: 0.2 },
  lmg: { lp: 3000, end: 250, dur: 0.22, vol: 0.8, boom: 130, boomVol: 0.85 },
  sniper: { lp: 5200, end: 180, dur: 0.55, vol: 1.15, boom: 80, boomVol: 1.1, tail: 0.35 },
  launcher: { lp: 900, end: 120, dur: 0.25, vol: 0.7, boom: 70, boomVol: 1.0 },
};

// All sounds are synthesised with WebAudio so the game ships without audio files.
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._wind();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  get ok() {
    return !!this.ctx;
  }

  _noise(loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = loop;
    return s;
  }

  _env(gainNode, t, peak, attack, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  _panner(pos) {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 4;
    p.rolloffFactor = 1.3;
    p.maxDistance = 90;
    if (p.positionX) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
    } else {
      p.setPosition(pos.x, pos.y, pos.z);
    }
    p.connect(this.master);
    return p;
  }

  setListener(pos, forward) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = pos.x;
      l.positionY.value = pos.y;
      l.positionZ.value = pos.z;
      l.forwardX.value = forward.x;
      l.forwardY.value = forward.y;
      l.forwardZ.value = forward.z;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
    }
  }

  _wind() {
    const ctx = this.ctx;
    const n = this._noise(true);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    const g = (this.windGain = ctx.createGain());
    g.gain.value = 0.07;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.045;
    lfo.connect(lfoGain).connect(g.gain);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.13;
    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = 180;
    lfo2.connect(lfo2Gain).connect(f.frequency);
    n.connect(f).connect(g).connect(this.master);
    n.start();
    lfo.start();
    lfo2.start();
  }

  // Gunshot: filtered noise crack plus a low thump, shaped per gun.
  shot(kind = 'rifle', heavy = false, pos = null) {
    if (!this.ctx) return;
    const P = SHOTS[kind] || SHOTS.rifle;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = pos ? this._panner(pos) : this.master;
    const n = this._noise();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(heavy ? P.lp * 0.6 : P.lp, t);
    f.frequency.exponentialRampToValueAtTime(P.end, t + P.dur);
    const g = ctx.createGain();
    this._env(g, t, P.vol * (heavy ? 1.2 : 1), 0.002, P.dur);
    n.connect(f).connect(g).connect(out);
    n.start(t, Math.random());
    n.stop(t + P.dur + 0.1);

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(P.boom, t);
    o.frequency.exponentialRampToValueAtTime(35, t + P.dur * 0.7);
    const og = ctx.createGain();
    this._env(og, t, P.boomVol, 0.002, P.dur * 0.7);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + P.dur);

    if (P.tail && !pos) {
      // distant echo rolling across the plains
      const e = this._noise();
      const ef = ctx.createBiquadFilter();
      ef.type = 'lowpass';
      ef.frequency.value = 700;
      const eg = ctx.createGain();
      eg.gain.setValueAtTime(0.0001, t + 0.08);
      eg.gain.exponentialRampToValueAtTime(P.tail, t + 0.15);
      eg.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      e.connect(ef).connect(eg).connect(this.master);
      e.start(t + 0.08, Math.random());
      e.stop(t + 1.3);
    }
  }

  click(pitch = 1, vol = 0.25, delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(900 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(300 * pitch, t + 0.03);
    const g = ctx.createGain();
    this._env(g, t, vol, 0.001, 0.04);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.06);
  }

  reload(duration) {
    this.click(0.8, 0.3, 0.05);
    this.click(0.6, 0.3, duration * 0.4);
    this.click(1.2, 0.35, duration * 0.85);
  }

  empty() {
    this.click(1.6, 0.2);
  }

  hit(headshot) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = this._noise();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 1.5;
    const g = ctx.createGain();
    this._env(g, t, 0.5, 0.002, 0.07);
    n.connect(f).connect(g).connect(this.master);
    n.start(t, Math.random());
    n.stop(t + 0.1);
    if (headshot) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 1700;
      const og = ctx.createGain();
      this._env(og, t, 0.22, 0.002, 0.12);
      o.connect(og).connect(this.master);
      o.start(t);
      o.stop(t + 0.15);
    }
  }

  kill() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.12);
    const g = ctx.createGain();
    this._env(g, t, 0.18, 0.002, 0.14);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.2);
  }

  groan(pos, pitch = 1, big = false) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = (big ? 1.6 : 1.0) + Math.random() * 0.6;
    const pan = this._panner(pos);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const base = (big ? 55 : 95) * pitch;
    o.frequency.setValueAtTime(base * 1.2, t);
    o.frequency.exponentialRampToValueAtTime(base * 0.75, t + dur);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5 + Math.random() * 4;
    const vibG = ctx.createGain();
    vibG.gain.value = base * 0.08;
    vib.connect(vibG).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(big ? 380 : 650, t);
    f.frequency.linearRampToValueAtTime(big ? 260 : 420, t + dur);
    f.Q.value = 2.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(big ? 0.9 : 0.6, t + 0.18);
    g.gain.setValueAtTime(big ? 0.9 : 0.6, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(pan);
    const n = this._noise();
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 500;
    const ng = ctx.createGain();
    ng.gain.value = 0.25;
    n.connect(nf).connect(ng).connect(g);
    o.start(t);
    vib.start(t);
    n.start(t, Math.random());
    o.stop(t + dur + 0.05);
    vib.stop(t + dur + 0.05);
    n.stop(t + dur + 0.05);
  }

  zombieAttack(pos) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const pan = this._panner(pos);
    const n = this._noise();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1100;
    const g = ctx.createGain();
    this._env(g, t, 0.9, 0.01, 0.25);
    n.connect(f).connect(g).connect(pan);
    n.start(t, Math.random());
    n.stop(t + 0.35);
  }

  hurt() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
    const g = ctx.createGain();
    this._env(g, t, 0.9, 0.005, 0.3);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.35);
  }

  explosion(pos) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const pan = this._panner(pos);
    const n = this._noise();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 0.6);
    const g = ctx.createGain();
    this._env(g, t, 1.1, 0.005, 0.6);
    n.connect(f).connect(g).connect(pan);
    n.start(t, Math.random());
    n.stop(t + 0.7);
  }

  step() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = this._noise();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 260 + Math.random() * 120;
    const g = ctx.createGain();
    this._env(g, t, 0.18, 0.005, 0.08);
    n.connect(f).connect(g).connect(this.master);
    n.start(t, Math.random());
    n.stop(t + 0.12);
  }

  _burst({ type = 'lowpass', freq = 800, q = 1, vol = 0.4, attack = 0.005, decay = 0.2, delay = 0, pos = null, sweep = null }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const n = this._noise();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + attack + decay);
    f.Q.value = q;
    const g = ctx.createGain();
    this._env(g, t, vol, attack, decay);
    n.connect(f).connect(g).connect(pos ? this._panner(pos) : this.master);
    n.start(t, Math.random());
    n.stop(t + attack + decay + 0.05);
  }

  slide() {
    this._burst({ type: 'bandpass', freq: 600, q: 0.8, vol: 0.35, attack: 0.05, decay: 0.6, sweep: 250 });
  }

  splat() {
    this._burst({ type: 'lowpass', freq: 1400, vol: 0.6, decay: 0.18, sweep: 300 });
    this._notes([210, 120], { type: 'sine', gap: 0.03, vol: 0.25, len: 0.12 });
  }

  spit(pos) {
    this._burst({ type: 'bandpass', freq: 1800, q: 2, vol: 0.7, attack: 0.01, decay: 0.25, sweep: 500, pos });
  }

  zap() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(1800, t);
    o.frequency.exponentialRampToValueAtTime(200, t + 0.15);
    const g = ctx.createGain();
    this._env(g, t, 0.15, 0.002, 0.15);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.2);
  }

  ignite() {
    this._burst({ type: 'highpass', freq: 1200, vol: 0.25, attack: 0.02, decay: 0.3 });
  }

  thunder(delay = 0) {
    this._burst({ type: 'lowpass', freq: 400, vol: 1.2, attack: 0.02, decay: 2.6, delay, sweep: 60 });
    this._burst({ type: 'lowpass', freq: 1200, vol: 0.5, attack: 0.005, decay: 0.4, delay, sweep: 200 });
  }

  // Looping rain hiss; level 0..1
  setRain(level) {
    if (!this.ctx) return;
    if (!this.rainGain) {
      const n = this._noise(true);
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 1500;
      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.value = 0;
      n.connect(f).connect(this.rainGain).connect(this.master);
      n.start();
    }
    this.rainGain.gain.setTargetAtTime(level * 0.16, this.ctx.currentTime, 0.8);
  }

  setWind(level) {
    if (this.windGain) this.windGain.gain.setTargetAtTime(0.07 + level * 0.2, this.ctx.currentTime, 0.8);
  }

  _notes(freqs, { type = 'triangle', gap = 0.09, vol = 0.22, len = 0.35 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    freqs.forEach((fr, i) => {
      const t = ctx.currentTime + i * gap;
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = fr;
      const g = ctx.createGain();
      this._env(g, t, vol, 0.01, len);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + len + 0.05);
    });
  }

  waveStart() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (const fr of [55, 82.4, 58.3]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = fr;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 420;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      o.connect(f).connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 2.5);
    }
  }

  waveCleared() {
    this._notes([392, 523, 659, 784], { gap: 0.11 });
  }

  pickup() {
    this._notes([660, 990], { type: 'sine', gap: 0.07, vol: 0.2, len: 0.15 });
  }

  powerup(rarity) {
    if (rarity === 'legendary') {
      this._notes([523, 659, 784, 1046, 1318, 1568], { gap: 0.07, vol: 0.2, len: 0.6 });
      this._notes([261, 392, 523], { type: 'sine', gap: 0.0, vol: 0.12, len: 1.4 });
    } else if (rarity === 'epic') {
      this._notes([440, 554, 659, 880], { gap: 0.08 });
    } else {
      this._notes([440, 554, 659], { gap: 0.08 });
    }
  }

  revive() {
    this._notes([330, 440, 554, 659, 880, 1100], { type: 'sine', gap: 0.06, vol: 0.25, len: 0.5 });
  }
}
