// Arranging a selection: align, distribute, flip and z-order. Each
// function takes the whole element list plus the selected ids and returns
// a new list in the same order (except the z-order ones, which reorder by
// definition), so the caller never has to splice anything itself.

import { type Bounds, type SketchElement } from './types';
import { boundsOfElements, rotatedBounds, transformElement, translateElement, unionBounds } from './geometry';

export type AlignMode = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom';
export type DistributeAxis = 'horizontal' | 'vertical';

const pick = (elements: SketchElement[], ids: Set<string>): SketchElement[] => elements.filter((el) => ids.has(el.id) && !el.locked);

function replace(elements: SketchElement[], moved: Map<string, SketchElement>): SketchElement[] {
  if (moved.size === 0) return elements;
  return elements.map((el) => moved.get(el.id) ?? el);
}

export function alignElements(elements: SketchElement[], ids: Set<string>, mode: AlignMode): SketchElement[] {
  const selected = pick(elements, ids);
  if (selected.length < 2) return elements;
  const target: Bounds = boundsOfElements(selected);
  const moved = new Map<string, SketchElement>();
  for (const el of selected) {
    const b = rotatedBounds(el);
    let dx = 0;
    let dy = 0;
    if (mode === 'left') dx = target.x - b.x;
    else if (mode === 'right') dx = target.x + target.w - (b.x + b.w);
    else if (mode === 'center-x') dx = target.x + target.w / 2 - (b.x + b.w / 2);
    else if (mode === 'top') dy = target.y - b.y;
    else if (mode === 'bottom') dy = target.y + target.h - (b.y + b.h);
    else if (mode === 'center-y') dy = target.y + target.h / 2 - (b.y + b.h / 2);
    if (dx || dy) moved.set(el.id, translateElement(el, dx, dy));
  }
  return replace(elements, moved);
}

/** Equal gaps between neighbours, outermost two left where they are. */
export function distributeElements(elements: SketchElement[], ids: Set<string>, axis: DistributeAxis): SketchElement[] {
  const selected = pick(elements, ids);
  if (selected.length < 3) return elements;
  const horizontal = axis === 'horizontal';
  const withBounds = selected
    .map((el) => ({ el, b: rotatedBounds(el) }))
    .sort((a, b) => (horizontal ? a.b.x - b.b.x : a.b.y - b.b.y));
  const first = withBounds[0].b;
  const last = withBounds[withBounds.length - 1].b;
  const span = horizontal ? last.x + last.w - first.x : last.y + last.h - first.y;
  const used = withBounds.reduce((sum, e) => sum + (horizontal ? e.b.w : e.b.h), 0);
  const gap = (span - used) / (withBounds.length - 1);
  const moved = new Map<string, SketchElement>();
  let cursor = horizontal ? first.x : first.y;
  for (const { el, b } of withBounds) {
    const current = horizontal ? b.x : b.y;
    const delta = cursor - current;
    if (delta) moved.set(el.id, translateElement(el, horizontal ? delta : 0, horizontal ? 0 : delta));
    cursor += (horizontal ? b.w : b.h) + gap;
  }
  return replace(elements, moved);
}

export function flipElements(elements: SketchElement[], ids: Set<string>, axis: 'horizontal' | 'vertical'): SketchElement[] {
  const selected = pick(elements, ids);
  if (!selected.length) return elements;
  const box = boundsOfElements(selected);
  const to: Bounds =
    axis === 'horizontal'
      ? { x: box.x + box.w, y: box.y, w: -box.w, h: box.h }
      : { x: box.x, y: box.y + box.h, w: box.w, h: -box.h };
  const moved = new Map<string, SketchElement>();
  for (const el of selected) moved.set(el.id, transformElement(el, box, to));
  return replace(elements, moved);
}

/* ---------------------------------------------------------- z-order */

export type OrderMode = 'front' | 'back' | 'forward' | 'backward';

export function reorder(elements: SketchElement[], ids: Set<string>, mode: OrderMode): SketchElement[] {
  if (!ids.size) return elements;
  const moving = elements.filter((el) => ids.has(el.id));
  if (!moving.length) return elements;
  const rest = elements.filter((el) => !ids.has(el.id));
  if (mode === 'front') return [...rest, ...moving];
  if (mode === 'back') return [...moving, ...rest];
  const out = elements.slice();
  if (mode === 'forward') {
    for (let i = out.length - 2; i >= 0; i--) {
      if (ids.has(out[i].id) && !ids.has(out[i + 1].id)) {
        const tmp = out[i];
        out[i] = out[i + 1];
        out[i + 1] = tmp;
      }
    }
  } else {
    for (let i = 1; i < out.length; i++) {
      if (ids.has(out[i].id) && !ids.has(out[i - 1].id)) {
        const tmp = out[i];
        out[i] = out[i - 1];
        out[i - 1] = tmp;
      }
    }
  }
  return out;
}

/* ----------------------------------------------------------- frames */

/** Elements whose box sits inside the frame - what a frame carries when
 *  it is dragged, and what "export this frame" contains. */
export function elementsInFrame(elements: SketchElement[], frame: SketchElement): SketchElement[] {
  const fb = rotatedBounds(frame);
  return elements.filter((el) => {
    if (el.id === frame.id || el.type === 'frame') return false;
    const b = rotatedBounds(el);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    return cx >= fb.x && cx <= fb.x + fb.w && cy >= fb.y && cy <= fb.y + fb.h;
  });
}

/** Expands `ids` with everything the selection implies: whole groups, and
 *  the contents of any selected frame. */
export function expandSelection(elements: SketchElement[], ids: Set<string>): Set<string> {
  const out = new Set(ids);
  const groups = new Set<string>();
  for (const el of elements) if (ids.has(el.id) && el.groupId) groups.add(el.groupId);
  for (const el of elements) if (el.groupId && groups.has(el.groupId)) out.add(el.id);
  for (const el of elements) {
    if (el.type === 'frame' && out.has(el.id)) for (const child of elementsInFrame(elements, el)) out.add(child.id);
  }
  return out;
}

export const selectionBounds = (elements: SketchElement[], ids: Set<string>): Bounds =>
  unionBounds(elements.filter((el) => ids.has(el.id)).map(rotatedBounds));
