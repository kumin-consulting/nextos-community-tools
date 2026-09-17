// src/ui/pieces.tsx
//
// The pieces, drawn as inline SVG paths - no image files, nothing to
// load, and crisp at any board size. Each piece is described once, on a
// 45x45 grid, as three lists:
//
//   body  - filled with the piece's colour and stroked with its outline
//   lines - stroked only (the bishop's slit, the king's crown band)
//   dots  - filled with the outline colour (the knight's eye, the
//           queen's coronet)
//
// Two sets share that description and differ in how they draw it:
//
//   'classic' - solid silhouettes with a dark outline, the shapes a
//               chess player reads without having to think;
//   'line'    - the same shapes hollow, with a halo behind the stroke so
//               they stay legible on a dark square as well as a light
//               one.
//
// Drawing them twice over would have been two sets of bugs; drawing them
// once and rendering them twice is why 'line' is not simply 'classic
// with the fill removed', which reads as a ghost.

import { BISHOP, KING, KNIGHT, PAWN, QUEEN, ROOK, WHITE } from '../lib/types';
import type { Color } from '../lib/types';

export type PieceSetId = 'classic' | 'line';

export const PIECE_SETS: Array<{ id: PieceSetId; name: string }> = [
  { id: 'classic', name: 'Classic' },
  { id: 'line', name: 'Line' },
];

interface PieceArt {
  body: string[];
  lines?: string[];
  dots?: Array<[number, number, number]>;
}

/** The felted base every piece stands on, and the collar above it. */
const BASE = 'M11.9 36.6h21.2c.5 0 .9.4.9.9v1.6c0 .5-.4.9-.9.9H11.9c-.5 0-.9-.4-.9-.9v-1.6c0-.5.4-.9.9-.9z';
const COLLAR = 'M14 32.9h17l1.9 3.7H12.1z';

const ART: Record<number, PieceArt> = {
  [PAWN]: {
    body: [
      'M22.5 10.4a4.6 4.6 0 0 1 2.8 8.3c2.5 1.8 3.9 4.6 4.1 7.5H15.6a9.6 9.6 0 0 1 4.1-7.5 4.6 4.6 0 0 1 2.8-8.3z',
      'M15.5 26.2h14c.5 3.6 1.9 6.7 4.2 9H11.3c2.3-2.3 3.7-5.4 4.2-9z',
      BASE,
    ],
  },
  [KNIGHT]: {
    body: [
      // A horse's head facing the a-file: ear, poll, muzzle, jaw, throat
      // and the cheek curving back into the neck.
      'M21 36.6c1.6-5.5 3-9.1 3.2-11.5.3-2.4-.8-3.6-2.6-3 -1.6.5-3 2.4-4.6 4 -1.8 1.8-4.4 2-5.4.4 -.8-1.4-.2-3 1.6-4.4l1.2-1c-1.8.2-3.2-.4-3.4-1.8 -.2-1.6 1-3.4 3.2-5.2 2.8-2.3 6.4-3.4 9.4-3.6L23 6.4l3.8 3.2c3.2 1.2 5.6 3.6 6.8 7 1.4 4 1.8 11 1.2 20z',
      COLLAR,
      BASE,
    ],
    lines: ['M25.4 11.6c-2.6 1-4.9 2.6-6.8 4.8'],
    dots: [[17.6, 17.4, 1.25]],
  },
  [BISHOP]: {
    body: [
      'M22.5 9.2c3.6 3.8 5.9 6.4 5.9 9.1 0 2.2-1.4 4-3.5 4.9 4 2.3 6.5 5.9 6.5 9.8l-.1.9H13.7l-.1-.9c0-3.9 2.5-7.5 6.5-9.8-2.1-.9-3.5-2.7-3.5-4.9 0-2.7 2.3-5.3 5.9-9.1z',
      COLLAR,
      BASE,
    ],
    lines: ['M19.5 15.8l5.2-4.6', 'M17.8 23.2h9.4'],
    dots: [[22.5, 6.2, 2.1]],
  },
  [ROOK]: {
    body: [
      'M11.4 9.4h4.6v3.4h4.2V9.4h4.6v3.4h4.2V9.4h4.6v8.2l-3.1 2.6v11.4l3.3 3.6H11.2l3.3-3.6V20.2l-3.1-2.6z',
      BASE,
    ],
    lines: ['M14.5 20.4h16', 'M14.5 31.6h16'],
  },
  [QUEEN]: {
    body: [
      'M9.6 17.8l3.3 7.2 2.4-10.2 3.9 8.8 3.3-11.4 3.3 11.4 3.9-8.8 2.4 10.2 3.3-7.2 1.2 15.1H8.4z',
      COLLAR,
      BASE,
    ],
    lines: ['M11.3 29.4c5.2-1.7 17.2-1.7 22.4 0'],
    dots: [
      [9.6, 15.6, 1.9],
      [15.3, 13.4, 1.9],
      [22.5, 11.4, 2.1],
      [29.7, 13.4, 1.9],
      [35.4, 15.6, 1.9],
    ],
  },
  [KING]: {
    body: [
      'M20.9 5.2h3.2v3.2h3.2v3.2h-3.2v3.4h-3.2v-3.4h-3.2V8.4h3.2z',
      'M22.5 16.2c6.2 0 11 4.2 12.1 10l-1 6.7H11.4l-1-6.7c1.1-5.8 5.9-10 12.1-10z',
      COLLAR,
      BASE,
    ],
    lines: ['M14.3 27.3c4.8-2.3 11.6-2.3 16.4 0'],
  },
};

