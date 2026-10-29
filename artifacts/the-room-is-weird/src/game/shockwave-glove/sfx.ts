// Fully procedural Web Audio: no audio files, no network. Safe if audio is blocked.

export class LevelSfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private ambience: { stop: () => void } | null = null;
  private volume = 0.6;

  private get(): AudioContext | null {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return null;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume * 0.5;
        const comp = this.ctx.createDynamicsCompressor();
        this.master.connect(comp);
        comp.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch { return null; }
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume * 0.5, this.ctx.currentTime, 0.05);
  }

  start() { this.get(); }

  tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.2, endFreq?: number, delay = 0) {
    const c = this.get(); if (!c || !this.master) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.03);
  }

  noise(dur: number, gain = 0.2, lowpass = 3000, sweepTo?: number, delay = 0, highpass = 0) {
    const c = this.get(); if (!c || !this.master) return;
    if (!this.noiseBuf) {
      this.noiseBuf = c.createBuffer(1, c.sampleRate * 1.5, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(lowpass, t);
    if (sweepTo) lp.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(lp);
    if (highpass > 0) { const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = highpass; lp.connect(hp); hp.connect(g); } else lp.connect(g);
    g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.03);
  }

  pickup() { this.tone(520, 0.14, 'triangle', 0.16, 1040); this.tone(780, 0.2, 'sine', 0.12, 1560, 0.07); }
  interact() { this.tone(340, 0.07, 'sine', 0.1, 260); }
  denied() { this.tone(180, 0.2, 'sawtooth', 0.08, 120); }
  clank() { this.noise(0.12, 0.25, 4200, 600, 0, 900); this.tone(210, 0.18, 'square', 0.1, 90); }
  zap() { this.noise(0.25, 0.22, 7000, 500, 0, 1500); this.tone(1300, 0.2, 'sawtooth', 0.09, 180); }
  whoosh(dur = 0.6, gain = 0.25) { this.noise(dur, gain, 600, 5200, 0, 200); }
  boom(gain = 0.5) { this.tone(95, 0.9, 'sine', gain, 28); this.noise(0.7, gain * 0.7, 1800, 80); }
  charge(dur = 3) { this.tone(80, dur, 'sawtooth', 0.12, 640); this.tone(160, dur, 'sine', 0.14, 1280); this.noise(dur, 0.12, 400, 6000, 0, 300); }
  powerUp() { this.tone(260, 1.2, 'sawtooth', 0.12, 1040); this.tone(520, 1.2, 'triangle', 0.1, 2080); this.noise(1.1, 0.14, 800, 7000); }
  doorRumble(dur = 3) { this.noise(dur, 0.32, 280, 120); this.tone(54, dur, 'sawtooth', 0.1, 38); this.tone(70, dur, 'square', 0.04, 55); }
  lockBeep(ok = false) { this.tone(ok ? 880 : 440, 0.16, 'square', 0.07); }
  heartbeat() { this.tone(62, 0.18, 'sine', 0.35, 38); this.tone(58, 0.2, 'sine', 0.28, 34, 0.2); }
  impact() { this.boom(0.8); this.noise(0.5, 0.5, 5000, 300, 0, 600); this.tone(1800, 0.25, 'sawtooth', 0.12, 120); }
  crash() { this.noise(1.1, 0.55, 2400, 100); this.tone(70, 0.8, 'sine', 0.35, 30); this.noise(0.4, 0.3, 6000, 800, 0.1, 1200); }
  roar() { this.tone(210, 0.8, 'sawtooth', 0.12, 90); this.noise(0.8, 0.2, 1600, 300); }
  footstep() { this.tone(86, 0.07, 'sine', 0.05, 60); }

  startAmbience(kind: 'cell' | 'tunnel' | 'arena') {
    this.stopAmbience();
    const c = this.get(); if (!c || !this.master) return;
    const g = c.createGain(); g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(kind === 'arena' ? 0.07 : 0.05, c.currentTime + 1.2);
    g.connect(this.master);
    const base = kind === 'cell' ? 55 : kind === 'tunnel' ? 48 : 41;
    const oscs = [base, base * 1.5, base * 2.02].map((f, i) => {
      const o = c.createOscillator(); o.type = i === 0 ? 'sawtooth' : 'sine'; o.frequency.value = f;
      const og = c.createGain(); og.gain.value = i === 0 ? 0.35 : 0.2;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
      o.connect(lp); lp.connect(og); og.connect(g); o.start(); return o;
    });
    this.ambience = { stop: () => { try { g.gain.setTargetAtTime(0.0001, c.currentTime, 0.3); oscs.forEach((o) => o.stop(c.currentTime + 1.2)); } catch { /* ignore */ } } };
  }
  stopAmbience() { this.ambience?.stop(); this.ambience = null; }

  dispose() { this.stopAmbience(); void this.ctx?.close(); this.ctx = null; this.master = null; }
}
