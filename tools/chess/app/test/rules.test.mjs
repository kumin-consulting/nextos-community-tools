// test/rules.test.mjs
//
// The endings. Every one of these is a rule people get wrong in hobby
// chess programs: two knights is NOT insufficient material, the third
// repetition is a CLAIM and not an automatic draw, the fifth one is
// automatic, and a flag fall against a bare king is a draw rather than a
// win.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register(new URL('./_ts-hook.mjs', import.meta.url));

const { fromFen } = await import('../src/lib/fen.ts');
const { gameStatus, describeStatus, resultOnFlag, materialCannotMate } = await import('../src/lib/rules.ts');
const { parseSan } = await import('../src/lib/san.ts');
const { makeMove } = await import('../src/lib/board.ts');
const { WHITE, BLACK } = await import('../src/lib/types.ts');

function play(fen, sans) {
  const pos = fromFen(fen);
  for (const san of sans) {
    const move = parseSan(pos, san);
    assert.ok(move !== null, `${san} should be legal in ${fen}`);
    makeMove(pos, move);
  }
  return pos;
}

test('checkmate ends the game and names the winner', () => {
  const pos = play('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', ['Qh4']);
  const status = gameStatus(pos);
  assert.equal(status.over, true);
  assert.equal(status.reason, 'checkmate');
  assert.equal(status.result, '0-1');
  assert.match(describeStatus(status, pos), /Black wins/);
});

test('stalemate is a draw, not a loss', () => {
  const pos = fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  const status = gameStatus(pos);
  assert.equal(status.over, true);
  assert.equal(status.reason, 'stalemate');
  assert.equal(status.result, '1/2-1/2');
});

test('insufficient material follows the rule, not the folklore', () => {
  const drawn = [
    '8/8/4k3/8/8/4K3/8/8 w - - 0 1', // bare kings
    '8/8/4k3/8/8/4K3/8/5B2 w - - 0 1', // king and bishop
    '8/8/4k3/8/8/4K3/8/5N2 w - - 0 1', // king and knight
    '5b2/8/4k3/8/8/4K3/8/4B3 w - - 0 1', // bishops on the same colour
  ];
  for (const fen of drawn) {
    assert.equal(gameStatus(fromFen(fen)).reason, 'insufficient-material', fen);
  }
  const playable = [
    '8/8/4k3/8/8/4K3/8/4NN2 w - - 0 1', // two knights: mate is possible
    '5b2/8/4k3/8/8/4K3/8/5B2 w - - 0 1', // bishops on opposite colours
    '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1', // a pawn can promote
  ];
  for (const fen of playable) {
    assert.equal(gameStatus(fromFen(fen)).over, false, fen);
  }
});

test('the third repetition is claimable and the fifth is automatic', () => {
  const shuffle = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  // Two full cycles reaches the position a third time.
  let pos = play(start, [...shuffle, ...shuffle]);
  let status = gameStatus(pos);
  assert.equal(status.repetitions, 3);
  assert.equal(status.over, false, 'a threefold repetition does not end the game by itself');
  assert.equal(status.claimableDraw, 'threefold-repetition');

  // Four cycles reaches it a fifth time, which does.
  pos = play(start, [...shuffle, ...shuffle, ...shuffle, ...shuffle]);
  status = gameStatus(pos);
  assert.equal(status.repetitions, 5);
  assert.equal(status.over, true);
  assert.equal(status.reason, 'fivefold-repetition');
});

test('the fifty-move rule is a claim and the seventy-fifth is not', () => {
  const claimable = gameStatus(fromFen('8/8/4k3/8/8/4K3/8/R6r w - - 100 80'));
  assert.equal(claimable.over, false);
  assert.equal(claimable.claimableDraw, 'fifty-move');

  const automatic = gameStatus(fromFen('8/8/4k3/8/8/4K3/8/R6r w - - 150 120'));
  assert.equal(automatic.over, true);
  assert.equal(automatic.reason, 'seventy-five-move');
});

test('checkmate beats the seventy-five-move rule', () => {
  // Mate on the board with a huge halfmove clock is still mate.
  const pos = fromFen('7k/6Q1/5K2/8/8/8/8/8 b - - 149 120');
  const status = gameStatus(pos);
  assert.equal(status.reason, 'checkmate');
});

test('a flag fall against a king that cannot mate is a draw', () => {
  const bare = fromFen('8/8/4k3/8/8/4K3/8/5B2 w - - 0 1');
  assert.equal(materialCannotMate(bare, WHITE), true);
  assert.equal(resultOnFlag(bare, BLACK).reason, 'timeout-vs-insufficient');
  assert.equal(resultOnFlag(bare, BLACK).result, '1/2-1/2');

  const rook = fromFen('8/8/4k3/8/8/4K3/8/5R2 w - - 0 1');
  assert.equal(materialCannotMate(rook, WHITE), false);
  assert.equal(resultOnFlag(rook, BLACK).result, '1-0');
});
