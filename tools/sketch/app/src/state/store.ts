// The app's single source of truth. One zustand store holds the board,
// the selection, the viewport, the undo stack and the file it came from;
// every action that changes elements goes through `commit`, which is the
// only place that records history, re-runs arrow bindings and schedules
// the autosave. The canvas subscribes imperatively and redraws in a
// requestAnimationFrame; React components subscribe with selectors, so a
// drag repaints the canvas without re-rendering the toolbar.

import { create } from 'zustand';
import sdk from '@kumin/sdk';
import {
  type ArrowHead,
  type EdgeShape,
  type ElementType,
  type FillStyle,
  type FontKey,
  type SketchElement,
  type StrokeStyle,
  type TextAlign,
  type Viewport,
} from '../lib/types';
import {
  type BackgroundStyle,
  type SketchDocument,
  createDocument,
  createElement,
  documentPath,
  newId,
  parseDocument,
  sanitizeName,
} from '../lib/document';
import { type History, canRedo, canUndo, createHistory, record, redo, seal, undo } from '../lib/history';
import { type Palette, paletteFor, translateColor } from '../lib/palette';
import { boundsOfElements, clamp, rotatedBounds, zoomAt } from '../lib/geometry';
import { pruneBindings, refreshBindings } from '../lib/binding';
import { type AlignMode, type DistributeAxis, type OrderMode, alignElements, distributeElements, expandSelection, flipElements, reorder } from '../lib/align';
import { insertLibraryItem } from '../lib/library';
import {
  type DocumentFile,
  deleteDocumentFile,
  ensureFolder,
  freeName,
  listDocuments,
  pathFor,
  readDocumentFile,
  renameDocumentFile,
  writeDocumentFile,
} from './files';

export type Tool = 'select' | 'hand' | 'rect' | 'ellipse' | 'diamond' | 'line' | 'arrow' | 'draw' | 'text' | 'sticky' | 'frame' | 'eraser';

export interface ElementStyle {
  stroke: string;
  fill: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  opacity: number;
  roundness: number;
  fontSize: number;
  fontFamily: FontKey;
  textAlign: TextAlign;
  textColor: string;
  edge: EdgeShape;
  startArrow: ArrowHead;
  endArrow: ArrowHead;
}

export type SaveState = 'saved' | 'saving' | 'dirty' | 'error';

export interface CorruptFile {
  path: string;
  name: string;
  error: string;
  raw: string;
}

export interface CommitOptions {
  label?: string;
  /** Edits sharing a key inside the history window fold into one step. */
  coalesce?: string | null;
  selectedIds?: string[];
  /** Skip the autosave (used when loading a file). */
  quiet?: boolean;
}

interface Dialogs {
  files: boolean;
  export: boolean;
  shortcuts: boolean;
  slash: boolean;
  minimap: boolean;
}

export interface SketchState {
  ready: boolean;
  isDark: boolean;
  palette: Palette;
  name: string;
  path: string | null;
  background: BackgroundStyle;
  createdAt: string;
  elements: SketchElement[];
  selectedIds: string[];
  tool: Tool;
  keepTool: boolean;
  viewport: Viewport;
  history: History;
  style: ElementStyle;
  editingId: string | null;
  /** Set by a keyboard shortcut to ask the canvas to edit an element's
   *  text; the canvas clears it once the editor is open. */
  editRequest: string | null;
  saveState: SaveState;
  saveError: string | null;
  files: DocumentFile[];
  recent: string[];
  corrupt: CorruptFile | null;
  dialogs: Dialogs;
  snapEnabled: boolean;
  status: string | null;

