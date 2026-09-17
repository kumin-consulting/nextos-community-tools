// Bound arrows: the feature that makes a diagram a diagram rather than a
// picture of one.
import './_register.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const binding = await import('../src/lib/binding.ts');
const { createElement } = await import('../src/lib/document.ts');

const close = (a, b, t = 1e-6) => assert.ok(Math.abs(a - b) <= t, `${a} != ${b}`);
const box = (props) => createElement('rect', { x: 0, y: 0, w: 100, h: 60, ...props });

test('boundaryPoint lands on a rectangle edge, pushed out by the gap', () => {
  const shape = box({});
  const right = binding.boundaryPoint(shape, [500, 30], 0);
  close(right[0], 100);
  close(right[1], 30);
  const withGap = binding.boundaryPoint(shape, [500, 30], 8);
  close(withGap[0], 108);
});

test('boundaryPoint follows an ellipse and a diamond, not their boxes', () => {
  const ellipse = createElement('ellipse', { x: 0, y: 0, w: 100, h: 100 });
  const p = binding.boundaryPoint(ellipse, [1000, 1000], 0);
  close(Math.hypot(p[0] - 50, p[1] - 50), 50, 1e-6);
  const diamond = createElement('diamond', { x: 0, y: 0, w: 100, h: 100 });
  const d = binding.boundaryPoint(diamond, [1000, 1000], 0);
  close(Math.abs(d[0] - 50) + Math.abs(d[1] - 50), 50, 1e-6);
});

test('boundaryPoint respects a rotated shape', () => {
  const shape = createElement('rect', { x: 0, y: 0, w: 100, h: 20, angle: Math.PI / 2 });
  const p = binding.boundaryPoint(shape, [50, 500], 0);
  close(p[0], 50, 1e-6);
  close(p[1], 60, 1e-6);
});

test('makeBinding records the distance the tip was left at', () => {
  const shape = box({});
  const b = binding.makeBinding(shape, [110, 30]);
  assert.equal(b.elementId, shape.id);
  close(b.gap, 10, 1e-6);
  assert.ok(binding.makeBinding(shape, [10000, 30]).gap <= 32, 'a wild gap is capped');
});

test('a bound arrow re-aims when its shape moves', () => {
  const from = box({ x: 0, y: 0 });
  const to = box({ x: 300, y: 0 });
  const arrow = createElement('arrow', {
    x: 100,
    y: 30,
    points: [[0, 0], [200, 0]],
    startBinding: { elementId: from.id, gap: 0 },
    endBinding: { elementId: to.id, gap: 0 },
  });
  const moved = { ...to, x: 300, y: 400 };
  const refreshed = binding.refreshBindings([from, moved, arrow]);
  const updated = refreshed.find((el) => el.id === arrow.id);
  const points = binding.absolutePoints(updated);
  close(points[0][1], 60, 1e-6);
  assert.ok(points[0][0] > 50 && points[0][0] < 100, 'the tail slid round to the bottom edge, aimed at where the shape went');
  assert.ok(points[1][1] > 200, 'the tip followed the shape downwards');
  assert.ok(points[1][0] > 300 && points[1][0] <= 400, 'and stayed on its edge');
});

test('a bound arrow follows a resize too', () => {
  const shape = box({});
  const arrow = createElement('arrow', { x: 100, y: 30, points: [[0, 0], [100, 0]], startBinding: { elementId: shape.id, gap: 0 } });
  const wider = { ...shape, w: 260 };
  const updated = binding.refreshBindings([wider, arrow]).find((el) => el.id === arrow.id);
  close(binding.absolutePoints(updated)[0][0], 260, 1e-6);
});

test('refreshBindings returns the same array when nothing moved', () => {
  const shape = box({});
  const loose = createElement('line', { x: 0, y: 0, points: [[0, 0], [10, 10]] });
  const elements = [shape, loose];
  assert.equal(binding.refreshBindings(elements), elements);
});

test('pruneBindings forgets shapes that were deleted', () => {
  const arrow = createElement('arrow', {
    x: 0,
    y: 0,
    points: [[0, 0], [10, 0]],
    startBinding: { elementId: 'gone', gap: 2 },
    endBinding: { elementId: 'also gone', gap: 2 },
  });
  const [pruned] = binding.pruneBindings([arrow]);
  assert.equal(pruned.startBinding, null);
  assert.equal(pruned.endBinding, null);
});

test('boundArrowIds finds what has to be refreshed when a shape moves', () => {
  const shape = box({});
  const arrow = createElement('arrow', { x: 0, y: 0, points: [[0, 0], [10, 0]], endBinding: { elementId: shape.id, gap: 1 } });
  const unrelated = createElement('line', { x: 0, y: 0, points: [[0, 0], [5, 5]] });
  const ids = binding.boundArrowIds([shape, arrow, unrelated], new Set([shape.id]));
  assert.deepEqual([...ids], [arrow.id]);
});

test('bindableAt finds the shape under a new arrow tip, and skips frames', () => {
  const shape = box({ fill: '#eee', fillStyle: 'solid' });
  const frame = createElement('frame', { x: -50, y: -50, w: 400, h: 400 });
  assert.equal(binding.bindableAt([frame, shape], [50, 30]).id, shape.id);
  assert.equal(binding.bindableAt([frame], [10, 10]), null);
  assert.equal(binding.bindableAt([shape], [900, 900]), null);
});

test('a label rides the midpoint of the route', () => {
  const arrow = createElement('arrow', { x: 0, y: 0, points: [[0, 0], [100, 0]], text: 'yes' });
  assert.deepEqual(binding.labelAnchor(arrow), [50, 0]);
  const bounds = binding.labelBounds(arrow, 40, 20);
  assert.deepEqual(bounds, { x: 30, y: -10, w: 40, h: 20 });
});
