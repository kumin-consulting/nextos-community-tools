// src/lib/analysis.ts
//
// "Why did I lose?" - the part of a chess program that is actually
// useful for getting better. Walk the game, ask the engine what it
// thought of the position before and after each move, and the moves
// where the evaluation fell off a cliff are the ones worth looking at.
//
// Two choices that matter:
//
//  * Everything is measured from the MOVER's point of view, in
//    centipawns, and clamped to a ten-pawn window first. Without the
//    clamp, a player who is already three queens down "blunders" on
//    every move of the rest of the game, which is true and useless.
//  * The engine is injected. This module never imports the search
//    directly, so the tests run it against a stub in microseconds and
//    the app runs it against a Web Worker, and neither one is a special
//    case of the other.

import type { Move, Position } from './types';
import { BLACK, WHITE } from './types';
import type { Color } from './types';
import type { GameTree } from './game';
import { mainLine, positionAt } from './game';
import { toFen } from './fen';
import { makeMove, unmakeMove } from './board';
import { toSan } from './san';

/** What the analyser needs from an engine: a score for the side to move
 *  and the line it expects. */
export interface Judgement {
  /** Centipawns, from the side to move's point of view. */
  score: number;
  /** Mate in this many moves, or null. */
  mate: number | null;
  /** The engine's expected continuation, from this position. */
  pv: Move[];
}

export type Analyser = (pos: Position) => Judgement;

export type MoveQuality = 'book' | 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

/** Centipawn loss at which a move earns each label. Chosen to match what
 *  a coach would say out loud: half a pawn is careless, a pawn is a
 *  mistake, two pawns is a blunder. */
export const THRESHOLDS = { inaccuracy: 50, mistake: 100, blunder: 200 };

/** Scores beyond this are treated as "winning" and stop moving, so a
 *  decided game does not generate a blunder on every move. */
export const CLAMP = 1000;

export interface MoveReport {
  nodeId: number;
  ply: number;
  /** Whose move it was. */
  color: Color;
  san: string;
  /** The engine's score before the move, from the mover's point of view. */
  before: number;
  /** After the move, still from the mover's point of view. */
  after: number;
  /** How much the move gave away, in centipawns. Never negative. */
  loss: number;
  quality: MoveQuality;
  /** What the engine would have played instead, in SAN. */
  bestSan: string;
  /** The engine's line from before the move, in SAN. */
  bestLine: string[];
  /** Set when the move threw away a forced mate, or walked into one. */
  mateSwing: boolean;
}

export interface SideSummary {
  color: Color;
  moves: number;
  inaccuracies: number;
  mistakes: number;
  blunders: number;
  /** Average centipawn loss - the number that actually tracks strength. */
  averageLoss: number;
  /** 0-100, a friendlier restatement of the average loss. */
  accuracy: number;
}

export interface GameReport {
  moves: MoveReport[];
  white: SideSummary;
  black: SideSummary;
  /** The three worst moves of the game, worst first. */
  worst: MoveReport[];
}

function clamp(score: number): number {
  return Math.max(-CLAMP, Math.min(CLAMP, score));
}

/** A mate score becomes a large but finite number, so the arithmetic
 *  below stays arithmetic. */
function normalise(judgement: Judgement): number {
  if (judgement.mate !== null) {
    return judgement.mate > 0 ? CLAMP : -CLAMP;
  }
  return clamp(judgement.score);
}

function qualityFor(loss: number): MoveQuality {
  if (loss >= THRESHOLDS.blunder) return 'blunder';
  if (loss >= THRESHOLDS.mistake) return 'mistake';
  if (loss >= THRESHOLDS.inaccuracy) return 'inaccuracy';
  if (loss >= 10) return 'good';
  return 'best';
}

/**
 * Judges every move of a game's main line. `analyse` is called once per
 * position - roughly twice per move, since the score after one move is
 * the score before the next, negated - so a forty-move game costs
 * forty-one engine calls, not eighty.
 */
