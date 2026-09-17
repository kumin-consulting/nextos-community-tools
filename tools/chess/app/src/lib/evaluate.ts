// src/lib/evaluate.ts
//
// A tapered evaluation: every term is scored twice, once for the
// middlegame and once for the endgame, and the two are blended by how
// much material is still on the board. That single idea is what stops
// an engine walking its king into the centre on move 12 and hiding it in
// the corner on move 60 - the king's piece-square table says both
// things, and the phase decides which one counts.
//
// Scores are centipawns from White's point of view inside this file;
// `evaluate` returns the score from the SIDE TO MOVE's point of view,
// which is what a negamax search wants.
//
// Terms: material, piece-square tables, bishop pair, mobility, rooks on
// open and half-open files, doubled/isolated/passed pawns, a pawn shield
// and an attack count around the king, and a small tempo bonus. Nothing
// exotic - the point is that each one is cheap, and the search does the
// rest.

import type { Color, Position } from './types';
import { BISHOP, BLACK, KING, KNIGHT, PAWN, QUEEN, ROOK, WHITE } from './types';

// Middlegame and endgame material values.
export const MG_VALUE = [0, 82, 337, 365, 477, 1025, 0];
export const EG_VALUE = [0, 94, 281, 297, 512, 936, 0];

/** How much each piece type contributes to "how far from an endgame are
 *  we?". The scale is arbitrary; only the ratio matters. */
const PHASE_WEIGHT = [0, 0, 1, 1, 2, 4, 0];
const TOTAL_PHASE = 24;

