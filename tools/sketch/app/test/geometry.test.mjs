// Geometry: the maths every other part of the app trusts. If hit testing
// or the resize transform is wrong, nothing above it can be right.
import './_register.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const geo = await import('../src/lib/geometry.ts');
const { createElement } = await import('../src/lib/document.ts');

const close = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

test('rotatePoint turns a point about a centre', () => {
  const [x, y] = geo.rotatePoint([10, 0], 0, 0, Math.PI / 2);
  close(x, 0, 1e-9);
  close(y, 10, 1e-9);
  assert.deepEqual(geo.rotatePoint([3, 4], 1, 1, 0), [3, 4]);
});

test('rotatedBounds grows the box for a tilted rectangle', () => {
  const el = createElement('rect', { x: 0, y: 0, w: 100, h: 40, angle: Math.PI / 4 });
  const b = geo.rotatedBounds(el);
  assert.ok(b.w > 98 && b.w < 100, `width ${b.w}`);
  close(b.x + b.w / 2, 50, 1e-6);
  const straight = geo.rotatedBounds(createElement('rect', { x: 5, y: 6, w: 10, h: 20 }));
  assert.deepEqual(straight, { x: 5, y: 6, w: 10, h: 20 });
});

test('unionBounds and boundsOfElements cover every element', () => {
  const a = createElement('rect', { x: 0, y: 0, w: 10, h: 10 });
  const b = createElement('rect', { x: 100, y: 50, w: 20, h: 20 });
  assert.deepEqual(geo.boundsOfElements([a, b]), { x: 0, y: 0, w: 120, h: 70 });
});

test('distanceToSegment measures to the segment, not the infinite line', () => {
  close(geo.distanceToSegment([5, 5], [0, 0], [10, 0]), 5);
  close(geo.distanceToSegment([20, 0], [0, 0], [10, 0]), 10);
});

test('hitTest: an unfilled rectangle is grabbed by its outline only', () => {
  const el = createElement('rect', { x: 0, y: 0, w: 100, h: 100 });
  assert.equal(geo.hitTest(el, [50, 50]), false);
  assert.equal(geo.hitTest(el, [0, 50]), true);
  assert.equal(geo.hitTest(el, [-3, 50]), true);
  assert.equal(geo.hitTest(el, [-40, 50]), false);
});

test('hitTest: a filled shape is grabbed anywhere inside it', () => {
  const el = createElement('rect', { x: 0, y: 0, w: 100, h: 100, fill: '#eee', fillStyle: 'solid' });
  assert.equal(geo.hitTest(el, [50, 50]), true);
  const ellipse = createElement('ellipse', { x: 0, y: 0, w: 100, h: 100, fill: '#eee', fillStyle: 'solid' });
  assert.equal(geo.hitTest(ellipse, [50, 50]), true);
  assert.equal(geo.hitTest(ellipse, [4, 4]), false, 'the corner of the box is outside the ellipse');
  const diamond = createElement('diamond', { x: 0, y: 0, w: 100, h: 100, fill: '#eee', fillStyle: 'solid' });
  assert.equal(geo.hitTest(diamond, [50, 50]), true);
  assert.equal(geo.hitTest(diamond, [6, 6]), false);
});

test('hitTest: a rotated shape is tested in its own frame', () => {
  const el = createElement('rect', { x: 0, y: 0, w: 200, h: 20, angle: Math.PI / 2, fill: '#eee', fillStyle: 'solid' });
  assert.equal(geo.hitTest(el, [100, 100]), true, 'along the rotated long side');
  assert.equal(geo.hitTest(el, [180, 100]), false);
});

test('hitTest: a line is grabbed near the stroke', () => {
  const line = createElement('line', { x: 0, y: 0, points: [[0, 0], [100, 0]], strokeWidth: 2 });
  assert.equal(geo.hitTest(line, [50, 3]), true);
  assert.equal(geo.hitTest(line, [50, 30]), false);
});

test('hitTestElements returns the topmost unlocked element', () => {
  const under = createElement('rect', { x: 0, y: 0, w: 100, h: 100, fill: '#eee', fillStyle: 'solid' });
  const over = createElement('rect', { x: 20, y: 20, w: 40, h: 40, fill: '#ddd', fillStyle: 'solid' });
  assert.equal(geo.hitTestElements([under, over], [30, 30]).id, over.id);
  const locked = { ...over, locked: true };
  assert.equal(geo.hitTestElements([under, locked], [30, 30]).id, under.id);
  assert.equal(geo.hitTestElements([under, over], [500, 500]), null);
});

test('elementsInBounds needs shapes fully inside, lines only partly', () => {
  const inside = createElement('rect', { x: 10, y: 10, w: 20, h: 20 });
  const straddling = createElement('rect', { x: 90, y: 10, w: 40, h: 20 });
  const line = createElement('line', { x: 50, y: 50, points: [[0, 0], [400, 400]] });
  const picked = geo.elementsInBounds([inside, straddling, line], { x: 0, y: 0, w: 100, h: 100 }).map((e) => e.id);
  assert.deepEqual(picked, [inside.id, line.id]);
});

