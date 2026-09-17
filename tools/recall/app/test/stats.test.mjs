// test/stats.test.mjs - the numbers on the deck browser. A heatmap that
// buckets a review into the wrong day, or a streak that breaks at
// midnight when the day starts at 4 am, is the kind of bug that makes
// people stop trusting an app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './_load.mjs';

const {
  averageDailyMinutes,
  breakdown,
  buildHeatmap,
  computeRetention,
  computeStreak,
  forecast,
  retentionSeries,
  summarise,
  trimLog,
} = await load('stats');
const { DAY, HOUR, dayIndexToDate } = await load('time');

const NOW = Date.UTC(2026, 2, 10, 9, 0, 0); // a Tuesday, 09:00 UTC
const ctx = { now: NOW, tzOffsetMinutes: 0, cutoffHour: 4 };

const entry = (t, over = {}) => ({ id: 'c', t, rating: 3, from: 'review', interval: 3, ms: 4000, ...over });

test('the heatmap has one bucket per day with no gaps', () => {
  const log = [entry(NOW), entry(NOW - HOUR), entry(NOW - 3 * DAY), entry(NOW - 400 * DAY)];
  const map = buildHeatmap(log, ctx, 183);
  assert.equal(map.days.length, 183);
  assert.equal(map.days[map.days.length - 1].reviews, 2, 'today');
  assert.equal(map.days[map.days.length - 4].reviews, 1);
  assert.equal(map.days[map.days.length - 2].reviews, 0);
  assert.equal(map.total, 3, 'reviews older than the window are left out');
  assert.equal(map.busiest, 2);
  assert.equal(map.active, 2);
  assert.equal(map.days[map.days.length - 1].date, '2026-03-10');
  assert.equal(map.days[0].date, dayIndexToDate(map.days[0].dayIndex, ctx));
});

test('a review at 2 am counts towards the day before', () => {
  const twoAm = Date.UTC(2026, 2, 10, 2, 0, 0);
  const map = buildHeatmap([entry(twoAm)], ctx);
  const last = map.days[map.days.length - 1];
  const before = map.days[map.days.length - 2];
  assert.equal(last.reviews, 0);
  assert.equal(before.reviews, 1);
  assert.equal(before.date, '2026-03-09');
});

test('heatmap levels are bands of the busiest day', () => {
  const log = [];
  for (let i = 0; i < 10; i++) log.push(entry(NOW));
  log.push(entry(NOW - DAY));
  log.push(entry(NOW - 2 * DAY), entry(NOW - 2 * DAY), entry(NOW - 2 * DAY), entry(NOW - 2 * DAY), entry(NOW - 2 * DAY));
  const map = buildHeatmap(log, ctx);
  const at = (back) => map.days[map.days.length - 1 - back].level;
  assert.equal(at(0), 4);
  assert.equal(at(2), 3);
  assert.equal(at(1), 1);
  assert.equal(at(3), 0);
});

test('the first weekday lets the grid pad its first column', () => {
  const map = buildHeatmap([], ctx, 7);
  assert.equal(map.days[0].date, '2026-03-04');
  assert.equal(map.firstWeekday, 3); // a Wednesday
});

test('a streak survives until a whole day has been missed', () => {
  const log = [entry(NOW - DAY), entry(NOW - 2 * DAY), entry(NOW - 3 * DAY)];
  const before = computeStreak(log, ctx);
  assert.equal(before.studiedToday, false);
  assert.equal(before.current, 3, 'today is not over yet');

  const after = computeStreak([...log, entry(NOW)], ctx);
  assert.equal(after.studiedToday, true);
  assert.equal(after.current, 4);

  const broken = computeStreak([entry(NOW - 2 * DAY), entry(NOW - 3 * DAY)], ctx);
  assert.equal(broken.current, 0);
  assert.equal(broken.longest, 2);
});

test('the longest streak is found anywhere in the log', () => {
  const log = [];
  for (const d of [30, 29, 28, 27, 26, 10, 9, 0]) log.push(entry(NOW - d * DAY));
  const streak = computeStreak(log, ctx);
  assert.equal(streak.longest, 5);
  assert.equal(streak.current, 1);
});

test('true retention counts only cards that were in review', () => {
  const log = [
    entry(NOW, { rating: 3, from: 'review' }),
    entry(NOW, { rating: 1, from: 'review' }),
    entry(NOW, { rating: 3, from: 'learning' }),
    entry(NOW, { rating: 1, from: 'new' }),
  ];
  const r = computeRetention(log, ctx);
  assert.equal(r.mature.total, 2);
  assert.equal(r.mature.rate, 0.5);
  assert.equal(r.all.total, 4);
  assert.equal(r.all.rate, 0.5);
  assert.equal(computeRetention([], ctx).mature.rate, null);
});

