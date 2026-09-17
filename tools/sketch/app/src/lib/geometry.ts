// Every piece of maths the canvas, the hit tester and the SVG exporter
// share: rotation, bounds, point-in-shape tests, segment distance,
// resize/flip transforms and the curve/elbow routing used to draw a line.
//
// Pure - no DOM, no React. src/canvas/render.ts and src/lib/svg.ts both
// build their paths from the functions here, so a curve looks identical
// on screen and in an exported file by construction.

import {
  type Bounds,
  type Point,
  type SketchElement,
  isLinear,
} from './types';

export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export const roundTo = (v: number, step: number): number => (step > 0 ? Math.round(v / step) * step : v);

export function rotatePoint(p: Point, cx: number, cy: number, angle: number): Point {
  if (angle === 0) return [p[0], p[1]];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = p[0] - cx;
  const dy = p[1] - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
}

export const elementCenter = (el: SketchElement): Point => [el.x + el.w / 2, el.y + el.h / 2];

export const elementBounds = (el: SketchElement): Bounds => ({ x: el.x, y: el.y, w: el.w, h: el.h });

/** The axis-aligned box that contains the element after rotation. */
export function rotatedBounds(el: SketchElement): Bounds {
  if (!el.angle) return elementBounds(el);
  const [cx, cy] = elementCenter(el);
  const corners: Point[] = [
    [el.x, el.y],
    [el.x + el.w, el.y],
    [el.x + el.w, el.y + el.h],
    [el.x, el.y + el.h],
  ].map((p) => rotatePoint(p as Point, cx, cy, el.angle));
  return boundsOfPoints(corners);
}

export function boundsOfPoints(points: Point[]): Bounds {
  if (!points.length) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function unionBounds(list: Bounds[]): Bounds {
  if (!list.length) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of list) {
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export const boundsOfElements = (els: SketchElement[]): Bounds => unionBounds(els.map(rotatedBounds));

export const boundsCenter = (b: Bounds): Point => [b.x + b.w / 2, b.y + b.h / 2];

export const expandBounds = (b: Bounds, by: number): Bounds => ({ x: b.x - by, y: b.y - by, w: b.w + by * 2, h: b.h + by * 2 });

export const pointInBounds = (p: Point, b: Bounds): boolean => p[0] >= b.x && p[0] <= b.x + b.w && p[1] >= b.y && p[1] <= b.y + b.h;

export const boundsIntersect = (a: Bounds, b: Bounds): boolean =>
  a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;

export const boundsContain = (outer: Bounds, inner: Bounds): boolean =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

export const normalizeBounds = (b: Bounds): Bounds => ({
  x: b.w < 0 ? b.x + b.w : b.x,
  y: b.h < 0 ? b.y + b.h : b.y,
  w: Math.abs(b.w),
  h: Math.abs(b.h),
});

/* --------------------------------------------------------- distances */

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const wx = p[0] - a[0];
  const wy = p[1] - a[1];
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : clamp((wx * vx + wy * vy) / len2, 0, 1);
  const dx = a[0] + t * vx - p[0];
  const dy = a[1] + t * vy - p[1];
  return Math.hypot(dx, dy);
}

export function distanceToPolyline(p: Point, points: Point[]): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) return Math.hypot(p[0] - points[0][0], p[1] - points[0][1]);
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const d = distanceToSegment(p, points[i - 1], points[i]);
    if (d < best) best = d;
  }
  return best;
}

/** Perimeter distance to an axis-aligned rectangle's outline (0 when on it). */
export function distanceToRectOutline(p: Point, b: Bounds): number {
  const corners: Point[] = [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x + b.w, b.y + b.h],
    [b.x, b.y + b.h],
  ];
  return distanceToPolyline(p, [...corners, corners[0]]);
}

export function distanceToDiamondOutline(p: Point, b: Bounds): number {
  const pts = diamondPoints(b);
  return distanceToPolyline(p, [...pts, pts[0]]);
}

export function diamondPoints(b: Bounds): Point[] {
  return [
    [b.x + b.w / 2, b.y],
    [b.x + b.w, b.y + b.h / 2],
    [b.x + b.w / 2, b.y + b.h],
    [b.x, b.y + b.h / 2],
  ];
}

