// Undo: one gesture must be one step, and a selection change must be no
// step at all.
import './_register.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const h = await import('../src/lib/history.ts');
const { createElement } = await import('../src/lib/document.ts');

const snap = (elements, selectedIds = []) => ({ elements, selectedIds });
const a = createElement('rect', { x: 0, y: 0, w: 10, h: 10 });
const b = createElement('rect', { x: 20, y: 0, w: 10, h: 10 });

test('a fresh history has nothing to undo', () => {
  const history = h.createHistory(snap([a]));
  assert.equal(h.canUndo(history), false);
  assert.equal(h.canRedo(history), false);
  assert.equal(h.currentSnapshot(history).elements[0], a);
});

test('records that share a key inside the window collapse into one step', () => {
  let history = h.createHistory(snap([a]));
  for (let i = 1; i <= 20; i++) {
    history = h.record(history, snap([{ ...a, x: i }]), { label: 'Move', coalesceKey: 'move', now: 1000 + i * 10 });
  }
  assert.equal(history.past.length, 1);
  history = h.undo(history);
  assert.equal(h.currentSnapshot(history).elements[0].x, 0);
});

test('a pause past the window starts a new step', () => {
  let history = h.createHistory(snap([a]));
  history = h.record(history, snap([{ ...a, x: 1 }]), { coalesceKey: 'move', now: 0 });
  history = h.record(history, snap([{ ...a, x: 2 }]), { coalesceKey: 'move', now: 5000 });
  assert.equal(history.past.length, 2);
});

test('seal ends the run so the next edit is its own step', () => {
  let history = h.createHistory(snap([a]));
  history = h.record(history, snap([{ ...a, x: 1 }]), { coalesceKey: 'move', now: 0 });
  history = h.seal(history);
  history = h.record(history, snap([{ ...a, x: 2 }]), { coalesceKey: 'move', now: 10 });
  assert.equal(history.past.length, 2);
});

test('a selection-only change updates in place and makes no step', () => {
  let history = h.createHistory(snap([a], []));
  history = h.record(history, snap([a], [a.id]));
  assert.equal(history.past.length, 0);
  assert.deepEqual(h.currentSnapshot(history).selectedIds, [a.id]);
});

test('undo and redo walk the stack and redo is dropped by a new edit', () => {
  let history = h.createHistory(snap([a]));
  history = h.record(history, snap([a, b]), { label: 'Add' });
  history = h.undo(history);
  assert.equal(h.currentSnapshot(history).elements.length, 1);
  assert.equal(h.canRedo(history), true);
  history = h.redo(history);
  assert.equal(h.currentSnapshot(history).elements.length, 2);
  history = h.undo(history);
  history = h.record(history, snap([a, a]), { label: 'Other' });
  assert.equal(h.canRedo(history), false);
});

test('undo past the beginning and redo past the end are no-ops', () => {
  const history = h.createHistory(snap([a]));
  assert.equal(h.undo(history), history);
  assert.equal(h.redo(history), history);
});

test('the stack is capped and drops the oldest step', () => {
  let history = h.createHistory(snap([a]), 5);
  for (let i = 1; i <= 20; i++) history = h.record(history, snap([{ ...a, x: i }]), { label: `step ${i}` });
  assert.equal(history.past.length, 5);
  assert.deepEqual(h.undoLabels(history)[0], 'step 19');
});

test('recording the identical snapshot changes nothing', () => {
  const history = h.createHistory(snap([a], [a.id]));
  assert.equal(h.record(history, snap([a], [a.id])), history);
});
