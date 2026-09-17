// src/lib/engine.ts
//
// The search. Iterative deepening over a principal-variation alpha-beta
// with a quiescence search at the leaves, a transposition table keyed by
// the position's Zobrist key, null-move pruning, check extensions,
// killer moves and a history heuristic for ordering, and mate scores
// that shrink with distance so a mate in two is preferred to a mate in
// four.
//
// Two rules shape every line of it:
//
//  1. Nothing allocates inside the search. Move lists are preallocated
//     Int32Arrays indexed by ply, the transposition table is one flat
//     Int32Array, and the principal variation is a triangular array of
//     the same. A garbage collection in the middle of a two-second
//     budget is a lost tenth of a second and a visible stutter.
//  2. The search never blocks the interface. It runs in a Web Worker
//     when one can be created, and `searchChunked` below runs the same
//     iterative deepening one depth at a time through a callback when
//     one cannot - the fallback the app uses under a strict content
//     policy, where the answer arrives a little later but the board
//     still animates at sixty frames a second.
//
// `runEngineWorker()` is the worker's entry point: the app builds a
// blob: URL from this very bundle and calls it, so the worker runs the
// same compiled code as the window and there is no second copy of the
// rules to keep in step.

import type { Color, Move, Position } from './types';
import {
  FLAG_PROMOTION,
  isCapture,
  moveFrom,
  movePromotion,
  moveTo,
} from './types';
import {
  clonePosition,
  hasInsufficientMaterial,
  inCheck,
  isSquareAttacked,
  makeMove,
  makeNullMove,
  nonPawnMaterial,
  repetitionCount,
  unmakeMove,
  unmakeNullMove,
} from './board';
import { generatePseudoLegal, moveBuffer } from './moves';
import { evaluate } from './evaluate';
import { fromFen, parseFen } from './fen';
import { parseSan, toUci } from './san';
import { pickBookMove } from './openings';

export const MATE_SCORE = 30000;
export const MATE_BOUND = MATE_SCORE - 512;
const INFINITY = 32000;
const MAX_PLY = 96;

export interface SearchOptions {
  /** Hard depth limit. Defaults to the level's depth. */
  depth?: number;
  /** Milliseconds this move may take. 0 means "depth only". */
  movetimeMs?: number;
  /** 1 (a beginner can win) to 8 (as strong as it gets here). */
  level?: number;
  /** Injected for tests; the engine's only source of randomness. */
  random?: () => number;
  /** Consult the opening book before searching. */
  useBook?: boolean;
  /** Called after each completed depth. */
  onInfo?: (info: SearchInfo) => void;
  /** Polled every few thousand nodes; return true to stop early. */
  shouldStop?: () => boolean;
  /** Injected clock, so tests are not at the mercy of a real one. */
  now?: () => number;
}

export interface SearchInfo {
  depth: number;
  seldepth: number;
  /** Centipawns from the side to move's point of view. */
  score: number;
  /** Mate in this many MOVES when the score is a mate score; positive
   *  means the side to move mates, negative means it is mated. */
  mate: number | null;
  pv: Move[];
  nodes: number;
  timeMs: number;
  nps: number;
  bestMove: Move;
  /** True when the move came straight from the opening book. */
  fromBook: boolean;
}

export interface Level {
  level: number;
  name: string;
  depth: number;
  movetimeMs: number;
  /** Centipawns of noise added to each root move's score. */
  noise: number;
  /** Chance of simply playing a random legal move - what makes the
   *  lowest levels beatable by someone who has just learnt the rules. */
  blunderChance: number;
}