  /* actions */
  setDark(isDark: boolean): void;
  setTool(tool: Tool, keep?: boolean): void;
  setViewport(v: Viewport): void;
  zoomTo(zoom: number, at?: [number, number], size?: { width: number; height: number }): void;
  zoomToFit(size: { width: number; height: number }, onlySelection?: boolean): void;
  setSelection(ids: string[]): void;
  selectAll(): void;
  commit(elements: SketchElement[], opts?: CommitOptions): void;
  patchSelected(patch: Partial<SketchElement>, opts?: CommitOptions): void;
  setStyle(patch: Partial<ElementStyle>): void;
  addElements(elements: SketchElement[], opts?: { select?: boolean; label?: string; coalesce?: string | null }): void;
  deleteSelected(): void;
  duplicateSelected(): void;
  copySelection(cut?: boolean): void;
  paste(at?: [number, number]): void;
  group(): void;
  ungroup(): void;
  order(mode: OrderMode): void;
  align(mode: AlignMode): void;
  distribute(axis: DistributeAxis): void;
  flip(axis: 'horizontal' | 'vertical'): void;
  toggleLock(): void;
  nudge(dx: number, dy: number): void;
  undo(): void;
  redo(): void;
  seal(): void;
  setEditing(id: string | null): void;
  requestEdit(id: string | null): void;
  setBackground(background: BackgroundStyle): void;
  toggleSnap(): void;
  setDialog(key: keyof Dialogs, open: boolean): void;
  setStatus(message: string | null): void;
  insertLibrary(itemId: string, center: [number, number]): void;

  /* files */
  boot(): Promise<void>;
  refreshFiles(): Promise<void>;
  newDocument(name?: string): Promise<void>;
  openDocument(path: string): Promise<void>;
  renameDocument(name: string): Promise<void>;
  renameDocumentAt(path: string, name: string): Promise<void>;
  duplicateDocument(): Promise<void>;
  deleteDocument(path: string): Promise<void>;
  importDocument(text: string, name: string): Promise<void>;
  openCorruptAsCopy(): Promise<void>;
  save(): Promise<void>;
  flush(): Promise<void>;
}

const RECENT_KEY = 'recent';
const STYLE_KEY = 'style';
const PREFS_KEY = 'prefs';

export const defaultStyle = (palette: Palette): ElementStyle => ({
  stroke: palette.defaultStroke,
  fill: 'transparent',
  fillStyle: 'none',
  strokeWidth: 3,
  strokeStyle: 'solid',
  opacity: 1,
  roundness: 0.12,
  fontSize: 20,
  fontFamily: 'sans',
  textAlign: 'center',
  textColor: palette.defaultText,
  edge: 'straight',
  startArrow: 'none',
  endArrow: 'arrow',
});

const snapshotOf = (s: { elements: SketchElement[]; selectedIds: string[] }) => ({ elements: s.elements, selectedIds: s.selectedIds });

/** The clipboard lives outside the store: it survives switching boards,
 *  and copying should never be an undo step. */
let clipboard: SketchElement[] = [];
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let savingPromise: Promise<void> | null = null;

const stylePatchFor = (style: ElementStyle, type: ElementType): Partial<SketchElement> => ({
  stroke: style.stroke,
  fill: style.fill,
  fillStyle: style.fillStyle,
  strokeWidth: style.strokeWidth,
  strokeStyle: style.strokeStyle,
  opacity: style.opacity,
  roundness: style.roundness,
  fontSize: style.fontSize,
  fontFamily: style.fontFamily,
  textAlign: type === 'text' ? 'left' : style.textAlign,
  textColor: style.textColor,
  edge: style.edge,
  startArrow: type === 'arrow' ? style.startArrow : 'none',
  endArrow: type === 'arrow' ? style.endArrow : 'none',
});

