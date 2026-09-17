// src/lib/zobrist.ts
//
// Zobrist hashing. The key is 48 bits, split into a 32-bit low half and a
// 16-bit high half: xor-ing two 32-bit halves is the fastest thing
// JavaScript can do to a hash, and capping the high half at 16 bits means
// `hi * 2**32 + lo` is an exact double, so a whole key is still a plain
// number that a Map or an array index can hold without string formatting.
// 48 bits is far more than repetition detection over one game needs and
// leaves 16 bits of verification for the transposition table.
//
// The numbers come from a fixed xorshift seed, so two runs - and a test
// and the app - always agree on a key.

import type {
  Position,
} from './types';
import {
  WHITE,
} from './types';

function xorshift32(seed: number): () => number {
  let x = seed | 0;
  return () => {
    x ^= x << 13;
    x |= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x |= 0;
    return x >>> 0;
  };
}

const rng = xorshift32(0x5eed1234);

/** [pieceCode][square] - piece codes run 0..14, squares 0..127. */
export const PIECE_KEYS_LO: Int32Array = new Int32Array(15 * 128);
export const PIECE_KEYS_HI: Int32Array = new Int32Array(15 * 128);
export const CASTLE_KEYS_LO: Int32Array = new Int32Array(16);
export const CASTLE_KEYS_HI: Int32Array = new Int32Array(16);
/** Indexed by file, 0..7 - only the file of an en-passant square matters. */
export const EP_KEYS_LO: Int32Array = new Int32Array(8);
export const EP_KEYS_HI: Int32Array = new Int32Array(8);
export let SIDE_KEY_LO = 0;
export let SIDE_KEY_HI = 0;

for (let i = 0; i < PIECE_KEYS_LO.length; i++) {
  PIECE_KEYS_LO[i] = rng() | 0;
  PIECE_KEYS_HI[i] = rng() & 0xffff;
}
for (let i = 0; i < 16; i++) {
  CASTLE_KEYS_LO[i] = rng() | 0;
  CASTLE_KEYS_HI[i] = rng() & 0xffff;
}
for (let i = 0; i < 8; i++) {
  EP_KEYS_LO[i] = rng() | 0;
  EP_KEYS_HI[i] = rng() & 0xffff;
}
SIDE_KEY_LO = rng() | 0;
SIDE_KEY_HI = rng() & 0xffff;

export function pieceKeyIndex(piece: number, sq: number): number {
  return piece * 128 + sq;
}

/** The whole 48-bit key as one exact number. */
export function positionKey(pos: Position): number {
  return (pos.keyHi & 0xffff) * 4294967296 + (pos.keyLo >>> 0);
}

/**
 * Recomputes a position's key from scratch. `makeMove` maintains the key
 * incrementally; this is what the tests compare it against, and what FEN
 * parsing uses to seed it.
 *
 * The en-passant square is folded in only when a pawn of the side to move
 * could actually capture on it. FIDE's repetition rule compares positions
 * by the moves available in them, so two positions that differ only in a
 * recorded-but-unusable en-passant square are the same position.
 */
export function computeKey(pos: Position): { lo: number; hi: number } {
  let lo = 0;
  let hi = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const piece = pos.board[sq];
    if (!piece) continue;
    const idx = pieceKeyIndex(piece, sq);
    lo ^= PIECE_KEYS_LO[idx];
    hi ^= PIECE_KEYS_HI[idx];
  }
  lo ^= CASTLE_KEYS_LO[pos.castling];
  hi ^= CASTLE_KEYS_HI[pos.castling];
  if (pos.ep >= 0 && epIsRelevant(pos)) {
    const file = pos.ep & 15;
    lo ^= EP_KEYS_LO[file];
    hi ^= EP_KEYS_HI[file];
  }
  if (pos.turn !== WHITE) {
    lo ^= SIDE_KEY_LO;
    hi ^= SIDE_KEY_HI;
  }
  return { lo: lo | 0, hi: hi & 0xffff };
}

/** True when a pawn of the side to move sits beside the en-passant
 *  target, i.e. when the capture is at least pseudo-legal. */
export function epIsRelevant(pos: Position): boolean {
  const ep = pos.ep;
  if (ep < 0) return false;
  // The capturing pawn stands one rank below the target for White.
  const back = pos.turn === WHITE ? -16 : 16;
  const pawn = pos.turn === WHITE ? 1 : 9;
  const left = ep + back - 1;
  const right = ep + back + 1;
  if ((left & 0x88) === 0 && pos.board[left] === pawn) return true;
  if ((right & 0x88) === 0 && pos.board[right] === pawn) return true;
  return false;
}
