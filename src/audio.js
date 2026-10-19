(function (PopoGame) {
'use strict';

// Music and effects are synthesised with the Web Audio API; the voice lines are recorded
// (tools/build-voice.py). Groups: music, sfx and voice.

const BPM = 84;
const EIGHTH = 60 / BPM / 2;
const CHORDS = [
  [261.63, 329.63, 392.0, 523.25],   // C
  [220.0, 261.63, 329.63, 440.0],    // Am
  [174.61, 220.0, 261.63, 349.23],   // F
  [196.0, 246.94, 293.66, 392.0],    // G
];

// Must match voice_key() in tools/build-voice.py.
function voiceKey(who, text) {
  return `${who}:${text.replace(/\*/g, '').replace(/…/g, '...').replace(/’/g, "'").split(/\s+/).filter(Boolean).join(' ')}`.toLowerCase();
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicOn = false;
    this.travel = false;
    this.beat = 0;
    this.nextBeat = 0;
    this.timer = null;
    this.effectSources = new Set();
    this.voiceBuffers = new Map();
    this.voiceSource = null;
  }

  // Recorded voice lines (tools/build-voice.py), decoded up front with an offline context so
  // they are ready before the first tap. Decoded buffers play in the live context later.
  prepareVoices(data) {
    const entries = Object.entries(data || {});
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!entries.length || !OAC) return Promise.resolve();
    const decoder = new OAC(1, 1, 24000);
    return Promise.all(entries.map(([key, url]) => {
      const bin = atob(url.slice(url.indexOf(',') + 1));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      return new Promise((resolve) => decoder.decodeAudioData(bytes.buffer, resolve, () => resolve(null)))
        .then((buf) => { if (buf) this.voiceBuffers.set(key, buf); });
    }));
  }

  // Plays a recorded line and returns its length in seconds (0 when there is no recording,
  // so the caller falls back to the synthesized voice). The music ducks under the voice.
  speak(who, text) {
    const buf = this.voiceBuffers.get(voiceKey(who, text));
    if (!this.ctx || !buf) return 0;
    this.stopVoice();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.voice);
    const now = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(now);
    this.music.gain.setTargetAtTime(0.18, now, 0.05);
    src.onended = () => {
      if (this.voiceSource !== src) return;
      this.voiceSource = null;
      this.music.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.25);
    };
    src.start();
    this.voiceSource = src;
    return buf.duration;
  }

  stopVoice() {
    const src = this.voiceSource;
    if (!src) return;
    this.voiceSource = null;
    try { src.stop(); } catch (e) { /* already stopped */ }
    this.music.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.25);
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // iPhone and iPad: play through the ringer's silent switch, like a game should
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older WebKit */ }
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(ctx.destination);
    this.music = this.gainNode(0.5, this.master);
    this.sfx = this.gainNode(0.9, this.master);
    this.voice = this.gainNode(1, this.master);

    // a touch of shimmer for the music bed
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = EIGHTH * 3;
    const feedback = this.gainNode(0.28, this.delay);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2200;
    this.delay.connect(tone);
    tone.connect(feedback);
    tone.connect(this.music);

    this.noiseBuffer = this.makeNoise();
    this.startAmbience();
  }

  gainNode(value, dest) {
    const g = this.ctx.createGain();
    g.gain.value = value;
    g.connect(dest);
    return g;
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  startAmbience() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const g = this.gainNode(0.045, this.music);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = this.gainNode(0.02, g.gain);
    lfo.connect(lfoGain);
    src.connect(lp);
    lp.connect(g);
    src.start();
    lfo.start();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  suspend() {
    if (this.ctx && this.ctx.state !== 'closed') this.ctx.suspend();
  }

  resume() {
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') this.ctx.resume();
    // notes are queued a little ahead; don't schedule the same beat twice
    this.nextBeat = Math.max(this.nextBeat, this.ctx.currentTime + 0.05);
  }

  setTravel(on) {
    this.travel = on;
  }

  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.beat = 0;
    this.nextBeat = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 90);
  }

  stopMusic() {
    this.musicOn = false;
    clearInterval(this.timer);
  }

  schedule() {
    if (this.ctx.state !== 'running') return;
    while (this.nextBeat < this.ctx.currentTime + 0.3) {
      this.playBeat(this.beat, this.nextBeat);
      this.beat += 1;
      this.nextBeat += EIGHTH;
    }
  }

  playBeat(i, t) {
    const chord = CHORDS[Math.floor(i / 16) % CHORDS.length];
    const step = i % 16;
    const pattern = [0, 2, 1, 3, 2, 3, 1, 2];
    const note = chord[pattern[step % 8]] * (step >= 8 ? 2 : 1);
    this.tone({ freq: note, type: 'triangle', t, dur: 0.32, gain: 0.07, attack: 0.01, dest: this.music, send: 0.5 });
    if (step % 8 === 0) this.tone({ freq: chord[0] / 2, type: 'sine', t, dur: 1.3, gain: 0.11, attack: 0.03, dest: this.music });
    if (step === 0) this.bell(chord[3] * 2, t, 0.05);
    if (this.travel && step % 4 === 0) this.noise({ t, dur: 0.28, type: 'bandpass', freq: 900, q: 0.8, gain: 0.08, to: 300, dest: this.music });
  }

  tone({ freq, type = 'sine', t, dur = 0.2, gain = 0.2, attack = 0.005, to = null, dest = this.sfx, send = 0 }) {
    if (!this.ctx) return;
    const start = t ?? this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, start + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(gain, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(dest);
    if (send && this.delay) {
      const s = this.gainNode(send, this.delay);
      g.connect(s);
    }
    this.trackEffect(osc, dest);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  bell(freq, t, gain = 0.1) {
    this.tone({ freq, type: 'sine', t, dur: 1.2, gain, dest: this.music, send: 0.6 });
    this.tone({ freq: freq * 2.76, type: 'sine', t, dur: 0.5, gain: gain * 0.25, dest: this.music });
  }

  noise({ t, dur = 0.3, type = 'lowpass', freq = 1000, q = 1, gain = 0.3, to = null, dest = this.sfx }) {
    if (!this.ctx) return;
    const start = t ?? this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, start);
    if (to) f.frequency.exponentialRampToValueAtTime(to, start + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    this.trackEffect(src, dest);
    src.start(start);
    src.stop(start + dur + 0.05);
  }

  trackEffect(source, destination) {
    if (destination !== this.sfx) return;
    this.effectSources.add(source);
    source.onended = () => { this.effectSources.delete(source); source.disconnect(); };
  }

  stopEffects() {
    for (const source of this.effectSources) {
      try { source.stop(); } catch (e) { /* already ended */ }
      source.disconnect();
    }
    this.effectSources.clear();
    if (this.ctx && this.music) {
      this.music.gain.cancelScheduledValues(this.ctx.currentTime);
      this.music.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.04);
    }
  }

  // The winch's ratchet, one tick per notch, for as long as the net is moving.
  crank(seconds) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const ticks = Math.floor(seconds / 0.09);
    for (let i = 0; i < ticks; i += 1) {
      const t = now + i * 0.09;
      this.noise({ t, dur: 0.025, type: 'highpass', freq: 2200, gain: 0.07 });
      if (i % 2 === 0) this.tone({ freq: 520, to: 470, t, type: 'triangle', dur: 0.04, gain: 0.03 });
    }
  }

  play(name) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const seq = (notes, gap, opts) => notes.forEach((n, i) => this.tone({ freq: n, t: now + i * gap, ...opts }));
    switch (name) {
      case 'ui': this.tone({ freq: 640, to: 520, dur: 0.07, gain: 0.12 }); break;
      case 'whoosh': this.noise({ dur: 0.38, type: 'bandpass', freq: 500, to: 2400, q: 1.2, gain: 0.25 }); break;
      case 'splashSmall': this.noise({ dur: 0.26, type: 'lowpass', freq: 1800, to: 500, gain: 0.3 }); this.tone({ freq: 900, to: 320, dur: 0.14, gain: 0.1 }); break;
      case 'collect': seq([523.25, 659.25, 783.99], 0.08, { dur: 0.25, gain: 0.14 }); this.noise({ dur: 0.12, type: 'lowpass', freq: 500, gain: 0.2 }); break;
      case 'success':
        [523.25, 659.25, 783.99, 1046.5].forEach((n, i) => this.bell(n, now + i * 0.12, 0.12));
        break;
      case 'puff': this.tone({ freq: 420, to: 740, dur: 0.09, gain: 0.075 }); this.noise({ dur: 0.06, type: 'lowpass', freq: 750, gain: 0.04 }); break;
      case 'bubbles': seq([360, 480, 620], 0.07, { type: 'sine', dur: 0.07, gain: 0.045 }); break;
      case 'drip': this.tone({ freq: 1100, to: 550, dur: 0.09, gain: 0.05 }); break;
      case 'paddle': this.noise({ dur: 0.25, type: 'bandpass', freq: 900, to: 300, q: 0.8, gain: 0.14 }); break;
      case 'complete': [392.0, 523.25, 659.25, 783.99].forEach((n, i) => { this.tone({ freq: n, t: now + i * 0.15, type: 'triangle', dur: 0.5, gain: 0.12 }); this.bell(n * 2, now + i * 0.15, 0.06); }); break;
      case 'hint': this.tone({ freq: 880, dur: 0.18, gain: 0.07 }); break;
      case 'talk': { const f = 250 + Math.random() * 130; this.tone({ freq: f, to: f * (1.1 + Math.random() * 0.25), type: 'triangle', dur: 0.07, gain: 0.08 }); break; }
      case 'narrate': this.bell(523.25, now, 0.07); this.bell(783.99, now + 0.12, 0.05); break;
      case 'woah': this.tone({ freq: 380, to: 1150, type: 'sine', dur: 0.34, gain: 0.11 }); this.tone({ freq: 1150, to: 720, t: now + 0.32, type: 'sine', dur: 0.3, gain: 0.08 }); break;
      case 'leap': this.noise({ dur: 0.5, type: 'bandpass', freq: 400, to: 2600, q: 1.1, gain: 0.22 }); this.tone({ freq: 300, to: 760, dur: 0.4, gain: 0.08, type: 'triangle' }); break;
      case 'boing': this.tone({ freq: 170, to: 560, type: 'sine', dur: 0.22, gain: 0.12 }); this.tone({ freq: 560, to: 420, t: now + 0.2, type: 'sine', dur: 0.16, gain: 0.07 }); break;
      // comic sound effects for Popo's entrance
      case 'honk': [0, 0.2].forEach((d) => { this.tone({ freq: 420, to: 380, type: 'square', t: now + d, dur: 0.13, gain: 0.07 }); this.tone({ freq: 630, to: 560, type: 'triangle', t: now + d, dur: 0.13, gain: 0.05 }); }); break;
      case 'skid': this.tone({ freq: 1650, to: 1250, type: 'sawtooth', dur: 0.5, gain: 0.035 }); this.tone({ freq: 1720, to: 1300, type: 'sawtooth', dur: 0.5, gain: 0.03 }); this.noise({ dur: 0.5, type: 'bandpass', freq: 2600, to: 1500, q: 2, gain: 0.12 }); break;
      case 'poof': this.noise({ dur: 0.32, type: 'lowpass', freq: 1800, to: 240, gain: 0.32 }); this.tone({ freq: 160, to: 70, dur: 0.22, gain: 0.12 }); break;
      case 'tada': [523.25, 659.25, 783.99, 1046.5].forEach((n, i) => { this.tone({ freq: n, t: now + i * 0.07, type: 'triangle', dur: i === 3 ? 0.5 : 0.12, gain: 0.09 }); }); this.bell(2093, now + 0.21, 0.05); break;
      case 'giggle': [0, 0.07, 0.14, 0.21].forEach((d, i) => this.tone({ freq: 760 + i * 90, to: 1050 + i * 90, type: 'triangle', t: now + d, dur: 0.06, gain: 0.06 })); break;
      case 'word': { const f = 700 + Math.random() * 260; this.tone({ freq: f, to: f * 1.15, type: 'sine', dur: 0.05, gain: 0.04 }); break; }
      case 'cheer': [523.25, 659.25, 783.99].forEach((n, i) => this.tone({ freq: n, t: now + i * 0.07, type: 'triangle', dur: 0.16, gain: 0.08 })); break;
      case 'bloop': this.tone({ freq: 420, to: 980, dur: 0.12, gain: 0.09 }); this.tone({ freq: 620, to: 1300, t: now + 0.08, dur: 0.09, gain: 0.05 }); break;
      // the net puzzle: picking the corner up, letting it go off its place, it clicking home
      case 'grab': this.tone({ freq: 320, to: 620, dur: 0.09, gain: 0.14 }); this.noise({ dur: 0.04, type: 'highpass', freq: 2500, gain: 0.05 }); break;
      case 'wobble': this.tone({ freq: 300, to: 240, type: 'triangle', dur: 0.14, gain: 0.07 }); this.tone({ freq: 260, to: 290, t: now + 0.12, type: 'triangle', dur: 0.12, gain: 0.05 }); break;
      case 'snap': this.noise({ dur: 0.04, type: 'highpass', freq: 3000, gain: 0.12 }); this.tone({ freq: 740, to: 980, dur: 0.1, gain: 0.12 }); this.tone({ freq: 1480, dur: 0.14, t: now + 0.05, gain: 0.05 }); break;
      case 'ready': this.tone({ freq: 523.25, to: 1046.5, type: 'triangle', dur: 0.16, gain: 0.1 }); this.bell(1568, now + 0.1, 0.05); break;
      case 'slip': this.tone({ freq: 620, to: 240, type: 'triangle', dur: 0.3, gain: 0.1 }); this.noise({ dur: 0.18, type: 'bandpass', freq: 1200, to: 400, q: 1, gain: 0.08 }); break;
      // measurements changing under the finger, and the Check press
      case 'tick': this.tone({ freq: 1320, dur: 0.035, gain: 0.045 }); break;
      case 'check': this.tone({ freq: 520, to: 780, type: 'triangle', dur: 0.12, gain: 0.1 }); this.noise({ dur: 0.04, type: 'highpass', freq: 2500, gain: 0.05 }); break;
      case 'catch': seq([523.25, 659.25, 783.99, 1046.5], 0.07, { type: 'triangle', dur: 0.2, gain: 0.08 }); this.noise({ dur: 0.3, type: 'lowpass', freq: 900, to: 300, gain: 0.12 }); break;
      default: break;
    }
  }
}

Object.assign(PopoGame, { AudioEngine });
})(window.PopoGame = window.PopoGame || {});