export interface PieceProps {
  /** A piece code: type | (colour << 3). 0 renders nothing. */
  code: number;
  set: PieceSetId;
  className?: string;
  /** A screen-reader name. Leave it out for a piece inside an already
   *  labelled square, so the name is not read twice. */
  title?: string;
}

const NAMES = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

export function pieceName(code: number): string {
  return `${(code >> 3) & 1 ? 'Black' : 'White'} ${NAMES[code & 7]}`;
}

export function Piece({ code, set, className, title }: PieceProps): JSX.Element | null {
  if (!code) return null;
  const art = ART[code & 7];
  if (!art) return null;
  const color = ((code >> 3) & 1) as Color;
  const light = color === WHITE;

  const fill = light ? '#fbfaf7' : '#272430';
  const ink = light ? '#2a251f' : '#0c0b10';

  if (set === 'line') {
    // White is hollow, Black is solid, and both are rimmed in the same
    // pale stroke over a dark halo - so the two colours are told apart
    // by whether the piece has a middle, which survives a small board
    // and a dark square in a way that "thin line versus thinner line"
    // does not.
    const rim = '#f8f6f2';
    const halo = 'rgba(12,9,6,0.5)';
    const bodyFill = light ? 'rgba(255,255,255,0.44)' : '#131218';
    return (
      <svg viewBox="0 0 45 45" className={className} role={title ? 'img' : 'presentation'} aria-label={title} focusable="false">
        {title ? <title>{title}</title> : null}
        {art.body.map((d, i) => (
          <path key={`halo${i}`} d={d} fill={halo} stroke={halo} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {art.body.map((d, i) => (
          <path key={`b${i}`} d={d} fill={bodyFill} stroke={rim} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {(art.lines ?? []).map((d, i) => (
          <path key={`l${i}`} d={d} fill="none" stroke={rim} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {(art.dots ?? []).map(([cx, cy, r], i) => (
          <circle key={`dot${i}`} cx={cx} cy={cy} r={r} fill={light ? 'rgba(255,255,255,0.44)' : '#131218'} stroke={rim} strokeWidth={1.6} />
        ))}
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 45 45" className={className} role={title ? 'img' : 'presentation'} aria-label={title} focusable="false">
      {title ? <title>{title}</title> : null}
      {art.body.map((d, i) => (
        <path key={`b${i}`} d={d} fill={fill} stroke={ink} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {(art.lines ?? []).map((d, i) => (
        <path key={`l${i}`} d={d} fill="none" stroke={ink} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {(art.dots ?? []).map(([cx, cy, r], i) => (
        <circle key={`d${i}`} cx={cx} cy={cy} r={r} fill={ink} />
      ))}
    </svg>
  );
}

export const PIECE_TYPES = [PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING];