export function analyzeGame(tree: GameTree, analyse: Analyser, onProgress?: (done: number, total: number) => void): GameReport {
  const line = mainLine(tree);
  const reports: MoveReport[] = [];
  const pos = positionAt(tree, 0);

  // The judgement of the position before the first move.
  let previous = analyse(pos);
  let previousScore = normalise(previous);
  let previousBest = previous.pv.length ? sanLine(pos, previous.pv) : [];

  for (let i = 0; i < line.length; i++) {
    const node = tree.nodes[line[i]];
    const color = pos.turn;
    makeMove(pos, node.move);
    const next = analyse(pos);
    // `next` is from the opponent's point of view; negate it to compare
    // with the score the mover had before playing.
    const afterFromMover = -normalise(next);
    const loss = Math.max(0, previousScore - afterFromMover);
    const mateSwing =
      (previous.mate !== null && previous.mate > 0 && (next.mate === null || next.mate > 0)) ||
      (previous.mate === null && next.mate !== null && next.mate > 0);

    reports.push({
      nodeId: node.id,
      ply: node.ply,
      color,
      san: node.san,
      before: previousScore,
      after: afterFromMover,
      loss,
      quality: qualityFor(loss),
      bestSan: previousBest[0] ?? '',
      bestLine: previousBest,
      mateSwing: mateSwing && loss >= THRESHOLDS.mistake,
    });

    previous = next;
    previousScore = normalise(next);
    previousBest = next.pv.length ? sanLine(pos, next.pv) : [];
    onProgress?.(i + 1, line.length);
  }

  // Leave the position as we found it.
  for (let i = line.length - 1; i >= 0; i--) unmakeMove(pos, tree.nodes[line[i]].move);

  return {
    moves: reports,
    white: summarise(reports, WHITE),
    black: summarise(reports, BLACK),
    worst: [...reports].sort((a, b) => b.loss - a.loss).slice(0, 3),
  };
}

/** Prints a line of packed moves as SAN without disturbing `pos`. */
export function sanLine(pos: Position, moves: Move[], limit = 8): string[] {
  const out: string[] = [];
  const made: Move[] = [];
  for (const move of moves.slice(0, limit)) {
    let san: string;
    try {
      san = toSan(pos, move);
    } catch {
      break;
    }
    if (!san) break;
    out.push(san);
    makeMove(pos, move);
    made.push(move);
  }
  for (let i = made.length - 1; i >= 0; i--) unmakeMove(pos, made[i]);
  return out;
}

function summarise(reports: MoveReport[], color: Color): SideSummary {
  const mine = reports.filter((r) => r.color === color);
  const totalLoss = mine.reduce((sum, r) => sum + r.loss, 0);
  const averageLoss = mine.length ? Math.round(totalLoss / mine.length) : 0;
  return {
    color,
    moves: mine.length,
    inaccuracies: mine.filter((r) => r.quality === 'inaccuracy').length,
    mistakes: mine.filter((r) => r.quality === 'mistake').length,
    blunders: mine.filter((r) => r.quality === 'blunder').length,
    averageLoss,
    accuracy: accuracyFromLoss(averageLoss),
  };
}

/** A smooth curve from average centipawn loss to a percentage: 0 loss is
 *  100, 20 is about 90, 100 is about 60, 300 is about 30. It is a
 *  presentation choice, not a measurement - the average loss is the
 *  number with meaning, and both are shown. */
export function accuracyFromLoss(averageLoss: number): number {
  return Math.round(100 * Math.exp(-averageLoss / 180));
}

