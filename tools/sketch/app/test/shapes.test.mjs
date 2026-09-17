// Path building, arrowheads, dashes, snapping and the shape library -
// the pieces the canvas and the exporter share.
import './_register.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const shapes = await import('../src/lib/shapes.ts');
const snap = await import('../src/lib/snap.ts');
const library = await import('../src/lib/library.ts');
const palette = await import('../src/lib/palette.ts');
const { createElement } = await import('../src/lib/document.ts');

test('a straight line is moves and lines; a curve is cubics', () => {
  const straight = createElement('line', { x: 0, y: 0, points: [[0, 0], [10, 0], [10, 10]] });
  assert.deepEqual(shapes.linearCommands(straight).map((c) => c[0]), ['M', 'L', 'L']);
  const curved = { ...straight, edge: 'curved' };
  assert.deepEqual(shapes.linearCommands(curved).map((c) => c[0]), ['M', 'C', 'C']);
  const freehand = createElement('draw', { x: 0, y: 0, points: [[0, 0], [5, 5], [10, 0]] });
  assert.deepEqual(shapes.linearCommands(freehand).map((c) => c[0]), ['M', 'C', 'C']);
});

test('path data is rounded to two decimals and never signs a zero', () => {
  const el = createElement('line', { x: 0, y: 0, points: [[0, 0], [1.23456, -0.0001]] });
  const d = shapes.commandsToPathData(shapes.linearCommands(el));
  assert.equal(d, 'M0 0 L1.23 0');
});

test('dash patterns scale with the pen', () => {
  assert.deepEqual(shapes.dashPattern('solid', 3), []);
  assert.deepEqual(shapes.dashPattern('dashed', 1), [3.2, 2.4]);
  assert.ok(shapes.dashPattern('dotted', 3)[0] < 0.1, 'a dot is a round cap on a zero-length dash');
});

test('an arrowhead points back along the line', () => {
  const head = shapes.arrowHeadGeometry([100, 0], [0, 0], 'arrow', 2);
  assert.equal(head.points.length, 3);
  assert.deepEqual(head.points[1], [100, 0]);
  for (const wing of [head.points[0], head.points[2]]) assert.ok(wing[0] < 100, 'the wings sit behind the tip');
  assert.equal(shapes.arrowHeadGeometry([0, 0], [0, 0], 'none', 2), null);
});

test('dot and bar heads have the geometry their renderers need', () => {
  const dot = shapes.arrowHeadGeometry([10, 10], [0, 0], 'dot', 4);
  assert.deepEqual(dot.center, [10, 10]);
  assert.ok(dot.radius >= 2.4);
  const bar = shapes.arrowHeadGeometry([10, 0], [0, 0], 'bar', 2);
  assert.equal(bar.points.length, 2);
  assert.equal(bar.points[0][0], 10, 'a bar crosses the line at right angles');
});

test('headsFor reads both ends of an element', () => {
  const arrow = createElement('arrow', { x: 0, y: 0, points: [[0, 0], [50, 0]], startArrow: 'dot', endArrow: 'arrow' });
  const { start, end } = shapes.headsFor(arrow);
  assert.equal(start.kind, 'dot');
  assert.equal(end.kind, 'arrow');
  assert.deepEqual(end.points[1], [50, 0]);
});

test('cornerRadius never exceeds half the shorter side', () => {
  assert.equal(shapes.cornerRadius(createElement('rect', { x: 0, y: 0, w: 100, h: 40, roundness: 0.5 })), 20);
  assert.equal(shapes.cornerRadius(createElement('rect', { x: 0, y: 0, w: 100, h: 40, roundness: 0 })), 0);
});

test('snapToElements aligns edges and centres and reports guides', () => {
  const moving = { x: 103, y: 0, w: 50, h: 50 };
  const target = { x: 100, y: 200, w: 50, h: 50 };
  const result = snap.snapToElements(moving, [target], 6);
  assert.equal(result.dx, -3);
  assert.equal(result.dy, 0);
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0].x, 100);
});

test('nothing within reach means no pull at all', () => {
  const result = snap.snapToElements({ x: 500, y: 500, w: 10, h: 10 }, [{ x: 0, y: 0, w: 10, h: 10 }], 6);
  assert.deepEqual([result.dx, result.dy, result.lines.length], [0, 0, 0]);
});

test('snapDrag falls back to the grid on the axis nothing aligned with', () => {
  const result = snap.snapDrag({ x: 103, y: 47, w: 50, h: 50 }, [{ x: 100, y: 500, w: 50, h: 50 }], { grid: 10 });
  assert.equal(result.dx, -3, 'the element edge won on x');
  assert.equal(result.dy, 3, 'the grid took y');
});

test('the library builds every item as one group of real elements', () => {
  for (const item of library.LIBRARY) {
    const built = library.insertLibraryItem(item.id, [0, 0]);
    assert.ok(built.length >= 1, `${item.id} built nothing`);
    if (built.length > 1) {
      const groups = new Set(built.map((el) => el.groupId));
      assert.equal(groups.size, 1, `${item.id} is not one group`);
      assert.notEqual([...groups][0], null);
    }
    for (const el of built) assert.ok(Number.isFinite(el.x) && Number.isFinite(el.y));
  }
});

test('an inserted item is centred on the point it was asked for', () => {
  const built = library.insertLibraryItem('process', [500, 300]);
  const el = built[0];
  assert.equal(el.x + el.w / 2, 500);
  assert.equal(el.y + el.h / 2, 300);
  assert.equal(library.insertLibraryItem('nothing-like-this', [0, 0]).length, 0);
});

test('searching the library ranks names before keywords', () => {
  assert.equal(library.searchLibrary('deci')[0].id, 'decision');
  assert.equal(library.searchLibrary('actor')[0].id, 'person');
  assert.deepEqual(library.searchLibrary('zzz'), []);
  assert.equal(library.searchLibrary('').length, library.LIBRARY.length);
});

test('the two palettes map onto each other so a board survives a theme change', () => {
  assert.equal(palette.translateColor('#1e1e1e', true), '#e6e7ea');
  assert.equal(palette.translateColor('#e6e7ea', false), '#1e1e1e');
  assert.equal(palette.translateColor('#123456', true), '#123456', 'a custom colour is left alone');
  assert.equal(palette.LIGHT.strokes.length, palette.DARK.strokes.length);
  assert.equal(palette.LIGHT.fills.length, palette.DARK.fills.length);
});

test('hex input is normalised and nonsense refused', () => {
  assert.equal(palette.normalizeHex('FF0000'), '#ff0000');
  assert.equal(palette.normalizeHex(' #ABC '), '#abc');
  assert.equal(palette.normalizeHex('nope'), null);
  assert.equal(palette.isHexColor('#ff00ff'), true);
});

test('readableTextOn picks a legible ink for a fill', () => {
  assert.equal(palette.readableTextOn('#ffffff'), '#1e1e1e');
  assert.equal(palette.readableTextOn('#101010'), '#ffffff');
  assert.ok(palette.luminance('#ffffff') > palette.luminance('#808080'));
});