export const LEVELS: Level[] = [
  { level: 1, name: 'Beginner', depth: 1, movetimeMs: 60, noise: 140, blunderChance: 0.25 },
  { level: 2, name: 'Casual', depth: 2, movetimeMs: 100, noise: 100, blunderChance: 0.12 },
  { level: 3, name: 'Club', depth: 3, movetimeMs: 200, noise: 65, blunderChance: 0.05 },
  { level: 4, name: 'Steady', depth: 4, movetimeMs: 350, noise: 40, blunderChance: 0.02 },
  { level: 5, name: 'Sharp', depth: 6, movetimeMs: 600, noise: 22, blunderChance: 0 },
  { level: 6, name: 'Strong', depth: 8, movetimeMs: 900, noise: 10, blunderChance: 0 },
  { level: 7, name: 'Expert', depth: 12, movetimeMs: 1400, noise: 0, blunderChance: 0 },
  { level: 8, name: 'Maximum', depth: 40, movetimeMs: 2000, noise: 0, blunderChance: 0 },
];

export function levelFor(level: number): Level {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, Math.round(level) - 1))];
}

// ---------------------------------------------------------------------
// Transposition table
// ---------------------------------------------------------------------
// One flat Int32Array, five ints per slot: the key's low half (the index
// is taken from it), the key's high half as verification, the best move,
// the score, and depth+flag packed together. Always-replace, which for a
// table this size loses almost nothing to a depth-preferred scheme and
// costs one branch instead of three.

const TT_BITS = 19;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const TT_STRIDE = 5;
const TT_EXACT = 0;
const TT_LOWER = 1;
const TT_UPPER = 2;

const tt = new Int32Array(TT_SIZE * TT_STRIDE);
let ttGeneration = 0;

export function clearTranspositionTable(): void {
  tt.fill(0);
  ttGeneration = 0;
}

function ttStore(keyLo: number, keyHi: number, depth: number, score: number, flag: number, move: Move, ply: number): void {
  const index = (keyLo & TT_MASK) * TT_STRIDE;
  // Mate scores are stored relative to the node they were found at, not
  // to the root, or a hit at a different distance would report the wrong
  // mate.
  let stored = score;
  if (score > MATE_BOUND) stored = score + ply;
  else if (score < -MATE_BOUND) stored = score - ply;
  tt[index] = keyLo;
  tt[index + 1] = keyHi;
  tt[index + 2] = move;
  tt[index + 3] = stored;
  tt[index + 4] = (depth << 8) | (flag << 4) | (ttGeneration & 15);
}

interface TTProbe {
  hit: boolean;
  move: Move;
  score: number;
  depth: number;
  flag: number;
}
const probe: TTProbe = { hit: false, move: 0, score: 0, depth: 0, flag: 0 };

function ttProbe(keyLo: number, keyHi: number, ply: number): TTProbe {
  const index = (keyLo & TT_MASK) * TT_STRIDE;
  if (tt[index] !== keyLo || tt[index + 1] !== keyHi) {
    probe.hit = false;
    return probe;
  }
  const packed = tt[index + 4];
  probe.hit = true;
  probe.move = tt[index + 2];
  probe.depth = packed >> 8;
  probe.flag = (packed >> 4) & 15;
  let score = tt[index + 3];
  if (score > MATE_BOUND) score -= ply;
  else if (score < -MATE_BOUND) score += ply;
  probe.score = score;
  return probe;
}

// ---------------------------------------------------------------------
// Ordering tables
// ---------------------------------------------------------------------

const killers = new Int32Array(MAX_PLY * 2);
/** [piece][toSquare] - how often a quiet move caused a beta cutoff. */
const history = new Int32Array(15 * 128);
const scoreBuffers: Int32Array[] = [];
const pv = new Int32Array(MAX_PLY * MAX_PLY);
const pvLength = new Int32Array(MAX_PLY);

function scoreBuffer(ply: number): Int32Array {
  let buf = scoreBuffers[ply];
  if (!buf) {
    buf = new Int32Array(256);
    scoreBuffers[ply] = buf;
  }
  return buf;
}

/** Most Valuable Victim, Least Valuable Attacker - the cheapest ordering
 *  that gets captures roughly right. */
const MVV = [0, 100, 320, 330, 500, 900, 20000];