/** The plain-words summary shown after a game. */
export function describeReport(report: GameReport, color: Color, result: string): string {
  const side = color === WHITE ? report.white : report.black;
  const name = color === WHITE ? 'White' : 'Black';
  const parts: string[] = [];
  const lost = (color === WHITE && result === '0-1') || (color === BLACK && result === '1-0');

  if (!side.moves) return 'There are no moves to look at yet.';

  const counts: string[] = [];
  if (side.blunders) counts.push(`${side.blunders} blunder${side.blunders === 1 ? '' : 's'}`);
  if (side.mistakes) counts.push(`${side.mistakes} mistake${side.mistakes === 1 ? '' : 's'}`);
  if (side.inaccuracies) counts.push(`${side.inaccuracies} inaccurac${side.inaccuracies === 1 ? 'y' : 'ies'}`);

  if (counts.length) parts.push(`${name} played ${counts.join(', ')} over ${side.moves} moves.`);
  else parts.push(`${name} played ${side.moves} moves with nothing worse than a slight inaccuracy.`);

  parts.push(`Average loss ${side.averageLoss} centipawns (${side.accuracy}% accuracy).`);

  const mine = report.worst.filter((r) => r.color === color);
  if (mine.length) {
    const worst = mine[0];
    const moveNumber = Math.floor((worst.ply - 1) / 2) + 1;
    const dots = color === WHITE ? '.' : '...';
    const better = worst.bestSan ? ` ${worst.bestSan} was the move` : '';
    parts.push(
      `The costliest was ${moveNumber}${dots} ${worst.san}, which gave away ${(worst.loss / 100).toFixed(1)} pawns of evaluation${better}.`
    );
  }
  if (lost && !side.blunders && !side.mistakes) {
    parts.push('Nothing here lost the game on its own - the losses came from small concessions adding up.');
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------
// Puzzles from your own games
// ---------------------------------------------------------------------

export interface Puzzle {
  /** The position to solve, as a FEN. */
  fen: string;
  /** The move actually played, in SAN. */
  playedSan: string;
  /** The move that should have been played, and the line after it. */
  solution: string[];
  /** How much the missed move was worth, in centipawns. */
  gain: number;
  /** Set when the missed move was a forced mate. */
  mate: number | null;
  /** Whose chance it was. */
  color: Color;
  ply: number;
  /** One line of context for the puzzle list. */
  label: string;
}

/**
 * The positions in a game where a real chance went begging: the mover
 * had something at least two pawns better than what they played, and the
 * engine's suggestion is a concrete line rather than a slow squeeze.
 * These make the app's puzzle mode - the tactics you personally missed,
 * which are worth a hundred generic ones.
 */
export function findPuzzles(tree: GameTree, report: GameReport, minimumGain = THRESHOLDS.blunder): Puzzle[] {
  const puzzles: Puzzle[] = [];
  for (const move of report.moves) {
    if (move.loss < minimumGain) continue;
    if (!move.bestSan || move.bestSan === move.san) continue;
    const node = tree.nodes[move.nodeId];
    const before = positionAt(tree, node.parent);
    const moveNumber = Math.floor((move.ply - 1) / 2) + 1;
    const dots = move.color === WHITE ? '.' : '...';
    puzzles.push({
      fen: toFen(before),
      playedSan: move.san,
      solution: move.bestLine,
      gain: move.loss,
      mate: move.mateSwing ? 1 : null,
      color: move.color,
      ply: move.ply,
      label: `${moveNumber}${dots} ${move.san} - ${move.bestSan} wins ${(move.loss / 100).toFixed(1)} pawns`,
    });
  }
  return puzzles.sort((a, b) => b.gain - a.gain);
}

/** The eval bar's height, 0 (Black winning) to 1 (White winning), from a
 *  score already in White's point of view. A logistic curve, because a
 *  linear bar spends its whole life pinned at one end. */
export function evalBarFraction(scoreWhite: number, mate: number | null): number {
  if (mate !== null) return mate > 0 ? 1 : 0;
  return 1 / (1 + Math.exp(-scoreWhite / 320));
}

/** '+1.4', '-0.7', 'M3' - the number printed beside the bar. */
export function formatScore(scoreWhite: number, mate: number | null): string {
  if (mate !== null) return `${mate > 0 ? 'M' : '-M'}${Math.abs(mate)}`;
  const pawns = scoreWhite / 100;
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`;
}