test('retention only looks back as far as it is asked to', () => {
  const log = [entry(NOW, { rating: 3 }), entry(NOW - 60 * DAY, { rating: 1 })];
  assert.equal(computeRetention(log, ctx, 30).mature.total, 1);
  assert.equal(computeRetention(log, ctx, 90).mature.total, 2);
});

test('the sparkline has a point a day and a gap where nothing was answered', () => {
  const series = retentionSeries([entry(NOW, { rating: 3 }), entry(NOW, { rating: 1 }), entry(NOW - 2 * DAY, { rating: 4 })], ctx, 30);
  assert.equal(series.length, 30);
  assert.equal(series[29].retention, 0.5);
  assert.equal(series[29].reviews, 2);
  assert.equal(series[28].retention, null);
  assert.equal(series[27].retention, 1);
});

test('the forecast counts overdue cards as due today', () => {
  const states = [
    { state: 'review', due: NOW - 5 * DAY, interval: 3, ease: 2.5, reps: 3, lapses: 0, step: 0 },
    { state: 'review', due: NOW + 1 * DAY, interval: 3, ease: 2.5, reps: 3, lapses: 0, step: 0 },
    { state: 'review', due: NOW + 1 * DAY, interval: 3, ease: 2.5, reps: 3, lapses: 0, step: 0 },
    { state: 'review', due: NOW + 30 * DAY, interval: 3, ease: 2.5, reps: 3, lapses: 0, step: 0 },
    { state: 'new', due: NOW, interval: 0, ease: 2.5, reps: 0, lapses: 0, step: 0 },
    { state: 'review', due: NOW, interval: 3, ease: 2.5, reps: 3, lapses: 0, step: 0, suspended: true },
  ];
  const days = forecast(states, ctx, 7);
  assert.equal(days.length, 7);
  assert.equal(days[0].due, 1, 'overdue lands on today; new and suspended cards do not');
  assert.equal(days[1].due, 2);
  assert.equal(days[6].cumulative, 3);
  assert.equal(days[0].date, '2026-03-10');
});

test('a session summary counts the grades and the median time', () => {
  const summary = summarise([
    entry(NOW, { rating: 1, ms: 8000, from: 'review' }),
    entry(NOW, { rating: 3, ms: 2000, from: 'new', interval: 0 }),
    entry(NOW, { rating: 3, ms: 4000, from: 'learning', interval: 1 }),
    entry(NOW, { rating: 4, ms: 3000, from: 'review' }),
  ]);
  assert.equal(summary.answered, 4);
  assert.deepEqual(summary.counts, [1, 0, 2, 1]);
  assert.equal(summary.correct, 3);
  assert.equal(summary.accuracy, 0.75);
  assert.equal(summary.totalMs, 17000);
  assert.equal(summary.medianMs, 4000);
  assert.equal(summary.newCards, 1);
  assert.equal(summary.graduated, 1);
  assert.equal(summarise([]).accuracy, null);
});

test('the breakdown separates young cards from mature ones', () => {
  const s = (over) => ({ state: 'review', due: NOW, interval: 5, ease: 2.5, reps: 1, lapses: 0, step: 0, ...over });
  const b = breakdown([s({ state: 'new', interval: 0 }), s({ state: 'learning' }), s({ interval: 5 }), s({ interval: 21 }), s({ suspended: true })]);
  assert.deepEqual(b, { new: 1, learning: 1, young: 1, mature: 1, suspended: 1, total: 5 });
});

test('average daily minutes only counts days that were studied', () => {
  const log = [entry(NOW, { ms: 60000 }), entry(NOW, { ms: 60000 }), entry(NOW - 3 * DAY, { ms: 120000 })];
  assert.equal(averageDailyMinutes(log, ctx, 30), 2);
  assert.equal(averageDailyMinutes([], ctx), 0);
});

test('the log is trimmed by age but never below a floor', () => {
  const log = [];
  for (let i = 0; i < 50; i++) log.push(entry(NOW - (500 + i) * DAY));
  for (let i = 0; i < 5; i++) log.push(entry(NOW - i * DAY));
  const trimmed = trimLog(log, ctx, 400, 10);
  assert.equal(trimmed.length, 10, 'the floor wins when almost everything is old');
  const kept = trimLog(log, ctx, 400, 3);
  assert.equal(kept.length, 5, 'everything inside the window is kept');
});
