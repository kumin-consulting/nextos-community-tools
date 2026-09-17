// test/search.test.mjs - the card browser's query language.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './_load.mjs';

const { compareCards, matches, parseQuery } = await load('search');
const { DAY } = await load('time');

const NOW = Date.UTC(2026, 2, 10, 9, 0, 0);
const ctx = { now: NOW, tzOffsetMinutes: 0, cutoffHour: 4 };

const subject = (over = {}, state = {}) => {
  const card = { id: 'c', noteIndex: 0, kind: 'basic', front: 'What is the capital of Peru?', back: 'Lima', answerText: 'Lima', tags: ['geography', 'chapter-3'], ...over };
  return {
    card,
    state: { state: 'review', due: NOW, interval: 10, ease: 2.5, reps: 4, lapses: 1, step: 0, ...state },
    haystack: `${card.front} ${card.back}`.toLowerCase(),
  };
};

const run = (query, over, state) => matches(parseQuery(query), subject(over, state), ctx);

test('plain words match the card text, and all of them have to', () => {
  assert.equal(run('capital'), true);
  assert.equal(run('capital peru'), true);
  assert.equal(run('capital chile'), false);
  assert.equal(run('CAPITAL'), true);
});

test('a quoted phrase matches as a phrase', () => {
  assert.equal(run('"capital of peru"'), true);
  assert.equal(run('"peru capital"'), false);
});

test('a leading minus excludes', () => {
  assert.equal(run('-chile'), true);
  assert.equal(run('-peru'), false);
});

test('tag: matches a tag by prefix', () => {
  assert.equal(run('tag:geo'), true);
  assert.equal(run('tag:chapter-3'), true);
  assert.equal(run('tag:history'), false);
  assert.equal(run('-tag:geo'), false);
});

test('is: matches the card state', () => {
  assert.equal(run('is:review'), true);
  assert.equal(run('is:new'), false);
  assert.equal(run('is:new', {}, { state: 'new' }), true);
  assert.equal(run('is:suspended', {}, { suspended: true }), true);
  assert.equal(run('is:suspended'), false);
  assert.equal(run('is:marked', {}, { marked: true }), true);
  assert.equal(run('is:leech', {}, { leech: true }), true);
  assert.equal(run('is:buried', {}, { buriedUntil: NOW + DAY }), true);
  assert.equal(run('is:buried', {}, { buriedUntil: NOW - DAY }), false);
});

test('is:due follows the day boundary, not the clock', () => {
  assert.equal(run('is:due', {}, { due: NOW + 3 * 3600_000 }), true, 'later today is due today');
  assert.equal(run('is:due', {}, { due: NOW + 2 * DAY }), false);
  assert.equal(run('is:due', {}, { due: NOW, suspended: true }), false);
  assert.equal(run('is:due', {}, { state: 'new' }), false);
});

test('due< and due> count days', () => {
  assert.equal(run('due<7', {}, { due: NOW + 3 * DAY }), true);
  assert.equal(run('due<7', {}, { due: NOW + 30 * DAY }), false);
  assert.equal(run('due>10', {}, { due: NOW + 30 * DAY }), true);
  assert.equal(run('due=0'), true);
});

test('prop: compares the scheduling numbers', () => {
  assert.equal(run('prop:ease<2.6'), true);
  assert.equal(run('prop:ease<2.0'), false);
  assert.equal(run('prop:lapses>0'), true);
  assert.equal(run('prop:interval>=10'), true);
  assert.equal(run('prop:reps=4'), true);
});

test('nonsense is treated as text rather than rejected', () => {
  assert.deepEqual(parseQuery('is:nonsense').map((t) => t.kind), ['text']);
  assert.equal(run('is:nonsense'), false);
});

test('an empty query matches everything', () => {
  assert.deepEqual(parseQuery('   '), []);
  assert.equal(run(''), true);
});

test('sorting falls back to the deck order for ties', () => {
  const a = subject({ id: 'a', front: 'Bravo' }, { due: NOW, interval: 5 });
  const b = subject({ id: 'b', front: 'Alpha' }, { due: NOW, interval: 5 });
  const position = (card) => (card.id === 'a' ? 0 : 1);
  assert.ok(compareCards(a, b, 'front', true, position) > 0);
  assert.ok(compareCards(a, b, 'front', false, position) < 0);
  assert.ok(compareCards(a, b, 'due', true, position) < 0, 'ties fall back to position');
  assert.ok(compareCards(a, b, 'state', true, position) < 0);
});
