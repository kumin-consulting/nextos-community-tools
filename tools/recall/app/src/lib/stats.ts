// src/lib/stats.ts
//
// Everything the deck browser draws: the heatmap of the last six
// months, the streak, the retention rate and its sparkline, the
// seven-day forecast and the end-of-session summary. All of it reads
// the review log in the sidecar, all of it is pure, and all of it
// agrees with `time.ts` about where a day starts - which is why a card
// answered at 2 am counts towards the evening you were still having.

import type { CardState, ReviewContext, ReviewLogEntry } from './types';
import { DAY, dayIndexOf, dayIndexToDate } from './time';

/* ----------------------------------------------------------- heatmap */

export interface HeatDay {
  dayIndex: number;
  /** YYYY-MM-DD in local time. */
  date: string;
  reviews: number;
  /** 0-4: nothing, then four bands scaled to the busiest day. */
  level: 0 | 1 | 2 | 3 | 4;
}

export interface Heatmap {
  /** Oldest first, one entry per day, no gaps - the grid fills by
   *  column, so the caller never has to think about missing days. */
  days: HeatDay[];
  /** Weekday (0 = Sunday) the first day falls on, to pad the first
   *  column of the grid. */
  firstWeekday: number;
  total: number;
  busiest: number;
  /** Days with at least one review. */
  active: number;
}

