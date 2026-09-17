// src/lib/scheduler.ts
//
// The spacing algorithm: SM-2 as everybody actually ships it today -
// learning steps in minutes, relearning steps after a lapse, a
// graduating and an easy interval, an ease factor with a 1.3 floor, an
// interval modifier, deterministic fuzz, per-deck daily limits and a
// leech threshold. FSRS in spirit (short steps, a lapse that costs the
// card most of its interval, intervals that grow with how well you
// actually answer) without shipping a model nobody here can retrain.
//
// Everything is pure: `applyRating` takes a card's state and returns the
// next one, and `project` runs the same function for all four buttons so
// the interval a button PROMISES is exactly the interval you get - fuzz
// included, because the fuzz is seeded by the card's id and rep count
// rather than drawn at the moment of answering.

import type { CardState, DeckSettings, Projection, Rating, ReviewContext } from './types';
import { DAY, MINUTE, dayIndexOf, dueAfterDays, formatDelay } from './time';

export const DEFAULT_SETTINGS: DeckSettings = {
  newPerDay: 20,
  reviewsPerDay: 200,
  learningSteps: [1, 10],
  relearningSteps: [10],
  graduatingInterval: 1,
  easyInterval: 4,
  startingEase: 2.5,
  easyBonus: 1.3,
  hardFactor: 1.2,
  lapseFactor: 0,
  minimumInterval: 1,
  maximumInterval: 36500,
  intervalModifier: 1,
  fuzz: true,
  leechThreshold: 8,
  dayCutoffHour: 4,
  typedAnswers: false,
  order: 'due',
};

export const EASE_FLOOR = 1.3;
export const RATINGS: Rating[] = [1, 2, 3, 4];
export const RATING_LABELS: Record<Rating, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

/* ---------------------------------------------------------- settings */

function positiveNumber(value: unknown, fallback: number, min = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min ? value : fallback;
}

function steps(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value.map((n) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0)).filter(Boolean);
  return cleaned.length ? cleaned : fallback;
}

/** Fills in and sanity-checks a deck's saved settings. A deck file that
 *  somebody hand-edited into nonsense still schedules, with the default
 *  for whatever did not make sense. */
export function resolveSettings(partial?: Partial<DeckSettings> | null): DeckSettings {
  const p = partial ?? {};
  return {
    newPerDay: Math.round(positiveNumber(p.newPerDay, DEFAULT_SETTINGS.newPerDay)),
    reviewsPerDay: Math.round(positiveNumber(p.reviewsPerDay, DEFAULT_SETTINGS.reviewsPerDay)),
    learningSteps: steps(p.learningSteps, DEFAULT_SETTINGS.learningSteps),
    relearningSteps: steps(p.relearningSteps, DEFAULT_SETTINGS.relearningSteps),
    graduatingInterval: Math.max(1, Math.round(positiveNumber(p.graduatingInterval, DEFAULT_SETTINGS.graduatingInterval, 1))),
    easyInterval: Math.max(1, Math.round(positiveNumber(p.easyInterval, DEFAULT_SETTINGS.easyInterval, 1))),
    startingEase: Math.max(EASE_FLOOR, positiveNumber(p.startingEase, DEFAULT_SETTINGS.startingEase, EASE_FLOOR)),
    easyBonus: Math.max(1, positiveNumber(p.easyBonus, DEFAULT_SETTINGS.easyBonus, 1)),
    hardFactor: Math.max(0.5, positiveNumber(p.hardFactor, DEFAULT_SETTINGS.hardFactor, 0.5)),
    lapseFactor: Math.min(1, positiveNumber(p.lapseFactor, DEFAULT_SETTINGS.lapseFactor)),
    minimumInterval: Math.max(1, Math.round(positiveNumber(p.minimumInterval, DEFAULT_SETTINGS.minimumInterval, 1))),
    maximumInterval: Math.max(1, Math.round(positiveNumber(p.maximumInterval, DEFAULT_SETTINGS.maximumInterval, 1))),
    intervalModifier: Math.max(0.1, positiveNumber(p.intervalModifier, DEFAULT_SETTINGS.intervalModifier, 0.1)),
    fuzz: typeof p.fuzz === 'boolean' ? p.fuzz : DEFAULT_SETTINGS.fuzz,
    leechThreshold: Math.max(1, Math.round(positiveNumber(p.leechThreshold, DEFAULT_SETTINGS.leechThreshold, 1))),
    dayCutoffHour: Math.min(23, Math.max(0, Math.round(positiveNumber(p.dayCutoffHour, DEFAULT_SETTINGS.dayCutoffHour)))),
    typedAnswers: typeof p.typedAnswers === 'boolean' ? p.typedAnswers : DEFAULT_SETTINGS.typedAnswers,
    order: p.order === 'random' || p.order === 'added' ? p.order : 'due',
  };
}

