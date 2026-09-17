// src/store.ts
//
// One zustand store for the whole app: the decks as they are on disk,
// the review session in progress, and every action that changes either.
// The UI reads from here and never touches the filesystem itself.
//
// Two rules keep this honest:
//   - every mutation writes through (queueWrite, debounced in files.ts);
//     nothing lives only in memory waiting for a save button,
//   - every deck's schedule is keyed by card id, so reloading a file
//     somebody edited elsewhere is an ordinary operation rather than a
//     disaster (see lib/deckfile.ts's reconcileSidecar).

import { create } from 'zustand';
import type { Card, CardState, DeckSettings, DraftCard, Note, ParsedDeck, Rating, ReviewContext, ReviewLogEntry, Sidecar } from './lib/types';
import {
  addNotes,
  basicNote,
  clozeNote,
  emptyDeck,
  expandCards,
  noteFromDraft,
  parseDeck,
  serialiseDeck,
  stableId,
} from './lib/markdown';
import {
  DEFAULT_SETTINGS,
  applyRating,
  buildQueue,
  deckCounts,
  isAvailable,
  newCardState,
  project,
  resolveSettings,
  settingsDiff,
} from './lib/scheduler';
import type { QueueEntry } from './lib/scheduler';
import { contextNow, dayStartMs, dayIndexOf } from './lib/time';
import {
  deckFileName,
  deckNameFromFile,
  doneToday,
  emptySidecar,
  parseSidecar,
  reconcileSidecar,
  renameCardState,
  safeDeckName,
  serialiseSidecar,
  sidecarFileName,
  uniqueDeckName,
} from './lib/deckfile';
import { trimLog } from './lib/stats';
import { SAMPLE_DECK, SAMPLE_DECK_NAME } from './lib/sample';
import {
  cancelWrite,
  deckDir,
  deckPath,
  ensureDeckDir,
  flush,
  loadAppSettings,
  mtimeOf,
  queueWrite,
  readIfPresent,
  saveAppSettings,
  vfs,
  type AppSettings,
} from './files';

export type View = 'decks' | 'today' | 'browse';

export interface DeckRecord {
  name: string;
  file: string;
  deck: ParsedDeck;
  cards: Card[];
  sidecar: Sidecar;
  settings: DeckSettings;
  /** The text last read from or written to disk - what a reload is
   *  compared against. */
  text: string;
  mtime: number;
  sidecarMtime: number;
  /** A problem worth telling the person about: a broken sidecar, an
   *  unreadable file. Never blocks the rest of the app. */
  problem: string | null;
}

export interface SessionCard {
  deck: string;
  id: string;
}

export interface UndoStep {
  deck: string;
  id: string;
  previous: CardState;
  /** Where the card was in the queue before it was answered. */
  queue: SessionCard[];
  logLength: number;
  answeredLength: number;
}

export interface Session {
  decks: string[];
  queue: SessionCard[];
  answered: ReviewLogEntry[];
  undo: UndoStep[];
  startedAt: number;
  shownAt: number;
  flipped: boolean;
  typed: string;
  checked: boolean;
  /** Set when the session has run out of cards. */
  finished: boolean;
  /** Counts as the session started, for the progress strip. */
  started: { new: number; learning: number; review: number };
}

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

interface State {
  ready: boolean;
  loadError: string | null;
  decks: Record<string, DeckRecord>;
  order: string[];
  settings: AppSettings;
  view: View;
  selected: string | null;
  session: Session | null;
  /** Bumped by a timer so "due in 3 minutes" becomes "due" on its own. */
  tick: number;
  toasts: Toast[];

  init(): Promise<void>;
  reload(): Promise<void>;
  reloadIfChanged(): Promise<void>;
  setView(view: View): void;
  select(name: string | null): void;
  bump(): void;
  toast(text: string, action?: Toast['action']): void;
  dismissToast(id: number): void;
  patchSettings(patch: Partial<AppSettings>): void;

