// src/lib/clock.ts
//
// Two chess clocks with a Fischer increment. Pure and time-source free:
// every function takes the current time in milliseconds, so the tests
// can run a whole game in an instant and the UI can drive it from
// requestAnimationFrame without either of them owning the rules.
//
// The state is the two remaining times plus the moment the running
// clock was last read. Nothing ticks by itself; `clockAt(state, now)`
// tells you what the faces read at `now`, which means a tab that was
// asleep for ten minutes comes back showing the truth rather than ten
// minutes of missed intervals.

import type { Color } from './types';
import { BLACK, WHITE } from './types';

export interface TimeControl {
  /** Starting time per side, in milliseconds. */
  initialMs: number;
  /** Added after each completed move, in milliseconds. */
  incrementMs: number;
}

export interface ClockState {
  control: TimeControl;
  /** Remaining time per colour, as of `since`. */
  remaining: [number, number];
  /** Which colour's clock is running, or null when both are stopped. */
  running: Color | null;
  /** The timestamp `remaining` was last correct at. */
  since: number;
  /** The colour whose flag fell, or null. */
  flagged: Color | null;
}

export const BLITZ_5_0: TimeControl = { initialMs: 5 * 60_000, incrementMs: 0 };
export const BLITZ_3_2: TimeControl = { initialMs: 3 * 60_000, incrementMs: 2_000 };
export const RAPID_10_0: TimeControl = { initialMs: 10 * 60_000, incrementMs: 0 };
export const RAPID_15_10: TimeControl = { initialMs: 15 * 60_000, incrementMs: 10_000 };
export const CLASSICAL_30_0: TimeControl = { initialMs: 30 * 60_000, incrementMs: 0 };

export const PRESETS: Array<{ label: string; control: TimeControl }> = [
  { label: '3 + 2 blitz', control: BLITZ_3_2 },
  { label: '5 + 0 blitz', control: BLITZ_5_0 },
  { label: '10 + 0 rapid', control: RAPID_10_0 },
  { label: '15 + 10 rapid', control: RAPID_15_10 },
  { label: '30 + 0 classical', control: CLASSICAL_30_0 },
];

export function createClock(control: TimeControl, now: number): ClockState {
  return {
    control,
    remaining: [control.initialMs, control.initialMs],
    running: null,
    since: now,
    flagged: null,
  };
}

/** The remaining time on both clocks at `now`, with the running side's
 *  elapsed time taken off. Never returns a negative number. */
export function clockAt(state: ClockState, now: number): [number, number] {
  const out: [number, number] = [state.remaining[WHITE], state.remaining[BLACK]];
  if (state.running !== null && state.flagged === null) {
    const elapsed = Math.max(0, now - state.since);
    out[state.running] = Math.max(0, out[state.running] - elapsed);
  }
  return out;
}

/** Folds elapsed time into `remaining` and moves `since` forward. Every
 *  state change goes through this first, so no millisecond is counted
 *  twice or lost. */
function settle(state: ClockState, now: number): ClockState {
  const remaining = clockAt(state, now);
  const flagged =
    state.flagged ?? (state.running !== null && remaining[state.running] <= 0 ? state.running : null);
  return { ...state, remaining, since: now, flagged };
}

/** Starts (or hands over) the clock to `color`. */
export function startClock(state: ClockState, color: Color, now: number): ClockState {
  const settled = settle(state, now);
  if (settled.flagged !== null) return settled;
  return { ...settled, running: color };
}

export function stopClock(state: ClockState, now: number): ClockState {
  return { ...settle(state, now), running: null };
}

/**
 * The player of `color` completed a move at `now`: their elapsed time
 * comes off, their increment goes on, and the other clock starts. A
 * flag that fell before the move landed stands - the increment does not
 * rescue it, which is exactly how an arbiter would rule it.
 */
export function pressClock(state: ClockState, color: Color, now: number): ClockState {
  const settled = settle(state, now);
  if (settled.flagged !== null) return settled;
  const remaining: [number, number] = [settled.remaining[WHITE], settled.remaining[BLACK]];
  remaining[color] += settled.control.incrementMs;
  return {
    ...settled,
    remaining,
    running: (color ^ 1) as Color,
  };
}

/** True when `color`'s time has run out at `now`. */
export function hasFlagged(state: ClockState, color: Color, now: number): boolean {
  if (state.flagged === color) return true;
  return clockAt(state, now)[color] <= 0;
}

/** 'mm:ss' above ten seconds, 'm:ss.d' below - the convention every
 *  clock uses, because the tenths only matter when they matter. */
export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = clamped / 1000;
  if (clamped < 10_000) {
    const seconds = Math.floor(totalSeconds);
    const tenths = Math.floor((clamped - seconds * 1000) / 100);
    return `0:0${seconds}.${tenths}`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds - minutes * 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}:${String(minutes - hours * 60).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** 'the last ten seconds' - when the UI should turn the clock red and
 *  the sound should start ticking. */
export function isCritical(ms: number): boolean {
  return ms <= 10_000;
}

/** Parses '5+3', '3 + 2', '10', '1:30+0' into a time control. Returns
 *  null when the text says nothing usable. */
export function parseTimeControl(text: string): TimeControl | null {
  const match = /^\s*(\d+)(?::(\d+))?\s*(?:\+\s*(\d+))?\s*$/.exec(text);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = match[2] ? Number(match[2]) : 0;
  const increment = match[3] ? Number(match[3]) : 0;
  if (minutes === 0 && seconds === 0) return null;
  return { initialMs: (minutes * 60 + seconds) * 1000, incrementMs: increment * 1000 };
}

/** The PGN TimeControl tag's value for a control: '300+2'. */
export function timeControlTag(control: TimeControl): string {
  return `${Math.round(control.initialMs / 1000)}+${Math.round(control.incrementMs / 1000)}`;
}
