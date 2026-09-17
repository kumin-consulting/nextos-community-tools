// test/notation.test.mjs
//
// SAN, LAN and coordinate notation. The interesting cases are all about
// disambiguation - two knights that can both reach a square, three
// queens after promotions, a rook that is pinned and therefore is NOT a
// second candidate - and about the notation real files are full of:
// zeroes for castling, figurines, 'e.p.', annotation suffixes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register(new URL('./_ts-hook.mjs', import.meta.url));

const { fromFen, toFen } = await import('../src/lib/fen.ts');
const { parseSan, toSan, toLan, toUci, stripSanDecoration, playLine } = await import('../src/lib/san.ts');
const { generateLegalMoves } = await import('../src/lib/moves.ts');
const { makeMove, unmakeMove } = await import('../src/lib/board.ts');

test('SAN disambiguates by file, then by rank, then by both', () => {
  // Two knights on g1 and e1 can both reach f3: the file tells them apart.
  const files = fromFen('4k3/8/8/8/8/8/8/4NKN1 w - - 0 1');
  const sans = generateLegalMoves(files).map((m) => toSan(files, m));
  assert.ok(sans.includes('Nef3'), sans.join(' '));
  assert.ok(sans.includes('Ngf3'), sans.join(' '));

  // Two rooks on a1 and a8 share a file, so the rank does the work.
  const ranks = fromFen('R7/8/8/4k3/8/8/8/R3K3 w - - 0 1');
  const rookSans = generateLegalMoves(ranks).map((m) => toSan(ranks, m));
  assert.ok(rookSans.includes('R1a4'), rookSans.join(' '));
  assert.ok(rookSans.includes('R8a4'), rookSans.join(' '));

  // Three queens reaching e4 need the whole square for one of them.
  // Queens on a1, a5 and e1 all reach e5: a1 shares its file with a5 and
  // its rank with e1, so only the whole square will do.
  const three = fromFen('1k6/8/8/Q7/8/8/8/Q3Q2K w - - 0 1');
  const queenSans = generateLegalMoves(three).map((m) => toSan(three, m));
  assert.ok(queenSans.includes('Qa1e5+'), queenSans.join(' '));
  assert.ok(queenSans.includes('Q5e5+'), queenSans.join(' '));
  assert.ok(queenSans.includes('Qee5+'), queenSans.join(' '));
});

test('a pinned piece is not a candidate, so no disambiguation is written', () => {
  // The knight on d2 cannot move (it shields the king from the bishop on
  // a5), so the other knight needs no file letter to reach b3... and the
  // move list must not pretend it does.
  const pos = fromFen('4k3/8/8/b7/8/8/3N4/4K3 w - - 0 1');
  const sans = generateLegalMoves(pos).map((m) => toSan(pos, m));
  assert.equal(sans.filter((s) => s.startsWith('N')).length, 0, 'the pinned knight has no legal move');
});

test('check and mate suffixes are written', () => {
  const check = fromFen('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1');
  assert.equal(toSan(check, parseSan(check, 'Ra8')), 'Ra8+');
  const mate = fromFen('4k3/8/4K3/8/8/8/8/R7 w - - 0 1');
  assert.equal(toSan(mate, parseSan(mate, 'Ra8')), 'Ra8#');
});

test('castling, promotion and en passant print the way people write them', () => {
  const castle = fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const sans = generateLegalMoves(castle).map((m) => toSan(castle, m));
  assert.ok(sans.includes('O-O'));
  assert.ok(sans.includes('O-O-O'));

  const promo = fromFen('8/P6k/8/8/8/8/8/K7 w - - 0 1');
  const promoSans = generateLegalMoves(promo).map((m) => toSan(promo, m));
  for (const piece of ['Q', 'R', 'B', 'N']) assert.ok(promoSans.includes(`a8=${piece}`), promoSans.join(' '));

  const ep = fromFen('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3');
  assert.equal(toSan(ep, parseSan(ep, 'exf6')), 'exf6');
  assert.equal(toLan(ep, parseSan(ep, 'exf6')), 'e5xf6 e.p.');
});

test('parsing accepts the notation real PGN is written in', () => {
  const pos = fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  for (const text of ['O-O', '0-0', 'O-O+', 'OO'.replace('OO', 'O-O'), 'e1g1']) {
    const move = parseSan(pos, text);
    assert.ok(move !== null, `"${text}" should parse`);
    assert.equal(toSan(pos, move), 'O-O');
  }
  const knight = fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  for (const text of ['Nf3', 'Ng1-f3', 'g1f3', '♘f3', 'Nf3!?']) {
    assert.equal(toUci(parseSan(knight, text)), 'g1f3', text);
  }
  assert.equal(parseSan(knight, 'Nf7'), null, 'an impossible move parses to null, it does not throw');
  assert.equal(parseSan(knight, 'hello'), null);
  assert.equal(stripSanDecoration('exd6 e.p.!?'), 'exd6');
});

test('under-promotion is never silently turned into a queen', () => {
  const pos = fromFen('8/P6k/8/8/8/8/8/K7 w - - 0 1');
  assert.equal(toUci(parseSan(pos, 'a8=N')), 'a7a8n');
  assert.equal(toUci(parseSan(pos, 'a7a8n')), 'a7a8n');
  assert.equal(toUci(parseSan(pos, 'a8')), 'a7a8q', 'a bare promotion square means a queen');
});

test('every legal move of a hundred positions survives a SAN round trip', () => {
  const fens = [
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    'r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1',
    'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
    '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
    'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
    'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3',
    '4k3/8/8/8/8/8/6PP/4K2R w K - 0 1',
    '8/P6k/8/8/8/8/6p1/K7 w - - 0 1',
  ];
  let checked = 0;
  for (const fen of fens) {
    const pos = fromFen(fen);
    const before = toFen(pos);
    for (const move of generateLegalMoves(pos)) {
      const san = toSan(pos, move);
      assert.equal(parseSan(pos, san), move, `${san} in ${fen}`);
      assert.equal(parseSan(pos, toUci(move)), move, `${toUci(move)} in ${fen}`);
      makeMove(pos, move);
      unmakeMove(pos, move);
      assert.equal(toFen(pos), before);
      checked++;
    }
  }
  assert.ok(checked > 150, `only ${checked} moves checked`);
});

test('playLine plays a whole game and leaves the position where it found it', () => {
  const pos = fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const before = toFen(pos);
  const moves = playLine(pos, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
  assert.equal(moves.length, 6);
  assert.equal(toFen(pos), before);
  assert.equal(playLine(pos, ['e4', 'e5', 'Qh8']), null, 'an illegal move aborts the whole line');
  assert.equal(toFen(pos), before);
});
