// src/lib/board.ts
//
// The position itself: a 0x88 mailbox board, per-colour piece lists, and
// make/unmake with an incremental Zobrist key. Nothing here allocates
// once a Position exists - the undo stack and the repetition history are
// preallocated typed arrays that grow by doubling, and make/unmake move
// integers in and out of them. That is what makes perft(5) from the
// starting position finish in a couple of seconds and the search reach a
// useful depth inside a two-second move budget.
//
// Attack detection uses the classic 0x88 difference tables: for any two
// squares there is exactly one offset between them, so `ATTACK_BITS[from
// - to + 119]` answers "could a piece of this type ever attack along this
// vector?" with one array read, and only the survivors pay for a walk
// down the ray looking for blockers.

import type {
  Color,
  Move,
  Position,
} from './types';
import {
  BISHOP,
  BLACK,
  CASTLE_ALL,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_WK,
  CASTLE_WQ,
  EMPTY,
  FLAG_DOUBLE,
  FLAG_EP,
  FLAG_KCASTLE,
  FLAG_QCASTLE,
  KING,
  KING_DIRS,
  KNIGHT,
  KNIGHT_DIRS,
  PAWN,
  QUEEN,
  ROOK,
  UNDO_SIZE,
  WHITE,
  isCapture,
  moveCaptured,
  moveFrom,
  movePromotion,
  moveTo,
  pieceColor,
  pieceType,
} from './types';
import {
  CASTLE_KEYS_HI,
  CASTLE_KEYS_LO,
  EP_KEYS_HI,
  EP_KEYS_LO,
  PIECE_KEYS_HI,
  PIECE_KEYS_LO,
  SIDE_KEY_HI,
  SIDE_KEY_LO,
  computeKey,
  epIsRelevant,
  pieceKeyIndex,
  positionKey,
} from './zobrist';

// ---------------------------------------------------------------------
// Attack tables
// ---------------------------------------------------------------------

/** Bit per piece type (1 << PAWN .. 1 << KING) for the vector between two
 *  squares, indexed by `attackerSquare - targetSquare + 119`. */
export const ATTACK_BITS = new Int32Array(239);
/** The single step direction to walk from attacker towards target for the
 *  same index; 0 when the vector is not a ray. */
export const RAY_DIR = new Int32Array(239);

(function buildAttackTables(): void {
  for (let from = 0; from < 128; from++) {
    if (from & 0x88) continue;
    for (const d of KNIGHT_DIRS) {
      const to = from + d;
      if (to & 0x88) continue;
      ATTACK_BITS[from - to + 119] |= 1 << KNIGHT;
    }
    for (const d of KING_DIRS) {
      const to = from + d;
      if (to & 0x88) continue;
      ATTACK_BITS[from - to + 119] |= 1 << KING;
    }
    for (const d of KING_DIRS) {
      const diagonal = d === 17 || d === 15 || d === -15 || d === -17;
      let to = from + d;
      while (!(to & 0x88)) {
        const idx = from - to + 119;
        ATTACK_BITS[idx] |= 1 << QUEEN;
        ATTACK_BITS[idx] |= diagonal ? 1 << BISHOP : 1 << ROOK;
        RAY_DIR[idx] = d;
        to += d;
      }
    }
    // Pawn captures: both colours share the four diagonal steps, and the
    // sign of the difference tells them apart at lookup time.
    for (const d of [15, 17, -15, -17]) {
      const to = from + d;
      if (to & 0x88) continue;
      ATTACK_BITS[from - to + 119] |= 1 << PAWN;
    }
  }
})();

/** ANDed into the castling rights whenever a piece leaves or lands on a
 *  square: a king or rook moving, or a rook being captured on its home
 *  square, all lose the same rights. */
const CASTLE_MASK = new Int32Array(128).fill(CASTLE_ALL);
CASTLE_MASK[0x04] = CASTLE_ALL & ~(CASTLE_WK | CASTLE_WQ); // e1
CASTLE_MASK[0x00] = CASTLE_ALL & ~CASTLE_WQ; // a1
CASTLE_MASK[0x07] = CASTLE_ALL & ~CASTLE_WK; // h1
CASTLE_MASK[0x74] = CASTLE_ALL & ~(CASTLE_BK | CASTLE_BQ); // e8
CASTLE_MASK[0x70] = CASTLE_ALL & ~CASTLE_BQ; // a8
CASTLE_MASK[0x77] = CASTLE_ALL & ~CASTLE_BK; // h8

// ---------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------