/** Signed-ish measure: <= 1 inside an axis-aligned ellipse inscribed in b. */
export function ellipseValue(p: Point, b: Bounds): number {
  const rx = b.w / 2 || 1e-6;
  const ry = b.h / 2 || 1e-6;
  const dx = (p[0] - (b.x + rx)) / rx;
  const dy = (p[1] - (b.y + ry)) / ry;
  return dx * dx + dy * dy;
}

export function distanceToEllipseOutline(p: Point, b: Bounds): number {
  // Sampled outline: exact ellipse distance needs an iterative solve, and
  // 64 samples is well under a pixel of error at the tolerances hit
  // testing uses.
  const rx = b.w / 2;
  const ry = b.h / 2;
  const cx = b.x + rx;
  const cy = b.y + ry;
  const pts: Point[] = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * TAU;
    pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return distanceToPolyline(p, pts);
}

export function pointInDiamond(p: Point, b: Bounds): boolean {
  const rx = b.w / 2 || 1e-6;
  const ry = b.h / 2 || 1e-6;
  const dx = Math.abs(p[0] - (b.x + rx)) / rx;
  const dy = Math.abs(p[1] - (b.y + ry)) / ry;
  return dx + dy <= 1;
}

/* -------------------------------------------------------- hit testing */

/** Scene point expressed in the element's own unrotated frame. */
export function toLocal(el: SketchElement, p: Point): Point {
  const [cx, cy] = elementCenter(el);
  return rotatePoint(p, cx, cy, -el.angle);
}

export function toWorld(el: SketchElement, p: Point): Point {
  const [cx, cy] = elementCenter(el);
  return rotatePoint(p, cx, cy, el.angle);
}

/** Absolute scene positions of a line/arrow/freehand element's vertices. */
export function linearPoints(el: SketchElement): Point[] {
  const [cx, cy] = elementCenter(el);
  return el.points.map((p) => rotatePoint([el.x + p[0], el.y + p[1]], cx, cy, el.angle));
}

const isFilled = (el: SketchElement): boolean => el.fillStyle !== 'none' && el.fill !== 'transparent';

/** Does `p` (scene coords) select this element, allowing `tolerance` slack? */
export function hitTest(el: SketchElement, p: Point, tolerance = 8): boolean {
  const slack = tolerance + el.strokeWidth / 2;
  if (isLinear(el)) {
    return distanceToPolyline(p, linearPathPoints(el)) <= slack;
  }
  const local = toLocal(el, p);
  const b = elementBounds(el);
  if (el.type === 'text' || el.type === 'sticky') return pointInBounds(local, expandBounds(b, slack / 2));
  if (el.type === 'frame') {
    // A frame is grabbed by its outline or its title strip, never by its
    // empty middle - otherwise it would swallow every click inside it.
    if (local[1] >= b.y - 26 && local[1] <= b.y && local[0] >= b.x && local[0] <= b.x + b.w) return true;
    return distanceToRectOutline(local, b) <= slack;
  }
  if (el.type === 'ellipse') {
    if (isFilled(el)) return ellipseValue(local, b) <= 1;
    return distanceToEllipseOutline(local, b) <= slack;
  }
  if (el.type === 'diamond') {
    if (isFilled(el)) return pointInDiamond(local, b);
    return distanceToDiamondOutline(local, b) <= slack;
  }
  // rect
  if (isFilled(el) || el.text) return pointInBounds(local, expandBounds(b, slack / 2));
  return distanceToRectOutline(local, b) <= slack;
}

/** Topmost element under the point; `elements` is bottom-to-top. */
export function hitTestElements(elements: SketchElement[], p: Point, tolerance = 8): SketchElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.locked) continue;
    if (hitTest(el, p, tolerance)) return el;
  }
  return null;
}

/** Marquee selection: an element counts when its rotated box is fully
 *  inside for shapes, or when any vertex is inside for linear elements. */
