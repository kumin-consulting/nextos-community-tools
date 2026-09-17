// src/ui/Board.tsx
//
// The board. Sixty-four buttons in a CSS grid, one absolutely-positioned
// piece each, and an SVG overlay on top for the analysis arrow. Three
// ways to move a piece, all of which must feel the same:
//
//   * click the piece, then click the destination;
//   * drag the piece;
//   * put the keyboard cursor on the piece, press Enter, move the cursor
//     to the destination and press Enter again.
//
// The grid is the accessible-grid pattern: exactly one square is in the
// tab order at a time and the arrow keys move the cursor, so tabbing
// through the app does not mean sixty-four stops. Game navigation with
// the left and right arrows lives in the window, and steps aside while
// the board has focus.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Move, Position } from '../lib/types';
import { isCapture, isEnPassant, moveFrom, moveTo, sq64, squareName } from '../lib/types';
import type { BoardPalette } from './themes';
import { boardStyle } from './themes';
import type { PieceSetId } from './pieces';
import { Piece, pieceName } from './pieces';

export interface BoardArrow {
  from: number;
  to: number;
  color?: string;
}

export interface BoardProps {
  position: Position;
  /** True when Black is at the bottom. */
  flipped: boolean;
  /** The moves the person at the keyboard may play right now. Empty
   *  makes the board a read-only diagram. */
  legalMoves: Move[];
  onMove: (move: Move) => void;
  lastMove: Move | null;
  /** The king's square to flash red, or -1. */
  checkSquare: number;
  arrows: BoardArrow[];
  palette: BoardPalette;
  pieceSet: PieceSetId;
  showCoordinates: boolean;
  /** Announced to a screen reader above the board. */
  describedBy?: string;
}

