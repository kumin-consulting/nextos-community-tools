// src/lib/san.ts
//
// Standard algebraic notation, in and out, plus the long algebraic /
// coordinate forms. Everything here is defined against the legal move
// list of the position it is given, which is the only way to get SAN
// right: the disambiguation a move needs, and whether 'exd6' is an en
// passant capture, are facts about the position and not about the move.
//
// Parsing is deliberately generous - it accepts the notation real PGN
// files are full of (0-0 with zeroes, 'e8=Q' and 'e8Q' and 'e8/Q',
// 'ep' suffixes, '!?' annotations, unicode figurines) and still returns
// null rather than throwing when the text names no legal move.

import type {
  Move,
  Position,
} from './types';
import {
  BISHOP,
  KING,
  KNIGHT,
  PAWN,
  PIECE_LETTERS,
  QUEEN,
  ROOK,
  isCapture,
  isCastle,
  isEnPassant,
  moveFrom,
  movePromotion,
  moveTo,
  parseSquare,
  squareName,
} from './types';
import {
  inCheck,
  makeMove,
  unmakeMove,
} from './board';
import {
  generateLegalMoves,
  hasLegalMove,
} from './moves';

const FIGURINES: Record<string, string> = {
  '♔': 'K',
  '♕': 'Q',
  '♖': 'R',
  '♗': 'B',
  '♘': 'N',
  '♚': 'K',
  '♛': 'Q',
  '♜': 'R',
  '♝': 'B',
  '♞': 'N',
};

/** Strips decoration SAN carries but does not mean: check and mate marks,
 *  '!?' style annotations, 'e.p.', and trailing whitespace. */
export function stripSanDecoration(text: string): string {
  let s = text.trim();
  s = s.replace(/[♔-♟]/g, (ch) => FIGURINES[ch] ?? ch);
  // Suffixes can arrive in either order ('exd6 e.p.!?' and 'exd6!? e.p.'
  // are both out there), so peel them off until nothing more comes.
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = s.replace(/[+#]+/g, '');
    s = s.replace(/[!?]+$/, '');
    s = s.replace(/\s*e\.?p\.?$/i, '');
    s = s.trim();
    if (s === before) break;
  }
  s = s.replace(/–|—|−/g, '-');
  return s.trim();
}

/** The check/mate suffix a move earns in the position it is played in.
 *  Call AFTER the move has been made. */
function suffixAfterMove(pos: Position): string {
  if (!inCheck(pos)) return '';
  return hasLegalMove(pos) ? '+' : '#';
}

/**
 * Prints one legal move of `pos` in SAN, with disambiguation and the
 * '+'/'#' suffix. The move must be legal in this position.
 */
export function toSan(pos: Position, move: Move): string {
  const legal = generateLegalMoves(pos);
  return sanWithin(pos, move, legal);
}

/** Prints every move of an already-generated legal list, which is what
 *  the move list and the engine's principal variation want: generating
 *  the list once for n moves instead of n times. */
export function toSanAll(pos: Position, moves: Move[]): string[] {
  const legal = generateLegalMoves(pos);
  return moves.map((m) => sanWithin(pos, m, legal));
}

function sanWithin(pos: Position, move: Move, legal: Move[]): string {
  const from = moveFrom(move);
  const to = moveTo(move);
  const piece = pos.board[from];
  const type = piece & 7;
  let text: string;

  if (isCastle(move)) {
    text = (to & 15) === 6 ? 'O-O' : 'O-O-O';
  } else if (type === PAWN) {
    text = isCapture(move) ? `${'abcdefgh'[from & 15]}x${squareName(to)}` : squareName(to);
    const promo = movePromotion(move);
    if (promo) text += `=${PIECE_LETTERS[promo].toUpperCase()}`;
  } else {
    // Which other pieces of this type could also land on `to`?
    let sameFile = 0;
    let sameRank = 0;
    let others = 0;
    for (const other of legal) {
      if (other === move) continue;
      if (moveTo(other) !== to) continue;
      const otherFrom = moveFrom(other);
      if ((pos.board[otherFrom] & 7) !== type) continue;
      others++;
      if ((otherFrom & 15) === (from & 15)) sameFile++;
      if (otherFrom >> 4 === from >> 4) sameRank++;
    }
    let disambiguation = '';
    if (others > 0) {
      if (sameFile === 0) disambiguation = 'abcdefgh'[from & 15];
      else if (sameRank === 0) disambiguation = String(1 + (from >> 4));
      else disambiguation = squareName(from);
    }
    text = PIECE_LETTERS[type].toUpperCase() + disambiguation + (isCapture(move) ? 'x' : '') + squareName(to);
  }

  makeMove(pos, move);
  text += suffixAfterMove(pos);
  unmakeMove(pos, move);
  return text;
}

const SAN_RE =
  /^(?:(?<piece>[KQRBN])(?<fromFile>[a-h])?(?<fromRank>[1-8])?(?<capture>x)?(?<to>[a-h][1-8])|(?<pawnFile>[a-h])?(?<pawnCapture>x)?(?<pawnTo>[a-h][1-8])(?:=?\/?(?<promo>[QRBNqrbn]))?)$/;

/**
 * Finds the legal move of `pos` that `text` names, or null. Accepts SAN,
 * long algebraic ('Ng1-f3', 'e2-e4') and pure coordinate notation
 * ('e2e4', 'e7e8q').
 */
export function parseSan(pos: Position, text: string): Move | null {
  const legal = generateLegalMoves(pos);
  return parseSanWithin(pos, text, legal);
}

export function parseSanWithin(pos: Position, text: string, legal: Move[]): Move | null {
  const clean = stripSanDecoration(text);
  if (!clean) return null;

  // Castling, in every spelling PGN uses.
  const castle = clean.replace(/0/g, 'O');
  if (/^O-?O-?O$/.test(castle) || /^O-?O$/.test(castle)) {
    const long = /^O-?O-?O$/.test(castle);
    for (const move of legal) {
      if (!isCastle(move)) continue;
      const kingside = (moveTo(move) & 15) === 6;
      if (kingside !== long) return move;
    }
    return null;
  }

  // Coordinate / long algebraic first: they are unambiguous, so there is
  // no reason to make them go through the SAN grammar.
  const coordinate = clean.replace(/[-x]/g, '');
  const coordinateBody = /^[KQRBN]/.test(coordinate) ? coordinate.slice(1) : coordinate;
  if (/^[a-h][1-8][a-h][1-8][qrbnQRBN]?$/.test(coordinateBody)) {
    const from = parseSquare(coordinateBody.slice(0, 2));
    const to = parseSquare(coordinateBody.slice(2, 4));
    const promoChar = coordinateBody[4];
    const promo = promoChar ? PIECE_LETTERS.indexOf(promoChar.toLowerCase()) : 0;
    for (const move of legal) {
      if (moveFrom(move) !== from || moveTo(move) !== to) continue;
      const movePromo = movePromotion(move);
      if (promo && movePromo !== promo) continue;
      // A promotion named without a piece is taken as a queen.
      if (!promo && movePromo && movePromo !== QUEEN) continue;
      return move;
    }
    return null;
  }

  const match = SAN_RE.exec(clean);
  if (!match || !match.groups) return null;
  const g = match.groups;
  const pieceLetter = g.piece ?? 'P';
  const type =
    pieceLetter === 'K'
      ? KING
      : pieceLetter === 'Q'
        ? QUEEN
        : pieceLetter === 'R'
          ? ROOK
          : pieceLetter === 'B'
            ? BISHOP
            : pieceLetter === 'N'
              ? KNIGHT
              : PAWN;
  const toText = g.to ?? g.pawnTo;
  if (!toText) return null;
  const to = parseSquare(toText);
  const fromFile = g.fromFile ?? g.pawnFile;
  const fromRank = g.fromRank;
  const promo = g.promo ? PIECE_LETTERS.indexOf(g.promo.toLowerCase()) : 0;
  const mustCapture = Boolean(g.capture ?? g.pawnCapture);

  const candidates: Move[] = [];
  for (const move of legal) {
    if (moveTo(move) !== to) continue;
    if (isCastle(move)) continue;
    const from = moveFrom(move);
    if ((pos.board[from] & 7) !== type) continue;
    if (fromFile && (from & 15) !== 'abcdefgh'.indexOf(fromFile)) continue;
    if (fromRank && from >> 4 !== Number(fromRank) - 1) continue;
    if (promo && movePromotion(move) !== promo) continue;
    // A promotion written without a piece ('e8', as some programs do)
    // means a queen - never a silent under-promotion.
    if (!promo && movePromotion(move) && movePromotion(move) !== QUEEN) continue;
    if (mustCapture && !isCapture(move)) continue;
    candidates.push(move);
  }
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) return null;
  // Ambiguous text: prefer the capture when 'x' was written, otherwise
  // give up rather than guess.
  const captures = candidates.filter((m) => isCapture(m));
  if (mustCapture && captures.length === 1) return captures[0];
  return null;
}