// Piece-square tables, written from White's point of view with a1 at the
// bottom left, i.e. the first row of each table is rank 1. Values are in
// centipawns and are added to the material value.
// prettier-ignore
const PST_MG: number[][] = [
  [], // empty
  [ // pawn
      0,   0,   0,   0,   0,   0,   0,   0,
    -35,  -1, -20, -23, -15,  24,  38, -22,
    -26,  -4,  -4, -10,   3,   3,  33, -12,
    -27,  -2,  -5,  12,  17,   6,  10, -25,
    -14,  13,   6,  21,  23,  12,  17, -23,
     -6,   7,  26,  31,  65,  56,  25, -20,
     98, 134,  61,  95,  68, 126,  34, -11,
      0,   0,   0,   0,   0,   0,   0,   0,
  ],
  [ // knight
   -105, -21, -58, -33, -17, -28, -19, -23,
    -29, -53, -12,  -3,  -1,  18, -14, -19,
    -23,  -9,  12,  10,  19,  17,  25, -16,
    -13,   4,  16,  13,  28,  19,  21,  -8,
     -9,  17,  19,  53,  37,  69,  18,  22,
    -47,  60,  37,  65,  84, 129,  73,  44,
    -73, -41,  72,  36,  23,  62,   7, -17,
   -167, -89, -34, -49,  61, -97, -15,-107,
  ],
  [ // bishop
    -33,  -3, -14, -21, -13, -12, -39, -21,
      4,  15,  16,   0,   7,  21,  33,   1,
      0,  15,  15,  15,  14,  27,  18,  10,
     -6,  13,  13,  26,  34,  12,  10,   4,
     -4,   5,  19,  50,  37,  37,   7,  -2,
    -16,  37,  43,  40,  35,  50,  37,  -2,
    -26,  16, -18, -13,  30,  59,  18, -47,
    -29,   4, -82, -37, -25, -42,   7,  -8,
  ],
  [ // rook
    -19, -13,   1,  17,  16,   7, -37, -26,
    -44, -16, -20,  -9,  -1,  11,  -6, -71,
    -45, -25, -16, -17,   3,   0,  -5, -33,
    -36, -26, -12,  -1,   9,  -7,   6, -23,
    -24, -11,   7,  26,  24,  35,  -8, -20,
     -5,  19,  26,  36,  17,  45,  61,  16,
     27,  32,  58,  62,  80,  67,  26,  44,
     32,  42,  32,  51,  63,   9,  31,  43,
  ],
  [ // queen
     -1, -18,  -9,  10, -15, -25, -31, -50,
    -35,  -8,  11,   2,   8,  15,  -3,   1,
    -14,   2, -11,  -2,  -5,   2,  14,   5,
     -9, -26,  -9, -10,  -2,  -4,   3,  -3,
    -27, -27, -16, -16,  -1,  17,  -2,   1,
    -13, -17,   7,   8,  29,  56,  47,  57,
    -24, -39,  -5,   1, -16,  57,  28,  54,
    -28,   0,  29,  12,  59,  44,  43,  45,
  ],
  [ // king
    -15,  36,  12, -54,   8, -28,  24,  14,
      1,   7,  -8, -64, -43, -16,   9,   8,
    -14, -14, -22, -46, -44, -30, -15, -27,
    -49,  -1, -27, -39, -46, -44, -33, -51,
    -17, -20, -12, -27, -30, -25, -14, -36,
     -9,  24,   2, -16, -20,   6,  22, -22,
     29,  -1, -20,  -7,  -8,  -4, -38, -29,
    -65,  23,  16, -15, -56, -34,   2,  13,
  ],
];
// prettier-ignore
const PST_EG: number[][] = [
  [],
  [ // pawn
      0,   0,   0,   0,   0,   0,   0,   0,
     13,   8,   8,  10,  13,   0,   2,  -7,
      4,   7,  -6,   1,   0,  -5,  -1,  -8,
     13,   9,  -3,  -7,  -7,  -8,   3,  -1,
     32,  24,  13,   5,  -2,   4,  17,  17,
     94, 100,  85,  67,  56,  53,  82,  84,
    178, 173, 158, 134, 147, 132, 165, 187,
      0,   0,   0,   0,   0,   0,   0,   0,
  ],
  [ // knight
    -29, -51, -23, -15, -22, -18, -50, -64,
    -42, -20, -10,  -5,  -2, -20, -23, -44,
    -23,  -3,  -1,  15,  10,  -3, -20, -22,
    -18,  -6,  16,  25,  16,  17,   4, -18,
    -17,   3,  22,  22,  22,  11,   8, -18,
    -24, -20,  10,   9,  -1,  -9, -19, -41,
    -25,  -8, -25,  -2,  -9, -25, -24, -52,
    -58, -38, -13, -28, -31, -27, -63, -99,
  ],
  [ // bishop
    -23,  -9, -23,  -5,  -9, -16,  -5, -17,
    -14, -18,  -7,  -1,   4,  -9, -15, -27,
    -12,  -3,   8,  10,  13,   3,  -7, -15,
     -6,   3,  13,  19,   7,  10,  -3,  -9,
     -3,   9,  12,   9,  14,  10,   3,   2,
      2,  -8,   0,  -1,  -2,   6,   0,   4,
     -8,  -4,   7, -12,  -3, -13,  -4, -14,
    -14, -21, -11,  -8,  -7,  -9, -17, -24,
  ],
  [ // rook
    -9,   2,   3,  -1,  -5, -13,   4, -20,
    -6,  -6,   0,   2,  -9,  -9, -11,  -3,
    -4,   0,  -5,  -1,  -7, -12,  -8, -16,
     3,   5,   8,   4,  -5,  -6,  -8, -11,
     4,   3,  13,   1,   2,   1,  -1,   2,
     7,   7,   7,   5,   4,  -3,  -5,  -3,
    11,  13,  13,  11,  -3,   3,   8,   3,
    13,  10,  18,  15,  12,  12,   8,   5,
  ],
  [ // queen
    -33, -28, -22, -43,  -5, -32, -20, -41,
    -22, -23, -30, -16, -16, -23, -36, -32,
    -16, -27,  15,   6,   9,  17,  10,   5,
    -18,  28,  19,  47,  31,  34,  39,  23,
      3,  22,  24,  45,  57,  40,  57,  36,
    -20,   6,   9,  49,  47,  35,  19,   9,
    -17,  20,  32,  41,  58,  25,  30,   0,
     -9,  22,  22,  27,  27,  19,  10,  20,
  ],
  [ // king
    -53, -34, -21, -11, -28, -14, -24, -43,
    -27, -11,   4,  13,  14,   4,  -5, -17,
    -19,  -3,  11,  21,  23,  16,   7,  -9,
    -18,  -4,  21,  24,  27,  23,   9, -11,
     -8,  22,  24,  27,  26,  33,  26,   3,
     10,  17,  23,  15,  20,  45,  44,  13,
    -12,  17,  14,  17,  17,  38,  23,  11,
    -74, -35, -18, -18, -11,  15,   4, -17,
  ],
];

