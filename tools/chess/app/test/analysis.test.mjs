// test/analysis.test.mjs
//
// The blunder finder, driven by a stub engine so the arithmetic is
// visible rather than inferred. The real engine is exercised in
// engine.test.mjs; what matters here is that a drop in evaluation is
// attributed to the right move, from the right player's point of view,
// and that a game already decided does not produce a blunder on every
// remaining move.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register(new URL('./_ts-hook.mjs', import.meta.url));

const { analyzeGame, findPuzzles, describeReport, accuracyFromLoss, evalBarFraction, formatScore, THRESHOLDS, CLAMP, sanLine } =
  await import('../src/lib/analysis.ts');
const { parsePgn } = await import('../src/lib/pgn.ts');
const { createTree, playSan, mainLine, positionAt } = await import('../src/lib/game.ts');
const { generateLegalMoves } = await import('../src/lib/moves.ts');
const { toFen } = await import('../src/lib/fen.ts');
const { WHITE, BLACK } = await import('../src/lib/types.ts');
const { search } = await import('../src/lib/engine.ts');

/** A stub engine: it reads the score for a position out of a table, and
 *  suggests whatever the first legal move is. */
function stubAnalyser(scores) {
  return (pos) => {
    const fen = toFen(pos).split(' ').slice(0, 4).join(' ');
    const score = scores[fen] ?? 0;
    const legal = generateLegalMoves(pos);
    return { score, mate: null, pv: legal.slice(0, 2) };
  };
}

function treeOf(sans) {
  const tree = createTree();
  let node = 0;
  for (const san of sans) {
    node = playSan(tree, node, san);
    assert.ok(node !== null, san);
  }
  return tree;
}

test('a drop in evaluation is charged to the player who caused it', () => {
  const tree = treeOf(['e4', 'e5', 'Qh5', 'Nc6']);
  const line = mainLine(tree);
  const scores = {};
  // Scores are from the SIDE TO MOVE's point of view, as the engine
  // reports them.
  scores[key(tree, 0)] = 20; // White to move, slightly better
  scores[key(tree, line[0])] = -20; // Black to move after 1.e4
  scores[key(tree, line[1])] = 20; // White to move after 1...e5
  scores[key(tree, line[2])] = 280; // Black to move after 2.Qh5: Black is much better, so White gave away 300
  scores[key(tree, line[3])] = -280;

  const report = analyzeGame(tree, stubAnalyser(scores));
  assert.equal(report.moves.length, 4);
  const qh5 = report.moves[2];
  assert.equal(qh5.san, 'Qh5');
  assert.equal(qh5.color, WHITE);
  assert.equal(qh5.loss, 300);
  assert.equal(qh5.quality, 'blunder');
  assert.equal(report.white.blunders, 1);
  assert.equal(report.black.blunders, 0);
  assert.equal(report.worst[0].san, 'Qh5');
});

function key(tree, nodeId) {
  return toFen(positionAt(tree, nodeId)).split(' ').slice(0, 4).join(' ');
}

test('the labels follow the thresholds', () => {
  const cases = [
    [0, 'best'],
    [THRESHOLDS.inaccuracy - 1, 'good'],
    [THRESHOLDS.inaccuracy, 'inaccuracy'],
    [THRESHOLDS.mistake, 'mistake'],
    [THRESHOLDS.blunder, 'blunder'],
  ];
  for (const [loss, quality] of cases) {
    const tree = treeOf(['e4', 'e5']);
    const line = mainLine(tree);
    const scores = {};
    scores[key(tree, 0)] = loss;
    scores[key(tree, line[0])] = 0;
    scores[key(tree, line[1])] = 0;
    const report = analyzeGame(tree, stubAnalyser(scores));
    assert.equal(report.moves[0].quality, quality, `a loss of ${loss}`);
  }
});

