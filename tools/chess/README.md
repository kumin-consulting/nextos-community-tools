# Chess

A complete chess program that happens to run in a browser tab. Its own
rules, its own engine, its own opening book, its own analysis - nothing
is fetched, nothing is a service, and none of it leaves your machine.

Play against the engine at eight strengths, play someone else across the
same board, or set the engine against itself and watch. Then go back
through the game and find out where it actually went wrong.

## The rules, in full

Legal move generation with castling on both sides under every condition,
en passant, promotion to any of the four pieces, check, checkmate,
stalemate, insufficient material, threefold repetition, the fifty-move
rule, and the fivefold-repetition and seventy-five-move rules that end a
game whether anyone claims them or not. The two kinds of draw are kept
apart: a third repetition offers a claim, a fifth one ends the game.

The proof is `perft`. The move generator reproduces every published node
count for the standard test positions exactly - the initial position to
depth 5 (4,865,609 nodes), Kiwipete to depth 4 (4,085,603), and five
more - in under three seconds. Those numbers are in the test suite, and
they are the reason you can trust the rest.

## The engine

`src/lib/engine.ts`: iterative deepening over a principal-variation
alpha-beta search with quiescence at the leaves, MVV-LVA capture
ordering, killer moves and a history heuristic, a transposition table
keyed by a Zobrist hash, null-move pruning, late move reductions, check
extensions, and mate scores that shrink with distance so a mate in two is
preferred to a mate in four. The evaluation is tapered - every term is
scored for the middlegame and for the endgame and blended by the material
left - and covers material, piece-square tables, mobility, the bishop
pair, rooks on open files, doubled, isolated and passed pawns, a pawn
shield around the king, and a tempo bonus.

It reaches depth 11 from the starting position inside a two-second move
budget on a laptop, at roughly 700,000 nodes a second, and finds every
mate-in-one, -two and -three in the test suite in milliseconds.

The search runs in a **Web Worker**, so the board never stutters while
the engine thinks; a "thinking" line shows the depth, the node count and
the rate. The worker is built at run time from this app's own compiled
bundle, so the worker and the window run the identical code. Where a
Worker cannot be created at all, the same iterative deepening runs on the
main thread one depth at a time, yielding between them - slower, never
frozen. The status bar says which of the two you are getting.

**Strength 1-8.** The lower levels limit the depth, add scaled noise to
the root scores and sometimes simply play a random legal move, so a
beginner can win at level 1 and has a real game at level 3. From level 5
up the noise is gone and it plays the best move it found.

## Openings