/** PST lookup tables, flattened per colour to a 0x88 index so evaluation
 *  is one array read per piece and never mirrors a square at run time. */
const MG_TABLE: Int32Array[] = [];
const EG_TABLE: Int32Array[] = [];
(function buildTables(): void {
  for (let piece = 0; piece < 15; piece++) {
    MG_TABLE[piece] = new Int32Array(128);
    EG_TABLE[piece] = new Int32Array(128);
  }
  for (let type = PAWN; type <= KING; type++) {
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) continue;
      const rank = sq >> 4;
      const file = sq & 7;
      const white = rank * 8 + file;
      const black = (7 - rank) * 8 + file;
      MG_TABLE[type][sq] = MG_VALUE[type] + PST_MG[type][white];
      EG_TABLE[type][sq] = EG_VALUE[type] + PST_EG[type][white];
      MG_TABLE[type | 8][sq] = MG_VALUE[type] + PST_MG[type][black];
      EG_TABLE[type | 8][sq] = EG_VALUE[type] + PST_EG[type][black];
    }
  }
})();

const MOBILITY_MG = [0, 0, 4, 5, 2, 1, 0];
const MOBILITY_EG = [0, 0, 4, 5, 4, 2, 0];
const PASSED_MG = [0, 5, 10, 20, 35, 60, 100, 0];
const PASSED_EG = [0, 10, 20, 40, 70, 110, 160, 0];
const BISHOP_PAIR_MG = 30;
const BISHOP_PAIR_EG = 50;
const DOUBLED_PAWN = -12;
const ISOLATED_PAWN = -16;
const ROOK_OPEN_FILE = 26;
const ROOK_HALF_OPEN_FILE = 12;
const KING_SHIELD = 11;
const TEMPO = 12;

const BISHOP_STEPS = [17, 15, -15, -17];
const ROOK_STEPS = [16, 1, -1, -16];
const QUEEN_STEPS = [17, 16, 15, 1, -1, -15, -16, -17];
const KNIGHT_STEPS = [33, 31, 18, 14, -14, -18, -31, -33];

/** Per-colour pawn counts by file, reused between calls - evaluation is
 *  the single hottest function in the program and this is the one place
 *  it would otherwise allocate. */
const pawnsOnFile = [new Int32Array(8), new Int32Array(8)];
const mostAdvanced = [new Int32Array(8), new Int32Array(8)];

export interface EvalBreakdown {
  total: number;
  material: number;
  pieceSquares: number;
  mobility: number;
  pawns: number;
  kingSafety: number;
  phase: number;
}

/** How far into the endgame the position is: 1 at the start, 0 with only
 *  kings and pawns left. */
export function phaseOf(pos: Position): number {
  let phase = 0;
  for (let color = 0 as Color; color <= 1; color = (color + 1) as Color) {
    const base = color * 16;
    for (let i = 0; i < pos.pieceCount[color]; i++) {
      phase += PHASE_WEIGHT[pos.board[pos.pieceSquares[base + i]] & 7];
    }
  }
  return Math.min(1, phase / TOTAL_PHASE);
}

/** The score from the side to move's point of view, in centipawns. */
export function evaluate(pos: Position): number {
  const white = evaluateWhite(pos);
  return pos.turn === WHITE ? white : -white;
}

