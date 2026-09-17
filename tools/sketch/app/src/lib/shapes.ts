// The drawing primitives the canvas renderer and the SVG exporter share:
// path commands for a line/arrow/freehand stroke, arrowhead geometry and
// dash patterns. Keeping them here is what makes an exported SVG match
// what is on screen - both consumers walk the SAME command list, one into
// ctx.bezierCurveTo, the other into a `d` attribute.
//
// Pure: no DOM, no canvas, no React.

import { type ArrowHead, type Point, type SketchElement, type StrokeStyle } from './types';
import { curveSegments, linearPathPoints } from './geometry';

export type PathCommand =
  | ['M', number, number]
  | ['L', number, number]
  | ['C', number, number, number, number, number, number]
  | ['Z'];

/** Path for a line, arrow or freehand stroke: straight segments, an
 *  orthogonal elbow route, or a Catmull-Rom curve, exactly as the element
 *  asks for. Freehand is always smoothed. */
export function linearCommands(el: SketchElement): PathCommand[] {
  const pts = linearPathPoints(el);
  if (pts.length === 0) return [];
  if (pts.length === 1) return [['M', pts[0][0], pts[0][1]]];
  const smooth = el.type === 'draw' || (el.edge === 'curved' && pts.length >= 2);
  if (!smooth) return [['M', pts[0][0], pts[0][1]], ...pts.slice(1).map((p) => ['L', p[0], p[1]] as PathCommand)];
  const out: PathCommand[] = [['M', pts[0][0], pts[0][1]]];
  for (const [c1, c2, end] of curveSegments(pts)) out.push(['C', c1[0], c1[1], c2[0], c2[1], end[0], end[1]]);
  return out;
}

const fmt = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

/** A `d` attribute from the same commands the canvas draws. */
export const commandsToPathData = (commands: PathCommand[]): string =>
  commands.map((c) => (c[0] === 'Z' ? 'Z' : c[0] + c.slice(1).map((n) => fmt(n as number)).join(' '))).join(' ');

/** Dash pattern in scene units for a stroke style, scaled with the pen so
 *  a bold dashed line still reads as dashed. */
export function dashPattern(style: StrokeStyle, strokeWidth: number): number[] {
  if (style === 'dashed') return [strokeWidth * 3.2, strokeWidth * 2.4];
  if (style === 'dotted') return [0.01, strokeWidth * 2.1];
  return [];
}

export const ARROW_HEAD_SIZE = 5.2;

export interface HeadGeometry {
  kind: ArrowHead;
  /** 'arrow' and 'bar': the polyline to stroke. */
  points: Point[];
  /** 'dot': the disc to fill. */
  center: Point;
  radius: number;
  /** How far back along the line the head reaches, so the shaft can stop
   *  short of a filled head instead of poking through it. */
  inset: number;
}

/** Geometry for one end of a linear element. `tip` is the endpoint,
 *  `from` the neighbouring vertex the line arrives from. */
export function arrowHeadGeometry(tip: Point, from: Point, kind: ArrowHead, strokeWidth: number): HeadGeometry | null {
  if (kind === 'none') return null;
  const dx = tip[0] - from[0];
  const dy = tip[1] - from[1];
  const len = Math.hypot(dx, dy);
  const ux = len === 0 ? 1 : dx / len;
  const uy = len === 0 ? 0 : dy / len;
  const size = ARROW_HEAD_SIZE * Math.max(1, strokeWidth * 0.75) + strokeWidth * 1.6;
  if (kind === 'dot') {
    const radius = Math.max(2.4, strokeWidth * 1.5);
    return { kind, points: [], center: tip, radius, inset: radius * 0.6 };
  }
  if (kind === 'bar') {
    const half = Math.max(4, size * 0.6);
    return {
      kind,
      points: [
        [tip[0] - uy * half, tip[1] + ux * half],
        [tip[0] + uy * half, tip[1] - ux * half],
      ],
      center: tip,
      radius: 0,
      inset: 0,
    };
  }
  const spread = 0.42;
  const cos = Math.cos(spread);
  const sin = Math.sin(spread);
  const back: Point = [tip[0] - ux * size, tip[1] - uy * size];
  const bx = back[0] - tip[0];
  const by = back[1] - tip[1];
  return {
    kind,
    points: [
      [tip[0] + bx * cos - by * sin, tip[1] + bx * sin + by * cos],
      [tip[0], tip[1]],
      [tip[0] + bx * cos + by * sin, tip[1] - bx * sin + by * cos],
    ],
    center: tip,
    radius: 0,
    inset: size * 0.55,
  };
}

/** Both ends of a linear element, already aimed along the drawn path. */
export function headsFor(el: SketchElement): { start: HeadGeometry | null; end: HeadGeometry | null } {
  const pts = linearPathPoints(el);
  if (pts.length < 2) return { start: null, end: null };
  return {
    start: arrowHeadGeometry(pts[0], pts[1], el.startArrow, el.strokeWidth),
    end: arrowHeadGeometry(pts[pts.length - 1], pts[pts.length - 2], el.endArrow, el.strokeWidth),
  };
}

/** Corner radius in scene units for a rectangle-ish element. */
export const cornerRadius = (el: SketchElement): number =>
  Math.max(0, Math.min(el.roundness * Math.min(Math.abs(el.w), Math.abs(el.h)), Math.min(Math.abs(el.w), Math.abs(el.h)) / 2));