export const useSketch = create<SketchState>((set, get) => ({
  ready: false,
  isDark: false,
  palette: paletteFor(false),
  name: 'Untitled',
  path: null,
  background: 'grid',
  createdAt: new Date().toISOString(),
  elements: [],
  selectedIds: [],
  tool: 'select',
  keepTool: false,
  viewport: { scrollX: -400, scrollY: -300, zoom: 1 },
  history: createHistory({ elements: [], selectedIds: [] }),
  style: defaultStyle(paletteFor(false)),
  editingId: null,
  editRequest: null,
  saveState: 'saved',
  saveError: null,
  files: [],
  recent: [],
  corrupt: null,
  dialogs: { files: false, export: false, shortcuts: false, slash: false, minimap: true },
  snapEnabled: true,
  status: null,

  setDark(isDark) {
    const state = get();
    if (state.isDark === isDark && state.ready) return;
    const palette = paletteFor(isDark);
    // A board drawn in one theme stays legible in the other: the curated
    // palette entries map across, custom colours are left alone.
    const elements = state.elements.map((el) => {
      const stroke = translateColor(el.stroke, isDark);
      const fill = translateColor(el.fill, isDark);
      const textColor = translateColor(el.textColor, isDark);
      return stroke === el.stroke && fill === el.fill && textColor === el.textColor ? el : { ...el, stroke, fill, textColor };
    });
    set({
      isDark,
      palette,
      elements,
      style: {
        ...state.style,
        stroke: translateColor(state.style.stroke, isDark),
        fill: translateColor(state.style.fill, isDark),
        textColor: translateColor(state.style.textColor, isDark),
      },
    });
  },

  setTool(tool, keep = false) {
    set({ tool, keepTool: keep, history: seal(get().history) });
    if (tool !== 'select' && get().editingId) set({ editingId: null });
  },

  setViewport(viewport) {
    set({ viewport });
  },

  zoomTo(zoom, at, size) {
    const { viewport } = get();
    const point: [number, number] = at ?? [size ? size.width / 2 : 400, size ? size.height / 2 : 300];
    set({ viewport: zoomAt(viewport, zoom, point) as Viewport });
  },

  zoomToFit(size, onlySelection = false) {
    const state = get();
    const { elements, selectedIds } = state;
    const target = onlySelection && selectedIds.length ? elements.filter((el) => selectedIds.includes(el.id)) : elements;
    if (!target.length) {
      set({ viewport: { scrollX: -size.width / 2, scrollY: -size.height / 2, zoom: 1 } });
      return;
    }
    // Fit into the space the floating islands leave free, not the whole
    // canvas - otherwise "zoom to fit" tucks the top of the board under
    // the toolbar and the bottom under the zoom controls.
    const panel = selectedIds.length || (state.tool !== 'select' && state.tool !== 'hand' && state.tool !== 'eraser') ? 252 : 24;
    const inset = { top: 78, bottom: 76, left: panel, right: 24 };
    const box = boundsOfElements(target);
    const availableWidth = Math.max(80, size.width - inset.left - inset.right);
    const availableHeight = Math.max(80, size.height - inset.top - inset.bottom);
    const zoom = clamp(Math.min(availableWidth / Math.max(box.w, 1), availableHeight / Math.max(box.h, 1)), 0.05, 1.6);
    set({
      viewport: {
        zoom,
        scrollX: box.x + box.w / 2 - (inset.left + availableWidth / 2) / zoom,
        scrollY: box.y + box.h / 2 - (inset.top + availableHeight / 2) / zoom,
      },
    });
  },

  setSelection(ids) {
    const { elements } = get();
    const expanded = Array.from(expandSelection(elements, new Set(ids)));
    set({ selectedIds: expanded });
  },

  selectAll() {
    set({ selectedIds: get().elements.filter((el) => !el.locked).map((el) => el.id) });
  },

  commit(elements, opts = {}) {
    const state = get();
    const pruned = pruneBindings(elements);
    const next = refreshBindings(pruned);
    const selectedIds = opts.selectedIds ?? state.selectedIds.filter((id) => next.some((el) => el.id === id));
    const history = record(state.history, { elements: next, selectedIds }, { label: opts.label ?? 'Edit', coalesceKey: opts.coalesce ?? null });
    set({ elements: next, selectedIds, history });
    if (!opts.quiet) scheduleSave(get, set);
  },

  patchSelected(patch, opts = {}) {
    const { elements, selectedIds } = get();
    if (!selectedIds.length) return;
    const ids = new Set(selectedIds);
    get().commit(
      elements.map((el) => (ids.has(el.id) && !el.locked ? { ...el, ...patch } : el)),
      { label: 'Style', ...opts }
    );
  },

  setStyle(patch) {
    const style = { ...get().style, ...patch };
    set({ style });
    sdk.storage.set(STYLE_KEY, style);
    const { selectedIds } = get();
    if (!selectedIds.length) return;
    // Every ElementStyle key is also an element field, so the patch
    // applies to the selection unchanged.
    get().patchSelected(patch as Partial<SketchElement>, { label: 'Style', coalesce: 'style' });
  },

  addElements(elements, opts = {}) {
    const state = get();
    const next = [...state.elements, ...elements];
    // A drawing tool passes the same coalesce key the drag that follows
    // will use, so "draw a rectangle" is one undo step rather than two
    // (the element appearing, then being given its size).
    state.commit(next, {
      label: opts.label ?? 'Add',
      coalesce: opts.coalesce ?? null,
      selectedIds: opts.select === false ? state.selectedIds : elements.map((el) => el.id),
    });
  },

  deleteSelected() {
    const { elements, selectedIds } = get();
    if (!selectedIds.length) return;
    const ids = new Set(selectedIds);
    const kept = elements.filter((el) => !ids.has(el.id) || el.locked);
    if (kept.length === elements.length) return;
    get().commit(kept, { label: 'Delete', selectedIds: [] });
  },

  duplicateSelected() {
    const { elements, selectedIds } = get();
    if (!selectedIds.length) return;
    const ids = new Set(selectedIds);
    const copies = cloneElements(elements.filter((el) => ids.has(el.id)), 16, 16);
    get().commit([...elements, ...copies], { label: 'Duplicate', selectedIds: copies.map((el) => el.id) });
  },

  copySelection(cut = false) {
    const { elements, selectedIds } = get();
    const ids = new Set(selectedIds);
    clipboard = elements.filter((el) => ids.has(el.id)).map((el) => ({ ...el }));
    if (!clipboard.length) return;
    get().setStatus(`${clipboard.length} element${clipboard.length === 1 ? '' : 's'} ${cut ? 'cut' : 'copied'}`);
    if (cut) get().deleteSelected();
  },

  paste(at) {
    if (!clipboard.length) return;
    const { elements } = get();
    const box = boundsOfElements(clipboard);
    const dx = at ? at[0] - (box.x + box.w / 2) : 24;
    const dy = at ? at[1] - (box.y + box.h / 2) : 24;
    const copies = cloneElements(clipboard, dx, dy);
    get().commit([...elements, ...copies], { label: 'Paste', selectedIds: copies.map((el) => el.id) });
  },

  group() {
    const { elements, selectedIds } = get();
    if (selectedIds.length < 2) return;
    const groupId = newId('g');
    const ids = new Set(selectedIds);
    get().commit(elements.map((el) => (ids.has(el.id) ? { ...el, groupId } : el)), { label: 'Group' });
  },

  ungroup() {
    const { elements, selectedIds } = get();
    const ids = new Set(selectedIds);
    let changed = false;
    const next = elements.map((el) => {
      if (!ids.has(el.id) || !el.groupId) return el;
      changed = true;
      return { ...el, groupId: null };
    });
    if (changed) get().commit(next, { label: 'Ungroup' });
  },

  order(mode) {
    const { elements, selectedIds } = get();
    if (!selectedIds.length) return;
    get().commit(reorder(elements, new Set(selectedIds), mode), { label: 'Reorder' });
  },

  align(mode) {
    const { elements, selectedIds } = get();
    if (selectedIds.length < 2) return;
    get().commit(alignElements(elements, new Set(selectedIds), mode), { label: 'Align' });
  },

  distribute(axis) {
    const { elements, selectedIds } = get();
    if (selectedIds.length < 3) return;
    get().commit(distributeElements(elements, new Set(selectedIds), axis), { label: 'Distribute' });
  },

  flip(axis) {
    const { elements, selectedIds } = get();
    if (!selectedIds.length) return;
    get().commit(flipElements(elements, new Set(selectedIds), axis), { label: 'Flip' });
  },

  toggleLock() {
    const { elements, selectedIds } = get();
    if (!selectedIds.length) return;
    const ids = new Set(selectedIds);
    const anyUnlocked = elements.some((el) => ids.has(el.id) && !el.locked);
    get().commit(elements.map((el) => (ids.has(el.id) ? { ...el, locked: anyUnlocked } : el)), { label: anyUnlocked ? 'Lock' : 'Unlock' });
  },

  nudge(dx, dy) {
    const { elements, selectedIds } = get();
    if (!selectedIds.length) return;
    const ids = new Set(selectedIds);
    get().commit(
      elements.map((el) => (ids.has(el.id) && !el.locked ? { ...el, x: el.x + dx, y: el.y + dy } : el)),
      { label: 'Move', coalesce: 'nudge' }
    );
  },

  undo() {
    const history = undo(get().history);
    const { elements, selectedIds } = history.present.snapshot;
    set({ history, elements, selectedIds, editingId: null });
    scheduleSave(get, set);
  },

  redo() {
    const history = redo(get().history);
    const { elements, selectedIds } = history.present.snapshot;
    set({ history, elements, selectedIds, editingId: null });
    scheduleSave(get, set);
  },

  seal() {
    set({ history: seal(get().history) });
  },

  setEditing(id) {
    set({ editingId: id, editRequest: null, history: seal(get().history) });
  },

  requestEdit(id) {
    set({ editRequest: id });
  },

  setBackground(background) {
    set({ background });
    scheduleSave(get, set);
  },

  toggleSnap() {
    const snapEnabled = !get().snapEnabled;
    set({ snapEnabled });
    sdk.storage.set(PREFS_KEY, { snapEnabled, minimap: get().dialogs.minimap });
  },

  setDialog(key, open) {
    set({ dialogs: { ...get().dialogs, [key]: open } });
    if (key === 'minimap') sdk.storage.set(PREFS_KEY, { snapEnabled: get().snapEnabled, minimap: open });
  },

  setStatus(message) {
    set({ status: message });
  },

  insertLibrary(itemId, center) {
    const { style } = get();
    const elements = insertLibraryItem(itemId, center, {
      stroke: style.stroke,
      fill: style.fill === 'transparent' ? (get().isDark ? '#23374f' : '#d6e6fb') : style.fill,
      fillStyle: 'solid',
      textColor: style.textColor,
      fontSize: style.fontSize,
    });
    if (elements.length) get().addElements(elements, { label: 'Insert shape' });
  },

  /* ------------------------------------------------------------ files */

  async boot() {
    const prefs = sdk.storage.get<{ snapEnabled?: boolean; minimap?: boolean }>(PREFS_KEY);
    const savedStyle = sdk.storage.get<ElementStyle>(STYLE_KEY);
    const recent = sdk.storage.get<string[]>(RECENT_KEY) ?? [];
    set({
      recent,
      snapEnabled: prefs?.snapEnabled ?? true,
      dialogs: { ...get().dialogs, minimap: prefs?.minimap ?? true },
      ...(savedStyle ? { style: { ...defaultStyle(get().palette), ...savedStyle } } : {}),
    });
    await ensureFolder();
    const files = await listDocuments();
    set({ files });
    const target = recent.find((p) => files.some((f) => f.path === p)) ?? files[0]?.path;
    if (target) {
      await get().openDocument(target);
    } else {
      await get().newDocument('Untitled');
    }
    set({ ready: true });
  },

  async refreshFiles() {
    set({ files: await listDocuments() });
  },

  async newDocument(name) {
    await get().flush();
    const base = sanitizeName(name ?? 'Untitled');
    const unique = await freeName(base);
    const doc = createDocument(unique);
    const path = pathFor(unique);
    loadIntoStore(set, get, doc, path);
    await writeDocumentFile(path, doc);
    rememberRecent(get, set, path);
    await get().refreshFiles();
    set({ saveState: 'saved' });
  },

  async openDocument(path) {
    await get().flush();
    const result = await readDocumentFile(path);
    if (!result.ok) {
      set({
        corrupt: { path, name: path.split('/').pop() ?? path, error: result.error, raw: result.raw },
        ready: true,
      });
      return;
    }
    loadIntoStore(set, get, result.doc, path);
    rememberRecent(get, set, path);
    set({
      saveState: 'saved',
      corrupt: null,
      status: result.dropped ? `Opened - ${result.dropped} unreadable element${result.dropped === 1 ? '' : 's'} were dropped` : null,
    });
    await get().refreshFiles();
  },

  async renameDocument(name) {
    const state = get();
    const clean = sanitizeName(name);
    if (!clean || clean === state.name) return;
    const unique = await freeName(clean, state.path ?? undefined);
    const from = state.path;
    const to = from ? await renameDocumentFile(from, unique) : pathFor(unique);
    set({ name: unique, path: to });
    await writeDocumentFile(to, currentDocument(get()));
    rememberRecent(get, set, to);
    await get().refreshFiles();
  },

  /** Renames any board, open or not. */
  async renameDocumentAt(path, name) {
    if (path === get().path) {
      await get().renameDocument(name);
      return;
    }
    const clean = sanitizeName(name);
    if (!clean) return;
    const parsed = await readDocumentFile(path);
    const unique = await freeName(clean, path);
    const to = await renameDocumentFile(path, unique);
    if (parsed.ok) await writeDocumentFile(to, { ...parsed.doc, name: unique });
    const recent = get().recent.map((p) => (p === path ? to : p));
    sdk.storage.set(RECENT_KEY, recent);
    set({ recent });
    await get().refreshFiles();
  },

  async duplicateDocument() {
    await get().flush();
    const state = get();
    const unique = await freeName(`${state.name} copy`);
    const path = pathFor(unique);
    const doc = { ...currentDocument(state), name: unique };
    await writeDocumentFile(path, doc);
    loadIntoStore(set, get, doc, path);
    rememberRecent(get, set, path);
    await get().refreshFiles();
    set({ saveState: 'saved', status: `Duplicated as "${unique}"` });
  },

  async deleteDocument(path) {
    await deleteDocumentFile(path);
    const recent = get().recent.filter((p) => p !== path);
    sdk.storage.set(RECENT_KEY, recent);
    set({ recent });
    await get().refreshFiles();
    if (get().path === path) {
      const next = get().files[0]?.path;
      if (next) await get().openDocument(next);
      else await get().newDocument('Untitled');
    }
  },

  async importDocument(text, name) {
    const parsed = parseDocument(text, name);
    if (!parsed.ok) {
      set({ status: parsed.error });
      return;
    }
    const unique = await freeName(parsed.doc.name || name);
    const path = pathFor(unique);
    const doc = { ...parsed.doc, name: unique };
    await writeDocumentFile(path, doc);
    loadIntoStore(set, get, doc, path);
    rememberRecent(get, set, path);
    await get().refreshFiles();
    set({ saveState: 'saved', status: `Imported "${unique}"` });
  },

  async openCorruptAsCopy() {
    const corrupt = get().corrupt;
    if (!corrupt) return;
    const unique = await freeName('Recovered board');
    const doc = createDocument(unique);
    const path = pathFor(unique);
    await writeDocumentFile(path, doc);
    loadIntoStore(set, get, doc, path);
    set({ corrupt: null, saveState: 'saved', status: `The unreadable file was left untouched; "${unique}" is a fresh copy` });
    await get().refreshFiles();
  },

  async save() {
    const state = get();
    if (!state.path) return;
    set({ saveState: 'saving' });
    try {
      await writeDocumentFile(state.path, currentDocument(get()));
      set({ saveState: get().saveState === 'saving' ? 'saved' : get().saveState, saveError: null });
    } catch (err) {
      set({ saveState: 'error', saveError: err instanceof Error ? err.message : String(err) });
    }
  },

  async flush() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      savingPromise = get().save();
    }
    if (savingPromise) await savingPromise;
  },
}));

