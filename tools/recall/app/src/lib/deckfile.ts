// src/lib/deckfile.ts
//
// Where a deck lives and how its scheduling is matched back up to it.
// Pure: the store does the reading and writing, this decides the names
// and reconciles the sidecar. Keeping the reconciliation here is what
// makes "somebody edited the deck in another editor" a tested case
// rather than a hope.

import type { Card, CardState, DeckSettings, ParsedDeck, ReviewContext, Sidecar } from './types';
import { newCardState, resolveSettings } from './scheduler';
import { dayIndexOf } from './time';

export const DECK_DIR_NAME = 'Recall';
export const SIDECAR_VERSION = 1;

/** Characters a VFS name must not contain, plus the ones that make a
 *  file miserable to type in a terminal. */
export function safeDeckName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 80);
}

export function deckFileName(name: string): string {
  return `${safeDeckName(name)}.md`;
}

export function sidecarFileName(name: string): string {
  return `${safeDeckName(name)}.recall.json`;
}

/** "Chemistry.md" -> "Chemistry"; anything else -> null. */
export function deckNameFromFile(file: string): string | null {
  if (!file.endsWith('.md') || file.endsWith('.recall.json')) return null;
  const name = file.slice(0, -3);
  return name.trim() ? name : null;
}

/** A name that does not collide with one already there: "Chemistry",
 *  then "Chemistry 2", "Chemistry 3"... */
