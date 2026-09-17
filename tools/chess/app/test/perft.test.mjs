// test/perft.test.mjs
//
// The proof that the rules are right. Perft counts the leaves of the move
// tree; if castling through check, en passant into a discovered check,
// promotion under-promotions or the double-push rule were even slightly
// wrong, these totals would not match, and every one of them is a number
// the whole chess-programming world has independently agreed on.
//
// Depths are chosen to keep the whole file well under a minute.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register(new URL('./_ts-hook.mjs', import.meta.url));

const { fromFen } = await import('../src/lib/fen.ts');
const { perft, generateLegalMoves } = await import('../src/lib/moves.ts');
const { makeMove, unmakeMove, positionKey } = await import('../src/lib/board.ts');
const { computeKey } = await import('../src/lib/zobrist.ts');
const { toFen } = await import('../src/lib/fen.ts');

const INITIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
const ENDGAME = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';
const POSITION_4 = 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1';
const POSITION_4_MIRROR = 'r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1';
const POSITION_5 = 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8';
const POSITION_6 = 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10';

const suites = [
  ['the initial position', INITIAL, [1, 20, 400, 8902, 197281, 4865609]],
  ['Kiwipete', KIWIPETE, [1, 48, 2039, 97862, 4085603]],
  ['a rook-and-pawn endgame (position 3)', ENDGAME, [1, 14, 191, 2812, 43238, 674624]],
  ['position 4', POSITION_4, [1, 6, 264, 9467, 422333]],
  ['position 4 mirrored', POSITION_4_MIRROR, [1, 6, 264, 9467, 422333]],
  ['position 5', POSITION_5, [1, 44, 1486, 62379, 2103487]],
  ['position 6', POSITION_6, [1, 46, 2079, 89890, 3894594]],
];

for (const [name, fen, expected] of suites) {
  test(`perft: ${name}`, () => {
    const pos = fromFen(fen);
    for (let depth = 0; depth < expected.length; depth++) {
      assert.equal(perft(pos, depth), expected[depth], `${name} depth ${depth}`);
    }
    assert.equal(toFen(pos), fen, 'the position is unchanged after perft');
  });
}

test('make and unmake leave the position byte-for-byte identical', () => {
  const pos = fromFen(KIWIPETE);
  const before = toFen(pos);
  const key = positionKey(pos);
  for (const move of generateLegalMoves(pos)) {
    makeMove(pos, move);
    // The incrementally maintained key has to agree with one computed
    // from scratch, or repetition detection and the transposition table
    // are both quietly wrong.
    const fresh = computeKey(pos);
    assert.equal(pos.keyLo, fresh.lo);
    assert.equal(pos.keyHi, fresh.hi);
    unmakeMove(pos, move);
    assert.equal(toFen(pos), before);
    assert.equal(positionKey(pos), key);
  }
});

test('en passant, castling and promotion each really happen', () => {
  const cases = [
    // En passant capture removes the pawn that stood beside it.
    ['rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3', 'exf6', 'rnbqkbnr/ppp1p1pp/5P2/3p4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3'],
    // Castling moves the rook too.
    ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'O-O-O', 'r3k2r/8/8/8/8/8/8/2KR3R b kq - 1 1'],
    // Under-promotion to a knight.
    ['8/P6k/8/8/8/8/8/K7 w - - 0 1', 'a8=N', 'N7/7k/8/8/8/8/8/K7 b - - 0 1'],
  ];
  return import('../src/lib/san.ts').then(({ parseSan }) => {
    for (const [fen, san, after] of cases) {
      const pos = fromFen(fen);
      const move = parseSan(pos, san);
      assert.ok(move, `${san} should parse in ${fen}`);
      makeMove(pos, move);
      assert.equal(toFen(pos), after, `${san} from ${fen}`);
    }
  });
});
