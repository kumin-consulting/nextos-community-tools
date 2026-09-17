// test/openings.test.mjs
//
// The book is data, and data rots. Every line is replayed from the
// initial position here, so a typo in a move or a duplicated line fails
// the build rather than quietly naming an opening that does not exist.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register(new URL('./_ts-hook.mjs', import.meta.url));

const { allOpenings, nameOpening, openingLabel, bookMoves, pickBookMove, searchOpenings } =
  await import('../src/lib/openings.ts');
const { fromFen } = await import('../src/lib/fen.ts');
const { parseSan } = await import('../src/lib/san.ts');
const { makeMove } = await import('../src/lib/board.ts');
const { generateLegalMoves } = await import('../src/lib/moves.ts');
const { INITIAL_FEN } = await import('../src/lib/types.ts');

test('the book has at least three hundred entries and every one is legal', () => {
  const book = allOpenings();
  assert.ok(book.length >= 300, `the book has ${book.length} entries`);
  for (const entry of book) {
    assert.match(entry.eco, /^[A-E][0-9][0-9]$/, `${entry.name} has a bad ECO code`);
    assert.ok(entry.name.length > 2, `${entry.eco} has no name`);
    assert.ok(entry.moves.length > 0, `${entry.name} has no moves`);
    const pos = fromFen(INITIAL_FEN);
    for (const san of entry.moves) {
      const move = parseSan(pos, san);
      assert.ok(move !== null, `${entry.eco} ${entry.name}: "${san}" is not legal`);
      makeMove(pos, move);
    }
  }
});

test('no two entries share a move order', () => {
  const seen = new Map();
  for (const entry of allOpenings()) {
    const key = entry.moves.join(' ');
    assert.ok(!seen.has(key), `${entry.name} repeats the line of ${seen.get(key)}`);
    seen.set(key, entry.name);
  }
});

test('the longest matching line names the opening', () => {
  assert.equal(openingLabel(['e4']), 'B00 King\'s Pawn Opening');
  assert.equal(openingLabel(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']), 'C60 Ruy Lopez');
  assert.equal(openingLabel(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6']), 'C65 Ruy Lopez, Berlin Defence');
  // A line that leaves the book keeps the last name that matched.
  assert.equal(openingLabel(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6', 'Qe2']), 'C65 Ruy Lopez, Berlin Defence');
  assert.equal(nameOpening([]), null);
  assert.equal(nameOpening(['Na3']), null, 'a move no book line plays names nothing');
});

test('book moves are offered in the starting position and run out later', () => {
  const pos = fromFen(INITIAL_FEN);
  const moves = bookMoves(pos);
  assert.ok(moves.length >= 8, `only ${moves.length} first moves in the book`);
  assert.equal(moves[0].san, 'e4', 'the most played first move comes first');
  const legal = new Set(generateLegalMoves(pos).map((m) => m));
  for (const entry of moves) {
    assert.ok(legal.has(parseSan(pos, entry.san)), `${entry.san} must be legal`);
  }
  const quiet = fromFen('8/8/4k3/8/8/4K3/8/8 w - - 0 1');
  assert.deepEqual(bookMoves(quiet), []);
  assert.equal(pickBookMove(quiet), null);
});

test('pickBookMove is deterministic given a deterministic source of chance', () => {
  const pos = fromFen(INITIAL_FEN);
  const first = pickBookMove(pos, () => 0);
  const again = pickBookMove(pos, () => 0);
  assert.equal(first, again);
  assert.ok(first !== null);
  const last = pickBookMove(pos, () => 0.999999);
  assert.ok(last !== null);
});

test('searching by name and by ECO code finds lines', () => {
  const sicilians = searchOpenings('najdorf');
  assert.ok(sicilians.length >= 3, `found ${sicilians.length}`);
  for (const entry of sicilians) assert.match(entry.name.toLowerCase(), /najdorf/);
  assert.ok(searchOpenings('C65').length >= 1);
  assert.deepEqual(searchOpenings(''), []);
});
