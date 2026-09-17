// src/tools.ts
//
// The app's real API, as tools an agent can call. Each one does exactly
// what the same button in the window does, against the same game (see
// src/store.ts) - so "play e4 for me" and clicking e4 are the same act,
// and the window updates the moment a tool changes anything whether or
// not anyone is looking at it.
//
// The descriptions are written for a model that has never seen this
// code: they say what the tool does, what the arguments mean, what comes
// back, and - where it matters - what NOT to use it for.

import sdk from '@kumin/sdk';
import type { AppAgentTool } from './lib/agentTool';
import type { Color, Position } from './lib/types';
import { BLACK, WHITE } from './lib/types';
import { parseFen, toAscii, toFen } from './lib/fen';
import { generateLegalMoves } from './lib/moves';
import { parseSan, toSan, toUci } from './lib/san';
import { describeStatus, gameStatus } from './lib/rules';
import { addMove, createTree, mainLine, mainLineEnd, positionAt } from './lib/game';
import { mainLineSan, parsePgn, printPgn } from './lib/pgn';
import { openingLabel } from './lib/openings';
import { levelFor, mateDistance, search } from './lib/engine';
import { buildReport, describeReport, formatScore, sanLine } from './lib/analysis';
import type { Judgement } from './lib/analysis';
import { listGames, readGame, saveGame } from './files';
import * as store from './store';

const PREFIX = `${sdk.app.id.replace(/-/g, '_')}_`;

type Json = Record<string, unknown>;

function ok<T extends Json>(value: T): T {
  return value;
}

function positionSummary(pos: Position): Json {
  const status = gameStatus(pos);
  const legal = generateLegalMoves(pos);
  return {
    fen: toFen(pos),
    board: toAscii(pos),
    sideToMove: pos.turn === WHITE ? 'white' : 'black',
    legalMoves: legal.map((m) => toSan(pos, m)),
    legalMoveCount: legal.length,
    inCheck: status.inCheck,
    isCheckmate: status.reason === 'checkmate',
    isStalemate: status.reason === 'stalemate',
    isGameOver: status.over,
    result: status.result,
    endedBecause: status.reason,
    claimableDraw: status.claimableDraw,
    halfmoveClock: status.halfmoveClock,
    repetitions: status.repetitions,
    summary: describeStatus(status, pos),
  };
}

function currentGameSummary(): Json {
  const state = store.getState();
  const pos = positionAt(state.tree, mainLineEnd(state.tree));
  const sans = mainLineSan(state.tree);
  return {
    ...positionSummary(pos),
    opening: openingLabel(sans) || null,
    moves: sans,
    moveCount: sans.length,
    pgn: store.currentPgn(),
    mode: state.mode,
    engineLevel: state.level,
    youPlay: state.mode === 'human-engine' ? (state.humanColor === WHITE ? 'white' : 'black') : null,
  };
}

/** Runs the search on whatever position it is given, and says what it
 *  found in words as well as numbers. */
function analyse(pos: Position, options: { depth?: number; movetimeMs?: number }): Json {
  const info = search(pos, {
    depth: options.depth ?? 14,
    movetimeMs: options.movetimeMs ?? 1200,
    level: 8,
  });
  const line = sanLine(pos, info.pv, 10);
  const scoreWhite = pos.turn === WHITE ? info.score : -info.score;
  const mateWhite = info.mate === null ? null : pos.turn === WHITE ? info.mate : -info.mate;
  const best = info.bestMove ? toSan(pos, info.bestMove) : null;
  return {
    fen: toFen(pos),
    bestMove: best,
    bestMoveUci: info.bestMove ? toUci(info.bestMove) : null,
    line,
    evaluation: formatScore(scoreWhite, mateWhite),
    centipawns: scoreWhite,
    mateIn: mateWhite,
    depth: info.depth,
    nodes: info.nodes,
    summary: describeEvaluation(scoreWhite, mateWhite, best, line),
  };
}

function describeEvaluation(scoreWhite: number, mate: number | null, best: string | null, line: string[]): string {
  const who = scoreWhite >= 0 ? 'White' : 'Black';
  if (mate !== null) {
    const side = mate > 0 ? 'White' : 'Black';
    return `${side} has a forced mate in ${Math.abs(mate)}${best ? `, starting with ${best}` : ''}. The line is ${line.join(' ')}.`;
  }
  const pawns = Math.abs(scoreWhite) / 100;
  let verdict: string;
  if (pawns < 0.3) verdict = 'The position is level';
  else if (pawns < 0.8) verdict = `${who} is slightly better`;
  else if (pawns < 1.8) verdict = `${who} is clearly better`;
  else if (pawns < 4) verdict = `${who} is winning`;
  else verdict = `${who} is completely winning`;
  return `${verdict} (${formatScore(scoreWhite, null)}).${best ? ` The best move is ${best}; the engine expects ${line.join(' ')}.` : ''}`;
}

