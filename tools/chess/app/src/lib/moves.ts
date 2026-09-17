// src/lib/moves.ts
//
// Move generation. `generatePseudoLegal` writes packed move integers into
// a caller-supplied Int32Array and returns how many it wrote - no array
// is allocated, which is what keeps perft and the search fast. Legality
// (does this leave my own king in check?) is settled by making the move
// and asking, which is both the simplest thing that is certainly correct
// and the thing the search has to do anyway.
//
// `generateLegalMoves` is the friendly wrapper the user interface, SAN
// and the agent tools use: it allocates a plain array, because a few
// dozen numbers once per user action is not a hot loop.

import type {
  Color,
  Move,
  Position,
} from './types';
import {
  BISHOP,
  BLACK,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_WK,
  CASTLE_WQ,
  EMPTY,
  FLAG_CAPTURE,
  FLAG_DOUBLE,
  FLAG_EP,
  FLAG_KCASTLE,
  FLAG_PROMOTION,
  FLAG_QCASTLE,
  KING,
  KING_DIRS,
  KNIGHT,
  KNIGHT_DIRS,
  PAWN,
  QUEEN,
  ROOK,
  WHITE,
  encodeMove,
  moveFrom,
  moveTo,
  pieceColor,
} from './types';
import {
  inCheck,
  isSquareAttacked,
  makeMove,
  unmakeMove,
} from './board';

const PROMOTION_PIECES = [QUEEN, ROOK, BISHOP, KNIGHT];
const BISHOP_STEPS = [17, 15, -15, -17];
const ROOK_STEPS = [16, 1, -1, -16];
const QUEEN_STEPS = [17, 16, 15, 1, -1, -15, -16, -17];
const WHITE_PAWN_CAPTURES = [15, 17];
const BLACK_PAWN_CAPTURES = [-15, -17];

/** One scratch buffer per search ply. 256 is comfortably above the most
 *  moves a legal chess position has ever been shown to have (218). */
const BUFFERS: Int32Array[] = [];
export function moveBuffer(ply: number): Int32Array {
  let buf = BUFFERS[ply];
  if (!buf) {
    buf = new Int32Array(256);
    BUFFERS[ply] = buf;
  }
  return buf;
}

/**
 * Writes every pseudo-legal move for the side to move into `out`,
 * returning the count. With `capturesOnly`, only captures, en passant and
 * queen promotions are written - what quiescence search wants.
 */
export function generatePseudoLegal(pos: Position, out: Int32Array, capturesOnly = false): number {
  const us = pos.turn;
  const them = (us ^ 1) as Color;
  const board = pos.board;
  const base = us * 16;
  const count = pos.pieceCount[us];
  let n = 0;

  for (let i = 0; i < count; i++) {
    const from = pos.pieceSquares[base + i];
    const piece = board[from];
    const type = piece & 7;

    if (type === PAWN) {
      const forward = us === WHITE ? 16 : -16;
      const startRank = us === WHITE ? 1 : 6;
      const promoRank = us === WHITE ? 7 : 0;
      const one = from + forward;
      if ((one & 0x88) === 0 && board[one] === EMPTY) {
        if (one >> 4 === promoRank) {
          for (let p = 0; p < 4; p++) {
            if (capturesOnly && p !== 0) continue;
            out[n++] = encodeMove(from, one, PROMOTION_PIECES[p], FLAG_PROMOTION);
          }
        } else if (!capturesOnly) {
          out[n++] = encodeMove(from, one);
          const two = one + forward;
          if (from >> 4 === startRank && board[two] === EMPTY) {
            out[n++] = encodeMove(from, two, 0, FLAG_DOUBLE);
          }
        }
      }
      const caps = us === WHITE ? WHITE_PAWN_CAPTURES : BLACK_PAWN_CAPTURES;
      for (let c = 0; c < 2; c++) {
        const to = from + caps[c];
        if (to & 0x88) continue;
        const target = board[to];
        if (target !== EMPTY && pieceColor(target) === them) {
          if (to >> 4 === promoRank) {
            for (let p = 0; p < 4; p++) {
              out[n++] = encodeMove(from, to, PROMOTION_PIECES[p], FLAG_PROMOTION | FLAG_CAPTURE, target);
            }
          } else {
            out[n++] = encodeMove(from, to, 0, FLAG_CAPTURE, target);
          }
        } else if (to === pos.ep) {
          out[n++] = encodeMove(from, to, 0, FLAG_CAPTURE | FLAG_EP, PAWN | (them << 3));
        }
      }
      continue;
    }

    if (type === KNIGHT || type === KING) {
      const dirs = type === KNIGHT ? KNIGHT_DIRS : KING_DIRS;
      for (let d = 0; d < dirs.length; d++) {
        const to = from + dirs[d];
        if (to & 0x88) continue;
        const target = board[to];
        if (target === EMPTY) {
          if (!capturesOnly) out[n++] = encodeMove(from, to);
        } else if (pieceColor(target) === them) {
          out[n++] = encodeMove(from, to, 0, FLAG_CAPTURE, target);
        }
      }
      continue;
    }

    // Sliders.
    const dirs = type === BISHOP ? BISHOP_STEPS : type === ROOK ? ROOK_STEPS : QUEEN_STEPS;
    for (let d = 0; d < dirs.length; d++) {
      const step = dirs[d];
      let to = from + step;
      while ((to & 0x88) === 0) {
        const target = board[to];
        if (target === EMPTY) {
          if (!capturesOnly) out[n++] = encodeMove(from, to);
        } else {
          if (pieceColor(target) === them) out[n++] = encodeMove(from, to, 0, FLAG_CAPTURE, target);
          break;
        }
        to += step;
      }
    }
  }

  if (!capturesOnly) n = addCastles(pos, out, n);
  return n;
}