export function Board(props: BoardProps): JSX.Element {
  const { position, flipped, legalMoves, onMove, lastMove, checkSquare, arrows, palette, pieceSet, showCoordinates } =
    props;
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number>(() => (flipped ? 0x70 : 0x00));
  const [drag, setDrag] = useState<{ from: number; x: number; y: number; code: number } | null>(null);

  // A move that is no longer possible must not leave a piece lit up.
  useEffect(() => {
    if (selected !== null && !legalMoves.some((m) => moveFrom(m) === selected)) setSelected(null);
  }, [legalMoves, selected]);

  const movesFromSelected = useMemo(
    () => (selected === null ? [] : legalMoves.filter((m) => moveFrom(m) === selected)),
    [legalMoves, selected]
  );

  const targets = useMemo(() => {
    const map = new Map<number, Move[]>();
    for (const move of movesFromSelected) {
      const to = moveTo(move);
      const existing = map.get(to);
      if (existing) existing.push(move);
      else map.set(to, [move]);
    }
    return map;
  }, [movesFromSelected]);

  const squares = useMemo(() => {
    const out: number[] = [];
    for (let rank = 7; rank >= 0; rank--) {
      for (let file = 0; file < 8; file++) {
        out.push(flipped ? (7 - rank) * 16 + (7 - file) : rank * 16 + file);
      }
    }
    return out;
  }, [flipped]);

  const tryMove = useCallback(
    (from: number, to: number): boolean => {
      const candidates = legalMoves.filter((m) => moveFrom(m) === from && moveTo(m) === to);
      if (!candidates.length) return false;
      // Promotion: hand every candidate up, and the window asks which.
      onMove(candidates.length === 1 ? candidates[0] : candidates[0] | PROMOTION_CHOICE);
      return true;
    },
    [legalMoves, onMove]
  );

  const activate = useCallback(
    (square: number): void => {
      const piece = position.board[square];
      if (selected !== null) {
        if (square === selected) {
          setSelected(null);
          return;
        }
        if (tryMove(selected, square)) {
          setSelected(null);
          return;
        }
      }
      if (piece && legalMoves.some((m) => moveFrom(m) === square)) setSelected(square);
      else setSelected(null);
    },
    [legalMoves, position, selected, tryMove]
  );

  const squareAtPoint = useCallback(
    (clientX: number, clientY: number): number => {
      const el = boardRef.current;
      if (!el) return -1;
      const rect = el.getBoundingClientRect();
      const size = rect.width / 8;
      const column = Math.floor((clientX - rect.left) / size);
      const row = Math.floor((clientY - rect.top) / size);
      if (column < 0 || column > 7 || row < 0 || row > 7) return -1;
      return squares[row * 8 + column];
    },
    [squares]
  );

  // Dragging. Pointer events are captured on the board itself rather
  // than the piece, so a fast drag that leaves the square never drops
  // the gesture.
  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (event.button !== 0) return;
      const square = squareAtPoint(event.clientX, event.clientY);
      if (square < 0) return;
      const piece = position.board[square];
      if (!piece || !legalMoves.some((m) => moveFrom(m) === square)) {
        // Clicking an empty square with a piece selected is a move.
        if (selected !== null && square >= 0) {
          if (tryMove(selected, square)) setSelected(null);
          else setSelected(null);
        }
        return;
      }
      setSelected(square);
      setCursor(square);
      setDrag({ from: square, x: event.clientX, y: event.clientY, code: piece });
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    },
    [legalMoves, position, selected, squareAtPoint, tryMove]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (!drag) return;
      setDrag({ ...drag, x: event.clientX, y: event.clientY });
    },
    [drag]
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (!drag) return;
      const target = squareAtPoint(event.clientX, event.clientY);
      const from = drag.from;
      setDrag(null);
      if (target >= 0 && target !== from && tryMove(from, target)) setSelected(null);
    },
    [drag, squareAtPoint, tryMove]
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      const file = cursor & 7;
      const rank = cursor >> 4;
      const step = flipped ? -1 : 1;
      let next = cursor;
      switch (event.key) {
        case 'ArrowLeft':
          next = file - step >= 0 && file - step <= 7 ? cursor - step : cursor;
          break;
        case 'ArrowRight':
          next = file + step >= 0 && file + step <= 7 ? cursor + step : cursor;
          break;
        case 'ArrowUp':
          next = rank + step >= 0 && rank + step <= 7 ? cursor + step * 16 : cursor;
          break;
        case 'ArrowDown':
          next = rank - step >= 0 && rank - step <= 7 ? cursor - step * 16 : cursor;
          break;
        case 'Home':
          next = squares[0];
          break;
        case 'End':
          next = squares[63];
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          activate(cursor);
          return;
        case 'Escape':
          if (selected !== null) {
            event.preventDefault();
            setSelected(null);
          }
          return;
        default:
          return;
      }
      event.preventDefault();
      event.stopPropagation();
      setCursor(next);
      const el = boardRef.current?.querySelector<HTMLElement>(`[data-square="${next}"]`);
      el?.focus();
    },
    [activate, cursor, flipped, selected, squares]
  );

  const lastFrom = lastMove ? moveFrom(lastMove) : -1;
  const lastTo = lastMove ? moveTo(lastMove) : -1;

  return (
    <div
      ref={boardRef}
      className="chessapp-board"
      style={boardStyle(palette) as React.CSSProperties}
      role="grid"
      aria-label="Chess board"
      aria-describedby={props.describedBy}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={onKeyDown}
    >
      {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
        <div key={row} role="row" style={{ display: 'contents' }}>
          {squares.slice(row * 8, row * 8 + 8).map((square) => {
        const code = position.board[square];
        const isLight = ((square >> 4) + (square & 7)) % 2 === 1;
        const moves = targets.get(square);
        const classes = ['chessapp-square', isLight ? 'chessapp-sq-light' : 'chessapp-sq-dark'];
        if (square === lastFrom || square === lastTo) classes.push('chessapp-sq-last');
        if (square === selected) classes.push('chessapp-sq-selected');
        if (square === checkSquare) classes.push('chessapp-sq-check');
        const file = square & 7;
        const rank = square >> 4;
        const showFile = showCoordinates && (flipped ? rank === 7 : rank === 0);
        const showRank = showCoordinates && (flipped ? file === 7 : file === 0);
        const label = code ? `${squareName(square)}, ${pieceName(code)}` : squareName(square);
        return (
          <div
            key={square}
            data-square={square}
            role="gridcell"
            tabIndex={square === cursor ? 0 : -1}
            aria-label={moves ? `${label}, can move here` : label}
            aria-selected={square === selected}
            className={classes.join(' ')}
            onFocus={() => setCursor(square)}
          >
            {code ? (
              <Piece
                code={code}
                set={pieceSet}
                className={`chessapp-piece${drag && drag.from === square ? ' is-dragging' : ''}`}
              />
            ) : null}
            {moves ? <span className={`chessapp-dot${code || isEnPassantTarget(moves) ? ' is-capture' : ''}`} /> : null}
            {showFile ? (
              <span
                className="chessapp-coord chessapp-coord-file"
                style={{ color: isLight ? palette.coordOnLight : palette.coordOnDark }}
              >
                {'abcdefgh'[file]}
              </span>
            ) : null}
            {showRank ? (
              <span
                className="chessapp-coord chessapp-coord-rank"
                style={{ color: isLight ? palette.coordOnLight : palette.coordOnDark }}
              >
                {rank + 1}
              </span>
            ) : null}
          </div>
        );
          })}
        </div>
      ))}

      {arrows.length ? (
        <svg className="chessapp-arrows" viewBox="0 0 8 8" aria-hidden="true">
          <defs>
            {arrows.map((arrow, i) => (
              <marker
                key={i}
                id={`chessapp-head-${i}`}
                markerWidth="2.7"
                markerHeight="2.7"
                refX="1.9"
                refY="1.35"
                orient="auto"
              >
                <path d="M0 0.25 L2.6 1.35 L0 2.45 z" fill={arrow.color ?? palette.arrow} />
              </marker>
            ))}
          </defs>
          {arrows.map((arrow, i) => {
            const a = center(arrow.from, flipped);
            const b = center(arrow.to, flipped);
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const length = Math.hypot(dx, dy) || 1;
            // Stop short of the centre so the head sits inside the square.
            const end = { x: b.x - (dx / length) * 0.34, y: b.y - (dy / length) * 0.34 };
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={end.x}
                y2={end.y}
                stroke={arrow.color ?? palette.arrow}
                strokeWidth={0.125}
                strokeLinecap="round"
                markerEnd={`url(#chessapp-head-${i})`}
              />
            );
          })}
        </svg>
      ) : null}

      {drag ? (
        <div
          className="chessapp-drag"
          style={{
            left: drag.x,
            top: drag.y,
            width: (boardRef.current?.getBoundingClientRect().width ?? 480) / 8,
            height: (boardRef.current?.getBoundingClientRect().width ?? 480) / 8,
          }}
        >
          <Piece code={drag.code} set={pieceSet} />
        </div>
      ) : null}
    </div>
  );
}

/** A bit above every flag a packed move uses, so the window can tell
 *  "the user needs to choose a promotion piece" from an ordinary move
 *  without a second callback. */
export const PROMOTION_CHOICE = 1 << 29;

function isEnPassantTarget(moves: Move[]): boolean {
  return moves.some((m) => isEnPassant(m) || isCapture(m));
}

function center(square: number, flipped: boolean): { x: number; y: number } {
  const index = sq64(square);
  const file = index & 7;
  const rank = index >> 3;
  const x = flipped ? 7 - file : file;
  const y = flipped ? rank : 7 - rank;
  return { x: x + 0.5, y: y + 0.5 };
}
