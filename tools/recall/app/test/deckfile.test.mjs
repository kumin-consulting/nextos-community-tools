// test/deckfile.test.mjs - file names, the sidecar, and the promise
// that editing a deck somewhere else does not cost you your schedule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './_load.mjs';

const {
  deckFileName,
  deckNameFromFile,
  doneToday,
  emptySidecar,
  logForCards,
  nextDueAcross,
  parseSidecar,
  reconcileSidecar,
  renameCardState,
  safeDeckName,
  serialiseSidecar,
  sidecarFileName,
  uniqueDeckName,
} = await load('deckfile');
const { expandCards, parseDeck } = await load('markdown');
const { DAY } = await load('time');

const NOW = Date.UTC(2026, 2, 10, 9, 0, 0);
const ctx = { now: NOW, tzOffsetMinutes: 0, cutoffHour: 4 };

test('a deck name becomes a file name a filesystem will take', () => {
  assert.equal(safeDeckName('  Physics / Waves  '), 'Physics Waves');
  assert.equal(safeDeckName('..hidden'), 'hidden');
  assert.equal(deckFileName('Physics'), 'Physics.md');
  assert.equal(sidecarFileName('Physics'), 'Physics.recall.json');
  assert.equal(safeDeckName('x'.repeat(200)).length, 80);
});

test('only .md files are decks', () => {
  assert.equal(deckNameFromFile('Physics.md'), 'Physics');
  assert.equal(deckNameFromFile('Physics.recall.json'), null);
  assert.equal(deckNameFromFile('notes.txt'), null);
  assert.equal(deckNameFromFile('.md'), null);
});

test('a duplicate gets a number, ignoring case', () => {
  assert.equal(uniqueDeckName('Physics', ['Chemistry']), 'Physics');
  assert.equal(uniqueDeckName('Physics', ['physics']), 'Physics 2');
  assert.equal(uniqueDeckName('Physics', ['Physics', 'Physics 2']), 'Physics 3');
  assert.equal(uniqueDeckName('   ', []), 'Untitled');
});

test('an unchanged card keeps its schedule when the file is reloaded', () => {
  const before = parseDeck('Q: Kept\nA: one\n\nQ: Doomed\nA: two\n');
  const cards = expandCards(before);
  let sidecar = reconcileSidecar(emptySidecar(), cards, NOW).sidecar;
  sidecar.cards[cards[0].id] = { ...sidecar.cards[cards[0].id], state: 'review', interval: 30, ease: 2.3, reps: 8, due: NOW + 5 * DAY };

  // Somebody edits the file elsewhere: one card's answer changes (its
  // identity is the question, so it survives), one is deleted, one is new.
  const after = parseDeck('Q: Kept\nA: a better answer\n\nQ: Brand new\nA: three\n');
  const result = reconcileSidecar(sidecar, expandCards(after), NOW);
  assert.equal(result.added, 1);
  assert.equal(result.removed, 1);
  assert.equal(result.sidecar.cards[cards[0].id].interval, 30, 'the unchanged card kept its schedule');
  assert.equal(Object.keys(result.sidecar.cards).length, 2);
});

test('an edited question carries its schedule when the app does the editing', () => {
  const cards = expandCards(parseDeck('Q: Old wording\nA: x\n'));
  let sidecar = reconcileSidecar(emptySidecar(), cards, NOW).sidecar;
  sidecar.cards[cards[0].id].interval = 12;
  sidecar.log.push({ id: cards[0].id, t: NOW, rating: 3, from: 'review', interval: 12, ms: 1000 });
  const next = expandCards(parseDeck('Q: New wording\nA: x\n'));
  const moved = renameCardState(sidecar, cards[0].id, next[0].id);
  assert.equal(moved.cards[next[0].id].interval, 12);
  assert.equal(moved.cards[cards[0].id], undefined);
  assert.equal(moved.log[0].id, next[0].id);
  assert.equal(reconcileSidecar(moved, next, NOW).removed, 0);
});

test('a corrupt sidecar costs the schedule, not the app', () => {
  const broken = parseSidecar('{ not json at all');
  assert.equal(broken.sidecar.cards && Object.keys(broken.sidecar.cards).length, 0);
  assert.match(broken.problem, /not valid JSON/);
  assert.equal(parseSidecar('[1,2,3]').problem !== null, true);
  assert.equal(parseSidecar('').problem, null);
});

test('a sidecar with rubbish in it is repaired field by field', () => {
  const { sidecar } = parseSidecar(
    JSON.stringify({
      version: 99,
      settings: { newPerDay: 3 },
      cards: { good: { state: 'review', due: 5, interval: 4, ease: 0.2, reps: '9' }, bad: 'nope' },
      log: [{ id: 'good', t: 10, rating: 9, from: 'nonsense', interval: 1, ms: 1 }, null, { id: 'x', t: 0 }],
    })
  );
  assert.equal(sidecar.cards.bad, undefined);
  assert.equal(sidecar.cards.good.ease, 1.3, 'the ease floor is applied');
  assert.equal(sidecar.cards.good.reps, 0, 'a string rep count falls back');
  assert.equal(sidecar.settings.newPerDay, 3);
  assert.equal(sidecar.log.length, 1);
  assert.equal(sidecar.log[0].rating, 3);
  assert.equal(sidecar.log[0].from, 'review');
});

test('the sidecar is written with a stable key order', () => {
  const a = { ...emptySidecar(), cards: { b: { state: 'new', due: 1, interval: 0, ease: 2.5, reps: 0, lapses: 0, step: 0 }, a: { state: 'new', due: 1, interval: 0, ease: 2.5, reps: 0, lapses: 0, step: 0 } } };
  const b = { ...a, cards: { a: a.cards.a, b: a.cards.b } };
  assert.equal(serialiseSidecar(a), serialiseSidecar(b));
  assert.equal(parseSidecar(serialiseSidecar(a)).sidecar.cards.a.ease, 2.5);
});

test("today's allowance is counted from the log, and a new card only once", () => {
  const sidecar = {
    ...emptySidecar(),
    log: [
      { id: 'a', t: NOW, rating: 3, from: 'new', interval: 0, ms: 1 },
      { id: 'a', t: NOW, rating: 3, from: 'learning', interval: 1, ms: 1 },
      { id: 'b', t: NOW, rating: 3, from: 'review', interval: 5, ms: 1 },
      { id: 'c', t: NOW - 2 * DAY, rating: 3, from: 'review', interval: 5, ms: 1 },
    ],
  };
  assert.deepEqual(doneToday(sidecar, ctx), { new: 1, review: 1 });
});

test('the log can be split by card, for a duplicated or deleted deck', () => {
  const log = [
    { id: 'a', t: 1, rating: 3, from: 'review', interval: 1, ms: 1 },
    { id: 'b', t: 2, rating: 3, from: 'review', interval: 1, ms: 1 },
  ];
  assert.deepEqual(logForCards(log, new Set(['b'])), [log[1]]);
});

test('nextDueAcross finds the soonest card that is not new or suspended', () => {
  const state = (over) => ({ state: 'review', due: NOW + 10 * DAY, interval: 3, ease: 2.5, reps: 1, lapses: 0, step: 0, ...over });
  assert.equal(nextDueAcross([state({}), state({ due: NOW + 2 * DAY })], NOW), NOW + 2 * DAY);
  assert.equal(nextDueAcross([state({ due: NOW - DAY })], NOW), NOW);
  assert.equal(nextDueAcross([state({ state: 'new' }), state({ suspended: true })], NOW), null);
  assert.equal(nextDueAcross([], NOW), null);
});