export const tools: AppAgentTool[] = [
  {
    name: `${PREFIX}new_game`,
    description:
      'Start a new chess game, replacing the one in progress. Use it before playing moves when the person asks for a fresh game or for a different opponent, colour or strength. Returns the starting position.',
    inputSchema: {
      type: 'object',
      properties: {
        opponent: {
          type: 'string',
          enum: ['engine', 'person', 'engine-vs-engine'],
          description:
            "Who the person is playing: 'engine' (the default - you against the app's engine), 'person' (two people sharing one board), or 'engine-vs-engine' (the engine plays both sides and you watch).",
        },
        playAs: {
          type: 'string',
          enum: ['white', 'black'],
          description: "Which colour the person takes when the opponent is the engine. Defaults to white.",
        },
        level: {
          type: 'integer',
          minimum: 1,
          maximum: 8,
          description:
            'Engine strength, 1 (a beginner can win) to 8 (as strong as this engine gets - about two seconds a move). Defaults to 4.',
        },
        fen: {
          type: 'string',
          description: 'Start from this position instead of the usual one. A full FEN. Optional.',
        },
        minutes: {
          type: 'number',
          description: 'Give each side a clock with this many minutes. Omit for no clock.',
        },
        incrementSeconds: {
          type: 'number',
          description: 'Seconds added after each move when a clock is used. Defaults to 0.',
        },
      },
    },
    execute: (raw: unknown) => {
      const input = (raw ?? {}) as Json;
      const opponent = String(input.opponent ?? 'engine');
      const mode = opponent === 'person' ? 'human-human' : opponent === 'engine-vs-engine' ? 'engine-engine' : 'human-engine';
      const level = clampLevel(input.level);
      const fen = typeof input.fen === 'string' && input.fen.trim() ? input.fen.trim() : undefined;
      if (fen) {
        const parsed = parseFen(fen);
        if (!parsed.ok) return ok({ ok: false, error: `That FEN does not describe a position: ${parsed.error}` });
      }
      const minutes = typeof input.minutes === 'number' && input.minutes > 0 ? input.minutes : 0;
      store.newGame({
        mode,
        humanColor: input.playAs === 'black' ? BLACK : WHITE,
        level,
        timeControl: minutes
          ? { initialMs: minutes * 60_000, incrementMs: Math.max(0, Number(input.incrementSeconds ?? 0)) * 1000 }
          : null,
        startFen: fen,
      });
      store.persistNow();
      return ok({ ok: true, ...currentGameSummary() });
    },
  },

  {
    name: `${PREFIX}play_move`,
    description:
      "Play one move in the game in progress. The move may be algebraic ('Nf3', 'exd5', 'O-O', 'e8=Q') or coordinates ('g1f3', 'e7e8q'). When the person is playing the engine and it is then the engine's turn, the engine's reply is played too and returned. Fails without changing anything if the move is not legal.",
    inputSchema: {
      type: 'object',
      properties: {
        move: { type: 'string', description: "The move, in algebraic or coordinate notation." },
        engineReplies: {
          type: 'boolean',
          description: "Let the engine answer when it is its turn. Defaults to true.",
        },
      },
      required: ['move'],
    },
    execute: (raw: unknown) => {
      const input = (raw ?? {}) as Json;
      store.ensureRestored();
      const state = store.getState();
      const end = mainLineEnd(state.tree);
      const pos = positionAt(state.tree, end);
      const before = gameStatus(pos);
      if (before.over) {
        return ok({ ok: false, error: `The game is already over: ${describeStatus(before, pos)}`, ...currentGameSummary() });
      }
      const text = String(input.move ?? '');
      const move = parseSan(pos, text);
      if (move === null) {
        return ok({
          ok: false,
          error: `"${text}" is not a legal move in this position.`,
          legalMoves: generateLegalMoves(pos).map((m) => toSan(pos, m)),
          fen: toFen(pos),
        });
      }
      const san = toSan(pos, move);
      const node = addMove(state.tree, end, move, pos);
      store.update({ nodeId: node });

      let reply: Json | null = null;
      const after = positionAt(state.tree, node);
      const afterStatus = gameStatus(after);
      const wantsReply = input.engineReplies !== false;
      if (wantsReply && !afterStatus.over && state.mode === 'human-engine' && after.turn !== state.humanColor) {
        const info = search(after, { level: state.level, useBook: mainLine(state.tree).length < 16 });
        if (info.bestMove) {
          const replySan = toSan(after, info.bestMove);
          const replyNode = addMove(state.tree, node, info.bestMove, after);
          store.update({ nodeId: replyNode });
          reply = {
            move: replySan,
            uci: toUci(info.bestMove),
            fromBook: info.fromBook,
            depth: info.depth,
            evaluation: formatScore(after.turn === WHITE ? info.score : -info.score, null),
          };
        }
      }
      store.persistNow();
      return ok({ ok: true, played: san, engineReply: reply, ...currentGameSummary() });
    },
  },

  {
    name: `${PREFIX}position`,
    description:
      'Look at the game in progress without changing it: the FEN, a plain-text board, whose turn it is, every legal move in algebraic notation, whether anyone is in check or mated, the name of the opening and the moves so far.',
    inputSchema: { type: 'object', properties: {} },
    readOnly: true,
    execute: () => {
      store.ensureRestored();
      return ok({ ok: true, ...currentGameSummary() });
    },
  },

  {
    name: `${PREFIX}analyze`,
    description:
      "Ask the engine what it thinks of a position. Give a FEN, or a PGN (the position after its last move is used), or neither to analyse the game in progress. Returns the evaluation in pawns, the move the engine would play, the line it expects, and a sentence saying what that means. Does not change the game.",
    inputSchema: {
      type: 'object',
      properties: {
        fen: { type: 'string', description: 'A position to analyse, as a FEN.' },
        pgn: { type: 'string', description: 'A game to analyse; the final position is used unless `everyMove` is set.' },
        depth: { type: 'integer', minimum: 1, maximum: 30, description: 'How deep to search. Defaults to 14.' },
        movetimeMs: {
          type: 'integer',
          minimum: 50,
          maximum: 10000,
          description: 'How long to think, in milliseconds. Defaults to 1200.',
        },
        everyMove: {
          type: 'boolean',
          description:
            'With a PGN (or the game in progress), judge every move and return the blunders, mistakes and inaccuracies as well as the final verdict. Slower.',
        },
      },
    },
    readOnly: true,
    execute: (raw: unknown) => {
      const input = (raw ?? {}) as Json;
      const depth = typeof input.depth === 'number' ? input.depth : undefined;
      const movetimeMs = typeof input.movetimeMs === 'number' ? input.movetimeMs : undefined;

      if (typeof input.fen === 'string' && input.fen.trim()) {
        const parsed = parseFen(input.fen.trim());
        if (!parsed.ok) return ok({ ok: false, error: `That FEN does not describe a position: ${parsed.error}` });
        return ok({ ok: true, ...analyse(parsed.position, { depth, movetimeMs }) });
      }

      let tree = store.getState().tree;
      if (typeof input.pgn === 'string' && input.pgn.trim()) {
        const { games, problems } = parsePgn(input.pgn);
        if (!games.length) return ok({ ok: false, error: problems[0] ?? 'No game was found in that PGN.' });
        tree = games[0];
      } else {
        store.ensureRestored();
      }

      const end = mainLineEnd(tree);
      const finalPosition = positionAt(tree, end);
      const verdict = analyse(finalPosition, { depth, movetimeMs });
      if (input.everyMove !== true) return ok({ ok: true, ...verdict });

      const line = mainLine(tree);
      const judgements: Judgement[] = [];
      for (const nodeId of [0, ...line]) {
        const at = positionAt(tree, nodeId);
        const info = search(at, { depth: depth ?? 10, movetimeMs: movetimeMs ?? 250, level: 8 });
        judgements.push({ score: info.score, mate: info.mate, pv: info.pv });
      }
      const report = buildReport(tree, judgements);
      return ok({
        ok: true,
        ...verdict,
        white: report.white,
        black: report.black,
        summary: `${describeReport(report, WHITE, tree.result)} ${describeReport(report, BLACK, tree.result)}`,
        worstMoves: report.worst.map((move) => ({
          move: move.san,
          ply: move.ply,
          side: move.color === WHITE ? 'white' : 'black',
          quality: move.quality,
          lostPawns: Number((move.loss / 100).toFixed(2)),
          betterWas: move.bestSan,
          line: move.bestLine,
        })),
      });
    },
  },

  {
    name: `${PREFIX}list_games`,
    description:
      'List the games saved in the Chess folder, newest first, with the players, the date, the result and the opening. Use it to find a game before opening or analysing it.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 200, description: 'How many to return. Defaults to 50.' },
      },
    },
    readOnly: true,
    execute: async (raw: unknown) => {
      const input = (raw ?? {}) as Json;
      const limit = typeof input.limit === 'number' ? Math.max(1, Math.min(200, input.limit)) : 50;
      const files = await listGames();
      return ok({
        ok: true,
        folder: files[0] ? files[0].path.split('/').slice(0, -1).join('/') : null,
        count: files.length,
        games: files.slice(0, limit).map((file) => ({
          path: file.path,
          white: file.white,
          black: file.black,
          date: file.date,
          result: file.result,
          opening: file.opening || null,
        })),
      });
    },
  },

  {
    name: `${PREFIX}import_pgn`,
    description:
      'Load a game from PGN text or from a .pgn file already on disk, replacing the game in progress. Variations, comments and annotations are kept. Use it before analysing a game someone has sent.',
    inputSchema: {
      type: 'object',
      properties: {
        pgn: { type: 'string', description: 'The PGN text. Give this or `path`.' },
        path: { type: 'string', description: 'A path to a .pgn file in the filesystem. Give this or `pgn`.' },
        save: { type: 'boolean', description: 'Also save it into the Chess games folder. Defaults to false.' },
      },
    },
    execute: async (raw: unknown) => {
      const input = (raw ?? {}) as Json;
      let text = typeof input.pgn === 'string' ? input.pgn : '';
      if (!text && typeof input.path === 'string') {
        const loaded = await readGame(input.path);
        if (!loaded) return ok({ ok: false, error: `Could not read ${input.path}.` });
        text = loaded;
      }
      if (!text.trim()) return ok({ ok: false, error: 'Give either `pgn` text or a `path` to a .pgn file.' });
      const { games, problems } = parsePgn(text);
      if (!games.length) return ok({ ok: false, error: problems[0] ?? 'No game was found in that PGN.' });
      store.loadTree(games[0]);
      store.update({ mode: 'human-human' });
      store.persistNow();
      let savedTo: string | null = null;
      if (input.save === true) savedTo = await saveGame(printPgn(games[0]), games[0].tags);
      return ok({
        ok: true,
        problems,
        savedTo,
        gamesInFile: games.length,
        ...currentGameSummary(),
      });
    },
  },
];