/** Only what differs from the defaults is written back to the sidecar,
 *  so a deck's JSON stays readable and a later change to a default
 *  reaches decks that never overrode it. */
export function settingsDiff(settings: DeckSettings): Partial<DeckSettings> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof DeckSettings>) {
    const value = settings[key];
    const base = DEFAULT_SETTINGS[key];
    const same = Array.isArray(value) && Array.isArray(base) ? value.join(',') === base.join(',') : value === base;
    if (!same) out[key] = value;
  }
  return out as Partial<DeckSettings>;
}

export function newCardState(now: number, settings: DeckSettings): CardState {
  return { state: 'new', due: now, interval: 0, ease: settings.startingEase, reps: 0, lapses: 0, step: 0 };
}

/* -------------------------------------------------------------- fuzz */

/** 0..1 from a string - the same seed always gives the same number, so a
 *  projected interval and the interval you actually get cannot disagree. */
export function hash01(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193) >>> 0;
  // FNV-1a alone leaves its high bits almost unchanged for a short seed -
  // every one-character seed would draw the same fuzz - so finish with an
  // avalanche mix (the lowbias32 finaliser) before taking the top bits.
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

/** Anki's fuzz bands: a quarter of a short interval, a twentieth of a
 *  long one, nothing at all below two and a half days. */
export function fuzzInterval(days: number, seed: string, settings: DeckSettings): number {
  const rounded = Math.round(days);
  if (!settings.fuzz || days < 2.5) return Math.max(1, rounded);
  const pct = rounded < 7 ? 0.25 : rounded < 20 ? 0.15 : 0.05;
  const range = Math.max(1, Math.floor(rounded * pct));
  const delta = Math.round((hash01(seed) * 2 - 1) * range);
  return Math.max(1, rounded + delta);
}

/* --------------------------------------------------------- intervals */

function clamp(days: number, settings: DeckSettings): number {
  return Math.min(settings.maximumInterval, Math.max(settings.minimumInterval, days));
}

function learningDelayMinutes(stepList: number[], step: number, rating: Rating): number {
  const index = Math.min(Math.max(step, 0), stepList.length - 1);
  if (rating === 1) return stepList[0];
  if (rating === 2) {
    const next = stepList[index + 1];
    return next === undefined ? stepList[index] * 1.5 : (stepList[index] + next) / 2;
  }
  return stepList[Math.min(index + 1, stepList.length - 1)];
}

/** The three passing intervals for a card in review, fuzzed and ordered:
 *  Hard < Good < Easy always, whatever the fuzz drew. */
export function reviewIntervals(id: string, card: CardState, settings: DeckSettings, ctx: ReviewContext): { hard: number; good: number; easy: number } {
  // Credit for a review that came in late: half of the extra days for
  // Good, all of them for Easy, none for Hard (which is the answer that
  // says "I only just got it").
  const elapsed = card.lastReview ? Math.max(0, dayIndexOf(ctx.now, ctx) - dayIndexOf(card.lastReview, ctx)) : card.interval;
  const late = Math.max(0, elapsed - card.interval);
  const seed = `${id}:${card.reps}`;
  const hard = clamp(fuzzInterval(card.interval * settings.hardFactor * settings.intervalModifier, `${seed}:2`, settings), settings);
  let good = clamp(fuzzInterval((card.interval + late / 2) * card.ease * settings.intervalModifier, `${seed}:3`, settings), settings);
  let easy = clamp(
    fuzzInterval((card.interval + late) * card.ease * settings.easyBonus * settings.intervalModifier, `${seed}:4`, settings),
    settings
  );
  good = Math.min(settings.maximumInterval, Math.max(good, hard + 1));
  easy = Math.min(settings.maximumInterval, Math.max(easy, good + 1));
  return { hard, good, easy };
}