test('normalizeLinear re-anchors points at the origin', () => {
  const el = createElement('line', { x: 10, y: 10, points: [[5, 5], [-5, 25]] });
  assert.equal(el.x, 5);
  assert.equal(el.y, 15);
  assert.deepEqual(el.points, [[10, 0], [0, 20]]);
  assert.equal(el.w, 10);
  assert.equal(el.h, 20);
});

test('transformElement maps a box onto another, mirroring on a negative side', () => {
  const el = createElement('rect', { x: 0, y: 0, w: 10, h: 10 });
  const moved = geo.transformElement(el, { x: 0, y: 0, w: 10, h: 10 }, { x: 100, y: 100, w: 20, h: 40 });
  assert.deepEqual([moved.x, moved.y, moved.w, moved.h], [100, 100, 20, 40]);
  const flipped = geo.transformElement(el, { x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: -10, h: 10 });
  assert.deepEqual([flipped.x, flipped.w], [0, 10]);
});

test('resizedLocalBounds keeps the aspect ratio when asked', () => {
  const box = { x: 0, y: 0, w: 100, h: 50 };
  const free = geo.resizedLocalBounds(box, 'se', [200, 60]);
  assert.deepEqual([free.w, free.h], [200, 60]);
  const locked = geo.resizedLocalBounds(box, 'se', [200, 60], true);
  close(locked.h / locked.w, 0.5);
});

test('resizeElement pins the opposite corner even when rotated', () => {
  const el = createElement('rect', { x: 0, y: 0, w: 100, h: 100, angle: Math.PI / 6 });
  const anchorBefore = geo.rotatePoint([0, 0], 50, 50, el.angle);
  const resized = geo.resizeElement(el, 'se', [200, 200]);
  const anchorAfter = geo.rotatePoint([resized.x, resized.y], resized.x + resized.w / 2, resized.y + resized.h / 2, resized.angle);
  close(anchorBefore[0], anchorAfter[0], 1e-6);
  close(anchorBefore[1], anchorAfter[1], 1e-6);
});

test('rotateAbout orbits a group member and spins it', () => {
  const el = createElement('rect', { x: 100, y: 0, w: 20, h: 20 });
  const turned = geo.rotateAbout(el, 0, 0, Math.PI / 2);
  close(turned.x + 10, -10, 1e-6);
  close(turned.y + 10, 110, 1e-6);
  close(turned.angle, Math.PI / 2, 1e-9);
});

test('zoomAt keeps the point under the cursor still', () => {
  const view = { scrollX: 0, scrollY: 0, zoom: 1 };
  const before = geo.canvasToScene([300, 200], view);
  const after = geo.zoomAt(view, 2.5, [300, 200]);
  const stillThere = geo.canvasToScene([300, 200], after);
  close(before[0], stillThere[0], 1e-9);
  close(before[1], stillThere[1], 1e-9);
  assert.equal(geo.zoomAt(view, 1000, [0, 0]).zoom, 30, 'clamped');
});

test('fitBounds frames the content inside the canvas', () => {
  const view = geo.fitBounds({ x: 0, y: 0, w: 1000, h: 500 }, 800, 600, 40);
  assert.ok(view.zoom <= 0.72 && view.zoom > 0.7, `zoom ${view.zoom}`);
  close(view.scrollX + 800 / 2 / view.zoom, 500, 1e-6);
});

test('elbowRoute leaves along the dominant axis', () => {
  assert.deepEqual(geo.elbowRoute([0, 0], [100, 40]), [[0, 0], [50, 0], [50, 40], [100, 40]]);
  assert.deepEqual(geo.elbowRoute([0, 0], [40, 100]), [[0, 0], [0, 50], [40, 50], [40, 100]]);
  assert.deepEqual(geo.elbowRoute([0, 0], [100, 0]), [[0, 0], [100, 0]]);
});

test('pointAlongPolyline walks the whole length', () => {
  const pts = [[0, 0], [10, 0], [10, 10]];
  assert.deepEqual(geo.pointAlongPolyline(pts, 0), [0, 0]);
  assert.deepEqual(geo.pointAlongPolyline(pts, 0.5), [10, 0]);
  assert.deepEqual(geo.pointAlongPolyline(pts, 1), [10, 10]);
  assert.equal(geo.polylineLength(pts), 20);
});

test('simplifyPoints drops points a stroke does not need', () => {
  const straight = Array.from({ length: 50 }, (_, i) => [i, 0]);
  assert.deepEqual(geo.simplifyPoints(straight), [[0, 0], [49, 0]]);
  const corner = [[0, 0], [10, 0], [10, 10]];
  assert.equal(geo.simplifyPoints(corner).length, 3);
});

test('curveSegments produces one cubic per gap', () => {
  const segments = geo.curveSegments([[0, 0], [10, 10], [20, 0]]);
  assert.equal(segments.length, 2);
  assert.deepEqual(segments[1][2], [20, 0]);
});
