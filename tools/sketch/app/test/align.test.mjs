// Arranging: align, distribute, flip, z-order, frames and what a
// selection really covers.
import './_register.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const align = await import('../src/lib/align.ts');
const { createElement } = await import('../src/lib/document.ts');

const box = (x, y, w = 40, h = 20, extra = {}) => createElement('rect', { x, y, w, h, ...extra });
const idsOf = (list) => list.map((el) => el.id);

test('alignElements pulls a selection onto one edge', () => {
  const a = box(0, 0);
  const b = box(100, 50);
  const left = align.alignElements([a, b], new Set([a.id, b.id]), 'left');
  assert.deepEqual(left.map((el) => el.x), [0, 0]);
  const bottom = align.alignElements([a, b], new Set([a.id, b.id]), 'bottom');
  assert.deepEqual(bottom.map((el) => el.y + el.h), [70, 70]);
  const middle = align.alignElements([a, b], new Set([a.id, b.id]), 'center-y');
  assert.deepEqual(middle.map((el) => el.y + el.h / 2), [35, 35]);
});

test('aligning fewer than two elements changes nothing', () => {
  const a = box(0, 0);
  const elements = [a];
  assert.equal(align.alignElements(elements, new Set([a.id]), 'left'), elements);
});

test('a locked element is left where it is', () => {
  const a = box(0, 0);
  const locked = box(200, 0, 40, 20, { locked: true });
  const out = align.alignElements([a, locked], new Set([a.id, locked.id]), 'left');
  assert.equal(out[1].x, 200);
});

test('distributeElements leaves equal gaps between neighbours', () => {
  const a = box(0, 0, 20, 20);
  const b = box(35, 0, 20, 20);
  const c = box(200, 0, 20, 20);
  const out = align.distributeElements([a, b, c], new Set([a.id, b.id, c.id]), 'horizontal');
  const xs = out.map((el) => el.x).sort((m, n) => m - n);
  assert.equal(xs[0], 0);
  assert.equal(xs[2], 200);
  assert.equal(xs[1] - xs[0], xs[2] - xs[1]);
});

test('flipElements mirrors about the selection box', () => {
  const a = box(0, 0, 20, 20);
  const b = box(80, 0, 20, 20);
  const out = align.flipElements([a, b], new Set([a.id, b.id]), 'horizontal');
  assert.deepEqual(out.map((el) => el.x).sort((m, n) => m - n), [0, 80]);
  assert.equal(out[0].x, 80, 'the first element swapped sides');
});

test('reorder moves a selection through the z-order', () => {
  const a = box(0, 0);
  const b = box(10, 0);
  const c = box(20, 0);
  assert.deepEqual(idsOf(align.reorder([a, b, c], new Set([a.id]), 'front')), idsOf([b, c, a]));
  assert.deepEqual(idsOf(align.reorder([a, b, c], new Set([c.id]), 'back')), idsOf([c, a, b]));
  assert.deepEqual(idsOf(align.reorder([a, b, c], new Set([a.id]), 'forward')), idsOf([b, a, c]));
  assert.deepEqual(idsOf(align.reorder([a, b, c], new Set([c.id]), 'backward')), idsOf([a, c, b]));
  assert.deepEqual(idsOf(align.reorder([a, b, c], new Set([c.id]), 'forward')), idsOf([a, b, c]), 'already at the top');
});

test('elementsInFrame takes what is centred inside it', () => {
  const frame = createElement('frame', { x: 0, y: 0, w: 200, h: 200, name: 'One' });
  const inside = box(20, 20);
  const outside = box(400, 400);
  const straddling = box(190, 20, 40, 20);
  const picked = align.elementsInFrame([frame, inside, outside, straddling], frame);
  assert.deepEqual(idsOf(picked), idsOf([inside]));
});

test('expandSelection pulls in whole groups and frame contents', () => {
  const g1 = box(0, 0, 40, 20, { groupId: 'g' });
  const g2 = box(50, 0, 40, 20, { groupId: 'g' });
  const loner = box(500, 500);
  const expanded = align.expandSelection([g1, g2, loner], new Set([g1.id]));
  assert.equal(expanded.size, 2);
  const frame = createElement('frame', { x: 0, y: 0, w: 200, h: 200 });
  const child = box(20, 20);
  const withFrame = align.expandSelection([frame, child], new Set([frame.id]));
  assert.equal(withFrame.size, 2);
});

test('selectionBounds covers only the selected elements', () => {
  const a = box(0, 0, 10, 10);
  const b = box(90, 90, 10, 10);
  assert.deepEqual(align.selectionBounds([a, b], new Set([a.id])), { x: 0, y: 0, w: 10, h: 10 });
  assert.deepEqual(align.selectionBounds([a, b], new Set([a.id, b.id])), { x: 0, y: 0, w: 100, h: 100 });
});
