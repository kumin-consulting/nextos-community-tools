// test/pgn.test.mjs
//
// PGN in and out, including the parts hobby parsers skip: nested
// variations, comments before and after a move, numeric annotation
// glyphs, a FEN tag, several games in one file, and text that is simply
// wrong - which must produce a problem report and the games that DID
// load, never an exception.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register(new URL('./_ts-hook.mjs', import.meta.url));

const { parsePgn, printPgn, mainLineSan } = await import('../src/lib/pgn.ts');
const { positionAt, mainLine, mainLineEnd, playSan, createTree, promoteVariation, truncateAfter, deleteNode } =
  await import('../src/lib/game.ts');
const { toFen } = await import('../src/lib/fen.ts');

const IMMORTAL = `[Event "London"]
[Site "London ENG"]
[Date "1851.06.21"]
[Round "?"]
[White "Adolf Anderssen"]
[Black "Lionel Kieseritzky"]
[Result "1-0"]

1.e4 e5 2.f4 exf4 3.Bc4 Qh4+ 4.Kf1 b5 5.Bxb5 Nf6 6.Nf3 Qh6 7.d3 Nh5 8.Nh4 Qg5
9.Nf5 c6 10.g4 Nf6 11.Rg1 cxb5 12.h4 Qg6 13.h5 Qg5 14.Qf3 Ng8 15.Bxf4 Qf6
16.Nc3 Bc5 17.Nd5 Qxb2 18.Bd6 Bxg1 19.e5 Qxa1+ 20.Ke2 Na6 21.Nxg7+ Kd8
22.Qf6+ Nxf6 23.Be7# 1-0
`;

test('a real game parses, prints and parses back to the same moves', () => {
  const { games, problems } = parsePgn(IMMORTAL);
  assert.deepEqual(problems, []);
  assert.equal(games.length, 1);
  const game = games[0];
  assert.equal(game.tags.White, 'Adolf Anderssen');
  assert.equal(game.result, '1-0');
  const sans = mainLineSan(game);
  assert.equal(sans.length, 45);
  assert.equal(sans[0], 'e4');
  assert.equal(sans[44], 'Be7#');

  const printed = printPgn(game);
  const again = parsePgn(printed);
  assert.deepEqual(again.problems, []);
  assert.deepEqual(mainLineSan(again.games[0]), sans);
  assert.equal(again.games[0].tags.Black, 'Lionel Kieseritzky');
});

test('comments, variations and NAGs survive a round trip', () => {
  const text = `[Event "Annotated"]

1. e4 {the best by test} e5 2. Nf3 (2. f4 {the King's Gambit} exf4 3. Nf3) 2... Nc6
3. Bb5 $1 {the Ruy Lopez} a6 *`;
  const { games, problems } = parsePgn(text);
  assert.deepEqual(problems, []);
  const game = games[0];
  const line = mainLine(game);
  assert.equal(game.nodes[line[0]].comment, 'the best by test');
  assert.deepEqual(game.nodes[line[4]].nags, [1]);
  assert.equal(game.nodes[line[4]].comment, 'the Ruy Lopez');
  // The variation hangs off the move before 2. Nf3.
  const beforeNf3 = game.nodes[line[2]].parent;
  assert.equal(game.nodes[beforeNf3].children.length, 2);
  const variation = game.nodes[game.nodes[beforeNf3].children[1]];
  assert.equal(variation.san, 'f4');
  assert.equal(variation.comment, "the King's Gambit");

  const printed = printPgn(game);
  assert.match(printed, /\(2\. f4/);
  assert.match(printed, /\$1/);
  const again = parsePgn(printed).games[0];
  assert.deepEqual(mainLineSan(again), mainLineSan(game));
  assert.equal(again.nodes[mainLine(again)[4]].comment, 'the Ruy Lopez');
});

test('a FEN tag sets the starting position and survives printing', () => {
  const text = `[SetUp "1"]
[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]

1. e4 Kd7 2. e5 *`;
  const game = parsePgn(text).games[0];
  assert.equal(game.startFen, '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
  assert.deepEqual(mainLineSan(game), ['e4', 'Kd7', 'e5']);
  const printed = printPgn(game);
  assert.match(printed, /\[FEN "4k3/);
  assert.equal(parsePgn(printed).games[0].startFen, game.startFen);
});

test('several games in one file all come back', () => {
  const text = `${IMMORTAL}\n${IMMORTAL.replace('Adolf Anderssen', 'Someone Else')}`;
  const { games, problems } = parsePgn(text);
  assert.deepEqual(problems, []);
  assert.equal(games.length, 2);
  assert.equal(games[1].tags.White, 'Someone Else');
});

test('a broken move is reported, and the rest of the file still loads', () => {
  const { games, problems } = parsePgn('[Event "Bad"]\n\n1. e4 e5 2. Nf9 Nc6 *');
  assert.equal(games.length, 1);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Nf9/);
  assert.deepEqual(mainLineSan(games[0]), ['e4', 'e5']);
});

test('rubbish produces a problem rather than an exception', () => {
  const { games, problems } = parsePgn('this is not a chess game at all');
  assert.equal(games.length, 0);
  assert.ok(problems.length >= 1);
  assert.deepEqual(parsePgn('').games, []);
});

test('; comments and % escape lines are understood', () => {
  const text = '% this line is escaped\n1. e4 ; a comment to the end of the line\ne5 *';
  const game = parsePgn(text).games[0];
  assert.deepEqual(mainLineSan(game), ['e4', 'e5']);
  assert.equal(game.nodes[mainLine(game)[0]].comment, 'a comment to the end of the line');
});

test('the tree replays to the right position at any node', () => {
  const game = parsePgn(IMMORTAL).games[0];
  const line = mainLine(game);
  // After 3...Qh4+, the sixth ply of the game.
  const afterQh4 = positionAt(game, line[5]);
  assert.equal(toFen(afterQh4), 'rnb1kbnr/pppp1ppp/8/8/2B1Pp1q/8/PPPP2PP/RNBQK1NR w KQkq - 2 4');
  const end = positionAt(game, mainLineEnd(game));
  assert.equal(end.turn, 1, 'Black is to move after the mating move');
});

test('variations can be added, promoted, truncated and deleted', () => {
  const tree = createTree();
  let node = playSan(tree, 0, 'e4');
  node = playSan(tree, node, 'e5');
  const nf3 = playSan(tree, node, 'Nf3');
  const f4 = playSan(tree, node, 'f4');
  assert.equal(tree.nodes[node].children.length, 2);
  assert.deepEqual(mainLineSan(tree), ['e4', 'e5', 'Nf3']);

  promoteVariation(tree, f4);
  assert.deepEqual(mainLineSan(tree), ['e4', 'e5', 'f4']);

  deleteNode(tree, nf3);
  assert.equal(tree.nodes[node].children.length, 1);

  truncateAfter(tree, node);
  assert.deepEqual(mainLineSan(tree), ['e4', 'e5']);

  assert.equal(playSan(tree, node, 'Qxz9'), null, 'an illegal move changes nothing');
  assert.deepEqual(mainLineSan(tree), ['e4', 'e5']);
});

test('replaying a move that is already there walks into it instead of duplicating', () => {
  const tree = createTree();
  const first = playSan(tree, 0, 'e4');
  const again = playSan(tree, 0, 'e4');
  assert.equal(first, again);
  assert.equal(tree.nodes[0].children.length, 1);
});
