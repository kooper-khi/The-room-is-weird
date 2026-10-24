import type { PuzzleResult } from "./puzzle";

type SoundName = PuzzleResult["sound"] | "footstep" | "start";

export class RoomAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: OscillatorNode[] = [];
  private volume = 0.62;

  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.volume * 0.34, this.context.currentTime, 0.08);
    }
  }

  async start() {
    const context = this.getContext();
    if (context.state === "suspended") await context.resume();
    if (this.ambience.length === 0) {
      const master = this.master;
      if (!master) return;
      for (const [frequency, level] of [[110, 0.035], [164.8, 0.016], [220, 0.009]] as const) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.value = level;
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start();
        this.ambience.push(oscillator);
      }
    }
    this.play("start");
  }

  play(name: SoundName) {
    const context = this.getContext();
    if (context.state === "suspended") void context.resume();
    if (!this.master || this.volume === 0) return;

    const now = context.currentTime;
    const presets: Record<SoundName, { notes: number[]; duration: number; type: OscillatorType; gain: number }> = {
      start: { notes: [392, 523.25], duration: 0.32, type: "sine", gain: 0.11 },
      pickup: { notes: [660, 880], duration: 0.2, type: "triangle", gain: 0.14 },
      transform: { notes: [174, 261.6, 392, 523.25], duration: 0.72, type: "sawtooth", gain: 0.09 },
      switch: { notes: [523.25, 659.25, 783.99], duration: 0.42, type: "triangle", gain: 0.12 },
      door: { notes: [220, 330], duration: 0.55, type: "sine", gain: 0.12 },
      complete: { notes: [523.25, 659.25, 783.99, 1046.5], duration: 0.8, type: "sine", gain: 0.12 },
      comedy: { notes: [440, 349.23], duration: 0.24, type: "triangle", gain: 0.08 },
      denied: { notes: [180, 147], duration: 0.2, type: "sine", gain: 0.07 },
      footstep: { notes: [90], duration: 0.08, type: "sine", gain: 0.035 },
    };
    const preset = presets[name];
    preset.notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = now + index * (name === "transform" ? 0.13 : 0.075);
      oscillator.type = preset.type;
      oscillator.frequency.setValueAtTime(frequency, startAt);
      if (name === "transform") {
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(60, frequency * 0.73), startAt + preset.duration);
      }
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.linearRampToValueAtTime(preset.gain, startAt + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + preset.duration);
      oscillator.connect(gain);
      gain.connect(this.master!);
      oscillator.start(startAt);
      oscillator.stop(startAt + preset.duration + 0.02);
    });
  }

  dispose() {
    this.ambience.forEach((oscillator) => oscillator.stop());
    this.ambience = [];
    void this.context?.close();
    this.context = null;
    this.master = null;
  }

  private getContext() {
    if (!this.context) {
      const AudioContextConstructor = window.AudioContext;
      this.context = new AudioContextConstructor();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume * 0.34;
      this.master.connect(this.context.destination);
    }
    return this.context;
  }
}