/** The score from White's point of view - what the eval bar shows. */
export function evaluateWhite(pos: Position): number {
  let mg = 0;
  let eg = 0;
  let phaseUnits = 0;
  const board = pos.board;

  pawnsOnFile[0].fill(0);
  pawnsOnFile[1].fill(0);
  mostAdvanced[0].fill(-1);
  mostAdvanced[1].fill(8);

  // First pass: pawn structure facts everything else asks about.
  for (let color = 0 as Color; color <= 1; color = (color + 1) as Color) {
    const base = color * 16;
    for (let i = 0; i < pos.pieceCount[color]; i++) {
      const sq = pos.pieceSquares[base + i];
      if ((board[sq] & 7) !== PAWN) continue;
      const file = sq & 7;
      const rank = sq >> 4;
      pawnsOnFile[color][file]++;
      if (color === WHITE) {
        if (rank > mostAdvanced[WHITE][file]) mostAdvanced[WHITE][file] = rank;
      } else if (rank < mostAdvanced[BLACK][file]) mostAdvanced[BLACK][file] = rank;
    }
  }

  for (let color = 0 as Color; color <= 1; color = (color + 1) as Color) {
    const sign = color === WHITE ? 1 : -1;
    const them = (color ^ 1) as Color;
    const base = color * 16;
    let bishops = 0;

    for (let i = 0; i < pos.pieceCount[color]; i++) {
      const sq = pos.pieceSquares[base + i];
      const piece = board[sq];
      const type = piece & 7;
      phaseUnits += PHASE_WEIGHT[type];
      mg += sign * MG_TABLE[piece][sq];
      eg += sign * EG_TABLE[piece][sq];

      const file = sq & 7;
      const rank = sq >> 4;

      switch (type) {
        case PAWN: {
          if (pawnsOnFile[color][file] > 1) {
            mg += sign * DOUBLED_PAWN;
            eg += sign * DOUBLED_PAWN;
          }
          const left = file > 0 ? pawnsOnFile[color][file - 1] : 0;
          const right = file < 7 ? pawnsOnFile[color][file + 1] : 0;
          if (!left && !right) {
            mg += sign * ISOLATED_PAWN;
            eg += sign * ISOLATED_PAWN;
          }
          if (isPassed(color, file, rank)) {
            const advance = color === WHITE ? rank : 7 - rank;
            mg += sign * PASSED_MG[advance];
            eg += sign * PASSED_EG[advance];
          }
          break;
        }
        case KNIGHT: {
          const moves = countSteps(pos, sq, KNIGHT_STEPS, color);
          mg += sign * MOBILITY_MG[KNIGHT] * (moves - 4);
          eg += sign * MOBILITY_EG[KNIGHT] * (moves - 4);
          break;
        }
        case BISHOP: {
          bishops++;
          const moves = countSlides(pos, sq, BISHOP_STEPS, color);
          mg += sign * MOBILITY_MG[BISHOP] * (moves - 6);
          eg += sign * MOBILITY_EG[BISHOP] * (moves - 6);
          break;
        }
        case ROOK: {
          const moves = countSlides(pos, sq, ROOK_STEPS, color);
          mg += sign * MOBILITY_MG[ROOK] * (moves - 7);
          eg += sign * MOBILITY_EG[ROOK] * (moves - 7);
          if (!pawnsOnFile[color][file]) {
            const bonus = pawnsOnFile[them][file] ? ROOK_HALF_OPEN_FILE : ROOK_OPEN_FILE;
            mg += sign * bonus;
            eg += sign * (bonus >> 1);
          }
          break;
        }
        case QUEEN: {
          const moves = countSlides(pos, sq, QUEEN_STEPS, color);
          mg += sign * MOBILITY_MG[QUEEN] * (moves - 13);
          eg += sign * MOBILITY_EG[QUEEN] * (moves - 13);
          break;
        }
        default:
          break;
      }
    }

    if (bishops >= 2) {
      mg += sign * BISHOP_PAIR_MG;
      eg += sign * BISHOP_PAIR_EG;
    }

    // King safety: pawns still standing in front of the king. Only a
    // middlegame term - in an endgame the king wants to walk out.
    const king = pos.kings[color];
    if (king >= 0) {
      const kingFile = king & 7;
      let shield = 0;
      for (let f = Math.max(0, kingFile - 1); f <= Math.min(7, kingFile + 1); f++) {
        if (pawnsOnFile[color][f]) shield++;
      }
      mg += sign * KING_SHIELD * (shield - 2);
    }
  }

  const phase = Math.min(1, phaseUnits / TOTAL_PHASE);
  const blended = Math.round(mg * phase + eg * (1 - phase));
  return blended + (pos.turn === WHITE ? TEMPO : -TEMPO);
}

