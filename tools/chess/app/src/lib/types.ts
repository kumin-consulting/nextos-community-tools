// src/lib/types.ts
//
// The vocabulary every other module in this app shares: piece codes,
// 0x88 squares, the packed 32-bit move integer and the Position record.
// A true leaf - it imports nothing, so no import cycle can ever form
// around it.

/** Colours. Used as array indices, so the values matter. */
export const WHITE = 0;
export const BLACK = 1;
export type Color = 0 | 1;

/** Piece types. A piece code is `type | (color << 3)`, so a white pawn
 *  is 1 and a black pawn is 9; 0 is an empty square and 7/8 are never
 *  used, which keeps `type` a plain `code & 7` mask. */
export const EMPTY = 0;
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export const W_PAWN = 1;
export const W_KNIGHT = 2;
export const W_BISHOP = 3;
export const W_ROOK = 4;
export const W_QUEEN = 5;
export const W_KING = 6;
export const B_PAWN = 9;
export const B_KNIGHT = 10;
export const B_BISHOP = 11;
export const B_ROOK = 12;
export const B_QUEEN = 13;
export const B_KING = 14;

export function pieceType(code: number): number {
  return code & 7;
}
export function pieceColor(code: number): Color {
  return ((code >> 3) & 1) as Color;
}
export function makePiece(type: number, color: Color): number {
  return type | (color << 3);
}

/** 'PNBRQK' indexed by piece type (index 0 unused). */
export const PIECE_LETTERS = ' pnbrqk';

export function pieceToChar(code: number): string {
  const letter = PIECE_LETTERS[code & 7];
  return pieceColor(code) === WHITE ? letter.toUpperCase() : letter;
}

export function charToPiece(ch: string): number {
  const lower = ch.toLowerCase();
  const type = PIECE_LETTERS.indexOf(lower);
  if (type <= 0) return EMPTY;
  return makePiece(type, ch === lower ? BLACK : WHITE);
}

// ---------------------------------------------------------------------
// 0x88 squares
// ---------------------------------------------------------------------
// `sq = rank * 16 + file`, rank 0 is White's first rank and file 0 is the
// a-file. A square is on the board exactly when `(sq & 0x88) === 0`, which
// is the whole point of the representation: adding a direction offset and
// testing one mask catches every wrap-around off the edge for free.

export const A1 = 0x00;
export const B1 = 0x01;
export const C1 = 0x02;
export const D1 = 0x03;
export const E1 = 0x04;
export const F1 = 0x05;
export const G1 = 0x06;
export const H1 = 0x07;
export const A8 = 0x70;
export const B8 = 0x71;
export const C8 = 0x72;
export const D8 = 0x73;
export const E8 = 0x74;
export const F8 = 0x75;
export const G8 = 0x76;
export const H8 = 0x77;

export function onBoard(sq: number): boolean {
  return (sq & 0x88) === 0;
}
export function sqFile(sq: number): number {
  return sq & 15;
}
export function sqRank(sq: number): number {
  return sq >> 4;
}
export function makeSquare(file: number, rank: number): number {
  return rank * 16 + file;
}
/** 0x88 square -> 0..63, a1 = 0, h8 = 63. Handy for tables and the UI. */
export function sq64(sq: number): number {
  return (sq >> 4) * 8 + (sq & 7);
}
/** 0..63 -> 0x88. */
export function from64(i: number): number {
  return ((i >> 3) << 4) | (i & 7);
}
export function squareName(sq: number): string {
  return 'abcdefgh'[sq & 15] + String(1 + (sq >> 4));
}
/** Parses 'e4'. Returns -1 when the text is not a square. */
export function parseSquare(text: string): number {
  if (text.length !== 2) return -1;
  const file = 'abcdefgh'.indexOf(text[0]);
  const rank = '12345678'.indexOf(text[1]);
  if (file < 0 || rank < 0) return -1;
  return rank * 16 + file;
}

// Direction offsets.
export const DIR_N = 16;
export const DIR_S = -16;
export const DIR_E = 1;
export const DIR_W = -1;
export const DIR_NE = 17;
export const DIR_NW = 15;
export const DIR_SE = -15;
export const DIR_SW = -17;

export const KNIGHT_DIRS = [33, 31, 18, 14, -14, -18, -31, -33];
export const BISHOP_DIRS = [17, 15, -15, -17];
export const ROOK_DIRS = [16, 1, -1, -16];
export const KING_DIRS = [17, 16, 15, 1, -1, -15, -16, -17];