  createDeck(name: string, text?: string): Promise<string>;
  renameDeck(name: string, next: string): Promise<void>;
  deleteDeck(name: string): Promise<void>;
  duplicateDeck(name: string): Promise<string>;
  saveDeckSettings(name: string, patch: Partial<DeckSettings>): void;
  addDrafts(name: string, drafts: DraftCard[]): Promise<{ added: number; duplicates: number }>;
  editNote(name: string, noteIndex: number, next: Note): void;
  deleteCards(name: string, ids: string[]): void;
  setCardFlag(name: string, ids: string[], flag: 'suspended' | 'marked', value: boolean): void;
  buryCards(name: string, ids: string[]): void;
  tagCards(name: string, ids: string[], tag: string, add: boolean): void;
  moveCards(from: string, ids: string[], to: string): Promise<void>;
  resetCards(name: string, ids: string[]): void;

  startSession(decks: string[]): void;
  endSession(): void;
  flip(): void;
  setTyped(value: string): void;
  checkTyped(): void;
  grade(rating: Rating): void;
  undoGrade(): void;
  sessionAction(action: 'suspend' | 'bury' | 'mark'): void;
}

let toastId = 1;

/* ----------------------------------------------------------- helpers */

export function ctxFor(settings: DeckSettings, now = Date.now()): ReviewContext {
  return contextNow(settings.dayCutoffHour, now);
}

/** The day boundary used by views that span decks. Decks usually agree;
 *  when they do not, the default 4 am wins, so a cross-deck heatmap has
 *  one consistent idea of "a day". */
export function globalCtx(decks: DeckRecord[], now = Date.now()): ReviewContext {
  const hours = new Set(decks.map((d) => d.settings.dayCutoffHour));
  return contextNow(hours.size === 1 ? Array.from(hours)[0] : DEFAULT_SETTINGS.dayCutoffHour, now);
}

export function queueEntriesFor(record: DeckRecord): QueueEntry[] {
  return record.cards.map((card, position) => ({
    id: card.id,
    state: record.sidecar.cards[card.id] ?? newCardState(Date.now(), record.settings),
    position,
  }));
}

export interface DeckCounts {
  new: number;
  learning: number;
  review: number;
  due: number;
  total: number;
  suspended: number;
  nextDue: number | null;
}

export function countsFor(record: DeckRecord, now = Date.now()): DeckCounts {
  const ctx = ctxFor(record.settings, now);
  const counts = deckCounts(queueEntriesFor(record), record.settings, ctx, doneToday(record.sidecar, ctx));
  return { ...counts, due: counts.new + counts.learning + counts.review };
}

function recordFrom(name: string, text: string, sidecarText: string | null, mtime: number, sidecarMtime: number, now: number): DeckRecord {
  const deck = parseDeck(text);
  const cards = expandCards(deck);
  const parsed = parseSidecar(sidecarText ?? '');
  const reconciled = reconcileSidecar(parsed.sidecar, cards, now);
  return {
    name,
    file: deckFileName(name),
    deck,
    cards,
    sidecar: reconciled.sidecar,
    settings: resolveSettings(reconciled.sidecar.settings),
    text,
    mtime,
    sidecarMtime,
    problem: parsed.problem,
  };
}

/** Re-parses a deck after the app itself changed it, keeping every card
 *  state that still has a card. */
function rebuild(record: DeckRecord, deck: ParsedDeck, now = Date.now()): DeckRecord {
  const cards = expandCards(deck);
  const { sidecar } = reconcileSidecar(record.sidecar, cards, now);
  return { ...record, deck, cards, sidecar, text: serialiseDeck(deck) };
}