/* ---------------------------------------------------------- helpers */

function currentDocument(state: SketchState): SketchDocument {
  return {
    type: 'sketch',
    version: 1,
    name: state.name,
    createdAt: state.createdAt,
    updatedAt: new Date().toISOString(),
    background: state.background,
    view: state.viewport,
    elements: state.elements,
  };
}

function loadIntoStore(
  set: (partial: Partial<SketchState>) => void,
  get: () => SketchState,
  doc: SketchDocument,
  path: string | null
): void {
  const elements = refreshBindings(doc.elements);
  set({
    name: doc.name,
    path,
    background: doc.background,
    createdAt: doc.createdAt,
    elements,
    selectedIds: [],
    editingId: null,
    viewport: doc.view,
    history: createHistory({ elements, selectedIds: [] }),
    corrupt: null,
  });
}

function rememberRecent(get: () => SketchState, set: (partial: Partial<SketchState>) => void, path: string): void {
  const recent = [path, ...get().recent.filter((p) => p !== path)].slice(0, 8);
  sdk.storage.set(RECENT_KEY, recent);
  set({ recent });
}

const SAVE_DELAY = 600;

function scheduleSave(get: () => SketchState, set: (partial: Partial<SketchState>) => void): void {
  if (!get().path) return;
  set({ saveState: 'dirty' });
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    savingPromise = get().save();
  }, SAVE_DELAY);
}