/* -------------------------------------------------------------- grade */

export interface RatingOutcome {
  card: CardState;
  /** Days until the card is next due (0 while it is still in steps). */
  interval: number;
  /** The card crossed the leech threshold on this answer. */
  becameLeech: boolean;
}

/**
 * The whole scheduler in one function. `id` seeds the fuzz; `card` is
 * never mutated.
 */
export function applyRating(id: string, card: CardState, rating: Rating, settings: DeckSettings, ctx: ReviewContext): RatingOutcome {
  const next: CardState = { ...card, reps: card.reps + 1, lastReview: ctx.now };
  delete next.buriedUntil;
  let becameLeech = false;

  if (card.state === 'new' || card.state === 'learning' || card.state === 'relearning') {
    const relearning = card.state === 'relearning';
    const stepList = relearning ? settings.relearningSteps : settings.learningSteps;
    const step = card.state === 'new' ? 0 : card.step;

    if (rating === 4) {
      // Easy graduates on the spot.
      next.state = 'review';
      next.step = 0;
      next.interval = relearning
        ? clamp(Math.max(card.interval, settings.graduatingInterval), settings)
        : clamp(settings.easyInterval, settings);
      next.due = dueAfterDays(ctx.now, next.interval, ctx);
      return { card: next, interval: next.interval, becameLeech };
    }

    if (rating === 3 && step + 1 >= stepList.length) {
      next.state = 'review';
      next.step = 0;
      next.interval = relearning ? clamp(Math.max(card.interval, settings.minimumInterval), settings) : clamp(settings.graduatingInterval, settings);
      next.due = dueAfterDays(ctx.now, next.interval, ctx);
      return { card: next, interval: next.interval, becameLeech };
    }

    next.state = relearning ? 'relearning' : 'learning';
    next.step = rating === 1 ? 0 : rating === 3 ? Math.min(step + 1, stepList.length - 1) : step;
    next.due = ctx.now + learningDelayMinutes(stepList, step, rating) * MINUTE;
    next.interval = relearning ? card.interval : 0;
    return { card: next, interval: 0, becameLeech };
  }

  // In review.
  if (rating === 1) {
    next.lapses = card.lapses + 1;
    next.ease = Math.max(EASE_FLOOR, card.ease - 0.2);
    next.interval = clamp(Math.round(card.interval * settings.lapseFactor), settings);
    if (next.lapses >= settings.leechThreshold && !card.leech) {
      becameLeech = true;
      next.leech = true;
      next.suspended = true;
    }
    if (settings.relearningSteps.length) {
      next.state = 'relearning';
      next.step = 0;
      next.due = ctx.now + settings.relearningSteps[0] * MINUTE;
      return { card: next, interval: 0, becameLeech };
    }
    next.state = 'review';
    next.due = dueAfterDays(ctx.now, next.interval, ctx);
    return { card: next, interval: next.interval, becameLeech };
  }

  const intervals = reviewIntervals(id, card, settings, ctx);
  next.state = 'review';
  next.step = 0;
  if (rating === 2) {
    next.ease = Math.max(EASE_FLOOR, card.ease - 0.15);
    next.interval = intervals.hard;
  } else if (rating === 3) {
    next.interval = intervals.good;
  } else {
    next.ease = card.ease + 0.15;
    next.interval = intervals.easy;
  }
  next.due = dueAfterDays(ctx.now, next.interval, ctx);
  return { card: next, interval: next.interval, becameLeech };
}

/** What the four buttons say, computed by running the real scheduler -
 *  never an approximation of it. */
export function project(id: string, card: CardState, settings: DeckSettings, ctx: ReviewContext): Projection[] {
  return RATINGS.map((rating) => {
    const outcome = applyRating(id, card, rating, settings, ctx);
    return {
      rating,
      state: outcome.card.state,
      due: outcome.card.due,
      interval: outcome.interval,
      label: formatDelay(outcome.card.due - ctx.now),
    };
  });
}

/* -------------------------------------------------------------- queue */

export interface QueueEntry {
  id: string;
  state: CardState;
  /** Position in the deck file - the tie-break for "added" order. */
  position: number;
}

export interface QueueCounts {
  new: number;
  learning: number;
  review: number;
}