export function createEmptyPosition(): Position {
  return {
    board: new Int8Array(128),
    turn: WHITE,
    castling: 0,
    ep: -1,
    halfmove: 0,
    fullmove: 1,
    kings: new Int32Array([-1, -1]),
    keyLo: 0,
    keyHi: 0,
    pieceSquares: new Int32Array(32).fill(-1),
    pieceCount: new Int32Array(2),
    pieceIndex: new Int32Array(128).fill(-1),
    undo: new Int32Array(UNDO_SIZE * 256),
    ply: 0,
    history: new Float64Array(512),
    histCount: 0,
  };
}

/** A deep copy that shares nothing - used whenever a second position is
 *  needed (analysis, the engine's own copy) so that one search can never
 *  disturb the board the user is looking at. */
export function clonePosition(pos: Position): Position {
  return {
    board: pos.board.slice(),
    turn: pos.turn,
    castling: pos.castling,
    ep: pos.ep,
    halfmove: pos.halfmove,
    fullmove: pos.fullmove,
    kings: pos.kings.slice(),
    keyLo: pos.keyLo,
    keyHi: pos.keyHi,
    pieceSquares: pos.pieceSquares.slice(),
    pieceCount: pos.pieceCount.slice(),
    pieceIndex: pos.pieceIndex.slice(),
    undo: pos.undo.slice(),
    ply: pos.ply,
    history: pos.history.slice(),
    histCount: pos.histCount,
  };
}

export function addPiece(pos: Position, sq: number, piece: number): void {
  const color = pieceColor(piece);
  const idx = color * 16 + pos.pieceCount[color];
  pos.board[sq] = piece;
  pos.pieceSquares[idx] = sq;
  pos.pieceIndex[sq] = idx;
  pos.pieceCount[color]++;
  if (pieceType(piece) === KING) pos.kings[color] = sq;
  const k = pieceKeyIndex(piece, sq);
  pos.keyLo ^= PIECE_KEYS_LO[k];
  pos.keyHi ^= PIECE_KEYS_HI[k];
}

export function removePiece(pos: Position, sq: number): number {
  const piece = pos.board[sq];
  if (!piece) return EMPTY;
  const color = pieceColor(piece);
  const idx = pos.pieceIndex[sq];
  const last = color * 16 + pos.pieceCount[color] - 1;
  const moved = pos.pieceSquares[last];
  pos.pieceSquares[idx] = moved;
  pos.pieceIndex[moved] = idx;
  pos.pieceSquares[last] = -1;
  pos.pieceCount[color]--;
  pos.board[sq] = EMPTY;
  pos.pieceIndex[sq] = -1;
  const k = pieceKeyIndex(piece, sq);
  pos.keyLo ^= PIECE_KEYS_LO[k];
  pos.keyHi ^= PIECE_KEYS_HI[k];
  return piece;
}

function shiftPiece(pos: Position, from: number, to: number): void {
  const piece = pos.board[from];
  const idx = pos.pieceIndex[from];
  pos.pieceSquares[idx] = to;
  pos.pieceIndex[to] = idx;
  pos.pieceIndex[from] = -1;
  pos.board[to] = piece;
  pos.board[from] = EMPTY;
  if (pieceType(piece) === KING) pos.kings[pieceColor(piece)] = to;
  const a = pieceKeyIndex(piece, from);
  const b = pieceKeyIndex(piece, to);
  pos.keyLo ^= PIECE_KEYS_LO[a] ^ PIECE_KEYS_LO[b];
  pos.keyHi ^= PIECE_KEYS_HI[a] ^ PIECE_KEYS_HI[b];
}

/** Recomputes the key and seeds the repetition history. Called after a
 *  position is built by hand or parsed from FEN. */
export function refreshKey(pos: Position): void {
  const { lo, hi } = computeKey(pos);
  pos.keyLo = lo;
  pos.keyHi = hi;
  pos.histCount = 0;
  pushHistory(pos);
}

function pushHistory(pos: Position): void {
  if (pos.histCount >= pos.history.length) {
    const bigger = new Float64Array(pos.history.length * 2);
    bigger.set(pos.history);
    pos.history = bigger;
  }
  pos.history[pos.histCount++] = positionKey(pos);
}

// ---------------------------------------------------------------------
// Attacks and check
// ---------------------------------------------------------------------

/**
 * Is `square` attacked by any piece of `byColor`? Walks that colour's
 * piece list (never more than sixteen entries, usually far fewer) and
 * rejects most of them with a single table read.
 */