function orderMoves(
  pos: Position,
  moves: Int32Array,
  scores: Int32Array,
  count: number,
  ttMove: Move,
  ply: number
): void {
  const killerA = killers[ply * 2];
  const killerB = killers[ply * 2 + 1];
  for (let i = 0; i < count; i++) {
    const move = moves[i];
    let score = 0;
    if (ttMove && (move & 0x7ffff) === (ttMove & 0x7ffff)) score = 1 << 24;
    else if (isCapture(move)) {
      const victim = MVV[(move >> 25) & 7];
      const attacker = MVV[pos.board[moveFrom(move)] & 7];
      score = (1 << 22) + victim * 16 - attacker;
    } else if (move & FLAG_PROMOTION) score = (1 << 21) + movePromotion(move) * 100;
    else if (move === killerA) score = 1 << 20;
    else if (move === killerB) score = (1 << 20) - 1;
    else score = history[(pos.board[moveFrom(move)] & 15) * 128 + moveTo(move)];
    scores[i] = score;
  }
}

/** Selection sort, one move at a time: a beta cutoff usually happens in
 *  the first two or three, so sorting the whole list up front would be
 *  work thrown away. */
function pickMove(moves: Int32Array, scores: Int32Array, count: number, from: number): void {
  let best = from;
  for (let i = from + 1; i < count; i++) if (scores[i] > scores[best]) best = i;
  if (best === from) return;
  const m = moves[from];
  moves[from] = moves[best];
  moves[best] = m;
  const s = scores[from];
  scores[from] = scores[best];
  scores[best] = s;
}

// ---------------------------------------------------------------------
// The search itself
// ---------------------------------------------------------------------

interface Context {
  nodes: number;
  seldepth: number;
  stopped: boolean;
  deadline: number;
  now: () => number;
  shouldStop: (() => boolean) | undefined;
}

function timeUp(ctx: Context): boolean {
  if (ctx.stopped) return true;
  if ((ctx.nodes & 2047) !== 0) return false;
  if (ctx.deadline && ctx.now() >= ctx.deadline) {
    ctx.stopped = true;
    return true;
  }
  if (ctx.shouldStop && ctx.shouldStop()) {
    ctx.stopped = true;
    return true;
  }
  return false;
}

/** A draw the search should score as zero: a repetition since the root,
 *  the fifty-move rule, or material that cannot mate. */
function isDrawnInSearch(pos: Position, ply: number): boolean {
  if (pos.halfmove >= 100) return true;
  if (ply > 0 && repetitionCount(pos) >= 2) return true;
  return hasInsufficientMaterial(pos);
}

