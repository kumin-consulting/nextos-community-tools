// test/engine.test.mjs
//
// Two questions about a chess engine matter more than its rating: does
// it see a forced mate, and does it ever try to play something illegal?
// The first is checked against known tactics (each of which the search
// must find in well under a second); the second over two hundred random
// games, where the engine is asked for a move in every position and the
// answer is checked against the legal move list before a random move is
// played instead - so the positions it is asked about are genuinely
// varied rather than the handful an engine-versus-engine game visits.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register(new URL('./_ts-hook.mjs', import.meta.url));

const { fromFen } = await import('../src/lib/fen.ts');
const { search, searchChunked, levelFor, LEVELS, mateDistance, MATE_SCORE, runEngineWorker, positionFromRequest, clearTranspositionTable } =
  await import('../src/lib/engine.ts');
const { toSan, toUci } = await import('../src/lib/san.ts');
const { generateLegalMoves } = await import('../src/lib/moves.ts');
const { makeMove } = await import('../src/lib/board.ts');
const { evaluateWhite, materialBalance, phaseOf } = await import('../src/lib/evaluate.ts');
const { INITIAL_FEN } = await import('../src/lib/types.ts');

const MATES = [
  ['mate in 1: back rank', '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'Ra8#', 1],
  ['mate in 1: scholar', 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1', 'Qxf7#', 1],
  ['mate in 1: smothered', '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', 'Nf7#', 1],
  ['mate in 2: two rooks', '6k1/pp4p1/2p5/2bp4/8/P5Pb/1P3rrP/2BRRN1K b - - 0 1', 'Rg1+', 2],
  ['mate in 2: Nf6 double check', 'r2qkb1r/pp2nppp/3p4/2pNN1B1/2BnP3/3P4/PPP2PPP/R2bK2R w KQkq - 1 1', 'Nf6+', 2],
  ['mate in 2: queen sacrifice', 'r1b2k1r/ppp1bppp/8/1B1Q4/5q2/2P5/PPP2PPP/R3R1K1 w - - 1 1', 'Qd8+', 2],
  ['mate in 2: king and rook', 'k7/8/2K5/8/8/8/8/6R1 w - - 0 1', null, 2],
  ['mate in 3: Morphy', '1k1r4/pp1b1R2/3q2pp/4p3/2B5/4Q3/PPP2B2/2K5 b - - 0 1', 'Qd1+', 3],
];

test('the engine finds known mates, with the right first move and distance', () => {
  for (const [name, fen, expected, distance] of MATES) {
    clearTranspositionTable();
    const pos = fromFen(fen);
    const started = Date.now();
    const info = search(pos, { depth: 8, movetimeMs: 3000, level: 8 });
    const elapsed = Date.now() - started;
    assert.ok(info.bestMove !== 0, `${name}: no move returned`);
    assert.equal(info.mate, distance, `${name}: found mate in ${info.mate}, expected ${distance}`);
    if (expected) assert.equal(toSan(pos, info.bestMove), expected, name);
    assert.ok(elapsed < 2000, `${name} took ${elapsed}ms`);
  }
});

test('mate scores shrink with distance, so a faster mate wins', () => {
  assert.equal(mateDistance(MATE_SCORE - 1), 1);
  assert.equal(mateDistance(MATE_SCORE - 3), 2);
  assert.equal(mateDistance(-(MATE_SCORE - 3)), -2);
  assert.equal(mateDistance(120), null);
});

test('the engine never returns an illegal move, over 200 random games', () => {
  let positions = 0;
  let engineMoves = 0;
  // A fixed generator: a failure here has to be reproducible.
  let seed = 0x1234abcd;
  const random = () => {
    seed ^= seed << 13;
    seed |= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed |= 0;
    return (seed >>> 0) / 4294967296;
  };

  for (let game = 0; game < 200; game++) {
    const pos = fromFen(INITIAL_FEN);
    const level = 1 + (game % 8);
    for (let ply = 0; ply < 60; ply++) {
      const legal = generateLegalMoves(pos);
      if (!legal.length || pos.halfmove >= 100) break;
      positions++;
      // Ask the engine what it would play here, and check the answer.
      const info = search(pos, { level, depth: Math.min(2, levelFor(level).depth), movetimeMs: 0, random });
      assert.ok(info.bestMove !== 0, `game ${game} ply ${ply}: the engine returned no move`);
      assert.ok(
        legal.includes(info.bestMove),
        `game ${game} ply ${ply}: ${toUci(info.bestMove)} is not legal in ${pos.turn === 0 ? 'white' : 'black'} to move`
      );
      engineMoves++;
      // Then play a random legal move, so the next position is a fresh one.
      makeMove(pos, legal[Math.floor(random() * legal.length)]);
    }
  }
  assert.ok(positions > 5000, `only ${positions} positions visited`);
  assert.equal(engineMoves, positions);
});

test('every level plays a legal move and the strong ones out-search the weak', () => {
  const pos = fromFen('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
  const legal = generateLegalMoves(pos);
  let previousDepth = 0;
  for (const level of LEVELS) {
    const info = search(pos, { level: level.level, movetimeMs: 200, random: () => 0.9 });
    assert.ok(legal.includes(info.bestMove), `level ${level.level} played an illegal move`);
    if (level.level >= 5) assert.ok(info.depth >= previousDepth, `level ${level.level} searched shallower`);
    previousDepth = info.depth;
  }
});

test('the book is used when asked and skipped when it runs out', () => {
  const start = fromFen(INITIAL_FEN);
  const booked = search(start, { useBook: true, level: 4, random: () => 0.1 });
  assert.equal(booked.fromBook, true);
  assert.ok(generateLegalMoves(start).includes(booked.bestMove));

  const offBook = fromFen('8/8/3k4/8/8/3K4/6R1/8 w - - 0 1');
  const searched = search(offBook, { useBook: true, level: 5, movetimeMs: 200 });
  assert.equal(searched.fromBook, false);
  assert.ok(searched.depth >= 1);
});

test('the chunked fallback reaches the same conclusion, one depth at a time', () => {
  clearTranspositionTable();
  const pos = fromFen('r1b2k1r/ppp1bppp/8/1B1Q4/5q2/2P5/PPP2PPP/R3R1K1 w - - 1 1');
  const runner = searchChunked(pos, { depth: 5, movetimeMs: 3000, level: 8 });
  let steps = 0;
  let info = null;
  while ((info = runner.next()) !== null) {
    steps++;
    assert.ok(info.depth === steps || info.depth >= steps, 'each call advances a depth');
    if (info.mate !== null) break;
  }
  assert.ok(steps >= 1);
  assert.equal(runner.best().mate, 2);
  assert.equal(toSan(pos, runner.best().bestMove), 'Qd8+');
});

test('a search never disturbs the position it was given', () => {
  const pos = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  const before = JSON.stringify([...pos.board], null, 0) + pos.turn + pos.castling + pos.ep;
  search(pos, { depth: 4, movetimeMs: 500, level: 7 });
  const after = JSON.stringify([...pos.board], null, 0) + pos.turn + pos.castling + pos.ep;
  assert.equal(after, before);
});

test('a stop signal ends the search and still returns a legal move', () => {
  const pos = fromFen(INITIAL_FEN);
  let polls = 0;
  const info = search(pos, { depth: 30, movetimeMs: 0, level: 8, shouldStop: () => ++polls > 2 });
  assert.ok(generateLegalMoves(pos).includes(info.bestMove));
});

test('the worker entry point answers a search request with info and a result', async () => {
  const messages = [];
  const scope = { onmessage: null, postMessage: (m) => messages.push(m) };
  runEngineWorker(scope);
  assert.equal(typeof scope.onmessage, 'function');
  scope.onmessage({
    data: {
      type: 'search',
      id: 7,
      fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
      history: [],
      options: { depth: 3, movetimeMs: 500, level: 8, seed: 42 },
    },
  });
  const result = messages[messages.length - 1];
  assert.equal(result.type, 'result');
  assert.equal(result.id, 7);
  assert.equal(result.bestMove, 'a1a8');
  assert.equal(result.mate, 1);
  assert.ok(messages.some((m) => m.type === 'info'));
});

test('a worker request replays its history, so repetitions are seen', () => {
  const pos = positionFromRequest({
    type: 'search',
    id: 1,
    fen: INITIAL_FEN,
    history: ['g1f3', 'g8f6', 'f3g1', 'f6g8'],
    options: {},
  });
  assert.equal(pos.histCount, 5);
  assert.equal(pos.fullmove, 3);
});

test('the evaluation is symmetric and sane', () => {
  assert.equal(materialBalance(fromFen(INITIAL_FEN)), 0);
  assert.ok(Math.abs(evaluateWhite(fromFen(INITIAL_FEN))) <= 20, 'the starting position is about level');
  const upAQueen = fromFen('rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  assert.ok(evaluateWhite(upAQueen) > 700, 'a queen up is a queen up');
  assert.equal(materialBalance(upAQueen), 9);
  assert.equal(phaseOf(fromFen(INITIAL_FEN)), 1);
  assert.equal(phaseOf(fromFen('8/8/4k3/8/8/4K3/8/8 w - - 0 1')), 0);
});
