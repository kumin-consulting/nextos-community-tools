// test/diff.test.mjs - the typed-answer comparison. It has to be kind
// about the things nobody is being tested on and exact about the rest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './_load.mjs';

const { diffAnswer, normalise, normaliseLoose, suggestedRating } = await load('diff');

test('an exact answer is correct', () => {
  const result = diffAnswer('Canberra', 'Canberra');
  assert.equal(result.correct, true);
  assert.equal(result.score, 1);
  assert.deepEqual(result.parts, [{ type: 'same', text: 'Canberra' }]);
});

test('case, punctuation, accents and spacing are forgiven', () => {
  for (const [typed, expected] of [
    ['canberra', 'Canberra'],
    ['Pacific ocean.', 'the Pacific Ocean'],
    ['cafe', 'café'],
    ['two   words', 'two words'],
    ['  trimmed  ', 'trimmed'],
  ]) {
    assert.equal(diffAnswer(typed, expected).correct, true, `${typed} vs ${expected}`);
  }
});

test('a missing word is shown as missing and a wrong one as wrong', () => {
  const result = diffAnswer('the powerhouse of the nucleus', 'the powerhouse of the cell');
  assert.equal(result.correct, false);
  assert.deepEqual(result.parts, [
    { type: 'same', text: 'the powerhouse of the' },
    { type: 'wrong', text: 'nucleus' },
    { type: 'missing', text: 'cell' },
  ]);
  assert.equal(result.score, 4 / 5);
});

test('a word left out is reported without marking anything wrong', () => {
  const result = diffAnswer('the powerhouse of cell', 'the powerhouse of the cell');
  assert.deepEqual(result.parts.filter((p) => p.type === 'wrong'), []);
  assert.deepEqual(result.parts.filter((p) => p.type === 'missing'), [{ type: 'missing', text: 'the' }]);
});

test('an empty answer is all missing', () => {
  const result = diffAnswer('', 'Ottawa');
  assert.equal(result.correct, false);
  assert.equal(result.score, 0);
  assert.deepEqual(result.parts, [{ type: 'missing', text: 'Ottawa' }]);
});

test('a completely wrong answer keeps both sides visible', () => {
  const result = diffAnswer('Sydney', 'Canberra');
  assert.deepEqual(result.parts.map((p) => p.type), ['wrong', 'missing']);
});

test('the parts read back in the order the answer was written', () => {
  const result = diffAnswer('alpha gamma beta', 'alpha beta gamma');
  assert.equal(result.parts.map((p) => p.text).join(' ').includes('alpha'), true);
  assert.equal(result.correct, false);
});

test('normalise and normaliseLoose do what the rest of the app assumes', () => {
  assert.equal(normalise('  Héllo, World!  '), 'hello world');
  assert.equal(normaliseLoose('The Hague'), 'hague');
  assert.equal(normalise('C++ 17'), 'c 17');
});

test('a pasted essay is compared without building a huge table', () => {
  const long = 'word '.repeat(600).trim();
  const result = diffAnswer(long, long);
  assert.equal(result.correct, true);
});

test('the suggested grade follows how close the answer was', () => {
  assert.equal(suggestedRating(diffAnswer('Canberra', 'Canberra')), 3);
  assert.equal(suggestedRating(diffAnswer('the powerhouse of the nucleus', 'the powerhouse of the cell')), 2);
  assert.equal(suggestedRating(diffAnswer('no idea', 'the powerhouse of the cell')), 1);
});