export const useStore = create<State>((set, get) => {
  const writeDeck = (record: DeckRecord): void => {
    void queueWrite(deckPath(record.file), record.text).catch(() => undefined);
  };
  const writeSidecar = (record: DeckRecord): void => {
    void queueWrite(deckPath(sidecarFileName(record.name)), serialiseSidecar(record.sidecar)).catch(() => undefined);
  };

  /** The single way a deck changes: takes the record, returns the next
   *  one, writes whichever files actually differ. */
  const update = (name: string, fn: (record: DeckRecord) => DeckRecord | null, write: { deck?: boolean; sidecar?: boolean } = { deck: true, sidecar: true }): void => {
    const record = get().decks[name];
    if (!record) return;
    const next = fn(record);
    if (!next) return;
    set((state) => ({ decks: { ...state.decks, [name]: next } }));
    if (write.deck !== false && next.text !== record.text) writeDeck(next);
    if (write.sidecar !== false) writeSidecar(next);
  };

  const noteIndexesFor = (record: DeckRecord, ids: string[]): number[] => {
    const wanted = new Set(ids);
    const indexes = new Set<number>();
    for (const card of record.cards) if (wanted.has(card.id)) indexes.add(card.noteIndex);
    return Array.from(indexes).sort((a, b) => a - b);
  };

  const mapStates = (record: DeckRecord, ids: string[], fn: (state: CardState) => CardState): DeckRecord => {
    const cards = { ...record.sidecar.cards };
    for (const id of ids) {
      const state = cards[id];
      if (state) cards[id] = fn(state);
    }
    return { ...record, sidecar: { ...record.sidecar, cards } };
  };

  return {
    ready: false,
    loadError: null,
    decks: {},
    order: [],
    settings: loadAppSettings(),
    view: 'decks',
    selected: null,
    session: null,
    tick: 0,
    toasts: [],

    async init() {
      if (get().ready) return;
      const settings = loadAppSettings();
      set({ settings, view: settings.lastView, selected: settings.lastDeck });
      await get().reload();
    },

    async reload() {
      const now = Date.now();
      try {
        await ensureDeckDir();
        const entries = await vfs().readdir(deckDir());
        const decks: Record<string, DeckRecord> = {};
        for (const entry of entries) {
          if (entry.kind !== 'file') continue;
          const name = deckNameFromFile(entry.name);
          if (!name) continue;
          const text = await readIfPresent(`${deckDir()}/${entry.name}`);
          if (text === null) continue;
          const sidecarPath = `${deckDir()}/${sidecarFileName(name)}`;
          const sidecarText = await readIfPresent(sidecarPath);
          decks[name] = recordFrom(name, text, sidecarText, entry.mtime, await mtimeOf(sidecarPath), now);
        }
        const order = Object.keys(decks).sort((a, b) => a.localeCompare(b));
        const selected = get().selected && decks[get().selected as string] ? get().selected : order[0] ?? null;
        set({ decks, order, ready: true, loadError: null, selected });
      } catch (err) {
        set({ ready: true, loadError: err instanceof Error ? err.message : String(err) });
      }
    },

    /** Called when the window regains focus: picks up edits made in
     *  another editor without throwing away anything unsaved here. */
    async reloadIfChanged() {
      if (!get().ready || get().session) return;
      try {
        await flush();
        const entries = await vfs().readdir(deckDir());
        const files = new Map<string, number>();
        for (const entry of entries) if (entry.kind === 'file') files.set(entry.name, entry.mtime);
        const state = get();
        let changed = false;
        const decks = { ...state.decks };
        const now = Date.now();

        for (const name of Object.keys(decks)) {
          const record = decks[name];
          const mtime = files.get(record.file);
          if (mtime === undefined) {
            delete decks[name];
            changed = true;
            continue;
          }
          const sidecarMtime = files.get(sidecarFileName(name)) ?? 0;
          if (mtime === record.mtime && sidecarMtime === record.sidecarMtime) continue;
          const text = await readIfPresent(deckPath(record.file));
          if (text === null) continue;
          if (text === record.text && sidecarMtime === record.sidecarMtime) {
            decks[name] = { ...record, mtime };
            continue;
          }
          const sidecarText = await readIfPresent(deckPath(sidecarFileName(name)));
          decks[name] = recordFrom(name, text, sidecarText, mtime, sidecarMtime, now);
          changed = true;
        }
        for (const [file, mtime] of files) {
          const name = deckNameFromFile(file);
          if (!name || decks[name]) continue;
          const text = await readIfPresent(`${deckDir()}/${file}`);
          if (text === null) continue;
          const sidecarPath = `${deckDir()}/${sidecarFileName(name)}`;
          decks[name] = recordFrom(name, text, await readIfPresent(sidecarPath), mtime, files.get(sidecarFileName(name)) ?? 0, now);
          changed = true;
        }
        if (changed) {
          const order = Object.keys(decks).sort((a, b) => a.localeCompare(b));
          set({ decks, order, selected: get().selected && decks[get().selected as string] ? get().selected : order[0] ?? null });
        }
      } catch {
        // A failed refresh is not worth an error state: what is on screen
        // is still what was last read successfully.
      }
    },

    setView(view) {
      set({ view });
      get().patchSettings({ lastView: view });
    },

    select(name) {
      set({ selected: name });
      get().patchSettings({ lastDeck: name });
    },

    bump() {
      set((state) => ({ tick: state.tick + 1 }));
    },

    toast(text, action) {
      const id = toastId++;
      set((state) => ({ toasts: [...state.toasts.slice(-2), { id, text, action }] }));
      setTimeout(() => get().dismissToast(id), action ? 8000 : 4000);
    },

    dismissToast(id) {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    },

    patchSettings(patch) {
      const settings = { ...get().settings, ...patch };
      set({ settings });
      saveAppSettings(settings);
    },

    /* --------------------------------------------------------- decks */

    async createDeck(name, text) {
      const unique = uniqueDeckName(name, get().order);
      const body = text ?? serialiseDeck(emptyDeck(unique, ''));
      const now = Date.now();
      await ensureDeckDir();
      await vfs().writeFile(deckPath(deckFileName(unique)), body);
      const record = recordFrom(unique, body, null, now, 0, now);
      set((state) => ({
        decks: { ...state.decks, [unique]: record },
        order: [...state.order, unique].sort((a, b) => a.localeCompare(b)),
        selected: unique,
      }));
      writeSidecar(record);
      return unique;
    },

    async renameDeck(name, next) {
      const record = get().decks[name];
      const clean = safeDeckName(next);
      if (!record || !clean || clean === name) return;
      const unique = uniqueDeckName(clean, get().order.filter((n) => n !== name));
      await flush();
      const deck = { ...record.deck, title: record.deck.title === name ? unique : record.deck.title };
      const text = serialiseDeck(deck);
      await vfs().writeFile(deckPath(deckFileName(unique)), text);
      await vfs().writeFile(deckPath(sidecarFileName(unique)), serialiseSidecar(record.sidecar));
      cancelWrite(deckPath(record.file));
      cancelWrite(deckPath(sidecarFileName(name)));
      await vfs().rm(deckPath(record.file), { force: true });
      await vfs().rm(deckPath(sidecarFileName(name)), { force: true });
      set((state) => {
        const decks = { ...state.decks };
        delete decks[name];
        decks[unique] = { ...record, name: unique, file: deckFileName(unique), deck, text, mtime: Date.now() };
        return { decks, order: Object.keys(decks).sort((a, b) => a.localeCompare(b)), selected: unique };
      });
    },

    async deleteDeck(name) {
      const record = get().decks[name];
      if (!record) return;
      cancelWrite(deckPath(record.file));
      cancelWrite(deckPath(sidecarFileName(name)));
      await vfs().rm(deckPath(record.file), { force: true });
      await vfs().rm(deckPath(sidecarFileName(name)), { force: true });
      set((state) => {
        const decks = { ...state.decks };
        delete decks[name];
        const order = Object.keys(decks).sort((a, b) => a.localeCompare(b));
        return { decks, order, selected: state.selected === name ? order[0] ?? null : state.selected };
      });
    },

    async duplicateDeck(name) {
      const record = get().decks[name];
      if (!record) return name;
      const unique = uniqueDeckName(`${name} copy`, get().order);
      const deck = { ...record.deck, title: unique };
      const text = serialiseDeck(deck);
      await ensureDeckDir();
      await vfs().writeFile(deckPath(deckFileName(unique)), text);
      const now = Date.now();
      // A copy starts fresh: the cards are the same, the schedule is not
      // (two decks sharing one history would make both of them lie).
      const next = recordFrom(unique, text, JSON.stringify({ version: 1, settings: record.sidecar.settings, cards: {}, log: [] }), now, 0, now);
      set((state) => ({
        decks: { ...state.decks, [unique]: next },
        order: [...state.order, unique].sort((a, b) => a.localeCompare(b)),
        selected: unique,
      }));
      writeSidecar(next);
      return unique;
    },

    saveDeckSettings(name, patch) {
      update(
        name,
        (record) => {
          const settings = resolveSettings({ ...record.settings, ...patch });
          return { ...record, settings, sidecar: { ...record.sidecar, settings: settingsDiff(settings) } };
        },
        { deck: false }
      );
    },

    /* --------------------------------------------------------- cards */

    async addDrafts(name, drafts) {
      const record = get().decks[name];
      if (!record) return { added: 0, duplicates: 0 };
      const notes = drafts.map(noteFromDraft);
      const result = addNotes(record.deck, notes);
      update(name, (current) => rebuild(current, result.deck));
      return { added: result.added.length, duplicates: result.duplicates.length };
    },

    editNote(name, noteIndex, next) {
      update(name, (record) => {
        const before = record.deck.notes[noteIndex];
        if (!before) return null;
        const beforeCards = record.cards.filter((c) => c.noteIndex === noteIndex);
        const notes = record.deck.notes.slice();
        notes[noteIndex] = next;
        const deck = { ...record.deck, notes };
        const afterCards = expandCards({ ...deck, notes: [next] });
        // Carry each card's schedule to the id its new text hashes to,
        // matching cloze cards up by their number.
        let sidecar = record.sidecar;
        beforeCards.forEach((card, index) => {
          const match = card.ordinal ? afterCards.find((c) => c.ordinal === card.ordinal) : afterCards[index];
          if (match) sidecar = renameCardState(sidecar, card.id, match.id);
        });
        return rebuild({ ...record, sidecar }, deck);
      });
    },

    deleteCards(name, ids) {
      update(name, (record) => {
        const drop = new Set(noteIndexesFor(record, ids));
        if (!drop.size) return null;
        const notes = record.deck.notes.filter((_note, index) => !drop.has(index));
        return rebuild(record, { ...record.deck, notes });
      });
    },

    setCardFlag(name, ids, flag, value) {
      update(name, (record) => mapStates(record, ids, (state) => ({ ...state, [flag]: value || undefined })), { deck: false });
    },

    buryCards(name, ids) {
      const record = get().decks[name];
      if (!record) return;
      const ctx = ctxFor(record.settings);
      const until = dayStartMs(dayIndexOf(ctx.now, ctx) + 1, ctx);
      update(name, (current) => mapStates(current, ids, (state) => ({ ...state, buriedUntil: until })), { deck: false });
    },

    tagCards(name, ids, tag, add) {
      const clean = tag.replace(/^#/, '').trim();
      if (!clean) return;
      update(name, (record) => {
        const indexes = noteIndexesFor(record, ids);
        if (!indexes.length) return null;
        const notes = record.deck.notes.slice();
        for (const index of indexes) {
          const note = notes[index];
          const has = note.tags.includes(clean);
          if (add === has) continue;
          notes[index] = { ...note, tags: add ? [...note.tags, clean] : note.tags.filter((t) => t !== clean) };
        }
        return rebuild(record, { ...record.deck, notes });
      });
    },

    async moveCards(from, ids, to) {
      const source = get().decks[from];
      const target = get().decks[to];
      if (!source || !target || from === to) return;
      const indexes = noteIndexesFor(source, ids);
      if (!indexes.length) return;
      const moving = indexes.map((index) => source.deck.notes[index]);
      const movingIds = new Set(source.cards.filter((c) => indexes.includes(c.noteIndex)).map((c) => c.id));

      const result = addNotes(target.deck, moving);
      const carried: Record<string, CardState> = {};
      const targetCards = expandCards(result.deck);
      const sourceById = new Map(source.cards.map((c) => [c.id, c]));
      for (const card of targetCards) {
        const twin = sourceById.get(card.id);
        if (twin && source.sidecar.cards[card.id]) carried[card.id] = source.sidecar.cards[card.id];
      }
      update(
        to,
        (record) =>
          rebuild(
            { ...record, sidecar: { ...record.sidecar, cards: { ...record.sidecar.cards, ...carried } } },
            result.deck
          )
      );
      update(from, (record) => {
        const drop = new Set(indexes);
        const notes = record.deck.notes.filter((_note, index) => !drop.has(index));
        const cards = { ...record.sidecar.cards };
        for (const id of movingIds) delete cards[id];
        return rebuild({ ...record, sidecar: { ...record.sidecar, cards } }, { ...record.deck, notes });
      });
    },

    resetCards(name, ids) {
      update(
        name,
        (record) =>
          mapStates(record, ids, () => newCardState(Date.now(), record.settings)),
        { deck: false }
      );
    },

    /* ------------------------------------------------------- session */

    startSession(decks) {
      const state = get();
      const now = Date.now();
      const queue: SessionCard[] = [];
      const started = { new: 0, learning: 0, review: 0 };
      const lists: SessionCard[][] = [];
      for (const name of decks) {
        const record = state.decks[name];
        if (!record) continue;
        const ctx = ctxFor(record.settings, now);
        const result = buildQueue(queueEntriesFor(record), record.settings, ctx, doneToday(record.sidecar, ctx));
        started.new += result.counts.new;
        started.learning += result.counts.learning;
        started.review += result.counts.review;
        lists.push(result.queue.map((id) => ({ deck: name, id })));
      }
      // Round-robin between decks so a "study everything" session does
      // not do one deck at a time.
      for (let i = 0; ; i++) {
        let any = false;
        for (const list of lists) {
          if (i < list.length) {
            queue.push(list[i]);
            any = true;
          }
        }
        if (!any) break;
      }
      set({
        session: {
          decks,
          queue,
          answered: [],
          undo: [],
          startedAt: now,
          shownAt: now,
          flipped: false,
          typed: '',
          checked: false,
          finished: queue.length === 0,
          started,
        },
      });
    },

    endSession() {
      set({ session: null });
      void flush();
    },

    flip() {
      const session = get().session;
      if (!session || session.flipped || !session.queue.length) return;
      set({ session: { ...session, flipped: true } });
    },

    setTyped(value) {
      const session = get().session;
      if (!session) return;
      set({ session: { ...session, typed: value } });
    },

    checkTyped() {
      const session = get().session;
      if (!session || session.checked) return;
      set({ session: { ...session, checked: true, flipped: true } });
    },

    grade(rating) {
      const state = get();
      const session = state.session;
      if (!session || !session.queue.length) return;
      const current = session.queue[0];
      const record = state.decks[current.deck];
      if (!record) return;
      const cardState = record.sidecar.cards[current.id];
      if (!cardState) return;

      const now = Date.now();
      const ctx = ctxFor(record.settings, now);
      const outcome = applyRating(current.id, cardState, rating, record.settings, ctx);
      const entry: ReviewLogEntry = {
        id: current.id,
        t: now,
        rating,
        from: cardState.state,
        interval: outcome.interval,
        ms: Math.min(120000, Math.max(0, now - session.shownAt)),
      };

      const undo: UndoStep = {
        deck: current.deck,
        id: current.id,
        previous: cardState,
        queue: session.queue,
        logLength: record.sidecar.log.length,
        answeredLength: session.answered.length,
      };

      update(
        current.deck,
        (deckRecord) => ({
          ...deckRecord,
          sidecar: {
            ...deckRecord.sidecar,
            cards: { ...deckRecord.sidecar.cards, [current.id]: outcome.card },
            log: trimLog([...deckRecord.sidecar.log, entry], ctx),
          },
        }),
        { deck: false }
      );

      // Where the card goes next: back into the session if it is still
      // in learning and due within the next quarter of an hour, gone
      // otherwise.
      const rest = session.queue.slice(1);
      const stillLearning = (outcome.card.state === 'learning' || outcome.card.state === 'relearning') && outcome.card.due - now < 15 * 60000;
      if (stillLearning) {
        const gap = Math.min(rest.length, rating === 1 ? 2 : 5);
        rest.splice(gap, 0, current);
      }

      if (outcome.becameLeech) {
        get().toast(`"${record.cards.find((c) => c.id === current.id)?.front.slice(0, 40) ?? 'A card'}" is a leech - suspended after ${outcome.card.lapses} lapses.`);
      }

      set({
        session: {
          ...session,
          queue: rest,
          answered: [...session.answered, entry],
          undo: [...session.undo.slice(-50), undo],
          flipped: false,
          typed: '',
          checked: false,
          shownAt: now,
          finished: rest.length === 0,
        },
      });
    },

    undoGrade() {
      const state = get();
      const session = state.session;
      if (!session || !session.undo.length) return;
      const step = session.undo[session.undo.length - 1];
      update(
        step.deck,
        (record) => ({
          ...record,
          sidecar: {
            ...record.sidecar,
            cards: { ...record.sidecar.cards, [step.id]: step.previous },
            log: record.sidecar.log.slice(0, step.logLength),
          },
        }),
        { deck: false }
      );
      set({
        session: {
          ...session,
          queue: step.queue,
          answered: session.answered.slice(0, step.answeredLength),
          undo: session.undo.slice(0, -1),
          flipped: false,
          typed: '',
          checked: false,
          shownAt: Date.now(),
          finished: false,
        },
      });
    },

    sessionAction(action) {
      const state = get();
      const session = state.session;
      if (!session || !session.queue.length) return;
      const current = session.queue[0];
      if (action === 'mark') {
        const record = state.decks[current.deck];
        const marked = !record?.sidecar.cards[current.id]?.marked;
        get().setCardFlag(current.deck, [current.id], 'marked', marked);
        get().toast(marked ? 'Marked' : 'Unmarked');
        return;
      }
      const previous = state.decks[current.deck]?.sidecar.cards[current.id];
      if (action === 'suspend') get().setCardFlag(current.deck, [current.id], 'suspended', true);
      else get().buryCards(current.deck, [current.id]);
      const rest = session.queue.slice(1);
      set({ session: { ...session, queue: rest, flipped: false, typed: '', checked: false, shownAt: Date.now(), finished: rest.length === 0 } });
      // A single keystroke took a card out of the session, so the toast
      // carries the way back in.
      get().toast(action === 'suspend' ? 'Card suspended' : 'Card buried until tomorrow', {
        label: 'Undo',
        run: () => {
          if (previous) {
            update(current.deck, (record) => ({ ...record, sidecar: { ...record.sidecar, cards: { ...record.sidecar.cards, [current.id]: previous } } }), { deck: false });
          }
          const live = get().session;
          if (live) set({ session: { ...live, queue: [current, ...live.queue], flipped: false, typed: '', checked: false, shownAt: Date.now(), finished: false } });
        },
      });
    },
  };
});

/* ------------------------------------------------- derived selectors */

/** The card on screen. Takes the session and the decks rather than the
 *  whole state because it BUILDS an object: a zustand selector that
 *  returns a fresh object every call makes React's store subscription
 *  recompute for ever, so this is called with what the component has
 *  already subscribed to instead of being one. */
export function currentCard(
  session: Session | null,
  decks: Record<string, DeckRecord>
): { record: DeckRecord; card: Card; cardState: CardState } | null {
  if (!session || !session.queue.length) return null;
  const { deck, id } = session.queue[0];
  const record = decks[deck];
  const card = record?.cards.find((c) => c.id === id);
  const cardState = record?.sidecar.cards[id];
  if (!record || !card || !cardState) return null;
  return { record, card, cardState };
}

export function projectionsFor(record: DeckRecord, id: string, cardState: CardState, now = Date.now()) {
  return project(id, cardState, record.settings, ctxFor(record.settings, now));
}

/** Everything due across every deck, for the Today view. */
export function dueEverywhere(decks: DeckRecord[], now = Date.now()): { new: number; learning: number; review: number; due: number; decks: Array<{ name: string; counts: DeckCounts }> } {
  let counts = { new: 0, learning: 0, review: 0, due: 0 };
  const rows: Array<{ name: string; counts: DeckCounts }> = [];
  for (const record of decks) {
    const deckCount = countsFor(record, now);
    counts = {
      new: counts.new + deckCount.new,
      learning: counts.learning + deckCount.learning,
      review: counts.review + deckCount.review,
      due: counts.due + deckCount.due,
    };
    rows.push({ name: record.name, counts: deckCount });
  }
  return { ...counts, decks: rows };
}

/** Every card state in a set of decks - what the stats read. */
export function statesOf(decks: DeckRecord[]): CardState[] {
  const out: CardState[] = [];
  for (const record of decks) for (const card of record.cards) {
    const state = record.sidecar.cards[card.id];
    if (state) out.push(state);
  }
  return out;
}

export function logOf(decks: DeckRecord[]): ReviewLogEntry[] {
  const out: ReviewLogEntry[] = [];
  for (const record of decks) out.push(...record.sidecar.log);
  return out.sort((a, b) => a.t - b.t);
}

export function availableCount(record: DeckRecord, now = Date.now()): number {
  const ctx = ctxFor(record.settings, now);
  return record.cards.filter((card) => {
    const state = record.sidecar.cards[card.id];
    return state ? isAvailable(state, ctx) : true;
  }).length;
}

/* ------------------------------------------------------ sample deck */

export async function installSampleDeck(): Promise<string> {
  const store = useStore.getState();
  const name = await store.createDeck(SAMPLE_DECK_NAME, SAMPLE_DECK);
  return name;
}

export { SAMPLE_DECK_NAME, basicNote, clozeNote, stableId, emptyDeck, parseDeck, serialiseDeck };
