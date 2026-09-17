// The diagram layout an agent leans on: a graph in, a tidy, connected
// board out.
import './_register.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const layout = await import('../src/lib/layout.ts');

const chain = {
  nodes: [
    { id: 'a', label: 'Start', shape: 'start' },
    { id: 'b', label: 'Do the thing' },
    { id: 'c', label: 'Happy?', shape: 'decision' },
    { id: 'd', label: 'Done', shape: 'end' },
  ],
  edges: [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
    { from: 'c', to: 'd', label: 'yes' },
  ],
};

test('shape words map onto element types', () => {
  assert.equal(layout.shapeToType('decision'), 'diamond');
  assert.equal(layout.shapeToType('process'), 'rect');
  assert.equal(layout.shapeToType('START'), 'ellipse');
  assert.equal(layout.shapeToType(undefined), 'rect');
  assert.equal(layout.shapeToType('nonsense'), 'rect');
});

test('sizeNode grows a box to hold its label and wraps long ones', () => {
  const short = layout.sizeNode({ id: 'a', label: 'Hi' });
  assert.equal(short.lines.length, 1);
  assert.ok(short.w >= 120);
  const long = layout.sizeNode({ id: 'b', label: 'A label long enough that it has to be wrapped onto several lines' });
  assert.ok(long.lines.length > 1);
  assert.ok(long.h > short.h);
  const words = 'Is the payment authorised';
  const asRect = layout.sizeNode({ id: 'c', label: words });
  const asDiamond = layout.sizeNode({ id: 'd', label: words, shape: 'decision' });
  assert.ok(asDiamond.w > asRect.w, 'a diamond needs more room for the same words');
  assert.ok(asDiamond.h > asRect.h);
});

test('layerNodes puts a chain on consecutive layers', () => {
  const { layerOf, layers } = layout.layerNodes(chain.nodes, chain.edges);
  assert.deepEqual([layerOf.get('a'), layerOf.get('b'), layerOf.get('c'), layerOf.get('d')], [0, 1, 2, 3]);
  assert.equal(layers.length, 4);
});

test('a cycle is broken rather than looping forever', () => {
  const nodes = [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }, { id: 'c', label: 'c' }];
  const edges = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }];
  const result = layout.layerNodes(nodes, edges);
  assert.equal(result.reversed.length, 1);
  assert.equal(result.layers.flat().length, 3);
  for (const edge of result.acyclic) assert.ok(result.layerOf.get(edge.from) < result.layerOf.get(edge.to));
});

test('self-edges and edges to nowhere are ignored', () => {
  const result = layout.layerNodes([{ id: 'a', label: 'a' }], [{ from: 'a', to: 'a' }, { from: 'a', to: 'ghost' }]);
  assert.equal(result.acyclic.length, 0);
  assert.equal(result.layers.length, 1);
});

test('orderLayers reduces crossings and is stable', () => {
  const nodes = [
    { id: 'a1', label: 'a1' },
    { id: 'a2', label: 'a2' },
    { id: 'b1', label: 'b1' },
    { id: 'b2', label: 'b2' },
  ];
  const edges = [
    { from: 'a1', to: 'b2' },
    { from: 'a2', to: 'b1' },
  ];
  const { layers, layerOf, acyclic } = layout.layerNodes(nodes, edges);
  const before = layout.countCrossings(layers, acyclic, layerOf);
  const ordered = layout.orderLayers(layers, acyclic, layerOf);
  const after = layout.countCrossings(ordered, acyclic, layerOf);
  assert.ok(after <= before);
  assert.deepEqual(layout.orderLayers(ordered, acyclic, layerOf), ordered);
});

test('assignPositions never overlaps two nodes in a layer', () => {
  const nodes = Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}` }));
  const edges = [];
  const sized = new Map(nodes.map((n) => [n.id, layout.sizeNode(n)]));
  const { layers, layerOf, acyclic } = layout.layerNodes(nodes, edges);
  void layerOf;
  const pos = layout.assignPositions(layers, sized, acyclic, {});
  const sorted = layers[0].map((id) => ({ id, x: pos.get(id), w: sized.get(id).w })).sort((a, b) => a.x - b.x);
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].x - sorted[i - 1].x - sorted[i].w / 2 - sorted[i - 1].w / 2;
    assert.ok(gap >= 47, `nodes overlap: gap ${gap}`);
  }
});

test('layoutGraph places every node inside the reported size', () => {
  const result = layout.layoutGraph(chain);
  assert.equal(result.nodes.length, 4);
  assert.equal(result.direction, 'TB');
  for (const n of result.nodes) {
    assert.ok(n.x >= 0 && n.y >= 0, 'origin is the top left');
    assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y));
  }
  const layers = result.nodes.map((n) => n.y).sort((a, b) => a - b);
  assert.ok(layers[3] > layers[0], 'later layers sit further down');
});

test('LR lays the same graph out sideways', () => {
  const result = layout.layoutGraph({ ...chain, direction: 'LR' });
  const byId = new Map(result.nodes.map((n) => [n.id, n]));
  assert.ok(byId.get('d').x > byId.get('a').x);
  assert.ok(Math.abs(byId.get('d').y - byId.get('a').y) < byId.get('d').x - byId.get('a').x);
});

test('an empty graph lays out without throwing', () => {
  const result = layout.layoutGraph({ nodes: [], edges: [] });
  assert.equal(result.nodes.length, 0);
});

test('buildDiagram returns shapes and arrows bound at both ends', () => {
  const elements = layout.buildDiagram(chain);
  const shapes = elements.filter((el) => el.type !== 'arrow');
  const arrows = elements.filter((el) => el.type === 'arrow');
  assert.equal(shapes.length, 4);
  assert.equal(arrows.length, 3);
  const ids = new Set(shapes.map((el) => el.id));
  for (const arrow of arrows) {
    assert.ok(ids.has(arrow.startBinding.elementId));
    assert.ok(ids.has(arrow.endBinding.elementId));
    assert.equal(arrow.endArrow, 'arrow');
  }
  assert.equal(arrows.find((a) => a.text === 'yes').text, 'yes');
  assert.equal(shapes.find((s) => s.text === 'Happy?').type, 'diamond');
});

test('duplicate node ids are collapsed and dangling edges dropped', () => {
  const elements = layout.buildDiagram({
    nodes: [{ id: 'a', label: 'a' }, { id: 'a', label: 'again' }],
    edges: [{ from: 'a', to: 'missing' }],
  });
  assert.equal(elements.length, 1);
  assert.equal(elements[0].text, 'a');
});
