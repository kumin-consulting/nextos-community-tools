// src/files.ts
//
// Everything that touches the outside world: the VFS, the app's own
// settings slot, notifications. The store calls into here; nothing here
// calls into the store, so the dependency only ever points one way.
//
// Writes are debounced and coalesced per file, and `flush()` empties the
// queue - the window's blur handler, its unmount and every agent tool
// call go through it, so there is no state of the app in which what you
// see differs from what is on disk for longer than it takes to type the
// next character.

import sdk from '@kumin/sdk';
import { DECK_DIR_NAME } from './lib/deckfile';

/** The slice of the OS filesystem Recall uses. `sdk.getVfs()` is typed
 *  `unknown` in the published SDK typings; this is the contract Recall
 *  relies on, so a change in the OS shows up here as a type error rather
 *  than as a crash at 7 am. */
export interface Vfs {
  readText(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<{ mtime: number }>;
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
  readdir(path: string): Promise<Array<{ name: string; kind: string; mtime: number; size: number }>>;
  stat(path: string): Promise<{ name: string; kind: string; mtime: number; size: number }>;
  exists(path: string): Promise<boolean>;
  rm(path: string, opts?: { force?: boolean; recursive?: boolean }): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

export const vfs = (): Vfs => sdk.getVfs() as Vfs;

/** `~/Apps/recall` -> `~`. The OS expands the home directory for us, so
 *  this is the one piece of path arithmetic the app has to do. */
export function homeDir(): string {
  const dir = sdk.app.dir || '';
  const stripped = dir.replace(/\/+$/, '').replace(/\/Apps\/[^/]+$/, '');
  return stripped || '/home/user';
}

export function deckDir(): string {
  return `${homeDir()}/${DECK_DIR_NAME}`;
}

export function deckPath(file: string): string {
  return `${deckDir()}/${file}`;
}

export async function ensureDeckDir(): Promise<void> {
  await vfs().mkdir(deckDir(), { recursive: true });
}

export async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await vfs().readText(path);
  } catch {
    return null;
  }
}

export async function mtimeOf(path: string): Promise<number> {
  try {
    return (await vfs().stat(path)).mtime;
  } catch {
    return 0;
  }
}

/* ------------------------------------------------------ write queue */

type Pending = { text: string; resolve: () => void; reject: (err: unknown) => void };

const pending = new Map<string, Pending>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let inFlight: Promise<void> = Promise.resolve();
const listeners = new Set<(state: SaveState) => void>();

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
let saveState: SaveState = 'idle';
let lastError: string | null = null;

export function onSaveState(listener: (state: SaveState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function saveError(): string | null {
  return lastError;
}

function setSaveState(next: SaveState): void {
  saveState = next;
  for (const listener of listeners) listener(next);
}

export function currentSaveState(): SaveState {
  return saveState;
}

/** Queues a write. Repeated calls for the same path replace each other,
 *  so holding a key down writes once, not once per keystroke. */
export function queueWrite(path: string, text: string, delay = 600): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = pending.get(path);
    if (existing) existing.resolve();
    pending.set(path, { text, resolve, reject });
    setSaveState('pending');
    const timer = timers.get(path);
    if (timer) clearTimeout(timer);
    timers.set(
      path,
      setTimeout(() => {
        void writeNow(path);
      }, delay)
    );
  });
}

async function writeNow(path: string): Promise<void> {
  const entry = pending.get(path);
  if (!entry) return;
  pending.delete(path);
  const timer = timers.get(path);
  if (timer) clearTimeout(timer);
  timers.delete(path);
  inFlight = inFlight.then(async () => {
    setSaveState('saving');
    try {
      await ensureDeckDir();
      await vfs().writeFile(path, entry.text);
      lastError = null;
      entry.resolve();
      setSaveState(pending.size ? 'pending' : 'saved');
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      setSaveState('error');
      entry.reject(err);
    }
  });
  await inFlight;
}

/** Writes everything outstanding, now. Awaited by the agent tools, the
 *  window's blur handler and its unmount. */
export async function flush(): Promise<void> {
  const paths = Array.from(pending.keys());
  await Promise.all(paths.map((path) => writeNow(path).catch(() => undefined)));
  await inFlight.catch(() => undefined);
  if (!pending.size && saveState !== 'error') setSaveState('saved');
}

export function hasPendingWrites(): boolean {
  return pending.size > 0;
}

/** Forgets a queued write - used when the file it was for has just been
 *  deleted or renamed. */
export function cancelWrite(path: string): void {
  const timer = timers.get(path);
  if (timer) clearTimeout(timer);
  timers.delete(path);
  const entry = pending.get(path);
  if (entry) entry.resolve();
  pending.delete(path);
}

/* --------------------------------------------------------- settings */

export interface AppSettings {
  /** The view the app opens on. */
  lastView: 'decks' | 'today' | 'browse';
  lastDeck: string | null;
  reminder: boolean;
  /** "HH:MM", local. */
  reminderTime: string;
  /** The last day a reminder was sent, as YYYY-MM-DD. */
  reminderSent: string | null;
  /** The person dismissed the sample-deck offer. */
  sampleDismissed: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  lastView: 'decks',
  lastDeck: null,
  reminder: false,
  reminderTime: '19:00',
  reminderSent: null,
  sampleDismissed: false,
};

export function loadAppSettings(): AppSettings {
  try {
    const saved = sdk.storage.get<Partial<AppSettings>>('settings');
    return { ...DEFAULT_APP_SETTINGS, ...(saved && typeof saved === 'object' ? saved : {}) };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export function saveAppSettings(settings: AppSettings): void {
  try {
    sdk.storage.set('settings', settings);
  } catch {
    // A full storage quota must not take the app down with it.
  }
}

export async function notify(title: string, body?: string): Promise<void> {
  try {
    await sdk.notify({ title, body });
  } catch {
    // Notifications may be refused; the reminder is a courtesy.
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Asks the user's assistant to draft cards. Resolves to null when there
 *  is no assistant, or it refuses - never throws. */
export async function askAssistant(question: string): Promise<string | null> {
  try {
    const result = await sdk.assistant.ask(question);
    return result && typeof result.answer === 'string' ? result.answer : null;
  } catch {
    return null;
  }
}
