// Text: wrapping, measuring and where a label ends up - the numbers the
// canvas, the textarea overlay and the SVG all position themselves from.
import './_register.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const text = await import('../src/lib/text.ts');
const textLayout = await import('../src/lib/textLayout.ts');
const { createElement } = await import('../src/lib/document.ts');

// A measurer with round numbers, so the expectations below are readable.
const each = (n) => (s) => s.length * n;
const measure10 = (s) => each(10)(s);
const layoutMeasure = (s) => measure10(s);

test('wrapText breaks on words and keeps explicit newlines', () => {
  assert.deepEqual(text.wrapText('one two three', 100, measure10), ['one two', 'three']);
  assert.deepEqual(text.wrapText('a\n\nb', 100, measure10), ['a', '', 'b']);
  assert.deepEqual(text.wrapText('', 100, measure10), ['']);
});

test('a word longer than the line is broken rather than overflowing', () => {
  const lines = text.wrapText('supercalifragilistic', 50, measure10);
  assert.ok(lines.length > 1);
  for (const line of lines) assert.ok(measure10(line) <= 50, `"${line}" overflows`);
});

test('estimateTextWidth scales with size and knows narrow from wide', () => {
  const wide = text.estimateTextWidth('MMMM', 20);
  const narrow = text.estimateTextWidth('iiii', 20);
  assert.ok(wide > narrow * 2);
  assert.ok(text.estimateTextWidth('hello', 40) > text.estimateTextWidth('hello', 20) * 1.9);
  assert.equal(text.estimateTextWidth('abcd', 10, 'mono'), 4 * 10 * 0.6);
});

test('lineHeight and measureBlock describe the whole block', () => {
  assert.equal(text.lineHeightFor(20), 25);
  const block = text.measureBlock(['aa', 'bbbb'], 20, measure10);
  assert.deepEqual(block, { width: 40, height: 50 });
});

test('text in a container is centred both ways and wrapped to the box', () => {
  const box = createElement('rect', { x: 0, y: 0, w: 120, h: 100, text: 'one two three four', fontSize: 20, textAlign: 'center' });
  const layout = textLayout.elementTextLayout(box, layoutMeasure);
  assert.ok(layout.lines.length > 1);
  assert.equal(layout.align, 'center');
  assert.equal(layout.anchorX, 60, 'centred on the shape');
  const middle = layout.y + layout.height / 2;
  assert.equal(middle, 50, 'and centred vertically');
});

test('a free text element grows sideways and never re-wraps itself', () => {
  const el = createElement('text', { x: 10, y: 20, w: 5, h: 5, text: 'a long single line', fontSize: 20, textAlign: 'left' });
  const layout = textLayout.elementTextLayout(el, layoutMeasure);
  assert.equal(layout.lines.length, 1);
  assert.equal(layout.anchorX, 10);
  assert.equal(layout.width, measure10('a long single line'));
});

test('an arrow label sits on the midpoint of the route', () => {
  const arrow = createElement('arrow', { x: 0, y: 0, points: [[0, 0], [100, 0]], text: 'yes', fontSize: 20 });
  const layout = textLayout.elementTextLayout(arrow, layoutMeasure);
  assert.equal(layout.anchorX, 50);
  assert.equal(layout.y + layout.height / 2, 0);
});

test('a frame puts its name on the strip above it', () => {
  const frame = createElement('frame', { x: 30, y: 60, w: 300, h: 200, name: 'Sheet one', fontSize: 16 });
  const layout = textLayout.elementTextLayout(frame, layoutMeasure);
  assert.equal(layout.align, 'left');
  assert.equal(layout.anchorX, 30);
  assert.ok(layout.y < 60, 'above the frame, not inside it');
});

test('an element with no text has no layout at all', () => {
  assert.equal(textLayout.elementTextLayout(createElement('rect', { x: 0, y: 0, w: 10, h: 10 }), layoutMeasure), null);
});

test('innerWidth leaves room for a diamond and an ellipse', () => {
  const w = 200;
  const rect = createElement('rect', { x: 0, y: 0, w, h: 100 });
  const diamond = createElement('diamond', { x: 0, y: 0, w, h: 100 });
  const ellipse = createElement('ellipse', { x: 0, y: 0, w, h: 100 });
  assert.ok(textLayout.innerWidth(diamond) < textLayout.innerWidth(ellipse));
  assert.ok(textLayout.innerWidth(ellipse) < textLayout.innerWidth(rect));
});

test('requiredHeight grows a shape that has more text than room', () => {
  const box = createElement('rect', { x: 0, y: 0, w: 100, h: 30, text: 'one two three four five six', fontSize: 20 });
  assert.ok(textLayout.requiredHeight(box, layoutMeasure) > 30);
});