export function elementsInBounds(elements: SketchElement[], b: Bounds): SketchElement[] {
  const box = normalizeBounds(b);
  return elements.filter((el) => {
    if (el.locked) return false;
    if (isLinear(el)) return linearPoints(el).some((p) => pointInBounds(p, box));
    return boundsContain(box, rotatedBounds(el));
  });
}

/* ------------------------------------------------------- line routing */

/** Catmull-Rom through the points, expressed as cubic Bezier control
 *  points - one entry per segment: [c1, c2, end]. */
export function curveSegments(points: Point[], tension = 0.5): Array<[Point, Point, Point]> {
  const out: Array<[Point, Point, Point]> = [];
  if (points.length < 2) return out;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1: Point = [p1[0] + ((p2[0] - p0[0]) / 6) * tension * 2, p1[1] + ((p2[1] - p0[1]) / 6) * tension * 2];
    const c2: Point = [p2[0] - ((p3[0] - p1[0]) / 6) * tension * 2, p2[1] - ((p3[1] - p1[1]) / 6) * tension * 2];
    out.push([c1, c2, p2]);
  }
  return out;
}

/** An orthogonal route between two points, leaving each end along the
 *  dominant axis - what "elbow" arrows draw. */
export function elbowRoute(a: Point, b: Point): Point[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (Math.abs(dx) < 1 || Math.abs(dy) < 1) return [a, b];
  if (Math.abs(dx) >= Math.abs(dy)) {
    const midX = a[0] + dx / 2;
    return [a, [midX, a[1]], [midX, b[1]], b];
  }
  const midY = a[1] + dy / 2;
  return [a, [a[0], midY], [b[0], midY], b];
}

/** The points actually drawn for a linear element, after elbow routing.
 *  Curved elements keep their vertices here (the curve is applied when
 *  the path is built) so hit testing stays close to what is on screen. */
export function linearPathPoints(el: SketchElement): Point[] {
  const pts = linearPoints(el);
  if (el.edge === 'elbow' && pts.length === 2) return elbowRoute(pts[0], pts[1]);
  return pts;
}

/** Point at parameter t (0..1) along a polyline - used for arrow labels. */
export function pointAlongPolyline(points: Point[], t: number): Point {
  if (points.length === 0) return [0, 0];
  if (points.length === 1) return points[0];
  let total = 0;
  const segs: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    segs.push(d);
    total += d;
  }
  if (total === 0) return points[0];
  let target = clamp(t, 0, 1) * total;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i] || i === segs.length - 1) {
      const f = segs[i] === 0 ? 0 : target / segs[i];
      return [points[i][0] + (points[i + 1][0] - points[i][0]) * f, points[i][1] + (points[i + 1][1] - points[i][1]) * f];
    }
    target -= segs[i];
  }
  return points[points.length - 1];
}

export function polylineLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return total;
}

/** Douglas-Peucker: keeps a freehand stroke light without visibly
 *  changing it (pen input arrives far denser than it needs to be). */
export function simplifyPoints(points: Point[], epsilon = 0.6): Point[] {
  if (points.length < 3) return points.slice();
  let maxDist = 0;
  let index = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = distanceToSegment(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist <= epsilon) return [first, last];
  const left = simplifyPoints(points.slice(0, index + 1), epsilon);
  const right = simplifyPoints(points.slice(index), epsilon);
  return [...left.slice(0, -1), ...right];
}

/* ------------------------------------------------------- transforms */

/** Re-anchors a linear element so its points start at (0,0) and w/h match
 *  their bounding box - the invariant every other function relies on. */
export function normalizeLinear(el: SketchElement): SketchElement {
  if (!isLinear(el) || el.points.length === 0) return el;
  const b = boundsOfPoints(el.points);
  const points: Point[] = el.points.map((p) => [p[0] - b.x, p[1] - b.y]);
  return { ...el, x: el.x + b.x, y: el.y + b.y, w: b.w, h: b.h, points };
}

export const translateElement = (el: SketchElement, dx: number, dy: number): SketchElement => ({ ...el, x: el.x + dx, y: el.y + dy });

/** Maps an element from one bounding box to another, mirroring when a
 *  target dimension is negative. Drives resize, flip and scale-to-fit. */