test('a decided game does not blunder on every move', () => {
  // Both sides are at the clamp: nothing can get worse, so nothing is a
  // blunder.
  const tree = treeOf(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
  const scores = {};
  let flip = 1;
  scores[key(tree, 0)] = CLAMP * 2;
  for (const id of mainLine(tree)) {
    flip = -flip;
    scores[key(tree, id)] = flip * CLAMP * 2;
  }
  const report = analyzeGame(tree, stubAnalyser(scores));
  assert.equal(report.white.blunders, 0);
  assert.equal(report.black.blunders, 0);
  assert.equal(report.white.averageLoss, 0);
});

test('accuracy is a monotone restatement of the average loss', () => {
  assert.equal(accuracyFromLoss(0), 100);
  assert.ok(accuracyFromLoss(20) < 100 && accuracyFromLoss(20) > 85);
  assert.ok(accuracyFromLoss(100) < accuracyFromLoss(50));
  assert.ok(accuracyFromLoss(400) < 20);
});

test('puzzles come out of the positions where something was missed', () => {
  const tree = treeOf(['e4', 'e5', 'Qh5', 'Nc6']);
  const line = mainLine(tree);
  const scores = {};
  scores[key(tree, 0)] = 20;
  scores[key(tree, line[0])] = -20;
  scores[key(tree, line[1])] = 20;
  scores[key(tree, line[2])] = 280;
  scores[key(tree, line[3])] = -280;
  const report = analyzeGame(tree, stubAnalyser(scores));
  const puzzles = findPuzzles(tree, report);
  assert.equal(puzzles.length, 1);
  assert.equal(puzzles[0].playedSan, 'Qh5');
  assert.equal(puzzles[0].color, WHITE);
  assert.ok(puzzles[0].solution.length >= 1);
  assert.match(puzzles[0].label, /Qh5/);
  // The FEN is the position BEFORE the mistake - that is the puzzle.
  assert.equal(puzzles[0].fen.split(' ')[1], 'w');
  assert.equal(findPuzzles(tree, report, 10_000).length, 0);
});

test('the written summary says something true', () => {
  const tree = treeOf(['e4', 'e5', 'Qh5', 'Nc6']);
  const line = mainLine(tree);
  const scores = {};
  scores[key(tree, 0)] = 20;
  scores[key(tree, line[0])] = -20;
  scores[key(tree, line[1])] = 20;
  scores[key(tree, line[2])] = 280;
  scores[key(tree, line[3])] = -280;
  const report = analyzeGame(tree, stubAnalyser(scores));
  const text = describeReport(report, WHITE, '0-1');
  assert.match(text, /1 blunder/);
  assert.match(text, /Qh5/);
  assert.match(text, /accuracy/);
  assert.match(describeReport(report, BLACK, '0-1'), /Black played/);
});

test('the eval bar and its label behave at both extremes', () => {
  assert.equal(evalBarFraction(0, null), 0.5);
  assert.ok(evalBarFraction(600, null) > 0.8);
  assert.ok(evalBarFraction(-600, null) < 0.2);
  assert.equal(evalBarFraction(0, 3), 1);
  assert.equal(evalBarFraction(0, -3), 0);
  assert.equal(formatScore(0, null), '+0.00');
  assert.equal(formatScore(137, null), '+1.37');
  assert.equal(formatScore(-45, null), '-0.45');
  assert.equal(formatScore(0, 3), 'M3');
  assert.equal(formatScore(0, -2), '-M2');
});

test('a real engine analysis of a short game finds the real blunder', () => {
  // 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7# - the move before mate is the
  // blunder, and the engine has to agree.
  const { games } = parsePgn('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0');
  const tree = games[0];
  const analyser = (pos) => {
    const info = search(pos, { depth: 4, movetimeMs: 150, level: 8 });
    return { score: info.score, mate: info.mate, pv: info.pv };
  };
  const report = analyzeGame(tree, analyser);
  assert.equal(report.moves.length, 7);
  const nf6 = report.moves[5];
  assert.equal(nf6.san, 'Nf6');
  assert.equal(nf6.color, BLACK);
  assert.equal(nf6.quality, 'blunder');
  assert.ok(nf6.bestSan !== 'Nf6' && nf6.bestSan.length > 1);
  assert.ok(report.black.blunders >= 1);
  const puzzles = findPuzzles(tree, report);
  assert.ok(puzzles.length >= 1);
});

test('sanLine prints a line without disturbing the board', () => {
  const tree = treeOf(['e4']);
  const pos = positionAt(tree, 0);
  const before = toFen(pos);
  const moves = generateLegalMoves(pos).slice(0, 3);
  const sans = sanLine(pos, moves.slice(0, 1));
  assert.equal(sans.length, 1);
  assert.equal(toFen(pos), before);
});
