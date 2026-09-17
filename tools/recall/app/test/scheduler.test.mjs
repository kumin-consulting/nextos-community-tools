// test/scheduler.test.mjs - the interval maths, pinned. Every number
// below is what a person will actually see on a grade button, so a
// change here is a change to everybody's schedule and should have to
// break a test first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './_load.mjs';

const {
  DEFAULT_SETTINGS,
  EASE_FLOOR,
  applyRating,
  buildQueue,
  deckCounts,
  fuzzInterval,
  hash01,
  newCardState,
  project,
  resolveSettings,
  reviewIntervals,
  settingsDiff,
  isAvailable,
} = await load('scheduler');
const { DAY, HOUR, MINUTE, dayIndexOf, formatInterval } = await load('time');

// A fixed instant: 2026-03-10T09:00:00Z, UTC, day starting at 4 am.
const NOW = Date.UTC(2026, 2, 10, 9, 0, 0);
const ctx = { now: NOW, tzOffsetMinutes: 0, cutoffHour: 4 };
const settings = resolveSettings({ fuzz: false });

const card = (over = {}) => ({ ...newCardState(NOW, settings), ...over });

/** Grades a card through a sequence, returning every step. */
function run(ratings, start = card(), s = settings, at = NOW) {
  let state = start;
  let now = at;
  const steps = [];
  for (const rating of ratings) {
    const out = applyRating('card-1', state, rating, s, { ...ctx, now });
    steps.push({ rating, state: out.card.state, interval: out.interval, ease: out.card.ease, due: out.card.due });
    state = out.card;
    // The next answer happens the moment the card is due again.
    now = Math.max(now, state.due);
  }
  return { steps, state };
}

test('a new card walks the learning steps and graduates on Good', () => {
  const { steps, state } = run([3, 3]);
  assert.equal(steps[0].state, 'learning');
  assert.equal(steps[0].interval, 0);
  assert.equal(steps[0].due - NOW, 10 * MINUTE);
  assert.equal(steps[1].state, 'review');
  assert.equal(steps[1].interval, 1);
  assert.equal(state.reps, 2);
  assert.equal(state.ease, 2.5);
});

test('Again on a learning card goes back to the first step', () => {
  const { state } = run([3, 1]);
  assert.equal(state.state, 'learning');
  assert.equal(state.step, 0);
  assert.equal(state.due - NOW - 10 * MINUTE, 1 * MINUTE);
});

test('Hard on a learning card waits between this step and the next', () => {
  const out = applyRating('c', card(), 2, settings, ctx);
  assert.equal(out.card.state, 'learning');
  assert.equal(out.card.due - NOW, 5.5 * MINUTE); // (1 + 10) / 2
});

test('Easy graduates a new card straight to the easy interval', () => {
  const out = applyRating('c', card(), 4, settings, ctx);
  assert.equal(out.card.state, 'review');
  assert.equal(out.interval, DEFAULT_SETTINGS.easyInterval);
});

test('review intervals follow SM-2: 1d -> 3d -> 8d -> 20d on Good', () => {
  const start = card({ state: 'review', interval: 1, ease: 2.5, reps: 2 });
  const { steps } = run([3, 3, 3], start);
  assert.deepEqual(steps.map((s) => s.interval), [3, 8, 20]);
  assert.deepEqual(steps.map((s) => s.ease), [2.5, 2.5, 2.5]);
});

test('Hard and Easy move the ease factor and stay in order', () => {
  const start = card({ state: 'review', interval: 10, ease: 2.5, reps: 5 });
  const hard = applyRating('c', start, 2, settings, ctx);
  const good = applyRating('c', start, 3, settings, ctx);
  const easy = applyRating('c', start, 4, settings, ctx);
  assert.equal(hard.interval, 12); // 10 * 1.2
  assert.equal(good.interval, 25); // 10 * 2.5
  assert.equal(easy.interval, 33); // 10 * 2.5 * 1.3
  assert.ok(hard.interval < good.interval && good.interval < easy.interval);
  assert.equal(hard.card.ease, 2.35);
  assert.equal(good.card.ease, 2.5);
  assert.equal(easy.card.ease, 2.65);
});

