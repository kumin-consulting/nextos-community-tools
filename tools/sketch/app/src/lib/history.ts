// Undo/redo over whole-scene snapshots, with coalescing so a continuous
// gesture (a drag, a slider, a run of typing) collapses into one step.
//
// Snapshots are cheap because every mutation in this app is structural:
// unchanged elements keep their object identity, so a snapshot is an
// array of mostly-shared references, not a deep copy.

import { type SketchElement } from './types';

export interface Snapshot {
  elements: SketchElement[];
  selectedIds: string[];
}

export interface HistoryEntry {
  snapshot: Snapshot;
  label: string;
  /** Records sharing a key within `window` ms fold into one step. */
  key: string | null;
  at: number;
}

export interface History {
  past: HistoryEntry[];
  present: HistoryEntry;
  future: HistoryEntry[];
  limit: number;
  /** Coalescing window in milliseconds. */
  window: number;
}

export interface RecordOptions {
  label?: string;
  coalesceKey?: string | null;
  now?: number;
}

export const DEFAULT_LIMIT = 200;
export const DEFAULT_WINDOW = 900;

export function createHistory(snapshot: Snapshot, limit = DEFAULT_LIMIT, window = DEFAULT_WINDOW): History {
  return { past: [], present: { snapshot, label: 'Open', key: null, at: 0 }, future: [], limit, window };
}

/** Cheap structural comparison: identical arrays of identical references
 *  mean nothing happened, so no history entry is worth making. */
export function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  if (a === b) return true;
  if (a.elements.length !== b.elements.length) return false;
  for (let i = 0; i < a.elements.length; i++) if (a.elements[i] !== b.elements[i]) return false;
  if (a.selectedIds.length !== b.selectedIds.length) return false;
  for (let i = 0; i < a.selectedIds.length; i++) if (a.selectedIds[i] !== b.selectedIds[i]) return false;
  return true;
}

/** Same but ignoring selection: an undo step should not exist purely
 *  because the selection changed. */
function sameElements(a: Snapshot, b: Snapshot): boolean {
  if (a.elements.length !== b.elements.length) return false;
  for (let i = 0; i < a.elements.length; i++) if (a.elements[i] !== b.elements[i]) return false;
  return true;
}

export function record(history: History, snapshot: Snapshot, opts: RecordOptions = {}): History {
  const now = opts.now ?? Date.now();
  const key = opts.coalesceKey ?? null;
  const label = opts.label ?? 'Edit';
  if (sameElements(history.present.snapshot, snapshot)) {
    // Selection-only change: update in place, never a new undo step.
    if (sameSnapshot(history.present.snapshot, snapshot)) return history;
    return { ...history, present: { ...history.present, snapshot } };
  }
  const canCoalesce = key !== null && history.present.key === key && now - history.present.at <= history.window;
  if (canCoalesce) {
    return { ...history, present: { snapshot, label, key, at: now }, future: [] };
  }
  const past = [...history.past, history.present];
  while (past.length > history.limit) past.shift();
  return { ...history, past, present: { snapshot, label, key, at: now }, future: [] };
}

export const canUndo = (h: History): boolean => h.past.length > 0;
export const canRedo = (h: History): boolean => h.future.length > 0;

export function undo(history: History): History {
  if (!history.past.length) return history;
  const past = history.past.slice();
  const previous = past.pop() as HistoryEntry;
  return { ...history, past, present: previous, future: [history.present, ...history.future] };
}

export function redo(history: History): History {
  if (!history.future.length) return history;
  const [next, ...rest] = history.future;
  return { ...history, past: [...history.past, history.present], present: next, future: rest };
}

export const currentSnapshot = (h: History): Snapshot => h.present.snapshot;

/** Ends the current coalescing run so the next edit always starts a new
 *  step (called on pointer-up, blur, and tool changes). */
export const seal = (history: History): History => ({ ...history, present: { ...history.present, key: null } });

/** Undo step labels, newest first - what a history menu would show. */
export const undoLabels = (h: History): string[] => h.past.map((e) => e.label).reverse();