export function uniqueDeckName(name: string, taken: Iterable<string>): string {
  const existing = new Set(Array.from(taken, (n) => n.toLowerCase()));
  const base = safeDeckName(name) || 'Untitled';
  if (!existing.has(base.toLowerCase())) return base;
  for (let n = 2; n < 500; n++) {
    const candidate = `${base} ${n}`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} ${Date.now()}`;
}

export function emptySidecar(): Sidecar {
  return { version: SIDECAR_VERSION, settings: {}, cards: {}, log: [] };
}

/** Reads a sidecar that may be anything at all - a half-written file, an
 *  older version, an object of the wrong shape - and returns something
 *  the app can use. Never throws: a corrupt sidecar costs you scheduling,
 *  and losing the app on top of that would be absurd. */
export function parseSidecar(text: string): { sidecar: Sidecar; problem: string | null } {
  if (!text.trim()) return { sidecar: emptySidecar(), problem: null };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { sidecar: emptySidecar(), problem: `The scheduling file is not valid JSON (${err instanceof Error ? err.message : 'unknown error'}). Recall started it again.` };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { sidecar: emptySidecar(), problem: 'The scheduling file was not an object. Recall started it again.' };
  }
  const row = raw as Record<string, unknown>;
  const cards: Record<string, CardState> = {};
  const rawCards = row.cards;
  if (rawCards && typeof rawCards === 'object' && !Array.isArray(rawCards)) {
    for (const [id, value] of Object.entries(rawCards as Record<string, unknown>)) {
      const state = coerceState(value);
      if (state) cards[id] = state;
    }
  }
  const log = Array.isArray(row.log)
    ? row.log
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
        .map((entry) => ({
          id: typeof entry.id === 'string' ? entry.id : '',
          t: num(entry.t, 0),
          rating: ([1, 2, 3, 4].includes(entry.rating as number) ? entry.rating : 3) as 1 | 2 | 3 | 4,
          from: (['new', 'learning', 'review', 'relearning'].includes(entry.from as string) ? entry.from : 'review') as CardState['state'],
          interval: num(entry.interval, 0),
          ms: num(entry.ms, 0),
        }))
        .filter((entry) => entry.t > 0)
    : [];
  return {
    sidecar: {
      version: SIDECAR_VERSION,
      settings: (row.settings && typeof row.settings === 'object' && !Array.isArray(row.settings) ? row.settings : {}) as Partial<DeckSettings>,
      cards,
      log,
    },
    problem: null,
  };
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function coerceState(value: unknown): CardState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const state = ['new', 'learning', 'review', 'relearning'].includes(row.state as string) ? (row.state as CardState['state']) : 'new';
  const out: CardState = {
    state,
    due: num(row.due, 0),
    interval: Math.max(0, num(row.interval, 0)),
    ease: Math.max(1.3, num(row.ease, 2.5)),
    reps: Math.max(0, Math.round(num(row.reps, 0))),
    lapses: Math.max(0, Math.round(num(row.lapses, 0))),
    step: Math.max(0, Math.round(num(row.step, 0))),
  };
  if (row.suspended === true) out.suspended = true;
  if (row.marked === true) out.marked = true;
  if (row.leech === true) out.leech = true;
  if (typeof row.buriedUntil === 'number') out.buriedUntil = row.buriedUntil;
  if (typeof row.lastReview === 'number') out.lastReview = row.lastReview;
  return out;
}

export interface ReconcileResult {
  sidecar: Sidecar;
  /** Cards that gained a fresh schedule because they are new to the file. */
  added: number;
  /** Schedules dropped because their card is no longer in the file. */
  removed: number;
}

/**
 * Brings a sidecar back into line with the cards a deck file actually
 * has - after a reload, an import, an edit, or somebody's text editor.
 * A card whose question did not change keeps its id and therefore
 * everything about its schedule; one that was rewritten is new, and one
 * that was deleted takes its state with it (its entries stay in the log,
 * because they really did happen).
 */
export function reconcileSidecar(sidecar: Sidecar, cards: Card[], now: number): ReconcileResult {
  const settings = resolveSettings(sidecar.settings);
  const next: Record<string, CardState> = {};
  let added = 0;
  for (const card of cards) {
    const existing = sidecar.cards[card.id];
    if (existing) next[card.id] = existing;
    else {
      next[card.id] = newCardState(now, settings);
      added++;
    }
  }
  const removed = Object.keys(sidecar.cards).length - (cards.length - added);
  return { sidecar: { ...sidecar, version: SIDECAR_VERSION, cards: next }, added, removed: Math.max(0, removed) };
}

/** Carries a card's schedule over to the id its new text hashes to,
 *  when the app itself is the one doing the editing. */
export function renameCardState(sidecar: Sidecar, fromId: string, toId: string): Sidecar {
  if (fromId === toId || !sidecar.cards[fromId]) return sidecar;
  const cards = { ...sidecar.cards };
  cards[toId] = cards[fromId];
  delete cards[fromId];
  return { ...sidecar, cards, log: sidecar.log.map((entry) => (entry.id === fromId ? { ...entry, id: toId } : entry)) };
}

/** How much of today's allowance a deck has already used. Counted from
 *  the log rather than a counter, so it cannot drift out of step with
 *  what actually happened. */
export function doneToday(sidecar: Sidecar, ctx: ReviewContext): { new: number; review: number } {
  const today = dayIndexOf(ctx.now, ctx);
  const seenNew = new Set<string>();
  let review = 0;
  for (const entry of sidecar.log) {
    if (dayIndexOf(entry.t, ctx) !== today) continue;
    if (entry.from === 'new') seenNew.add(entry.id);
    else if (entry.from === 'review') review++;
  }
  return { new: seenNew.size, review };
}

/** The sidecar as it is written to disk: stable key order, so a deck
 *  that did not change produces the same bytes and the file's mtime
 *  stops jumping around. */
export function serialiseSidecar(sidecar: Sidecar): string {
  const cards: Record<string, CardState> = {};
  for (const id of Object.keys(sidecar.cards).sort()) cards[id] = sidecar.cards[id];
  return JSON.stringify({ version: SIDECAR_VERSION, settings: sidecar.settings, cards, log: sidecar.log }, null, 1) + '\n';
}

/** Splits a deck's own state out of the review log - used when a deck is
 *  deleted or duplicated. */
export function logForCards(log: Sidecar['log'], ids: Set<string>): Sidecar['log'] {
  return log.filter((entry) => ids.has(entry.id));
}

/** The next moment anything in a set of decks is due, or null. */
export function nextDueAcross(states: CardState[], now: number): number | null {
  let next: number | null = null;
  for (const state of states) {
    if (state.suspended || state.state === 'new') continue;
    if (state.due <= now) return now;
    next = next === null ? state.due : Math.min(next, state.due);
  }
  return next;
}