function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** Reviews per day for the last `days` days, ending today. */
export function buildHeatmap(log: ReviewLogEntry[], ctx: ReviewContext, days = 183): Heatmap {
  const today = dayIndexOf(ctx.now, ctx);
  const first = today - days + 1;
  const counts = new Map<number, number>();
  for (const entry of log) {
    const d = dayIndexOf(entry.t, ctx);
    if (d < first || d > today) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let busiest = 0;
  for (const value of counts.values()) busiest = Math.max(busiest, value);
  const out: HeatDay[] = [];
  let total = 0;
  let active = 0;
  for (let d = first; d <= today; d++) {
    const reviews = counts.get(d) ?? 0;
    total += reviews;
    if (reviews) active++;
    out.push({ dayIndex: d, date: dayIndexToDate(d, ctx), reviews, level: levelFor(reviews, busiest) });
  }
  return { days: out, firstWeekday: out.length ? weekdayOf(out[0].date) : 0, total, busiest, active };
}

function levelFor(reviews: number, busiest: number): 0 | 1 | 2 | 3 | 4 {
  if (reviews <= 0) return 0;
  if (busiest <= 0) return 1;
  const ratio = reviews / busiest;
  if (ratio > 0.66) return 4;
  if (ratio > 0.33) return 3;
  if (ratio > 0.12) return 2;
  return 1;
}

/* ------------------------------------------------------------ streak */

export interface Streak {
  current: number;
  longest: number;
  /** True when today already has a review in it. */
  studiedToday: boolean;
}

/** A streak that does not break until you have missed a WHOLE day: at
 *  9 am, yesterday's study still counts, because today is not over. */
export function computeStreak(log: ReviewLogEntry[], ctx: ReviewContext): Streak {
  const today = dayIndexOf(ctx.now, ctx);
  const seen = new Set<number>();
  for (const entry of log) seen.add(dayIndexOf(entry.t, ctx));
  const studiedToday = seen.has(today);
  let current = 0;
  for (let d = studiedToday ? today : today - 1; seen.has(d); d--) current++;
  let longest = 0;
  let run = 0;
  const sorted = Array.from(seen).sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { current, longest, studiedToday };
}

/* --------------------------------------------------------- retention */

export interface Retention {
  /** Answers on cards that were in `review` - the number Anki calls
   *  "true retention", and the only one worth comparing over time. */
  mature: { correct: number; total: number; rate: number | null };
  /** Every answer, learning steps included. */
  all: { correct: number; total: number; rate: number | null };
}

function rate(correct: number, total: number): number | null {
  return total ? correct / total : null;
}

export function computeRetention(log: ReviewLogEntry[], ctx: ReviewContext, sinceDays = 30): Retention {
  const first = dayIndexOf(ctx.now, ctx) - sinceDays + 1;
  let mc = 0;
  let mt = 0;
  let ac = 0;
  let at = 0;
  for (const entry of log) {
    if (dayIndexOf(entry.t, ctx) < first) continue;
    at++;
    if (entry.rating > 1) ac++;
    if (entry.from === 'review') {
      mt++;
      if (entry.rating > 1) mc++;
    }
  }
  return { mature: { correct: mc, total: mt, rate: rate(mc, mt) }, all: { correct: ac, total: at, rate: rate(ac, at) } };
}

export interface SparkPoint {
  dayIndex: number;
  date: string;
  reviews: number;
  /** null on a day with nothing to measure. */
  retention: number | null;
}

/** Daily retention for the sparkline - `null` where nothing was
 *  answered, so the line breaks instead of dropping to zero. */
export function retentionSeries(log: ReviewLogEntry[], ctx: ReviewContext, days = 30): SparkPoint[] {
  const today = dayIndexOf(ctx.now, ctx);
  const first = today - days + 1;
  const buckets = new Map<number, { correct: number; total: number }>();
  for (const entry of log) {
    const d = dayIndexOf(entry.t, ctx);
    if (d < first || d > today) continue;
    const bucket = buckets.get(d) ?? { correct: 0, total: 0 };
    bucket.total++;
    if (entry.rating > 1) bucket.correct++;
    buckets.set(d, bucket);
  }
  const out: SparkPoint[] = [];
  for (let d = first; d <= today; d++) {
    const bucket = buckets.get(d);
    out.push({
      dayIndex: d,
      date: dayIndexToDate(d, ctx),
      reviews: bucket?.total ?? 0,
      retention: bucket && bucket.total ? bucket.correct / bucket.total : null,
    });
  }
  return out;
}

/* ---------------------------------------------------------- forecast */

export interface ForecastDay {
  dayIndex: number;
  date: string;
  /** Cards already scheduled for that day. */
  due: number;
  /** The running total if you never fell behind. */
  cumulative: number;
}

/** What is coming: cards whose due date falls on each of the next
 *  `days` days. Day 0 is today, and anything overdue is counted there -
 *  which is exactly how it will feel when you sit down. */
export function forecast(states: CardState[], ctx: ReviewContext, days = 7): ForecastDay[] {
  const today = dayIndexOf(ctx.now, ctx);
  const counts = new Map<number, number>();
  for (const state of states) {
    if (state.suspended) continue;
    if (state.state === 'new') continue;
    const d = Math.max(today, dayIndexOf(state.due, ctx));
    if (d > today + days - 1) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const out: ForecastDay[] = [];
  let cumulative = 0;
  for (let i = 0; i < days; i++) {
    const d = today + i;
    const due = counts.get(d) ?? 0;
    cumulative += due;
    out.push({ dayIndex: d, date: dayIndexToDate(d, ctx), due, cumulative });
  }
  return out;
}

/* ----------------------------------------------------------- session */

export interface SessionSummary {
  answered: number;
  /** By rating: Again, Hard, Good, Easy. */
  counts: [number, number, number, number];
  correct: number;
  /** 0..1, or null when nothing was answered. */
  accuracy: number | null;
  /** Milliseconds actually spent looking at cards. */
  totalMs: number;
  medianMs: number;
  newCards: number;
  /** Cards that graduated out of learning in this session. */
  graduated: number;
}

export function summarise(entries: ReviewLogEntry[]): SessionSummary {
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  let totalMs = 0;
  let newCards = 0;
  let graduated = 0;
  const times: number[] = [];
  for (const entry of entries) {
    counts[entry.rating - 1]++;
    totalMs += entry.ms;
    times.push(entry.ms);
    if (entry.from === 'new') newCards++;
    if ((entry.from === 'learning' || entry.from === 'new' || entry.from === 'relearning') && entry.interval >= 1) graduated++;
  }
  times.sort((a, b) => a - b);
  const correct = counts[1] + counts[2] + counts[3];
  const answered = entries.length;
  return {
    answered,
    counts,
    correct,
    accuracy: answered ? correct / answered : null,
    totalMs,
    medianMs: times.length ? times[Math.floor(times.length / 2)] : 0,
    newCards,
    graduated,
  };
}

/* ------------------------------------------------------------ totals */

export interface StateBreakdown {
  new: number;
  learning: number;
  young: number;
  mature: number;
  suspended: number;
  total: number;
}

/** A deck's make-up, for the bar under its name. "Mature" is Anki's
 *  three-week line: a card you have genuinely kept. */
export function breakdown(states: CardState[]): StateBreakdown {
  const out: StateBreakdown = { new: 0, learning: 0, young: 0, mature: 0, suspended: 0, total: states.length };
  for (const state of states) {
    if (state.suspended) {
      out.suspended++;
      continue;
    }
    if (state.state === 'new') out.new++;
    else if (state.state === 'learning' || state.state === 'relearning') out.learning++;
    else if (state.interval >= 21) out.mature++;
    else out.young++;
  }
  return out;
}

/** Minutes of study a day, averaged over the days you actually studied
 *  - the honest version of "time spent". */
export function averageDailyMinutes(log: ReviewLogEntry[], ctx: ReviewContext, days = 30): number {
  const first = dayIndexOf(ctx.now, ctx) - days + 1;
  const perDay = new Map<number, number>();
  for (const entry of log) {
    const d = dayIndexOf(entry.t, ctx);
    if (d < first) continue;
    perDay.set(d, (perDay.get(d) ?? 0) + entry.ms);
  }
  if (!perDay.size) return 0;
  let total = 0;
  for (const ms of perDay.values()) total += ms;
  return total / perDay.size / 60000;
}

/** Trims a review log so a sidecar cannot grow without bound: entries
 *  older than `keepDays` go, and the newest `keepMin` always stay. */
export function trimLog(log: ReviewLogEntry[], ctx: ReviewContext, keepDays = 400, keepMin = 2000): ReviewLogEntry[] {
  const cutoff = ctx.now - keepDays * DAY;
  const kept = log.filter((entry) => entry.t >= cutoff);
  if (kept.length >= Math.min(keepMin, log.length)) return kept;
  return log.slice(-keepMin);
}
