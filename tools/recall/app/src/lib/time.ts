// src/lib/time.ts
//
// Days, as a person means them. A review day does not start at midnight:
// answering a card at 1 am belongs to the evening you are still having,
// so the day boundary sits at 4 am local by default (configurable per
// deck, `dayCutoffHour`). Everything here is pure arithmetic over epoch
// milliseconds and an explicit UTC offset, so a test can pin a time zone
// instead of inheriting the machine's.
//
// The offset is the one the caller would get from
// `-new Date().getTimezoneOffset()` - minutes to ADD to UTC. It is taken
// as a constant for the instant being converted, which is exactly right
// either side of a daylight-saving change and off by an hour only for a
// card answered inside the one ambiguous hour itself.

import type { ReviewContext } from './types';

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

/** Which review day an instant belongs to. Consecutive days differ by 1;
 *  the absolute value is meaningless on its own. */
export function dayIndexOf(ms: number, ctx: ReviewContext): number {
  return Math.floor((ms + ctx.tzOffsetMinutes * MINUTE - ctx.cutoffHour * HOUR) / DAY);
}

/** The instant a review day starts. */
export function dayStartMs(dayIndex: number, ctx: ReviewContext): number {
  return dayIndex * DAY + ctx.cutoffHour * HOUR - ctx.tzOffsetMinutes * MINUTE;
}

export function today(ctx: ReviewContext): number {
  return dayIndexOf(ctx.now, ctx);
}

/** Whole review days from `a` to `b` (negative when b is earlier). */
export function daysBetween(a: number, b: number, ctx: ReviewContext): number {
  return dayIndexOf(b, ctx) - dayIndexOf(a, ctx);
}

/** When a card that is due "in `days` days" comes back: the start of
 *  that review day, the way Anki rolls a card over to a date rather than
 *  to an exact time of day. */
export function dueAfterDays(now: number, days: number, ctx: ReviewContext): number {
  return dayStartMs(dayIndexOf(now, ctx) + Math.max(0, Math.round(days)), ctx);
}

/** The local calendar date of an instant, as YYYY-MM-DD. Uses the day
 *  INDEX, so a card answered at 2 am lands on the previous date - which
 *  is what makes a heatmap and a streak agree with each other. */
export function dayIndexToDate(dayIndex: number, ctx: ReviewContext): string {
  const noon = dayStartMs(dayIndex, ctx) + ctx.tzOffsetMinutes * MINUTE + 12 * HOUR;
  return new Date(noon).toISOString().slice(0, 10);
}

/** "10m", "2d", "1.4mo", "3.1y" - an interval as a flash-card app says
 *  it. Sub-day intervals are given in minutes or hours. */
export function formatInterval(days: number): string {
  if (days <= 0) return 'now';
  if (days < 1) {
    const minutes = days * 24 * 60;
    if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
    return `${round1(minutes / 60)}h`;
  }
  if (days < 31) return `${Math.round(days)}d`;
  if (days < 365) return `${round1(days / 30.4)}mo`;
  return `${round1(days / 365)}y`;
}

/** The same, from a delay in milliseconds. */
export function formatDelay(ms: number): string {
  if (ms <= 0) return 'now';
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))}m`;
  if (ms < DAY) return `${round1(ms / HOUR)}h`;
  return formatInterval(ms / DAY);
}

/** "in 3 days", "tomorrow", "today" - for the deck list's next-due line. */
export function formatDueDay(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 31) return `in ${days} days`;
  return `in ${formatInterval(days)}`;
}

function round1(value: number): string | number {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? rounded : rounded.toFixed(1);
}

/** The context the app runs with right now. */
export function contextNow(cutoffHour: number, now = Date.now()): ReviewContext {
  return { now, tzOffsetMinutes: -new Date(now).getTimezoneOffset(), cutoffHour };
}