export function transformElement(el: SketchElement, from: Bounds, to: Bounds): SketchElement {
  const sx = from.w === 0 ? 1 : to.w / from.w;
  const sy = from.h === 0 ? 1 : to.h / from.h;
  const mapX = (x: number): number => to.x + (x - from.x) * sx;
  const mapY = (y: number): number => to.y + (y - from.y) * sy;
  const next: SketchElement = {
    ...el,
    x: mapX(el.x),
    y: mapY(el.y),
    w: el.w * sx,
    h: el.h * sy,
    points: el.points.map((p) => [p[0] * sx, p[1] * sy] as Point),
    angle: sx * sy < 0 ? -el.angle : el.angle,
  };
  const fixed: SketchElement = {
    ...next,
    x: next.w < 0 ? next.x + next.w : next.x,
    y: next.h < 0 ? next.y + next.h : next.y,
    w: Math.abs(next.w),
    h: Math.abs(next.h),
  };
  if (isLinear(fixed)) {
    const shifted: SketchElement = {
      ...fixed,
      x: next.x,
      y: next.y,
      points: next.points,
    };
    return normalizeLinear(shifted);
  }
  return fixed;
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Handle positions (scene coords) around a selection box. */
export function handlePositions(b: Bounds, angle = 0): Array<{ handle: ResizeHandle; point: Point }> {
  const [cx, cy] = boundsCenter(b);
  const raw: Record<ResizeHandle, Point> = {
    nw: [b.x, b.y],
    n: [b.x + b.w / 2, b.y],
    ne: [b.x + b.w, b.y],
    e: [b.x + b.w, b.y + b.h / 2],
    se: [b.x + b.w, b.y + b.h],
    s: [b.x + b.w / 2, b.y + b.h],
    sw: [b.x, b.y + b.h],
    w: [b.x, b.y + b.h / 2],
  };
  return RESIZE_HANDLES.map((handle) => ({ handle, point: rotatePoint(raw[handle], cx, cy, angle) }));
}

export function rotateHandlePosition(b: Bounds, angle = 0, offset = 28): Point {
  const [cx, cy] = boundsCenter(b);
  return rotatePoint([b.x + b.w / 2, b.y - offset], cx, cy, angle);
}

/** New local bounds for a handle drag. `local` is the pointer expressed in
 *  the element's unrotated frame. */
export function resizedLocalBounds(b: Bounds, handle: ResizeHandle, local: Point, keepAspect = false, minSize = 1): Bounds {
  let { x, y, w, h } = b;
  let x1 = x + w;
  let y1 = y + h;
  if (handle.includes('w')) x = local[0];
  if (handle.includes('e')) x1 = local[0];
  if (handle.includes('n')) y = local[1];
  if (handle.includes('s')) y1 = local[1];
  let nw = x1 - x;
  let nh = y1 - y;
  if (keepAspect && b.w !== 0 && b.h !== 0 && handle.length === 2) {
    const ratio = b.h / b.w;
    const signW = nw < 0 ? -1 : 1;
    const signH = nh < 0 ? -1 : 1;
    const mag = Math.max(Math.abs(nw), Math.abs(nh) / ratio);
    nw = mag * signW;
    nh = mag * ratio * signH;
    if (handle.includes('w')) x = x1 - nw;
    if (handle.includes('n')) y = y1 - nh;
  }
  if (Math.abs(nw) < minSize) nw = nw < 0 ? -minSize : minSize;
  if (Math.abs(nh) < minSize) nh = nh < 0 ? -minSize : minSize;
  return { x, y, w: nw, h: nh };
}

/** Resizes one element by a handle, keeping the opposite corner pinned in
 *  world space even when the element is rotated. */
export function resizeElement(el: SketchElement, handle: ResizeHandle, pointerScene: Point, keepAspect = false): SketchElement {
  const from = elementBounds(el);
  const local = toLocal(el, pointerScene);
  const to = resizedLocalBounds(from, handle, local, keepAspect, isLinear(el) ? 0.01 : 2);
  const moved = transformElement(el, from, to);
  if (!el.angle) return moved;
  // The anchor is the corner/edge the drag does not touch; both frames
  // rotate about their own centre, so pin it by comparing world positions.
  const anchorLocal: Point = [
    handle.includes('w') ? from.x + from.w : handle.includes('e') ? from.x : from.x + from.w / 2,
    handle.includes('n') ? from.y + from.h : handle.includes('s') ? from.y : from.y + from.h / 2,
  ];
  const [oldCx, oldCy] = elementCenter(el);
  const worldAnchor = rotatePoint(anchorLocal, oldCx, oldCy, el.angle);
  const normTo = normalizeBounds(to);
  const anchorInNew: Point = [
    handle.includes('w') ? normTo.x + normTo.w : handle.includes('e') ? normTo.x : normTo.x + normTo.w / 2,
    handle.includes('n') ? normTo.y + normTo.h : handle.includes('s') ? normTo.y : normTo.y + normTo.h / 2,
  ];
  const [newCx, newCy] = [moved.x + moved.w / 2, moved.y + moved.h / 2];
  const rotatedAnchor = rotatePoint(anchorInNew, newCx, newCy, moved.angle);
  return { ...moved, x: moved.x + (worldAnchor[0] - rotatedAnchor[0]), y: moved.y + (worldAnchor[1] - rotatedAnchor[1]) };
}

export function rotateElementTo(el: SketchElement, pointerScene: Point, snap = false): SketchElement {
  const [cx, cy] = elementCenter(el);
  let angle = Math.atan2(pointerScene[1] - cy, pointerScene[0] - cx) + Math.PI / 2;
  if (snap) angle = roundTo(angle, Math.PI / 12);
  return { ...el, angle: ((angle % TAU) + TAU) % TAU };
}

/** Rotates a group about a shared centre: each element spins on its own
 *  axis and orbits the centre, which is what a person expects. */
export function rotateAbout(el: SketchElement, cx: number, cy: number, delta: number): SketchElement {
  const [ex, ey] = elementCenter(el);
  const [nx, ny] = rotatePoint([ex, ey], cx, cy, delta);
  return { ...el, x: nx - el.w / 2, y: ny - el.h / 2, angle: ((el.angle + delta) % TAU + TAU) % TAU };
}

/* ---------------------------------------------------------- viewport */

export interface ViewportLike {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

export const sceneToCanvas = (p: Point, v: ViewportLike): Point => [(p[0] - v.scrollX) * v.zoom, (p[1] - v.scrollY) * v.zoom];
export const canvasToScene = (p: Point, v: ViewportLike): Point => [p[0] / v.zoom + v.scrollX, p[1] / v.zoom + v.scrollY];

/** The scene rectangle currently visible in a canvas of this size. */
export const visibleBounds = (v: ViewportLike, width: number, height: number): Bounds => ({
  x: v.scrollX,
  y: v.scrollY,
  w: width / v.zoom,
  h: height / v.zoom,
});

/** Zoom keeping the scene point under the cursor pinned to the cursor. */
export function zoomAt(v: ViewportLike, nextZoom: number, canvasPoint: Point): ViewportLike {
  const zoom = clamp(nextZoom, 0.05, 30);
  const before = canvasToScene(canvasPoint, v);
  const after = canvasToScene(canvasPoint, { ...v, zoom });
  return { zoom, scrollX: v.scrollX + before[0] - after[0], scrollY: v.scrollY + before[1] - after[1] };
}

/** Viewport that frames `b` inside a width x height canvas with padding. */
export function fitBounds(b: Bounds, width: number, height: number, padding = 64, maxZoom = 1.6): ViewportLike {
  if (b.w <= 0 && b.h <= 0) return { scrollX: b.x - width / 2, scrollY: b.y - height / 2, zoom: 1 };
  const zoom = clamp(Math.min((width - padding * 2) / Math.max(b.w, 1), (height - padding * 2) / Math.max(b.h, 1)), 0.05, maxZoom);
  return {
    zoom,
    scrollX: b.x + b.w / 2 - width / 2 / zoom,
    scrollY: b.y + b.h / 2 - height / 2 / zoom,
  };
}