export function isSquareAttacked(pos: Position, square: number, byColor: Color): boolean {
  const base = byColor * 16;
  const count = pos.pieceCount[byColor];
  const board = pos.board;
  for (let i = 0; i < count; i++) {
    const from = pos.pieceSquares[base + i];
    const diff = from - square;
    if (diff === 0) continue;
    const idx = diff + 119;
    const type = board[from] & 7;
    if ((ATTACK_BITS[idx] & (1 << type)) === 0) continue;
    if (type === PAWN) {
      // A white pawn attacks upwards, so the attacker sits below the
      // target and `from - square` is negative.
      if (byColor === WHITE ? diff < 0 : diff > 0) return true;
      continue;
    }
    if (type === KNIGHT || type === KING) return true;
    const step = RAY_DIR[idx];
    let sq = from + step;
    let blocked = false;
    while (sq !== square) {
      if (board[sq] !== EMPTY) {
        blocked = true;
        break;
      }
      sq += step;
    }
    if (!blocked) return true;
  }
  return false;
}

export function kingSquare(pos: Position, color: Color): number {
  return pos.kings[color];
}

export function inCheck(pos: Position, color: Color = pos.turn): boolean {
  const king = pos.kings[color];
  if (king < 0) return false;
  return isSquareAttacked(pos, king, (color ^ 1) as Color);
}

// ---------------------------------------------------------------------
// Make and unmake
// ---------------------------------------------------------------------

function ensureUndo(pos: Position): void {
  const need = (pos.ply + 1) * UNDO_SIZE;
  if (need <= pos.undo.length) return;
  const bigger = new Int32Array(Math.max(need, pos.undo.length * 2));
  bigger.set(pos.undo);
  pos.undo = bigger;
}

/**
 * Plays `move`. The move must be pseudo-legal for this position; whether
 * it leaves the mover's own king in check is the caller's business (the
 * usual pattern is make, ask `inCheck`, unmake if so - see
 * `generateLegalMoves`).
 */
export function makeMove(pos: Position, move: Move): void {
  ensureUndo(pos);
  const base = pos.ply * UNDO_SIZE;
  pos.undo[base] = pos.castling;
  pos.undo[base + 1] = pos.ep;
  pos.undo[base + 2] = pos.halfmove;
  pos.undo[base + 3] = pos.keyLo;
  pos.undo[base + 4] = pos.keyHi;
  pos.undo[base + 5] = pos.fullmove;
  pos.ply++;

  const us = pos.turn;
  const them = (us ^ 1) as Color;
  const from = moveFrom(move);
  const to = moveTo(move);
  const piece = pos.board[from];
  const type = piece & 7;

  // Retire the old en-passant and castling contributions to the key
  // before anything on the board moves, while `epIsRelevant` can still
  // see the position the flag belonged to.
  if (pos.ep >= 0 && epIsRelevant(pos)) {
    const f = pos.ep & 15;
    pos.keyLo ^= EP_KEYS_LO[f];
    pos.keyHi ^= EP_KEYS_HI[f];
  }
  pos.keyLo ^= CASTLE_KEYS_LO[pos.castling];
  pos.keyHi ^= CASTLE_KEYS_HI[pos.castling];

  if (move & FLAG_EP) {
    removePiece(pos, to + (us === WHITE ? -16 : 16));
  } else if (isCapture(move)) {
    removePiece(pos, to);
  }

  shiftPiece(pos, from, to);

  const promo = movePromotion(move);
  if (promo) {
    removePiece(pos, to);
    addPiece(pos, to, promo | (us << 3));
  }

  if (move & FLAG_KCASTLE) shiftPiece(pos, to + 1, to - 1);
  else if (move & FLAG_QCASTLE) shiftPiece(pos, to - 2, to + 1);

  pos.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
  pos.keyLo ^= CASTLE_KEYS_LO[pos.castling];
  pos.keyHi ^= CASTLE_KEYS_HI[pos.castling];

  pos.ep = move & FLAG_DOUBLE ? (from + to) >> 1 : -1;

  if (type === PAWN || isCapture(move)) pos.halfmove = 0;
  else pos.halfmove++;
  if (us === BLACK) pos.fullmove++;

  pos.turn = them;
  pos.keyLo ^= SIDE_KEY_LO;
  pos.keyHi ^= SIDE_KEY_HI;

  if (pos.ep >= 0 && epIsRelevant(pos)) {
    const f = pos.ep & 15;
    pos.keyLo ^= EP_KEYS_LO[f];
    pos.keyHi ^= EP_KEYS_HI[f];
  }

  pushHistory(pos);
}

