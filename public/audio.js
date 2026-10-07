// Synthesised sound effects (WebAudio only, no files). Silent until the first
// user gesture creates/resumes the context; mute is remembered in localStorage.

const MAX_VOICES = 12;

export class Sfx {
  constructor() {
    this.ctx = null;
    this.voices = 0;
    try {
      this.muted = localStorage.getItem("modou-muted") === "1";
    } catch {
      this.muted = false;
    }
    const unlock = () => this.unlock();
    addEventListener("keydown", unlock);
    addEventListener("pointerdown", unlock);
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.35;
      this.master.connect(comp);
      comp.connect(ctx.destination);
      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
      // a suspend can drop onended callbacks; start the voice count afresh on resume
      ctx.onstatechange = () => {
        if (ctx.state === "running") this.voices = 0;
      };
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    try {
      localStorage.setItem("modou-muted", m ? "1" : "0");
    } catch {}
    if (this.master) this.master.gain.value = m ? 0 : 0.35;
  }

  ready() {
    return this.ctx && this.ctx.state === "running" && !this.muted && this.voices < MAX_VOICES;
  }

  // one enveloped oscillator
  tone(type, f0, f1, dur, gain, delay = 0) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    this.voices++;
    o.onended = () => (this.voices = Math.max(0, this.voices - 1));
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // filtered noise burst, filter sweeping f0 -> f1
  hiss(kind, f0, f1, dur, gain, delay = 0) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const fl = c.createBiquadFilter();
    fl.type = kind;
    fl.frequency.setValueAtTime(f0, t);
    fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    fl.Q.value = 1.2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(this.master);
    this.voices++;
    s.onended = () => (this.voices = Math.max(0, this.voices - 1));
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  play(name, arg = 0) {
    if (!this.ready()) return;
    switch (name) {
      case "hit": {
        const k = Math.min(1, arg / 120);
        this.tone("sine", 170 - 40 * k, 45, 0.12 + 0.18 * k, 0.35 + 0.5 * k);
        this.hiss("lowpass", 1400, 200, 0.08 + 0.1 * k, 0.25 + 0.4 * k);
        break;
      }
      case "block":
        this.tone("triangle", 980, 700, 0.05, 0.18);
        break;
      case "ko":
        this.hiss("bandpass", 3500, 250, 0.7, 0.6);
        this.tone("sine", 110, 98, 1.6, 0.5);
        this.tone("sine", 297, 280, 1.1, 0.18);
        break;
      case "jump":
        this.hiss("highpass", 1800, 900, 0.12, 0.12);
        break;
      case "special":
        this.hiss("bandpass", 700, 2600, 0.09, 0.3);
        this.tone("sine", 520, 880, 0.08, 0.12);
        break;
      case "tick":
        this.tone("sine", 660, 660, 0.07, 0.25);
        break;
      case "start":
        this.tone("sine", 880, 880, 0.25, 0.3);
        this.tone("sine", 1320, 1320, 0.4, 0.2, 0.06);
        break;
      case "respawn":
        this.tone("sine", 300, 600, 0.25, 0.12);
        break;
      case "end":
        this.tone("sine", 523, 523, 0.4, 0.25);
        this.tone("sine", 392, 392, 0.4, 0.25, 0.22);
        this.tone("sine", 262, 262, 0.9, 0.3, 0.44);
        break;
    }
  }

  event(ev) {
    if (ev.type === "hit") this.play(ev.shielded ? "block" : "hit", ev.kb || 0);
    else if (ev.type === "ko") this.play("ko");
    else if (ev.type === "jump") this.play("jump");
    else if (ev.type === "special") this.play("special");
    else if (ev.type === "start") this.play("start");
    else if (ev.type === "respawn") this.play("respawn");
  }
}