A 350-line ECO book names what you are playing as you play it ("C65 Ruy
Lopez, Berlin Defence") and gives the engine something human to play in
the first dozen moves instead of grinding out the same search every game.
Every line in the book is replayed from the initial position by the test
suite, so a typo in the data cannot ship.

## Analysis

Turn analysis on and an evaluation bar, the engine's expected line and a
best-move arrow follow you through any position, including deep inside a
variation.

**The report** looks at every move of the game and says where it went
wrong: blunders, mistakes and inaccuracies at half a pawn, a pawn and two
pawns of evaluation lost, an average centipawn loss and an accuracy
percentage per side, the three costliest moves, and a short paragraph in
plain words. A finished position is scored as the result rather than as a
zero, so delivering checkmate is not reported as a ten-pawn blunder.

**Puzzles** are the positions from that report where you had something
two pawns better and played something else - your own missed tactics,
which are worth a hundred generic ones. Find the move; the app tells you
whether you got it.

## Files

Games are PGN, and nothing else.

- Saved to `~/Chess/games/<date>-<white>-<black>.pgn`, one game per file,
  automatically when a game ends and whenever you press Save.
- The games list reads each file's tags - players, date, result, opening
  - without replaying the moves.
- The game in progress is written to `~/Chess/current.pgn` after every
  move and comes back when you open the app again.
- Import by pasting PGN or choosing a `.pgn` file: tags, comments,
  variations and numeric annotation glyphs all come in, and anything that
  does not parse is reported rather than swallowed.
- Copy the game as PGN or the position as FEN to the clipboard.

## Keyboard

Everything is reachable without a mouse. Press `?` in the app for the
list.

| Key | What it does |
| --- | --- |
| `←` `→` | One move back or forward |
| `Home` `End` | The start or the end of the game |
| `Space` | Play through the game, or stop |
| `F` | Flip the board |
| `N` | New game |
| `T` | Take back the last move |
| `A` | Engine analysis on or off |
| `E` | Ask the engine to move now |
| `M` or `/` | Type a move in algebraic notation |
| `S` | Sound on or off |
| `C` | Coordinates on or off |
| `P` | Next piece set |
| `B` | Next board theme |
| `R` | Analyse the whole game |
| `1`-`8` | Set the engine strength |
| `Ctrl`/`⌘` `S` | Save this game as a PGN file |
| `Ctrl`/`⌘` `C` | Copy the game as PGN |
| `?` | The shortcut list |
| `Esc` | Close whatever is open |

On the board itself the arrow keys move a cursor and `Enter` picks a
piece up and puts it down, so a whole game can be played from the
keyboard - or typed into the move box in algebraic notation, which
accepts `Nf3`, `exd5`, `O-O`, `0-0`, `e8=Q` and `e2e4` alike.

## Look and feel

Two piece sets (Classic, solid; Line, outlined) and three board themes
(Walnut, Sea glass, Slate), all drawn as inline SVG - no image files.
Both the light and the dark theme are designed rather than inverted.
Coordinates, last-move and check highlights, legal-move dots, and small
synthesised click sounds through WebAudio that can be turned off.
Optional clocks with a Fischer increment, including the rule that a flag
fall against a king that cannot mate is a draw.

## Tools for agents

Every tool works whether or not the window is open, and acts on the same
game the window shows.

| Tool | What it does |
| --- | --- |
| `chess_new_game` | Start a game: the opponent (engine, another person, or engine vs engine), the colour, the strength 1-8, an optional starting FEN and an optional clock. |
| `chess_play_move` | Play one move in algebraic or coordinate notation, and get the engine's reply when it is the engine's turn. An illegal move changes nothing and comes back with the legal list. |
| `chess_position` | Read-only: FEN, a plain-text board, the side to move, every legal move in algebraic notation, check and mate status, the opening's name, the moves so far and the game as PGN. |
| `chess_analyze` | Read-only: the engine's view of a FEN, a PGN or the game in progress - evaluation, best move, expected line, and a sentence saying what that means. With `everyMove`, judges every move and reports the blunders. |
| `chess_list_games` | Read-only: the saved games, newest first, with players, date, result and opening. |
| `chess_import_pgn` | Load a game from PGN text or a `.pgn` file, replacing the game in progress; optionally saves a copy. |

Intents: `open` (`{ file }`) opens a `.pgn` file, `analyze` (`{ fen }`)
sets the board to a position and analyses it.

## Permissions

- `fs:read:home`, `fs:write:home` - the `~/Chess` folder: saved games,
  the game in progress, and the app's own compiled bundle, which the
  engine worker reads to run.
- `storage` - settings and a copy of the game in progress.
- `clipboard` - the Copy PGN and Copy FEN buttons.
- `intents` - the `open` and `analyze` intents above.

There is no `network` permission, and nothing here makes a network
request.

## Limits, honestly

- The engine is a strong club player, not a modern top engine: single
  threaded, no endgame tablebases, no neural evaluation, a plain
  hand-written evaluation. Level 8 thinks for about two seconds a move.
- The transposition table is fixed at half a million entries (about 10
  MB). It is not configurable.
- The whole-game report searches each position for about a third of a
  second, so a fifty-move game takes roughly half a minute. It runs in
  its own worker and the board stays usable while it does.
- Puzzles come only from games you have analysed in this app; there is no
  puzzle database.
- A move played while you are browsing an earlier position starts a
  variation rather than changing the game, and the engine does not answer
  it. That is deliberate - it is how you try things out - but it can
  surprise you the first time.
- PGN import reads one game at a time into the board; a file with many
  games loads the first, and `chess_analyze` can be given the rest.

## Building it

```
npm run build:app -- chess      # compile src/ to files/build/app.js and zip it
npm run test:apps               # the rules, the engine, the book, the parsers
npm run typecheck:apps
node tools/chess/app/preview/serve.mjs   # look at it in a browser at :4173
```

The tests are the interesting part: `perft.test.mjs` is the proof the
rules are right, `engine.test.mjs` checks known mates and then asks the
engine for a move in every position of two hundred random games and
verifies each one is legal, and `openings.test.mjs` replays all 350 book
lines.

MIT licensed.