function addCastles(pos: Position, out: Int32Array, n: number): number {
  const us = pos.turn;
  const them = (us ^ 1) as Color;
  const board = pos.board;
  const king = pos.kings[us];
  if (king < 0) return n;
  const home = us === WHITE ? 0x04 : 0x74;
  if (king !== home) return n;
  const kingRight = us === WHITE ? CASTLE_WK : CASTLE_BK;
  const queenRight = us === WHITE ? CASTLE_WQ : CASTLE_BQ;
  if (!(pos.castling & (kingRight | queenRight))) return n;
  // Only pay for the "is the king in check right now?" test once.
  let checked: boolean | null = null;
  const kingInCheck = (): boolean => {
    if (checked === null) checked = isSquareAttacked(pos, king, them);
    return checked;
  };
  if (pos.castling & kingRight) {
    if (board[home + 1] === EMPTY && board[home + 2] === EMPTY && !kingInCheck()) {
      if (!isSquareAttacked(pos, home + 1, them) && !isSquareAttacked(pos, home + 2, them)) {
        out[n++] = encodeMove(home, home + 2, 0, FLAG_KCASTLE);
      }
    }
  }
  if (pos.castling & queenRight) {
    if (
      board[home - 1] === EMPTY &&
      board[home - 2] === EMPTY &&
      board[home - 3] === EMPTY &&
      !kingInCheck()
    ) {
      if (!isSquareAttacked(pos, home - 1, them) && !isSquareAttacked(pos, home - 2, them)) {
        out[n++] = encodeMove(home, home - 2, 0, FLAG_QCASTLE);
      }
    }
  }
  return n;
}

/** Filters a buffer of pseudo-legal moves in place, returning the number
 *  that are actually legal. */
export function filterLegal(pos: Position, buf: Int32Array, count: number): number {
  let kept = 0;
  const us = pos.turn;
  for (let i = 0; i < count; i++) {
    const move = buf[i];
    makeMove(pos, move);
    const ok = !isSquareAttacked(pos, pos.kings[us], (us ^ 1) as Color);
    unmakeMove(pos, move);
    if (ok) buf[kept++] = move;
  }
  return kept;
}

/** Every legal move, as a fresh array. For the interface, SAN and the
 *  agent tools - not for the search. */
export function generateLegalMoves(pos: Position): Move[] {
  const buf = new Int32Array(256);
  const count = filterLegal(pos, buf, generatePseudoLegal(pos, buf));
  const moves: Move[] = new Array(count);
  for (let i = 0; i < count; i++) moves[i] = buf[i];
  return moves;
}

export function isLegalMove(pos: Position, move: Move): boolean {
  const legal = generateLegalMoves(pos);
  for (const m of legal) if (m === move) return true;
  return false;
}

/** Legal moves that start on `from` - what the board uses to draw the
 *  dots when a piece is picked up. */
export function movesFrom(pos: Position, from: number): Move[] {
  return generateLegalMoves(pos).filter((m) => moveFrom(m) === from);
}

export function hasLegalMove(pos: Position): boolean {
  const buf = moveBuffer(220);
  const count = generatePseudoLegal(pos, buf);
  const us = pos.turn;
  for (let i = 0; i < count; i++) {
    const move = buf[i];
    makeMove(pos, move);
    const ok = !isSquareAttacked(pos, pos.kings[us], (us ^ 1) as Color);
    unmakeMove(pos, move);
    if (ok) return true;
  }
  return false;
}

export function isCheckmate(pos: Position): boolean {
  return inCheck(pos) && !hasLegalMove(pos);
}

export function isStalemate(pos: Position): boolean {
  return !inCheck(pos) && !hasLegalMove(pos);
}

/**
 * Counts leaf nodes of the move tree `depth` plies deep. The proof that
 * the rules above are right: every published perft number for a position
 * has to come out exactly.
 */
export function perft(pos: Position, depth: number, ply = 0): number {
  if (depth === 0) return 1;
  const buf = moveBuffer(ply);
  const count = generatePseudoLegal(pos, buf);
  const us = pos.turn;
  let nodes = 0;
  for (let i = 0; i < count; i++) {
    const move = buf[i];
    makeMove(pos, move);
    if (!isSquareAttacked(pos, pos.kings[us], (us ^ 1) as Color)) {
      nodes += depth === 1 ? 1 : perft(pos, depth - 1, ply + 1);
    }
    unmakeMove(pos, move);
  }
  return nodes;
}

/** perft split by first move - the tool you actually debug a mismatch
 *  with. Returns `{ e2e4: 20, ... }` in UCI notation. */
export function perftDivide(pos: Position, depth: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const move of generateLegalMoves(pos)) {
    makeMove(pos, move);
    out[uciOf(move)] = depth <= 1 ? 1 : perft(pos, depth - 1, 1);
    unmakeMove(pos, move);
  }
  return out;
}

function uciOf(move: Move): string {
  const names = 'abcdefgh';
  const from = moveFrom(move);
  const to = moveTo(move);
  const promo = (move >> 16) & 7;
  return (
    names[from & 15] +
    String(1 + (from >> 4)) +
    names[to & 15] +
    String(1 + (to >> 4)) +
    (promo ? ' pnbrqk'[promo] : '')
  );
}

export { KING, KNIGHT, PAWN, BISHOP, ROOK, QUEEN, BLACK, WHITE };