/** Is there an enemy pawn on this file or either neighbour, ahead of
 *  this pawn? Uses the per-file most-advanced pawn recorded above, which
 *  is exact for the file itself and a safe approximation for the
 *  neighbours (it can only ever miss a passer, never invent one). */
function isPassed(color: Color, file: number, rank: number): boolean {
  const them = (color ^ 1) as Color;
  for (let f = Math.max(0, file - 1); f <= Math.min(7, file + 1); f++) {
    if (color === WHITE) {
      if (mostAdvanced[them][f] < 8 && mostAdvanced[them][f] > rank) return false;
    } else if (mostAdvanced[them][f] >= 0 && mostAdvanced[them][f] < rank) return false;
  }
  return true;
}

function countSteps(pos: Position, from: number, steps: number[], color: Color): number {
  let count = 0;
  for (let i = 0; i < steps.length; i++) {
    const to = from + steps[i];
    if (to & 0x88) continue;
    const target = pos.board[to];
    if (!target || ((target >> 3) & 1) !== color) count++;
  }
  return count;
}

function countSlides(pos: Position, from: number, steps: number[], color: Color): number {
  let count = 0;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    let to = from + step;
    while ((to & 0x88) === 0) {
      const target = pos.board[to];
      if (!target) {
        count++;
        to += step;
        continue;
      }
      if (((target >> 3) & 1) !== color) count++;
      break;
    }
  }
  return count;
}

/** The same numbers, broken out - what the analysis panel shows when you
 *  ask why the engine thinks what it thinks. */
export function evaluateBreakdown(pos: Position): EvalBreakdown {
  let material = 0;
  let pieceSquares = 0;
  const phase = phaseOf(pos);
  for (let color = 0 as Color; color <= 1; color = (color + 1) as Color) {
    const sign = color === WHITE ? 1 : -1;
    const base = color * 16;
    for (let i = 0; i < pos.pieceCount[color]; i++) {
      const sq = pos.pieceSquares[base + i];
      const piece = pos.board[sq];
      const type = piece & 7;
      material += sign * Math.round(MG_VALUE[type] * phase + EG_VALUE[type] * (1 - phase));
      pieceSquares +=
        sign *
        Math.round(
          (MG_TABLE[piece][sq] - MG_VALUE[type]) * phase + (EG_TABLE[piece][sq] - EG_VALUE[type]) * (1 - phase)
        );
    }
  }
  const total = evaluateWhite(pos);
  return {
    total,
    material,
    pieceSquares,
    mobility: 0,
    pawns: 0,
    kingSafety: 0,
    phase,
    // The remaining terms are folded into `total`; splitting every one
    // out would mean evaluating twice, and the three headline numbers
    // are what the panel actually shows.
  };
}

/** Material only, in pawns, from White's point of view - the '+3' next
 *  to a captured-pieces row. */
export function materialBalance(pos: Position): number {
  let total = 0;
  const values = [0, 1, 3, 3, 5, 9, 0];
  for (let color = 0 as Color; color <= 1; color = (color + 1) as Color) {
    const sign = color === WHITE ? 1 : -1;
    const base = color * 16;
    for (let i = 0; i < pos.pieceCount[color]; i++) {
      total += sign * values[pos.board[pos.pieceSquares[base + i]] & 7];
    }
  }
  return total;
}