test('a lapse costs the interval, drops the ease and starts relearning', () => {
  const start = card({ state: 'review', interval: 40, ease: 2.5, reps: 9, lapses: 1 });
  const again = applyRating('c', start, 1, settings, ctx);
  assert.equal(again.card.state, 'relearning');
  assert.equal(again.card.lapses, 2);
  assert.equal(again.card.ease, 2.3);
  assert.equal(again.card.interval, 1); // lapseFactor 0, floored at the minimum
  assert.equal(again.card.due - NOW, 10 * MINUTE);

  const back = applyRating('c', again.card, 3, settings, ctx);
  assert.equal(back.card.state, 'review');
  assert.equal(back.interval, 1);
});

test('lapseFactor keeps a share of the old interval when a deck asks for one', () => {
  const s = resolveSettings({ fuzz: false, lapseFactor: 0.4 });
  const out = applyRating('c', card({ state: 'review', interval: 40, ease: 2.5 }), 1, s, ctx);
  assert.equal(out.card.interval, 16);
});

test('the ease factor never falls below 1.3', () => {
  let state = card({ state: 'review', interval: 5, ease: 1.4, reps: 4 });
  for (let i = 0; i < 5; i++) state = applyRating('c', state, 2, settings, ctx).card;
  assert.equal(state.ease, EASE_FLOOR);
});

test('the eighth lapse makes a leech and suspends the card', () => {
  const start = card({ state: 'review', interval: 10, ease: 2.0, reps: 30, lapses: 7 });
  const out = applyRating('c', start, 1, settings, ctx);
  assert.equal(out.becameLeech, true);
  assert.equal(out.card.suspended, true);
  assert.equal(out.card.leech, true);
  // It only happens once.
  const again = applyRating('c', out.card, 1, settings, ctx);
  assert.equal(again.becameLeech, false);
});

test('a late review is given credit for the extra days', () => {
  const lastReview = NOW - 20 * DAY;
  const onTime = applyRating('c', card({ state: 'review', interval: 10, ease: 2.5, lastReview: NOW - 10 * DAY }), 3, settings, ctx);
  const late = applyRating('c', card({ state: 'review', interval: 10, ease: 2.5, lastReview }), 3, settings, ctx);
  assert.equal(onTime.interval, 25);
  assert.equal(late.interval, 38); // (10 + 10/2) * 2.5
});

test('the interval modifier scales every review interval', () => {
  const s = resolveSettings({ fuzz: false, intervalModifier: 0.8 });
  const out = applyRating('c', card({ state: 'review', interval: 10, ease: 2.5 }), 3, s, ctx);
  assert.equal(out.interval, 20);
});

test('intervals are clamped to the deck maximum', () => {
  const s = resolveSettings({ fuzz: false, maximumInterval: 365 });
  const out = applyRating('c', card({ state: 'review', interval: 300, ease: 2.5 }), 4, s, ctx);
  assert.equal(out.interval, 365);
});

test('a due time lands on the 4 am boundary of the right day', () => {
  const out = applyRating('c', card({ state: 'review', interval: 1, ease: 2.5 }), 2, settings, ctx);
  assert.equal(dayIndexOf(out.card.due, ctx), dayIndexOf(NOW, ctx) + out.interval);
  assert.equal(new Date(out.card.due).getUTCHours(), 4);

  // 2 am belongs to the previous review day, so "tomorrow" is 26 hours away.
  const lateNight = { ...ctx, now: Date.UTC(2026, 2, 10, 2, 0, 0) };
  const out2 = applyRating('c', card({ state: 'review', interval: 1, ease: 2.5 }), 3, settings, lateNight);
  assert.equal(out2.card.due, Date.UTC(2026, 2, 10, 4, 0, 0) + (out2.interval - 1) * DAY);
});

