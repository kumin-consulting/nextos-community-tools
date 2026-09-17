// The file format. Reading must never throw and never lose work: every
// path through parseDocument is exercised here, including the ones a
// half-written file takes.
import './_register.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const doc = await import('../src/lib/document.ts');

test('newId is unique across a burst', () => {
  const ids = new Set(Array.from({ length: 5000 }, () => doc.newId()));
  assert.equal(ids.size, 5000);
  assert.match(doc.newId('g'), /^g/);
});

test('createElement fills every field and normalises a linear element', () => {
  const rect = doc.createElement('rect', { x: 1, y: 2, w: 3, h: 4 });
  assert.equal(rect.type, 'rect');
  assert.equal(rect.opacity, 1);
  assert.equal(rect.points.length, 0);
  const arrow = doc.createElement('arrow', { x: 0, y: 0, points: [[10, 10], [30, 50]] });
  assert.deepEqual(arrow.points, [[0, 0], [20, 40]]);
  assert.deepEqual([arrow.x, arrow.y, arrow.w, arrow.h], [10, 10, 20, 40]);
});

test('a document round-trips through serialize and parse', () => {
  const original = doc.createDocument('Plan', [
    doc.createElement('rect', { x: 10, y: 20, w: 100, h: 50, text: 'Hello', fill: '#d6e6fb', fillStyle: 'solid' }),
    doc.createElement('arrow', { x: 0, y: 0, points: [[0, 0], [50, 0]], endArrow: 'arrow' }),
  ]);
  const text = doc.serializeDocument(original);
  const parsed = doc.parseDocument(text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.doc.name, 'Plan');
  assert.equal(parsed.doc.elements.length, 2);
  assert.equal(parsed.doc.elements[0].text, 'Hello');
  assert.equal(parsed.dropped, 0);
  assert.equal(parsed.migrated, false);
  assert.deepEqual(parsed.doc.elements[1].points, [[0, 0], [50, 0]]);
});

test('broken JSON produces a readable problem, not an exception', () => {
  const result = doc.parseDocument('{"type":"sketch", "elements": [');
  assert.equal(result.ok, false);
  assert.match(result.error, /not valid JSON/);
  assert.equal(result.raw, '{"type":"sketch", "elements": [');
});

test('a file from another app is refused by name', () => {
  const result = doc.parseDocument(JSON.stringify({ type: 'kanban', elements: [] }));
  assert.equal(result.ok, false);
  assert.match(result.error, /"kanban" file/);
});

test('a sketch file with no elements list is refused', () => {
  const result = doc.parseDocument(JSON.stringify({ type: 'sketch', version: 1 }));
  assert.equal(result.ok, false);
  assert.match(result.error, /no "elements" list/);
});

test('a bare array of elements is migrated', () => {
  const result = doc.parseDocument(JSON.stringify([{ type: 'rect', x: 0, y: 0, w: 10, h: 10 }]), 'Old board');
  assert.equal(result.ok, true);
  assert.equal(result.migrated, true);
  assert.equal(result.doc.name, 'Old board');
  assert.equal(result.doc.elements.length, 1);
});

test('unreadable elements are dropped and counted, the rest survive', () => {
  const result = doc.parseDocument(
    JSON.stringify({
      type: 'sketch',
      version: 1,
      elements: [{ type: 'rect', x: 0, y: 0, w: 10, h: 10 }, null, 'nonsense', { type: 'line' }, { type: 'arrow', points: [[0, 0], [1, 1]] }],
    })
  );
  assert.equal(result.ok, true);
  assert.equal(result.dropped, 3);
  assert.equal(result.doc.elements.length, 2);
});

test('nonsense field values fall back instead of poisoning the board', () => {
  const el = doc.coerceElement({ type: 'wat', x: 'nope', w: -50, opacity: 12, fontSize: -3, strokeStyle: 'zigzag', points: [[1, 'x'], [2, 3]] });
  assert.equal(el.type, 'rect');
  assert.equal(el.x, 0);
  assert.equal(el.w, 0);
  assert.equal(el.opacity, 1);
  assert.equal(el.fontSize, 6);
  assert.equal(el.strokeStyle, 'solid');
});

test('duplicate ids are made unique on load', () => {
  const result = doc.parseDocument(
    JSON.stringify({ type: 'sketch', elements: [{ id: 'same', type: 'rect' }, { id: 'same', type: 'ellipse' }] })
  );
  assert.equal(result.ok, true);
  assert.notEqual(result.doc.elements[0].id, result.doc.elements[1].id);
});

test('the viewport is clamped to something usable', () => {
  const result = doc.parseDocument(JSON.stringify({ type: 'sketch', elements: [], view: { scrollX: 'x', zoom: 9999 } }));
  assert.equal(result.doc.view.scrollX, 0);
  assert.equal(result.doc.view.zoom, 30);
});

test('sanitizeName keeps human punctuation and drops path separators', () => {
  assert.equal(doc.sanitizeName('Q3 plan, v2'), 'Q3 plan, v2');
  assert.equal(doc.sanitizeName('a/b:c*d?'), 'a b c d');
  assert.equal(doc.sanitizeName('   '), 'Untitled');
  assert.equal(doc.sanitizeName('...hidden'), 'hidden');
  assert.equal(doc.sanitizeName('x'.repeat(200)).length, 80);
});

test('file names and board names convert both ways', () => {
  assert.equal(doc.fileNameFor('My board'), 'My board.sketch.json');
  assert.equal(doc.nameFromFileName('My board.sketch.json'), 'My board');
  assert.equal(doc.documentPath('/home/user/Sketches', 'My board'), '/home/user/Sketches/My board.sketch.json');
  assert.equal(doc.isSketchFile('notes.txt'), false);
  assert.equal(doc.isSketchFile('a.sketch.json'), true);
});

test('uniqueName counts up past names already taken, ignoring case', () => {
  assert.equal(doc.uniqueName(['Board'], 'Board'), 'Board 2');
  assert.equal(doc.uniqueName(['board', 'Board 2'], 'Board'), 'Board 3');
  assert.equal(doc.uniqueName([], 'Board'), 'Board');
});

test('describeDocument reads a diagram back in words', () => {
  const box = doc.createElement('rect', { x: 0, y: 0, w: 100, h: 50, text: 'Start' });
  const other = doc.createElement('rect', { x: 200, y: 0, w: 100, h: 50, text: 'Finish' });
  const arrow = doc.createElement('arrow', {
    x: 100,
    y: 25,
    points: [[0, 0], [100, 0]],
    text: 'then',
    startBinding: { elementId: box.id, gap: 4 },
    endBinding: { elementId: other.id, gap: 4 },
  });
  const frame = doc.createElement('frame', { x: -10, y: -10, w: 400, h: 200, name: 'Overview' });
  const text = doc.describeDocument(doc.createDocument('Flow', [box, other, arrow, frame]));
  assert.match(text, /Board "Flow" - 4 elements/);
  assert.match(text, /Frames: "Overview"/);
  assert.match(text, /"Start" -> "Finish" labelled "then"/);
  assert.match(text, /rectangle "Start" at \(0, 0\), 100x50/);
  assert.match(doc.describeDocument(doc.createDocument('Empty')), /The board is empty/);
});