/** Long algebraic: 'Ng1-f3', 'e2-e4', 'exd5', 'e7-e8=Q', 'O-O'. */
export function toLan(pos: Position, move: Move): string {
  if (isCastle(move)) return (moveTo(move) & 15) === 6 ? 'O-O' : 'O-O-O';
  const from = moveFrom(move);
  const to = moveTo(move);
  const type = pos.board[from] & 7;
  const letter = type === PAWN ? '' : PIECE_LETTERS[type].toUpperCase();
  const promo = movePromotion(move);
  return (
    letter +
    squareName(from) +
    (isCapture(move) ? 'x' : '-') +
    squareName(to) +
    (promo ? `=${PIECE_LETTERS[promo].toUpperCase()}` : '') +
    (isEnPassant(move) ? ' e.p.' : '')
  );
}

/** 'e2e4', 'e7e8q' - the coordinate form the engine and the agent tools
 *  speak. Defined here rather than in types.ts so every notation lives
 *  in one file. */
export function toUci(move: Move): string {
  const promo = movePromotion(move);
  return squareName(moveFrom(move)) + squareName(moveTo(move)) + (promo ? PIECE_LETTERS[promo] : '');
}

/** Plays a line of SAN (or coordinate) moves on a copy-free position,
 *  returning the moves made, or null at the first move that does not
 *  parse. Used by the PGN reader and the agent tools. */
export function playLine(pos: Position, texts: string[]): Move[] | null {
  const played: Move[] = [];
  for (const text of texts) {
    const move = parseSan(pos, text);
    if (move === null) {
      for (let i = played.length - 1; i >= 0; i--) unmakeMove(pos, played[i]);
      return null;
    }
    makeMove(pos, move);
    played.push(move);
  }
  for (let i = played.length - 1; i >= 0; i--) unmakeMove(pos, played[i]);
  return played;
}
