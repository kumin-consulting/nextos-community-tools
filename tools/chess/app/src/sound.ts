// src/sound.ts
//
// The sounds, synthesised. A chess app needs four noises - a move, a
// capture, a check and the end of the game - and shipping four audio
// files for four noises is silly when an oscillator and a gain envelope
// make better ones: they are a hundred bytes of code, they start
// instantly, and they never 404.
//
// The context is created on the first sound, not at load: browsers
// suspend an AudioContext made before a user gesture, and an app that
// makes one on import leaves a suspended context behind forever.

export type SoundName = 'move' | 'capture' | 'check' | 'castle' | 'end' | 'low-time';

let context: AudioContext | null = null;
let failed = false;

function audio(): AudioContext | null {
  if (failed) return null;
  if (context) return context;
  try {
    const Ctor: typeof AudioContext | undefined =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      failed = true;
      return null;
    }
    context = new Ctor();
    return context;
  } catch {
    failed = true;
    return null;
  }
}

interface Blip {
  /** Hertz at the start and at the end of the blip. */
  from: number;
  to: number;
  /** Seconds. */
  duration: number;
  type: OscillatorType;
  gain: number;
  /** A second blip, a moment later - what makes a capture sound like a
   *  capture rather than a louder move. */
  delay?: number;
}

const VOICES: Record<SoundName, Blip[]> = {
  move: [{ from: 320, to: 210, duration: 0.05, type: 'triangle', gain: 0.16 }],
  capture: [
    { from: 200, to: 90, duration: 0.07, type: 'square', gain: 0.1 },
    { from: 420, to: 150, duration: 0.06, type: 'triangle', gain: 0.14, delay: 0.015 },
  ],
  check: [
    { from: 660, to: 660, duration: 0.05, type: 'sine', gain: 0.16 },
    { from: 880, to: 880, duration: 0.07, type: 'sine', gain: 0.14, delay: 0.07 },
  ],
  castle: [
    { from: 280, to: 280, duration: 0.05, type: 'triangle', gain: 0.13 },
    { from: 280, to: 220, duration: 0.05, type: 'triangle', gain: 0.13, delay: 0.08 },
  ],
  end: [
    { from: 520, to: 520, duration: 0.12, type: 'sine', gain: 0.14 },
    { from: 390, to: 390, duration: 0.18, type: 'sine', gain: 0.14, delay: 0.12 },
    { from: 260, to: 260, duration: 0.3, type: 'sine', gain: 0.13, delay: 0.26 },
  ],
  'low-time': [{ from: 1200, to: 1200, duration: 0.03, type: 'sine', gain: 0.08 }],
};

/** Plays one of the app's sounds. Silent and harmless when the browser
 *  has no audio, when the context cannot start, or when `enabled` is
 *  false - a sound is never worth an exception. */
export function playSound(name: SoundName, enabled: boolean): void {
  if (!enabled) return;
  const ctx = audio();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    for (const blip of VOICES[name]) {
      const start = now + (blip.delay ?? 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = blip.type;
      osc.frequency.setValueAtTime(blip.from, start);
      if (blip.to !== blip.from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, blip.to), start + blip.duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(blip.gain, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + blip.duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + blip.duration + 0.02);
    }
  } catch {
    // An audio failure must never stop a move being played.
  }
}

/** Picks the right sound for a move that has just been played. */
export function soundForMove(options: {
  capture: boolean;
  castle: boolean;
  check: boolean;
  gameOver: boolean;
}): SoundName {
  if (options.gameOver) return 'end';
  if (options.check) return 'check';
  if (options.castle) return 'castle';
  if (options.capture) return 'capture';
  return 'move';
}

/** Releases the audio context - called when the window unmounts, so a
 *  closed app leaves nothing running. */
export function disposeSound(): void {
  if (context) {
    void context.close().catch(() => undefined);
    context = null;
  }
}
