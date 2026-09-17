// Snapping while you drag: to the grid, and to the edges and centres of
// the other elements on the board. Returns the nudge to apply plus the
// guide lines to draw, so the renderer never recomputes what the drag
// already worked out.
//
// Pure: bounds in, bounds and guides out.

import { type Bounds } from './types';

export interface SnapLine {
  /** Exactly one of x / y is set: a vertical or a horizontal guide. */
  x?: number;
  y?: number;
  from: number;
  to: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  lines: SnapLine[];
}

export const DEFAULT_SNAP_THRESHOLD = 6;

const edgesX = (b: Bounds): number[] => [b.x, b.x + b.w / 2, b.x + b.w];
const edgesY = (b: Bounds): number[] => [b.y, b.y + b.h / 2, b.y + b.h];

/** Aligns `moving` to whichever of `targets` it is nearly aligned with.
 *  `threshold` is in scene units (the caller divides by the zoom, so the
 *  pull feels the same at every magnification). */
export function snapToElements(moving: Bounds, targets: Bounds[], threshold = DEFAULT_SNAP_THRESHOLD): SnapResult {
  let bestX: { delta: number; line: SnapLine } | null = null;
  let bestY: { delta: number; line: SnapLine } | null = null;
  for (const t of targets) {
    for (const mx of edgesX(moving)) {
      for (const tx of edgesX(t)) {
        const delta = tx - mx;
        if (Math.abs(delta) <= threshold && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) {
          bestX = {
            delta,
            line: { x: tx, from: Math.min(moving.y, t.y), to: Math.max(moving.y + moving.h, t.y + t.h) },
          };
        }
      }
    }
    for (const my of edgesY(moving)) {
      for (const ty of edgesY(t)) {
        const delta = ty - my;
        if (Math.abs(delta) <= threshold && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) {
          bestY = {
            delta,
            line: { y: ty, from: Math.min(moving.x, t.x), to: Math.max(moving.x + moving.w, t.x + t.w) },
          };
        }
      }
    }
  }
  const lines: SnapLine[] = [];
  if (bestX) lines.push(bestX.line);
  if (bestY) lines.push(bestY.line);
  return { dx: bestX?.delta ?? 0, dy: bestY?.delta ?? 0, lines };
}

/** Grid snapping for the top-left corner. */
export function snapToGrid(b: Bounds, grid: number): SnapResult {
  if (grid <= 0) return { dx: 0, dy: 0, lines: [] };
  return { dx: Math.round(b.x / grid) * grid - b.x, dy: Math.round(b.y / grid) * grid - b.y, lines: [] };
}

/** Element alignment first (it is what a person is usually after), the
 *  grid only on the axis alignment did not claim. */
export function snapDrag(
  moving: Bounds,
  targets: Bounds[],
  opts: { grid?: number | null; threshold?: number } = {}
): SnapResult {
  const threshold = opts.threshold ?? DEFAULT_SNAP_THRESHOLD;
  const aligned = snapToElements(moving, targets, threshold);
  if (!opts.grid) return aligned;
  const grid = snapToGrid({ ...moving, x: moving.x + aligned.dx, y: moving.y + aligned.dy }, opts.grid);
  return {
    dx: aligned.dx + (aligned.lines.some((l) => l.x !== undefined) ? 0 : grid.dx),
    dy: aligned.dy + (aligned.lines.some((l) => l.y !== undefined) ? 0 : grid.dy),
    lines: aligned.lines,
  };
}