// ---------------------------------------------------------------------
// Castling rights
// ---------------------------------------------------------------------
export const CASTLE_WK = 1;
export const CASTLE_WQ = 2;
export const CASTLE_BK = 4;
export const CASTLE_BQ = 8;
export const CASTLE_ALL = 15;

// ---------------------------------------------------------------------
// Moves, packed into one non-negative 32-bit integer
// ---------------------------------------------------------------------
// bits  0.. 7  from square (0x88)
// bits  8..15  to square (0x88)
// bits 16..18  promotion piece type, 0 when there is none
// bits 19..24  flags
// bits 25..28  captured piece code (0 when the move is not a capture)
//
// Keeping a move in a number rather than an object is what lets move
// generation write into a preallocated Int32Array and allocate nothing at
// all in the search's hot loop.

export type Move = number;

export const FLAG_CAPTURE = 1 << 19;
export const FLAG_EP = 1 << 20;
export const FLAG_DOUBLE = 1 << 21;
export const FLAG_KCASTLE = 1 << 22;
export const FLAG_QCASTLE = 1 << 23;
export const FLAG_PROMOTION = 1 << 24;
export const FLAG_CASTLE = FLAG_KCASTLE | FLAG_QCASTLE;

export const NO_MOVE = 0;

export function encodeMove(
  from: number,
  to: number,
  promotion = 0,
  flags = 0,
  captured = 0
): Move {
  return from | (to << 8) | (promotion << 16) | flags | (captured << 25);
}

export function moveFrom(m: Move): number {
  return m & 0xff;
}
export function moveTo(m: Move): number {
  return (m >> 8) & 0xff;
}
export function movePromotion(m: Move): number {
  return (m >> 16) & 7;
}
export function moveCaptured(m: Move): number {
  return (m >> 25) & 15;
}
export function isCapture(m: Move): boolean {
  return (m & FLAG_CAPTURE) !== 0;
}
export function isPromotion(m: Move): boolean {
  return (m & FLAG_PROMOTION) !== 0;
}
export function isEnPassant(m: Move): boolean {
  return (m & FLAG_EP) !== 0;
}
export function isCastle(m: Move): boolean {
  return (m & FLAG_CASTLE) !== 0;
}
/** Compares only from/to/promotion - what a user interface or a parsed
 *  move can know without consulting the position. */
export function sameMove(a: Move, b: Move): boolean {
  return (a & 0x7ffff) === (b & 0x7ffff);
}

/** 'e2e4', 'e7e8q' - the UCI/long-algebraic coordinate form. */
export function moveToUci(m: Move): string {
  const promo = movePromotion(m);
  return squareName(moveFrom(m)) + squareName(moveTo(m)) + (promo ? PIECE_LETTERS[promo] : '');
}

// ---------------------------------------------------------------------
// Position
// ---------------------------------------------------------------------

export interface Position {
  /** 128 entries, 0x88 layout; 0 is an empty square. */
  board: Int8Array;
  turn: Color;
  /** Bitmask of CASTLE_*. */
  castling: number;
  /** The en-passant target square, or -1. Standard FEN semantics: it is
   *  set after any double pawn push, whether or not a capture is legal. */
  ep: number;
  halfmove: number;
  fullmove: number;
  /** King square per colour. */
  kings: Int32Array;
  /** Zobrist key, as two 32-bit halves (JS has no 64-bit integer that is
   *  also fast to xor). */
  keyLo: number;
  keyHi: number;
  /** Squares of every piece: white at 0..15, black at 16..31. Order is
   *  not meaningful - removals swap the last entry into the hole. */
  pieceSquares: Int32Array;
  /** How many entries of each colour's slice are live. */
  pieceCount: Int32Array;
  /** Square -> index into pieceSquares. Only meaningful for occupied
   *  squares. */
  pieceIndex: Int32Array;
  /** Flat undo stack, UNDO_SIZE ints per ply. */
  undo: Int32Array;
  /** How many plies deep the undo stack currently is. */
  ply: number;
  /** Zobrist key of every position reached so far, this one last. Used
   *  for repetition detection; a Float64Array because a 48-bit key is an
   *  exact double and pushing to it allocates nothing. */
  history: Float64Array;
  /** How many entries of `history` are live. */
  histCount: number;
}

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Slots per ply on the flat undo stack. */
export const UNDO_SIZE = 6;
