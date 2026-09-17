// SVG export: real elements, real text, and nothing that would break a
// parser downstream.
import './_register.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const svg = await import('../src/lib/svg.ts');
const { createDocument, createElement } = await import('../src/lib/document.ts');

test('shapes leave as their native SVG elements', () => {
  const out = svg.elementsToSvg([
    createElement('rect', { x: 0, y: 0, w: 100, h: 50, roundness: 0 }),
    createElement('ellipse', { x: 200, y: 0, w: 100, h: 50 }),
    createElement('diamond', { x: 400, y: 0, w: 100, h: 50 }),
  ]);
  assert.match(out, /<rect /);
  assert.match(out, /<ellipse [^>]*cx="250"/);
  assert.match(out, /<polygon [^>]*points="450,0 500,25 450,50 400,25"/);
  assert.doesNotMatch(out, /<image/);
});

test('the document declares itself and its viewBox', () => {
  const out = svg.elementsToSvg([createElement('rect', { x: 0, y: 0, w: 100, h: 100 })], { padding: 10, title: 'Board' });
  assert.match(out, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(out, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(out, /viewBox="-10 -10 120 120"/);
  assert.match(out, /width="120" height="120"/);
  assert.match(out, /<title>Board<\/title>/);
});

test('scale multiplies the pixel size but not the viewBox', () => {
  const out = svg.elementsToSvg([createElement('rect', { x: 0, y: 0, w: 100, h: 100 })], { padding: 0, scale: 2 });
  assert.match(out, /width="200" height="200"/);
  assert.match(out, /viewBox="0 0 100 100"/);
});

test('text becomes <text> with one <tspan> per line', () => {
  const out = svg.elementsToSvg([createElement('text', { x: 0, y: 0, w: 100, h: 60, text: 'one\ntwo', fontSize: 20 })]);
  assert.match(out, /<text /);
  const tspans = out.match(/<tspan/g) ?? [];
  assert.equal(tspans.length, 2);
  assert.match(out, />one<\/tspan>/);
});

test('XML special characters are escaped everywhere they appear', () => {
  const out = svg.elementsToSvg([createElement('text', { x: 0, y: 0, w: 10, h: 10, text: 'a < b & "c"' })], { title: '<board>' });
  assert.match(out, /a &lt; b &amp; &quot;c&quot;/);
  assert.match(out, /<title>&lt;board&gt;<\/title>/);
  const textOnly = out
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<\/?(svg|text|tspan|title|rect|g|path|defs|pattern|line|ellipse|polygon|circle)[^>]*>/g, '');
  assert.doesNotMatch(textOnly, /[<>]/);
});

test('a dashed stroke and an opacity survive', () => {
  const out = svg.elementsToSvg([createElement('rect', { x: 0, y: 0, w: 10, h: 10, strokeStyle: 'dashed', strokeWidth: 3, opacity: 0.5 })]);
  assert.match(out, /stroke-dasharray="9\.6 7\.2"/);
  assert.match(out, /opacity="0\.5"/);
});

test('a hatched fill defines one pattern per colour and reuses it', () => {
  const hatched = (x) => createElement('rect', { x, y: 0, w: 10, h: 10, fill: '#ff0000', fillStyle: 'hatch' });
  const out = svg.elementsToSvg([hatched(0), hatched(50)]);
  assert.equal((out.match(/<pattern /g) ?? []).length, 1);
  assert.equal((out.match(/url\(#hatch-1\)/g) ?? []).length, 2);
});

test('a rotated element is wrapped in one rotate transform', () => {
  const out = svg.elementsToSvg([createElement('rect', { x: 0, y: 0, w: 100, h: 100, angle: Math.PI / 2 })]);
  assert.match(out, /<g transform="rotate\(90 50 50\)">/);
});

test('an arrow draws a path plus its head', () => {
  const out = svg.elementsToSvg([createElement('arrow', { x: 0, y: 0, points: [[0, 0], [100, 0]], endArrow: 'arrow' })]);
  const paths = out.match(/<path /g) ?? [];
  assert.equal(paths.length, 2, 'the shaft and the head');
  assert.match(out, /d="M0 0 L100 0"/);
});

test('a curved connector exports as cubics, an elbow as corners', () => {
  const curved = svg.elementsToSvg([createElement('line', { x: 0, y: 0, edge: 'curved', points: [[0, 0], [50, 40], [100, 0]] })]);
  assert.match(curved, /d="M0 0 C/);
  const elbow = svg.elementsToSvg([createElement('line', { x: 0, y: 0, edge: 'elbow', points: [[0, 0], [100, 40]] })]);
  assert.match(elbow, /d="M0 0 L50 0 L50 40 L100 40"/);
});

test('a dot head is a circle, a bar head a short path', () => {
  const dot = svg.elementsToSvg([createElement('arrow', { x: 0, y: 0, points: [[0, 0], [50, 0]], endArrow: 'dot' })]);
  assert.match(dot, /<circle /);
  const bar = svg.elementsToSvg([createElement('arrow', { x: 0, y: 0, points: [[0, 0], [50, 0]], startArrow: 'bar' })]);
  assert.match(bar, /<path [^>]*d="M0 /);
});

test('the background is optional and drawn behind everything', () => {
  const withBg = svg.elementsToSvg([createElement('rect', { x: 0, y: 0, w: 10, h: 10 })], { background: '#ffffff', padding: 0 });
  assert.ok(withBg.indexOf('fill="#ffffff"') < withBg.indexOf('stroke="#1e1e1e"'), 'the paper is drawn first');
  const without = svg.elementsToSvg([createElement('rect', { x: 0, y: 0, w: 10, h: 10 })], { padding: 0 });
  assert.doesNotMatch(without, /fill="#ffffff"/);
});

test('frames are drawn under their contents', () => {
  const frame = createElement('frame', { x: 0, y: 0, w: 200, h: 200, name: 'Sheet' });
  const rect = createElement('rect', { x: 20, y: 20, w: 40, h: 40 });
  const out = svg.elementsToSvg([rect, frame], { frameStroke: '#999999' });
  assert.ok(out.indexOf('#999999') < out.indexOf('<rect x="20"'));
  assert.match(out, />Sheet<\/tspan>/);
});

test('an empty board still produces a valid file', () => {
  const out = svg.elementsToSvg([]);
  assert.match(out, /<svg /);
  assert.match(out, /<\/svg>/);
});

test('documentToSvg titles the file with the board name', () => {
  const out = svg.documentToSvg(createDocument('My plan', [createElement('rect', { x: 0, y: 0, w: 10, h: 10 })]));
  assert.match(out, /<title>My plan<\/title>/);
});

test('exportBounds pads the content', () => {
  const b = svg.exportBounds([createElement('rect', { x: 10, y: 10, w: 10, h: 10 })], 5);
  assert.deepEqual(b, { x: 5, y: 5, w: 20, h: 20 });
});
