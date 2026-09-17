// src/lib/fen.ts
//
// FEN in and out. `parseFen` never throws on rubbish: it returns a
// `{ ok: false, error }` so the window can show a person what is wrong
// with the text they pasted instead of going blank.

import type {
  Color,
  Position,
} from './types';
import {
  BLACK,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_WK,
  CASTLE_WQ,
  INITIAL_FEN,
  KING,
  PAWN,
  WHITE,
  charToPiece,
  parseSquare,
  pieceColor,
  pieceToChar,
  pieceType,
  squareName,
} from './types';
import {
  addPiece,
  createEmptyPosition,
  isSquareAttacked,
  refreshKey,
} from './board';

export type FenResult = { ok: true; position: Position } | { ok: false; error: string };

/** Parses a FEN into a position, or explains why it cannot. */
export function parseFen(fen: string): FenResult {
  const text = fen.trim();
  if (!text) return { ok: false, error: 'The FEN is empty.' };
  const parts = text.split(/\s+/);
  if (parts.length < 2) {
    return { ok: false, error: 'A FEN needs at least a board and a side to move.' };
  }
  const [placement, sideText] = parts;
  const castlingText = parts[2] ?? '-';
  const epText = parts[3] ?? '-';
  const halfmoveText = parts[4] ?? '0';
  const fullmoveText = parts[5] ?? '1';

  const ranks = placement.split('/');
  if (ranks.length !== 8) {
    return { ok: false, error: `The board has ${ranks.length} ranks; it needs 8.` };
  }

  const pos = createEmptyPosition();
  const seenKings = [0, 0];
  for (let r = 0; r < 8; r++) {
    // FEN lists rank 8 first; our rank 0 is White's first rank.
    const rank = 7 - r;
    let file = 0;
    for (const ch of ranks[r]) {
      if (ch >= '1' && ch <= '8') {
        file += ch.charCodeAt(0) - 48;
        continue;
      }
      const piece = charToPiece(ch);
      if (!piece) return { ok: false, error: `"${ch}" is not a piece.` };
      if (file > 7) return { ok: false, error: `Rank ${rank + 1} has more than 8 squares.` };
      const sq = rank * 16 + file;
      if (pieceType(piece) === KING) {
        const color = pieceColor(piece);
        seenKings[color]++;
        if (seenKings[color] > 1) {
          return { ok: false, error: `${color === WHITE ? 'White' : 'Black'} has more than one king.` };
        }
      }
      if (pos.pieceCount[pieceColor(piece)] >= 16) {
        return { ok: false, error: 'A side has more than 16 pieces.' };
      }
      addPiece(pos, sq, piece);
      file++;
    }
    if (file !== 8) return { ok: false, error: `Rank ${rank + 1} describes ${file} squares, not 8.` };
  }
  if (!seenKings[WHITE] || !seenKings[BLACK]) {
    return { ok: false, error: 'Both sides need a king.' };
  }

  if (sideText !== 'w' && sideText !== 'b') {
    return { ok: false, error: `"${sideText}" is not a side to move; use w or b.` };
  }
  pos.turn = sideText === 'w' ? WHITE : BLACK;

  pos.castling = 0;
  if (castlingText !== '-') {
    for (const ch of castlingText) {
      if (ch === 'K') pos.castling |= CASTLE_WK;
      else if (ch === 'Q') pos.castling |= CASTLE_WQ;
      else if (ch === 'k') pos.castling |= CASTLE_BK;
      else if (ch === 'q') pos.castling |= CASTLE_BQ;
      else return { ok: false, error: `"${ch}" is not a castling right.` };
    }
  }
  // Rights that the board contradicts are dropped rather than rejected -
  // plenty of real PGN carries a stale KQkq.
  if (pos.board[0x04] !== 6) pos.castling &= ~(CASTLE_WK | CASTLE_WQ);
  if (pos.board[0x07] !== 4) pos.castling &= ~CASTLE_WK;
  if (pos.board[0x00] !== 4) pos.castling &= ~CASTLE_WQ;
  if (pos.board[0x74] !== 14) pos.castling &= ~(CASTLE_BK | CASTLE_BQ);
  if (pos.board[0x77] !== 12) pos.castling &= ~CASTLE_BK;
  if (pos.board[0x70] !== 12) pos.castling &= ~CASTLE_BQ;

  if (epText === '-') pos.ep = -1;
  else {
    const sq = parseSquare(epText);
    if (sq < 0) return { ok: false, error: `"${epText}" is not a square.` };
    const rank = sq >> 4;
    const wanted = pos.turn === WHITE ? 5 : 2;
    if (rank !== wanted) return { ok: false, error: `${epText} cannot be an en-passant square here.` };
    // A stale target with no pawn that could have just moved is dropped.
    const pawnSq = sq + (pos.turn === WHITE ? -16 : 16);
    pos.ep = pos.board[pawnSq] === (PAWN | (((pos.turn ^ 1) as Color) << 3)) ? sq : -1;
  }

  const halfmove = Number(halfmoveText);
  const fullmove = Number(fullmoveText);
  if (!Number.isFinite(halfmove) || halfmove < 0) return { ok: false, error: 'The halfmove clock is not a number.' };
  if (!Number.isFinite(fullmove) || fullmove < 1) return { ok: false, error: 'The move number is not a number.' };
  pos.halfmove = Math.floor(halfmove);
  pos.fullmove = Math.floor(fullmove);

  // The side that just moved must not be sitting in check.
  if (isSquareAttacked(pos, pos.kings[(pos.turn ^ 1) as Color], pos.turn)) {
    return { ok: false, error: 'The side that just moved is left in check - this position cannot occur.' };
  }

  refreshKey(pos);
  return { ok: true, position: pos };
}

