// src/lib/rules.ts
//
// When is a game over, and why? The board module knows the material and
// repetition facts; this file turns them into the answer FIDE gives,
// keeping the two kinds of draw apart:
//
//   automatic - the game IS drawn the moment it happens, nobody has to
//               ask: stalemate, dead position, fivefold repetition, the
//               seventy-five-move rule (articles 9.6 and 5.2);
//   claimable - the game CAN be drawn if a player says so: threefold
//               repetition and the fifty-move rule (article 9.2, 9.3).
//
// Conflating the two is the commonest bug in a hobby chess program, and
// it is visible: a game that stops by itself on the third repetition when
// both players wanted to keep playing.

import type { Position } from './types';
import { BLACK, WHITE } from './types';
import { hasInsufficientMaterial, inCheck, repetitionCount } from './board';
import { hasLegalMove } from './moves';

export type Result = '1-0' | '0-1' | '1/2-1/2' | '*';

export type EndReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient-material'
  | 'fivefold-repetition'
  | 'seventy-five-move'
  | 'threefold-repetition'
  | 'fifty-move'
  | 'resignation'
  | 'timeout'
  | 'timeout-vs-insufficient'
  | 'agreement'
  | 'abandoned';

export interface GameStatus {
  /** True when play cannot continue - the automatic endings only. */
  over: boolean;
  result: Result;
  reason: EndReason | null;
  /** A draw either player may claim but neither has: threefold
   *  repetition or the fifty-move rule. Null when there is none. */
  claimableDraw: 'threefold-repetition' | 'fifty-move' | null;
  inCheck: boolean;
  /** How many times the current position has occurred, this one counted. */
  repetitions: number;
  /** Plies since the last capture or pawn move. */
  halfmoveClock: number;
}

export function gameStatus(pos: Position): GameStatus {
  const checked = inCheck(pos);
  const repetitions = repetitionCount(pos);
  const base = {
    inCheck: checked,
    repetitions,
    halfmoveClock: pos.halfmove,
  };

  if (!hasLegalMove(pos)) {
    if (checked) {
      return {
        ...base,
        over: true,
        result: pos.turn === WHITE ? '0-1' : '1-0',
        reason: 'checkmate',
        claimableDraw: null,
      };
    }
    return { ...base, over: true, result: '1/2-1/2', reason: 'stalemate', claimableDraw: null };
  }

  if (hasInsufficientMaterial(pos)) {
    return { ...base, over: true, result: '1/2-1/2', reason: 'insufficient-material', claimableDraw: null };
  }
  if (repetitions >= 5) {
    return { ...base, over: true, result: '1/2-1/2', reason: 'fivefold-repetition', claimableDraw: null };
  }
  // 75 moves by each player with no capture and no pawn move.
  if (pos.halfmove >= 150) {
    return { ...base, over: true, result: '1/2-1/2', reason: 'seventy-five-move', claimableDraw: null };
  }

  const claimableDraw =
    repetitions >= 3 ? 'threefold-repetition' : pos.halfmove >= 100 ? 'fifty-move' : null;
  return { ...base, over: false, result: '*', reason: null, claimableDraw };
}

/** One sentence a person reads, for the status line and the agent tools. */
export function describeStatus(status: GameStatus, pos: Position): string {
  const mover = pos.turn === WHITE ? 'White' : 'Black';
  const other = pos.turn === WHITE ? 'Black' : 'White';
  switch (status.reason) {
    case 'checkmate':
      return `Checkmate - ${other} wins.`;
    case 'stalemate':
      return `Stalemate - ${mover} has no legal move and is not in check. Draw.`;
    case 'insufficient-material':
      return 'Draw - neither side has enough material to mate.';
    case 'fivefold-repetition':
      return 'Draw - the same position has occurred five times.';
    case 'seventy-five-move':
      return 'Draw - seventy-five moves without a capture or a pawn move.';
    case 'resignation':
      return `${mover} resigned.`;
    case 'timeout':
      return `${mover} ran out of time.`;
    case 'timeout-vs-insufficient':
      return `${mover} ran out of time, but ${other} cannot mate. Draw.`;
    case 'agreement':
      return 'Draw agreed.';
    case 'abandoned':
      return 'Game abandoned.';
    default:
      break;
  }
  if (status.claimableDraw === 'threefold-repetition') {
    return `${mover} to move. The position has repeated three times - either player may claim a draw.`;
  }
  if (status.claimableDraw === 'fifty-move') {
    return `${mover} to move. Fifty moves without a capture or a pawn move - either player may claim a draw.`;
  }
  if (status.inCheck) return `${mover} is in check.`;
  return `${mover} to move.`;
}

/** The result of a game the loser's clock ended. A flag fall is only a
 *  loss when the other side could still mate with the material on the
 *  board (FIDE 6.9); otherwise it is a draw. */
export function resultOnFlag(pos: Position, flagged: 0 | 1): { result: Result; reason: EndReason } {
  const opponentCanMate = !materialCannotMate(pos, flagged === WHITE ? BLACK : WHITE);
  if (opponentCanMate) {
    return { result: flagged === WHITE ? '0-1' : '1-0', reason: 'timeout' };
  }
  return { result: '1/2-1/2', reason: 'timeout-vs-insufficient' };
}

/** Could this side ever deliver mate, even with the most cooperative
 *  play? A lone king cannot; a king and one minor cannot. */
export function materialCannotMate(pos: Position, color: 0 | 1): boolean {
  let minors = 0;
  const base = color * 16;
  for (let i = 0; i < pos.pieceCount[color]; i++) {
    const type = pos.board[pos.pieceSquares[base + i]] & 7;
    if (type === 6) continue;
    if (type === 1 || type === 4 || type === 5) return false;
    minors++;
  }
  return minors <= 1;
}
