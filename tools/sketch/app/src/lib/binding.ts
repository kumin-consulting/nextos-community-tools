// Arrow-to-shape attachment. A bound endpoint stores only the shape's id
// and the gap it keeps; the actual coordinate is recomputed from the
// shape's current geometry every time anything moves, so an arrow follows
// its shape through a move, a resize, a rotation and an undo without any
// of those code paths knowing that bindings exist.

import {
  type Binding,
  type Bounds,
  type Point,
  type SketchElement,
  isBindable,
  isLinear,
} from './types';
import {
  elementCenter,
  hitTest,
  normalizeLinear,
  pointAlongPolyline,
  rotatePoint,
  linearPathPoints,
} from './geometry';

export const DEFAULT_BINDING_GAP = 6;
export const MAX_BINDING_GAP = 32;
/** How close a pointer has to be to a shape for a new arrow to snap to it. */
export const BINDING_REACH = 18;

/** Where a ray aimed at `towards` leaves `shape`, pushed out by `gap`.
 *  Works in the shape's own rotated frame, so a tilted box still gets a
 *  tip that sits on its real edge. */
export function boundaryPoint(shape: SketchElement, towards: Point, gap = DEFAULT_BINDING_GAP): Point {
  const [cx, cy] = elementCenter(shape);
  const local = rotatePoint(towards, cx, cy, -shape.angle);
  let dx = local[0] - cx;
  let dy = local[1] - cy;
  if (dx === 0 && dy === 0) dy = -1;
  const rx = Math.max(shape.w / 2, 0.5);
  const ry = Math.max(shape.h / 2, 0.5);
  let t: number;
  if (shape.type === 'ellipse') {
    t = 1 / Math.hypot(dx / rx, dy / ry);
  } else if (shape.type === 'diamond') {
    t = 1 / (Math.abs(dx) / rx + Math.abs(dy) / ry);
  } else {
    const tx = dx === 0 ? Infinity : rx / Math.abs(dx);
    const ty = dy === 0 ? Infinity : ry / Math.abs(dy);
    t = Math.min(tx, ty);
  }
  const len = Math.hypot(dx, dy) * t;
  const scale = len === 0 ? 0 : (len + gap) / len;
  const edgeLocal: Point = [cx + dx * t * scale, cy + dy * t * scale];
  return rotatePoint(edgeLocal, cx, cy, shape.angle);
}

/** Absolute coordinates of a linear element's vertices (bindings ignore
 *  rotation: a bound arrow is always stored unrotated). */
export const absolutePoints = (el: SketchElement): Point[] => el.points.map((p) => [el.x + p[0], el.y + p[1]] as Point);

export function fromAbsolutePoints(el: SketchElement, points: Point[]): SketchElement {
  if (!points.length) return el;
  const [ox, oy] = points[0];
  return normalizeLinear({ ...el, x: ox, y: oy, points: points.map((p) => [p[0] - ox, p[1] - oy] as Point) });
}

/** The shape a new arrow endpoint at `p` should fasten to, if any. */
export function bindableAt(elements: SketchElement[], p: Point, reach = BINDING_REACH, exclude?: string): SketchElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.id === exclude || el.locked || !isBindable(el) || el.type === 'frame') continue;
    if (hitTest(el, p, reach)) return el;
  }
  return null;
}

export function makeBinding(shape: SketchElement, tip: Point): Binding {
  const towards = tip;
  const edge = boundaryPoint(shape, towards, 0);
  const gap = Math.min(MAX_BINDING_GAP, Math.max(0, Math.hypot(tip[0] - edge[0], tip[1] - edge[1])));
  return { elementId: shape.id, gap: Number.isFinite(gap) ? gap : DEFAULT_BINDING_GAP };
}

/** Recomputes a single arrow's bound endpoints against the current scene. */
export function updateBoundArrow(arrow: SketchElement, byId: Map<string, SketchElement>): SketchElement {
  if (!isLinear(arrow) || (!arrow.startBinding && !arrow.endBinding)) return arrow;
  const pts = absolutePoints(arrow);
  if (pts.length < 2) return arrow;
  const start = arrow.startBinding ? byId.get(arrow.startBinding.elementId) : undefined;
  const end = arrow.endBinding ? byId.get(arrow.endBinding.elementId) : undefined;
  let next = pts.slice();
  if (start) {
    const aim = end && pts.length === 2 ? elementCenter(end) : next[1];
    next[0] = boundaryPoint(start, aim, arrow.startBinding!.gap);
  }
  if (end) {
    const aim = start && pts.length === 2 ? elementCenter(start) : next[next.length - 2];
    next[next.length - 1] = boundaryPoint(end, aim, arrow.endBinding!.gap);
  }
  if (next[0][0] === pts[0][0] && next[0][1] === pts[0][1] && next[next.length - 1][0] === pts[pts.length - 1][0] && next[next.length - 1][1] === pts[pts.length - 1][1]) {
    return arrow;
  }
  return fromAbsolutePoints(arrow, next);
}

/** Re-runs every binding in the scene. Cheap enough to call after any
 *  mutation: it touches only arrows that actually carry a binding, and
 *  returns the same array reference shape when nothing changed. */
export function refreshBindings(elements: SketchElement[]): SketchElement[] {
  const byId = new Map(elements.map((el) => [el.id, el]));
  let changed = false;
  const out = elements.map((el) => {
    const next = updateBoundArrow(el, byId);
    if (next !== el) changed = true;
    return next;
  });
  return changed ? out : elements;
}

/** Drops bindings that point at elements that no longer exist (after a
 *  delete, or after importing a partial selection). */
export function pruneBindings(elements: SketchElement[]): SketchElement[] {
  const ids = new Set(elements.map((el) => el.id));
  let changed = false;
  const out = elements.map((el) => {
    if (!el.startBinding && !el.endBinding) return el;
    const startOk = !el.startBinding || ids.has(el.startBinding.elementId);
    const endOk = !el.endBinding || ids.has(el.endBinding.elementId);
    if (startOk && endOk) return el;
    changed = true;
    return { ...el, startBinding: startOk ? el.startBinding : null, endBinding: endOk ? el.endBinding : null };
  });
  return changed ? out : elements;
}

/** Ids of arrows fastened to any of `ids` - the set that has to be
 *  refreshed when those elements move. */
export function boundArrowIds(elements: SketchElement[], ids: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const el of elements) {
    if (!isLinear(el)) continue;
    if ((el.startBinding && ids.has(el.startBinding.elementId)) || (el.endBinding && ids.has(el.endBinding.elementId))) out.add(el.id);
  }
  return out;
}

/** Where an arrow's label sits: the midpoint of the drawn route. */
export function labelAnchor(arrow: SketchElement): Point {
  return pointAlongPolyline(linearPathPoints(arrow), 0.5);
}

/** Box a label occupies, centred on the arrow's midpoint. */
export function labelBounds(arrow: SketchElement, width: number, height: number): Bounds {
  const [x, y] = labelAnchor(arrow);
  return { x: x - width / 2, y: y - height / 2, w: width, h: height };
}