test('a different cutoff hour moves the boundary', () => {
  const s = resolveSettings({ fuzz: false, dayCutoffHour: 0 });
  const midnight = { ...ctx, cutoffHour: 0 };
  const out = applyRating('c', card({ state: 'review', interval: 1, ease: 2.5 }), 3, s, midnight);
  assert.equal(new Date(out.card.due).getUTCHours(), 0);
});

test('fuzz stays inside its band and is the same every time', () => {
  const fuzzy = resolveSettings({});
  assert.equal(fuzzInterval(2, 'seed', fuzzy), 2, 'nothing under two and a half days is fuzzed');
  for (const days of [4, 10, 30, 200]) {
    const values = new Set();
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const value = fuzzInterval(days, seed, fuzzy);
      values.add(value);
      const band = days < 7 ? 0.25 : days < 20 ? 0.15 : 0.05;
      assert.ok(Math.abs(value - days) <= Math.max(1, Math.floor(days * band)), `${value} is outside the band for ${days}`);
    }
    assert.ok(values.size > 1, 'the fuzz actually spreads intervals');
  }
  assert.equal(fuzzInterval(10, 'seed', fuzzy), fuzzInterval(10, 'seed', fuzzy));
  assert.ok(hash01('x') >= 0 && hash01('x') < 1);
});

test('a projected interval is exactly the interval you get', () => {
  const fuzzy = resolveSettings({});
  const start = card({ state: 'review', interval: 30, ease: 2.4, reps: 12 });
  for (const p of project('card-77', start, fuzzy, ctx)) {
    const actual = applyRating('card-77', start, p.rating, fuzzy, ctx);
    assert.equal(p.due, actual.card.due, `rating ${p.rating}`);
    assert.equal(p.interval, actual.interval);
  }
  const labels = project('card-77', start, fuzzy, ctx).map((p) => p.label);
  assert.equal(labels[0], '10m');
  assert.ok(/^[\d.]+(?:m|h|d|mo|y)$/.test(labels[2]), labels[2]);
});

test('review intervals never collide after fuzzing', () => {
  const fuzzy = resolveSettings({});
  for (let i = 0; i < 200; i++) {
    const state = card({ state: 'review', interval: 3 + (i % 40), ease: 1.3 + (i % 13) * 0.1, reps: i });
    const { hard, good, easy } = reviewIntervals(`id-${i}`, state, fuzzy, ctx);
    assert.ok(hard < good && good < easy, `${hard} ${good} ${easy}`);
  }
});

test('settings are repaired rather than trusted', () => {
  const s = resolveSettings({ newPerDay: -5, learningSteps: [], startingEase: 0.2, order: 'nonsense', dayCutoffHour: 99 });
  assert.equal(s.newPerDay, DEFAULT_SETTINGS.newPerDay);
  assert.deepEqual(s.learningSteps, DEFAULT_SETTINGS.learningSteps);
  assert.equal(s.startingEase, DEFAULT_SETTINGS.startingEase);
  assert.equal(s.order, 'due');
  assert.equal(s.dayCutoffHour, 23);
});

test('only what differs from the defaults is written back', () => {
  assert.deepEqual(settingsDiff(resolveSettings({})), {});
  assert.deepEqual(settingsDiff(resolveSettings({ newPerDay: 5, learningSteps: [2, 20] })), { newPerDay: 5, learningSteps: [2, 20] });
});

/* ------------------------------------------------------------ queue */

const entry = (id, state, position) => ({ id, state: { ...newCardState(NOW, settings), ...state }, position });