function quiescence(pos: Position, alpha: number, beta: number, ply: number, ctx: Context): number {
  ctx.nodes++;
  if (ply > ctx.seldepth) ctx.seldepth = ply;
  if (timeUp(ctx)) return 0;
  if (ply >= MAX_PLY - 1) return evaluate(pos);

  const standPat = evaluate(pos);
  if (standPat >= beta) return standPat;
  if (standPat > alpha) alpha = standPat;
  // Delta pruning: if even winning a queen for free would not reach
  // alpha, this whole node is hopeless.
  if (standPat + 1000 < alpha) return alpha;

  const moves = moveBuffer(ply);
  const scores = scoreBuffer(ply);
  const count = generatePseudoLegal(pos, moves, true);
  orderMoves(pos, moves, scores, count, 0, ply);
  const us = pos.turn;
  let best = standPat;

  for (let i = 0; i < count; i++) {
    pickMove(moves, scores, count, i);
    const move = moves[i];
    makeMove(pos, move);
    if (isSquareAttacked(pos, pos.kings[us], (us ^ 1) as Color)) {
      unmakeMove(pos, move);
      continue;
    }
    const score = -quiescence(pos, -beta, -alpha, ply + 1, ctx);
    unmakeMove(pos, move);
    if (ctx.stopped) return 0;
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

function negamax(
  pos: Position,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  ctx: Context,
  allowNull: boolean
): number {
  pvLength[ply] = ply;
  if (timeUp(ctx)) return 0;
  if (ply > 0 && isDrawnInSearch(pos, ply)) return 0;
  if (ply >= MAX_PLY - 2) return evaluate(pos);

  const isPv = beta - alpha > 1;
  const checked = inCheck(pos);
  // Check extension: a forcing line is cheap to follow and expensive to
  // guess at.
  if (checked) depth++;

  if (depth <= 0) return quiescence(pos, alpha, beta, ply, ctx);

  ctx.nodes++;

  // Mate distance pruning - never look for a mate longer than one
  // already found on the way here.
  const mateAlpha = Math.max(alpha, -MATE_SCORE + ply);
  const mateBeta = Math.min(beta, MATE_SCORE - ply - 1);
  if (mateAlpha >= mateBeta) return mateAlpha;
  alpha = mateAlpha;
  beta = mateBeta;

  const entry = ttProbe(pos.keyLo, pos.keyHi, ply);
  let ttMove: Move = 0;
  if (entry.hit) {
    ttMove = entry.move;
    if (!isPv && entry.depth >= depth) {
      if (entry.flag === TT_EXACT) return entry.score;
      if (entry.flag === TT_LOWER && entry.score >= beta) return entry.score;
      if (entry.flag === TT_UPPER && entry.score <= alpha) return entry.score;
    }
  }

  // Null-move pruning: give the opponent a free move; if the position is
  // still winning, it was winning enough not to search further. Never in
  // check (the null move would be illegal), never in an endgame with no
  // pieces (zugzwang lives there).
  if (allowNull && !isPv && !checked && depth >= 3 && nonPawnMaterial(pos, pos.turn) > 0) {
    const reduction = depth > 6 ? 3 : 2;
    makeNullMove(pos);
    const score = -negamax(pos, depth - 1 - reduction, -beta, -beta + 1, ply + 1, ctx, false);
    unmakeNullMove(pos);
    if (ctx.stopped) return 0;
    if (score >= beta && score < MATE_BOUND) return beta;
  }

  const moves = moveBuffer(ply);
  const scores = scoreBuffer(ply);
  const count = generatePseudoLegal(pos, moves, false);
  orderMoves(pos, moves, scores, count, ttMove, ply);

  const us = pos.turn;
  let bestScore = -INFINITY;
  let bestMove: Move = 0;
  let legal = 0;
  const originalAlpha = alpha;

  for (let i = 0; i < count; i++) {
    pickMove(moves, scores, count, i);
    const move = moves[i];
    makeMove(pos, move);
    if (isSquareAttacked(pos, pos.kings[us], (us ^ 1) as Color)) {
      unmakeMove(pos, move);
      continue;
    }
    legal++;

    let score: number;
    if (legal === 1) {
      score = -negamax(pos, depth - 1, -beta, -alpha, ply + 1, ctx, true);
    } else {
      // Late move reductions: quiet moves late in a well-ordered list
      // are searched shallower first, and re-searched only if they
      // surprise us.
      let reduction = 0;
      if (depth >= 3 && legal > 3 && !isCapture(move) && !(move & FLAG_PROMOTION) && !checked) {
        reduction = legal > 6 ? 2 : 1;
      }
      score = -negamax(pos, depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, ctx, true);
      if (score > alpha && reduction) {
        score = -negamax(pos, depth - 1, -alpha - 1, -alpha, ply + 1, ctx, true);
      }
      if (score > alpha && score < beta) {
        score = -negamax(pos, depth - 1, -beta, -alpha, ply + 1, ctx, true);
      }
    }
    unmakeMove(pos, move);
    if (ctx.stopped) return 0;

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
      if (score > alpha) {
        alpha = score;
        // Copy the child's principal variation up, with this move in
        // front - the triangular array trick, no allocation.
        pv[ply * MAX_PLY + ply] = move;
        for (let j = ply + 1; j < pvLength[ply + 1]; j++) {
          pv[ply * MAX_PLY + j] = pv[(ply + 1) * MAX_PLY + j];
        }
        pvLength[ply] = pvLength[ply + 1];
      }
      if (alpha >= beta) {
        if (!isCapture(move) && !(move & FLAG_PROMOTION)) {
          const slot = ply * 2;
          if (killers[slot] !== move) {
            killers[slot + 1] = killers[slot];
            killers[slot] = move;
          }
          const h = (pos.board[moveFrom(move)] & 15) * 128 + moveTo(move);
          history[h] += depth * depth;
          if (history[h] > 1 << 19) for (let k = 0; k < history.length; k++) history[k] >>= 1;
        }
        break;
      }
    }
  }

  if (legal === 0) {
    // Mate scores shrink with distance, so a mate in two beats a mate in
    // three from the same position.
    return checked ? -MATE_SCORE + ply : 0;
  }

  const flag = bestScore <= originalAlpha ? TT_UPPER : bestScore >= beta ? TT_LOWER : TT_EXACT;
  ttStore(pos.keyLo, pos.keyHi, depth, bestScore, flag, bestMove, ply);
  return bestScore;
}

// ---------------------------------------------------------------------
// The root
// ---------------------------------------------------------------------

interface RootMove {
  move: Move;
  score: number;
  pv: Move[];
}

function collectPv(): Move[] {
  const line: Move[] = [];
  for (let i = 0; i < pvLength[0]; i++) {
    const move = pv[i];
    if (!move) break;
    line.push(move);
  }
  return line;
}

/** Mate in how many moves, or null when the score is an ordinary one. */
export function mateDistance(score: number): number | null {
  if (score > MATE_BOUND) return Math.ceil((MATE_SCORE - score) / 2);
  if (score < -MATE_BOUND) return -Math.ceil((MATE_SCORE + score) / 2);
  return null;
}

/**
 * Searches `pos` and returns the best move it found. The position is
 * cloned, so the caller's board is never touched - the search makes and
 * unmakes tens of thousands of moves and a bug in that machinery must
 * not be able to corrupt the game being played.
 */
export function search(pos: Position, options: SearchOptions = {}): SearchInfo {
  const level = levelFor(options.level ?? 8);
  const now = options.now ?? (() => Date.now());
  const started = now();
  const maxDepth = Math.min(MAX_PLY - 4, options.depth ?? level.depth);
  const movetime = options.movetimeMs ?? level.movetimeMs;
  const random = options.random ?? Math.random;
  const board = clonePosition(pos);

  const ctx: Context = {
    nodes: 0,
    seldepth: 0,
    stopped: false,
    deadline: movetime > 0 ? started + movetime : 0,
    now,
    shouldStop: options.shouldStop,
  };

  killers.fill(0);
  for (let i = 0; i < history.length; i++) history[i] >>= 2;
  ttGeneration = (ttGeneration + 1) & 15;

  // The book, when asked for. A book move is instant and needs no
  // search, which is also what keeps the first few moves of a game
  // varied instead of identical every time.
  if (options.useBook) {
    const bookMove = pickBookMove(board, random);
    if (bookMove !== null) {
      return {
        depth: 0,
        seldepth: 0,
        score: 0,
        mate: null,
        pv: [bookMove],
        nodes: 0,
        timeMs: now() - started,
        nps: 0,
        bestMove: bookMove,
        fromBook: true,
      };
    }
  }

  // The root move list, filtered to legal moves once.
  const rootBuffer = new Int32Array(256);
  const pseudoCount = generatePseudoLegal(board, rootBuffer, false);
  const rootMoves: RootMove[] = [];
  const us = board.turn;
  for (let i = 0; i < pseudoCount; i++) {
    const move = rootBuffer[i];
    makeMove(board, move);
    const ok = !isSquareAttacked(board, board.kings[us], (us ^ 1) as Color);
    unmakeMove(board, move);
    if (ok) rootMoves.push({ move, score: -INFINITY, pv: [move] });
  }

  const empty: SearchInfo = {
    depth: 0,
    seldepth: 0,
    score: 0,
    mate: null,
    pv: [],
    nodes: 0,
    timeMs: now() - started,
    nps: 0,
    bestMove: 0,
    fromBook: false,
  };
  if (!rootMoves.length) return empty;

  // A deliberate blunder at the lowest levels: a beginner who has just
  // learnt how the knight moves should be able to win a game.
  if (level.blunderChance > 0 && random() < level.blunderChance) {
    const choice = rootMoves[Math.floor(random() * rootMoves.length)];
    return { ...empty, bestMove: choice.move, pv: [choice.move], depth: 0 };
  }

  let best: SearchInfo = { ...empty, bestMove: rootMoves[0].move, pv: [rootMoves[0].move] };

  for (let depth = 1; depth <= maxDepth; depth++) {
    let alpha = -INFINITY;
    const beta = INFINITY;
    let bestThisDepth: RootMove | null = null;
    // The previous depth's order is the best guess at this one's.
    rootMoves.sort((a, b) => b.score - a.score);

    for (let i = 0; i < rootMoves.length; i++) {
      const entry = rootMoves[i];
      makeMove(board, entry.move);
      let score: number;
      if (i === 0) {
        score = -negamax(board, depth - 1, -beta, -alpha, 1, ctx, true);
      } else {
        score = -negamax(board, depth - 1, -alpha - 1, -alpha, 1, ctx, true);
        if (score > alpha) score = -negamax(board, depth - 1, -beta, -alpha, 1, ctx, true);
      }
      unmakeMove(board, entry.move);
      if (ctx.stopped) break;
      entry.score = score;
      if (score > alpha) {
        alpha = score;
        pv[0] = entry.move;
        entry.pv = [entry.move, ...collectPv().slice(1)];
        bestThisDepth = entry;
      } else if (!bestThisDepth) {
        bestThisDepth = entry;
      }
    }

    if (ctx.stopped && depth > 1) break;
    if (bestThisDepth) {
      const elapsed = Math.max(1, now() - started);
      best = {
        depth,
        seldepth: ctx.seldepth,
        score: bestThisDepth.score,
        mate: mateDistance(bestThisDepth.score),
        pv: bestThisDepth.pv,
        nodes: ctx.nodes,
        timeMs: elapsed,
        nps: Math.round((ctx.nodes / elapsed) * 1000),
        bestMove: bestThisDepth.move,
        fromBook: false,
      };
      options.onInfo?.(best);
    }
    if (ctx.stopped) break;
    // A forced mate is the end of the search: nothing deeper can improve
    // on it.
    if (best.mate !== null && Math.abs(best.mate) <= depth) break;
    // Do not start a depth there is no chance of finishing.
    if (ctx.deadline && now() + (now() - started) * 0.4 > ctx.deadline) break;
  }

  // Levels below Expert add noise to the root scores, so the engine
  // picks a move that is merely good rather than the best one - and the
  // noise is scaled so it can never throw away a piece for nothing at
  // the middle levels.
  if (level.noise > 0 && rootMoves.length > 1) {
    let chosen = rootMoves[0];
    let bestNoisy = -INFINITY;
    for (const entry of rootMoves) {
      if (entry.score <= -INFINITY) continue;
      const noisy = entry.score + (random() * 2 - 1) * level.noise;
      if (noisy > bestNoisy) {
        bestNoisy = noisy;
        chosen = entry;
      }
    }
    if (chosen.move !== best.bestMove) {
      best = { ...best, bestMove: chosen.move, pv: chosen.pv, score: chosen.score, mate: mateDistance(chosen.score) };
    }
  }

  return best;
}

/**
 * The same iterative deepening, handed back one depth at a time. The app
 * uses this when a Web Worker cannot be created: each call runs a single
 * depth and returns, so the caller can yield to the browser between them
 * and the interface keeps painting.
 */
export function searchChunked(
  pos: Position,
  options: SearchOptions = {}
): { next: () => SearchInfo | null; best: () => SearchInfo } {
  const level = levelFor(options.level ?? 8);
  const maxDepth = Math.min(MAX_PLY - 4, options.depth ?? level.depth);
  const now = options.now ?? (() => Date.now());
  const started = now();
  const movetime = options.movetimeMs ?? level.movetimeMs;
  let depth = 0;
  let current: SearchInfo = {
    depth: 0,
    seldepth: 0,
    score: 0,
    mate: null,
    pv: [],
    nodes: 0,
    timeMs: 0,
    nps: 0,
    bestMove: 0,
    fromBook: false,
  };
  let nodes = 0;

  return {
    next(): SearchInfo | null {
      depth++;
      if (depth > maxDepth) return null;
      if (movetime > 0 && now() - started > movetime) return null;
      const info = search(pos, {
        ...options,
        depth,
        movetimeMs: movetime > 0 ? Math.max(30, movetime - (now() - started)) : 0,
        useBook: depth === 1 ? options.useBook : false,
      });
      nodes += info.nodes;
      current = { ...info, nodes, timeMs: now() - started, depth };
      if (info.fromBook) return current;
      if (current.mate !== null && Math.abs(current.mate) <= depth) {
        depth = maxDepth;
      }
      return current;
    },
    best(): SearchInfo {
      return current;
    },
  };
}

// ---------------------------------------------------------------------
// The Web Worker entry point
// ---------------------------------------------------------------------

export interface WorkerRequest {
  type: 'search';
  id: number;
  fen: string;
  /** The moves of the game so far, in UCI, so the search sees the same
   *  repetition history the game has. */
  history?: string[];
  options: Omit<SearchOptions, 'onInfo' | 'shouldStop' | 'random' | 'now'> & { seed?: number };
}

export interface WorkerInfoMessage {
  type: 'info' | 'result';
  id: number;
  depth: number;
  seldepth: number;
  score: number;
  mate: number | null;
  /** UCI, because a packed move integer means nothing without the
   *  position it came from. */
  pv: string[];
  bestMove: string;
  nodes: number;
  timeMs: number;
  nps: number;
  fromBook: boolean;
}

/** A tiny deterministic generator, so a worker search with a seed is
 *  reproducible. */
function seededRandom(seed: number): () => number {
  let x = seed || 1;
  return () => {
    x ^= x << 13;
    x |= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x |= 0;
    return (x >>> 0) / 4294967296;
  };
}

/** Rebuilds the position a request describes, replaying its history so
 *  repetition detection inside the search is real. */
export function positionFromRequest(request: WorkerRequest): Position {
  const parsed = parseFen(request.fen);
  const pos = parsed.ok ? parsed.position : fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  for (const uci of request.history ?? []) {
    const move = parseSan(pos, uci);
    if (move === null) break;
    makeMove(pos, move);
  }
  return pos;
}

function toMessage(type: 'info' | 'result', id: number, info: SearchInfo): WorkerInfoMessage {
  return {
    type,
    id,
    depth: info.depth,
    seldepth: info.seldepth,
    score: info.score,
    mate: info.mate,
    pv: info.pv.map((m) => toUci(m)),
    bestMove: info.bestMove ? toUci(info.bestMove) : '',
    nodes: info.nodes,
    timeMs: info.timeMs,
    nps: info.nps,
    fromBook: info.fromBook,
  };
}

/**
 * The worker's whole program. The app builds a blob: URL that imports
 * this bundle and calls this function, so worker and window run the
 * identical rules and evaluation - there is no second implementation to
 * drift.
 */
export function runEngineWorker(scope?: {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage: (message: unknown) => void;
}): void {
  const self_ = scope ?? (globalThis as unknown as Parameters<typeof runEngineWorker>[0]);
  if (!self_) return;
  self_.onmessage = (event: { data: unknown }): void => {
    const request = event.data as WorkerRequest;
    if (!request || request.type !== 'search') return;
    const pos = positionFromRequest(request);
    const info = search(pos, {
      ...request.options,
      random: request.options.seed ? seededRandom(request.options.seed) : Math.random,
      onInfo: (partial) => self_.postMessage(toMessage('info', request.id, partial)),
    });
    self_.postMessage(toMessage('result', request.id, info));
  };
}