/** Parses a FEN, throwing on failure. For constants and tests, where a
 *  bad FEN is a bug and not a user's typo. */
export function fromFen(fen: string): Position {
  const result = parseFen(fen);
  if (!result.ok) throw new Error(`Bad FEN "${fen}": ${result.error}`);
  return result.position;
}

export function initialPosition(): Position {
  return fromFen(INITIAL_FEN);
}

/** Prints the position as a FEN. */
export function toFen(pos: Position): string {
  let placement = '';
  for (let rank = 7; rank >= 0; rank--) {
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const piece = pos.board[rank * 16 + file];
      if (!piece) {
        empty++;
        continue;
      }
      if (empty) {
        placement += String(empty);
        empty = 0;
      }
      placement += pieceToChar(piece);
    }
    if (empty) placement += String(empty);
    if (rank > 0) placement += '/';
  }
  let castling = '';
  if (pos.castling & CASTLE_WK) castling += 'K';
  if (pos.castling & CASTLE_WQ) castling += 'Q';
  if (pos.castling & CASTLE_BK) castling += 'k';
  if (pos.castling & CASTLE_BQ) castling += 'q';
  return [
    placement,
    pos.turn === WHITE ? 'w' : 'b',
    castling || '-',
    pos.ep >= 0 ? squareName(pos.ep) : '-',
    String(pos.halfmove),
    String(pos.fullmove),
  ].join(' ');
}

/** The first four fields only - the part that identifies a position
 *  rather than a moment in a game. */
export function toPositionFen(pos: Position): string {
  return toFen(pos).split(' ').slice(0, 4).join(' ');
}

/** A plain-text board, White at the bottom. Used by the agent tools so a
 *  model that is bad at FEN can still see what is going on. */
export function toAscii(pos: Position): string {
  const lines: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let line = `${rank + 1} `;
    for (let file = 0; file < 8; file++) {
      const piece = pos.board[rank * 16 + file];
      line += piece ? pieceToChar(piece) : '.';
      if (file < 7) line += ' ';
    }
    lines.push(line);
  }
  lines.push('  a b c d e f g h');
  return lines.join('\n');
}