test('the queue puts learning first, then reviews with new cards mixed in', () => {
  const entries = [
    entry('new-1', {}, 0),
    entry('new-2', {}, 1),
    entry('rev-1', { state: 'review', due: NOW - DAY, interval: 5 }, 2),
    entry('rev-2', { state: 'review', due: NOW - 2 * DAY, interval: 5 }, 3),
    entry('rev-3', { state: 'review', due: NOW - 3 * DAY, interval: 5 }, 4),
    entry('learn-1', { state: 'learning', due: NOW - MINUTE, step: 0 }, 5),
    entry('future', { state: 'review', due: NOW + 5 * DAY, interval: 9 }, 6),
  ];
  const result = buildQueue(entries, settings, ctx);
  assert.equal(result.queue[0], 'learn-1');
  assert.deepEqual(result.counts, { new: 2, learning: 1, review: 3 });
  assert.equal(result.queue.length, 6);
  assert.ok(result.queue.indexOf('new-1') < result.queue.length - 1, 'new cards are spread through the session');
  assert.equal(result.nextDue, NOW + 5 * DAY);
  // Oldest review first.
  const reviews = result.queue.filter((id) => id.startsWith('rev-'));
  assert.deepEqual(reviews, ['rev-3', 'rev-2', 'rev-1']);
});

test('daily limits hold cards back, and what is done today counts against them', () => {
  const entries = [];
  for (let i = 0; i < 30; i++) entries.push(entry(`n${i}`, {}, i));
  for (let i = 0; i < 30; i++) entries.push(entry(`r${i}`, { state: 'review', due: NOW - DAY, interval: 3 }, 30 + i));
  const s = resolveSettings({ fuzz: false, newPerDay: 5, reviewsPerDay: 10 });
  const fresh = buildQueue(entries, s, ctx);
  assert.deepEqual(fresh.counts, { new: 5, learning: 0, review: 10 });
  assert.deepEqual(fresh.heldBack, { new: 25, review: 20 });

  const partway = buildQueue(entries, s, ctx, { new: 4, review: 10 });
  assert.deepEqual(partway.counts, { new: 1, learning: 0, review: 0 });
});

test('suspended and buried cards are not shown', () => {
  const entries = [
    entry('ok', { state: 'review', due: NOW - DAY, interval: 2 }, 0),
    entry('suspended', { state: 'review', due: NOW - DAY, interval: 2, suspended: true }, 1),
    entry('buried', { state: 'review', due: NOW - DAY, interval: 2, buriedUntil: NOW + HOUR }, 2),
    entry('unburied', { state: 'review', due: NOW - DAY, interval: 2, buriedUntil: NOW - HOUR }, 3),
  ];
  const result = buildQueue(entries, settings, ctx);
  assert.deepEqual(result.queue, ['ok', 'unburied']);
  assert.equal(isAvailable(entries[1].state, ctx), false);
  assert.equal(isAvailable(entries[3].state, ctx), true);

  const counts = deckCounts(entries, settings, ctx);
  assert.equal(counts.total, 4);
  assert.equal(counts.suspended, 1);
  assert.equal(counts.review, 2);
});

test('a card due later today is due now - the day, not the clock, is the unit', () => {
  const later = entry('later', { state: 'review', due: NOW + 3 * HOUR, interval: 4 }, 0);
  assert.equal(buildQueue([later], settings, ctx).queue.length, 1);
  const tomorrow = entry('tomorrow', { state: 'review', due: NOW + 20 * HOUR, interval: 4 }, 0);
  assert.equal(buildQueue([tomorrow], settings, ctx).queue.length, 0);
});

test('a learning card due in ten minutes is not in the queue yet', () => {
  const soon = entry('soon', { state: 'learning', due: NOW + 10 * MINUTE }, 0);
  const result = buildQueue([soon], settings, ctx);
  assert.deepEqual(result.queue, []);
  assert.equal(result.nextDue, NOW + 10 * MINUTE);
});

test('random order is stable for a given card set', () => {
  const s = resolveSettings({ order: 'random' });
  const entries = ['a', 'b', 'c', 'd', 'e'].map((id, i) => entry(id, { state: 'review', due: NOW - DAY, interval: 2 }, i));
  assert.deepEqual(buildQueue(entries, s, ctx).queue, buildQueue(entries, s, ctx).queue);
});

test('formatInterval says intervals the way a person would', () => {
  assert.equal(formatInterval(0.007), '10m');
  assert.equal(formatInterval(1), '1d');
  assert.equal(formatInterval(45), '1.5mo');
  assert.equal(formatInterval(730), '2y');
});