function clampLevel(value: unknown): number {
  const n = typeof value === 'number' ? Math.round(value) : 4;
  return levelFor(n).level;
}

// ---------------------------------------------------------------------
// Intents - what other apps and `kumin://chess/...` links can ask for
// ---------------------------------------------------------------------

export const intents: Record<string, (params: Record<string, string>) => unknown> = {
  /** Open a .pgn file from the Files app, or anywhere else. */
  open: async (params) => {
    const path = params.file ?? params.path ?? '';
    if (!path) return { ok: false, error: 'No file was named.' };
    const text = await readGame(path);
    if (!text) return { ok: false, error: `Could not read ${path}.` };
    const { games, problems } = parsePgn(text);
    if (!games.length) return { ok: false, error: problems[0] ?? 'That file has no game in it.' };
    store.loadTree(games[0]);
    store.update({ mode: 'human-human' });
    store.persistNow();
    sdk.openApp(sdk.app.id, `Chess - ${games[0].tags.White ?? 'White'} vs ${games[0].tags.Black ?? 'Black'}`);
    return { ok: true, moves: mainLineSan(games[0]).length, path };
  },

  /** Set the board to a position and open the window on it. */
  analyze: (params) => {
    const fen = params.fen ?? '';
    const parsed = parseFen(fen);
    if (!parsed.ok) return { ok: false, error: `That FEN does not describe a position: ${parsed.error}` };
    const tree = createTree(toFen(parsed.position), {
      Event: 'Analysis',
      White: 'White',
      Black: 'Black',
      Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
    });
    store.loadTree(tree, 0);
    store.update({ mode: 'human-human' });
    store.persistNow();
    sdk.openApp(sdk.app.id, 'Chess - analysis');
    const verdict = analyse(parsed.position, { depth: 12, movetimeMs: 800 });
    return { ok: true, ...verdict };
  },
};

export { mateDistance };