/** Fresh ids for a copy, with group ids and arrow bindings rewritten to
 *  point at the copies - so pasting a bound diagram pastes a diagram, not
 *  a pile of arrows still attached to the originals. */
export function cloneElements(elements: SketchElement[], dx: number, dy: number): SketchElement[] {
  const idMap = new Map<string, string>();
  const groupMap = new Map<string, string>();
  for (const el of elements) {
    idMap.set(el.id, newId());
    if (el.groupId && !groupMap.has(el.groupId)) groupMap.set(el.groupId, newId('g'));
  }
  return elements.map((el) => ({
    ...el,
    id: idMap.get(el.id)!,
    x: el.x + dx,
    y: el.y + dy,
    groupId: el.groupId ? groupMap.get(el.groupId)! : null,
    startBinding: el.startBinding && idMap.has(el.startBinding.elementId) ? { ...el.startBinding, elementId: idMap.get(el.startBinding.elementId)! } : null,
    endBinding: el.endBinding && idMap.has(el.endBinding.elementId) ? { ...el.endBinding, elementId: idMap.get(el.endBinding.elementId)! } : null,
  }));
}

/** A new element carrying the current style - what every draw tool makes. */
export function elementFromStyle(type: ElementType, props: Partial<SketchElement>, style: ElementStyle): SketchElement {
  const base = stylePatchFor(style, type);
  if (type === 'sticky') {
    return createElement(type, { ...base, fill: props.fill ?? base.fill, fillStyle: 'solid', stroke: 'transparent', textAlign: 'center', ...props });
  }
  if (type === 'text') {
    return createElement(type, { ...base, stroke: 'transparent', fill: 'transparent', fillStyle: 'none', textAlign: 'left', ...props });
  }
  if (type === 'frame') {
    return createElement(type, { ...base, fill: 'transparent', fillStyle: 'none', fontSize: 16, textAlign: 'left', ...props });
  }
  return createElement(type, { ...base, ...props });
}

export const selectionBoundsOf = (elements: SketchElement[], ids: string[]) => {
  const set = new Set(ids);
  return boundsOfElements(elements.filter((el) => set.has(el.id)));
};

export const elementById = (elements: SketchElement[], id: string): SketchElement | undefined => elements.find((el) => el.id === id);

export const canUndoNow = (s: SketchState): boolean => canUndo(s.history);
export const canRedoNow = (s: SketchState): boolean => canRedo(s.history);
export const rotatedBoundsOf = rotatedBounds;
export const documentPathOf = documentPath;
