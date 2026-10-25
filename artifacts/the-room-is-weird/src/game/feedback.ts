type FeedbackKind = 'jump' | 'land' | 'collect' | 'impact' | 'interact';

let audio: AudioContext | null = null;

/** Small procedural SFX; no external assets or network requests. */
export function playFeedback(kind: FeedbackKind): void {
  try {
    const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    audio ??= new AudioCtor();
    if (audio.state === 'suspended') void audio.resume();
    const ctx = audio;
    const now = ctx.currentTime;
    const presets: Record<FeedbackKind, { start: number; end: number; duration: number; wave: OscillatorType; volume: number }> = {
      jump: { start: 190, end: 310, duration: .09, wave: 'sine', volume: .045 },
      land: { start: 105, end: 58, duration: .12, wave: 'triangle', volume: .065 },
      collect: { start: 520, end: 1040, duration: .16, wave: 'sine', volume: .055 },
      impact: { start: 125, end: 42, duration: .2, wave: 'triangle', volume: .075 },
      interact: { start: 340, end: 260, duration: .07, wave: 'sine', volume: .035 },
    };
    const p = presets[kind];
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = p.wave;
    oscillator.frequency.setValueAtTime(p.start, now);
    oscillator.frequency.exponentialRampToValueAtTime(p.end, now + p.duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(p.volume, now + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, now + p.duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + p.duration + .015);
  } catch { /* Audio is optional; gameplay must still work if blocked. */ }
}