export interface QueueResult {
  queue: string[];
  counts: QueueCounts;
  /** When the next card comes back, if nothing is due right now. */
  nextDue: number | null;
  /** Cards held back by today's limits. */
  heldBack: { new: number; review: number };
}

export function isBuried(state: CardState, ctx: ReviewContext): boolean {
  return state.buriedUntil !== undefined && state.buriedUntil > ctx.now;
}

export function isAvailable(state: CardState, ctx: ReviewContext): boolean {
  return !state.suspended && !isBuried(state, ctx);
}

/** Interleaves two lists as evenly as the shorter one allows, so new
 *  cards arrive spread through a session instead of all at the end. */
function interleave(long: string[], short: string[]): string[] {
  if (!short.length) return long;
  if (!long.length) return short;
  const out: string[] = [];
  const every = long.length / short.length;
  let taken = 0;
  for (let i = 0; i < long.length; i++) {
    out.push(long[i]);
    while (taken < short.length && (taken + 1) * every <= i + 1) out.push(short[taken++]);
  }
  while (taken < short.length) out.push(short[taken++]);
  return out;
}

/**
 * Today's queue for one deck. `doneToday` is how many new cards and
 * reviews the log already has for this day - the daily limits are the
 * whole reason the scheduler needs to know about the log at all.
 */
export function buildQueue(
  entries: QueueEntry[],
  settings: DeckSettings,
  ctx: ReviewContext,
  doneToday: { new: number; review: number } = { new: 0, review: 0 }
): QueueResult {
  const todayIndex = dayIndexOf(ctx.now, ctx);
  const learning: QueueEntry[] = [];
  const review: QueueEntry[] = [];
  const fresh: QueueEntry[] = [];
  let nextDue: number | null = null;

  for (const entry of entries) {
    if (!isAvailable(entry.state, ctx)) continue;
    const { state } = entry;
    if (state.state === 'learning' || state.state === 'relearning') {
      if (state.due <= ctx.now) learning.push(entry);
      else nextDue = nextDue === null ? state.due : Math.min(nextDue, state.due);
      continue;
    }
    if (state.state === 'review') {
      if (dayIndexOf(state.due, ctx) <= todayIndex) review.push(entry);
      else nextDue = nextDue === null ? state.due : Math.min(nextDue, state.due);
      continue;
    }
    fresh.push(entry);
  }

  learning.sort((a, b) => a.state.due - b.state.due || a.position - b.position);
  if (settings.order === 'added') review.sort((a, b) => a.position - b.position);
  else if (settings.order === 'random') review.sort((a, b) => hash01(a.id) - hash01(b.id));
  else review.sort((a, b) => a.state.due - b.state.due || a.position - b.position);
  fresh.sort((a, b) => (settings.order === 'random' ? hash01(a.id) - hash01(b.id) : a.position - b.position));

  const reviewAllowance = Math.max(0, settings.reviewsPerDay - doneToday.review);
  const newAllowance = Math.max(0, settings.newPerDay - doneToday.new);
  const reviewTaken = review.slice(0, reviewAllowance);
  const newTaken = fresh.slice(0, newAllowance);

  const queue = learning
    .map((e) => e.id)
    .concat(interleave(reviewTaken.map((e) => e.id), newTaken.map((e) => e.id)));

  return {
    queue,
    counts: { new: newTaken.length, learning: learning.length, review: reviewTaken.length },
    nextDue,
    heldBack: { new: fresh.length - newTaken.length, review: review.length - reviewTaken.length },
  };
}

/** The deck list's numbers: what is waiting, without building a queue. */
export function deckCounts(
  entries: QueueEntry[],
  settings: DeckSettings,
  ctx: ReviewContext,
  doneToday: { new: number; review: number } = { new: 0, review: 0 }
): QueueCounts & { total: number; suspended: number; nextDue: number | null } {
  const result = buildQueue(entries, settings, ctx, doneToday);
  return {
    ...result.counts,
    total: entries.length,
    suspended: entries.filter((e) => e.state.suspended).length,
    nextDue: result.nextDue,
  };
}

/** How many days until a card is due again, for the browser's columns. */
export function daysUntilDue(state: CardState, ctx: ReviewContext): number {
  return Math.max(0, Math.ceil((state.due - ctx.now) / DAY));
}