/** Takes back the last move made on this position. */
export function unmakeMove(pos: Position, move: Move): void {
  pos.ply--;
  const base = pos.ply * UNDO_SIZE;
  const us = (pos.turn ^ 1) as Color;
  const from = moveFrom(move);
  const to = moveTo(move);

  if (move & FLAG_KCASTLE) shiftPiece(pos, to - 1, to + 1);
  else if (move & FLAG_QCASTLE) shiftPiece(pos, to + 1, to - 2);

  if (movePromotion(move)) {
    removePiece(pos, to);
    addPiece(pos, to, PAWN | (us << 3));
  }
  shiftPiece(pos, to, from);

  if (move & FLAG_EP) {
    addPiece(pos, to + (us === WHITE ? -16 : 16), PAWN | ((us ^ 1) << 3));
  } else if (isCapture(move)) {
    addPiece(pos, to, moveCaptured(move));
  }

  pos.castling = pos.undo[base];
  pos.ep = pos.undo[base + 1];
  pos.halfmove = pos.undo[base + 2];
  pos.keyLo = pos.undo[base + 3];
  pos.keyHi = pos.undo[base + 4];
  pos.fullmove = pos.undo[base + 5];
  pos.turn = us;
  pos.histCount--;
}

/** A null move - hand the turn over without touching a piece. Used by the
 *  search's null-move pruning, and by nothing else. */
export function makeNullMove(pos: Position): void {
  ensureUndo(pos);
  const base = pos.ply * UNDO_SIZE;
  pos.undo[base] = pos.castling;
  pos.undo[base + 1] = pos.ep;
  pos.undo[base + 2] = pos.halfmove;
  pos.undo[base + 3] = pos.keyLo;
  pos.undo[base + 4] = pos.keyHi;
  pos.undo[base + 5] = pos.fullmove;
  pos.ply++;
  if (pos.ep >= 0 && epIsRelevant(pos)) {
    const f = pos.ep & 15;
    pos.keyLo ^= EP_KEYS_LO[f];
    pos.keyHi ^= EP_KEYS_HI[f];
  }
  pos.ep = -1;
  pos.halfmove++;
  if (pos.turn === BLACK) pos.fullmove++;
  pos.turn = (pos.turn ^ 1) as Color;
  pos.keyLo ^= SIDE_KEY_LO;
  pos.keyHi ^= SIDE_KEY_HI;
  pushHistory(pos);
}

export function unmakeNullMove(pos: Position): void {
  pos.ply--;
  const base = pos.ply * UNDO_SIZE;
  pos.castling = pos.undo[base];
  pos.ep = pos.undo[base + 1];
  pos.halfmove = pos.undo[base + 2];
  pos.keyLo = pos.undo[base + 3];
  pos.keyHi = pos.undo[base + 4];
  pos.fullmove = pos.undo[base + 5];
  pos.turn = (pos.turn ^ 1) as Color;
  pos.histCount--;
}

// ---------------------------------------------------------------------
// Repetition, material and the drawing rules that only need the board
// ---------------------------------------------------------------------

/**
 * How many times this exact position has occurred, counting the current
 * one. Only the plies since the last irreversible move can possibly
 * match, so the scan is bounded by the halfmove clock.
 */
export function repetitionCount(pos: Position): number {
  const key = positionKey(pos);
  let count = 1;
  const last = pos.histCount - 1;
  const stop = Math.max(0, last - pos.halfmove);
  // Only every second ply has the same side to move.
  for (let i = last - 2; i >= stop; i -= 2) {
    if (pos.history[i] === key) count++;
  }
  return count;
}

/**
 * The FIDE 5.2(b) "dead position" cases that can be decided from material
 * alone: king v king, king and a minor v king, and king and bishop v king
 * and bishop with both bishops on one colour. Two knights against a lone
 * king is NOT insufficient - mate is possible, just not forcible - and
 * this follows the rule rather than the folklore.
 */
export function hasInsufficientMaterial(pos: Position): boolean {
  let knights = 0;
  const bishopSquareColors: number[] = [];
  for (let color = 0 as Color; color <= 1; color = (color + 1) as Color) {
    const base = color * 16;
    for (let i = 0; i < pos.pieceCount[color]; i++) {
      const sq = pos.pieceSquares[base + i];
      const type = pos.board[sq] & 7;
      if (type === KING) continue;
      if (type === PAWN || type === ROOK || type === QUEEN) return false;
      if (type === KNIGHT) knights++;
      else bishopSquareColors.push(((sq >> 4) + (sq & 15)) & 1);
    }
  }
  const minors = knights + bishopSquareColors.length;
  if (minors === 0) return true;
  if (minors === 1) return true;
  if (knights === 0 && bishopSquareColors.every((c) => c === bishopSquareColors[0])) return true;
  return false;
}

/** Non-pawn, non-king material for the given colour, in centipawns - the
 *  test the search uses before trying a null move. */
export function nonPawnMaterial(pos: Position, color: Color): number {
  const values = [0, 0, 320, 330, 500, 900, 0];
  let total = 0;
  const base = color * 16;
  for (let i = 0; i < pos.pieceCount[color]; i++) {
    total += values[pos.board[pos.pieceSquares[base + i]] & 7];
  }
  return total;
}

export { positionKey };
