// src/store.ts
//
// One game, shared between the window and the agent tools.
//
// The tools an app exports are live the moment it is installed - the
// window does not have to be open, or ever to have been opened - so the
// game cannot live in React state. It lives here, as a module-level
// record with a subscribe/notify pair; the window renders from it and
// the tools mutate it, and both see the same game. That is the whole
// reason this file exists rather than a `useState` in the component.
//
// Everything is written through to kumin.storage (small, synchronous,
// survives a reload) and to `<home>/Chess/current.pgn` (the copy another
// program can open), so an unfinished game comes back when the app is
// opened again.

import sdk from '@kumin/sdk';
import type { Color } from './lib/types';
import { WHITE } from './lib/types';
import type { GameTree } from './lib/game';
import { createTree, mainLineEnd, positionAt } from './lib/game';
import { parsePgn, printPgn } from './lib/pgn';
import { openingLabel } from './lib/openings';
import { mainLineSan } from './lib/pgn';
import type { TimeControl } from './lib/clock';
import { todayTag, writeCurrent } from './files';
import type { GameMode } from './ui/dialogs';

export interface GameState {
  tree: GameTree;
  /** The node the window is looking at. */
  nodeId: number;
  mode: GameMode;
  humanColor: Color;
  level: number;
  timeControl: TimeControl | null;
  /** Bumped on every change - a cheap snapshot identity for React. */
  revision: number;
}

const STORAGE_KEY = 'game';
const SETTINGS_KEY = 'settings';

export interface Settings {
  flipped: boolean;
  sound: boolean;
  pieceSet: 'classic' | 'line';
  boardTheme: 'walnut' | 'sea' | 'slate';
  coordinates: boolean;
  analysis: boolean;
  level: number;
  mode: GameMode;
  humanColor: Color;
}

export const DEFAULT_SETTINGS: Settings = {
  flipped: false,
  sound: true,
  pieceSet: 'classic',
  boardTheme: 'walnut',
  coordinates: true,
  analysis: false,
  level: 4,
  mode: 'human-engine',
  humanColor: WHITE,
};

let state: GameState = freshState('human-engine', WHITE, 4, null);
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function freshState(mode: GameMode, humanColor: Color, level: number, timeControl: TimeControl | null, startFen?: string): GameState {
  const tree = createTree(startFen && startFen.trim() ? startFen.trim() : undefined, defaultTags(mode, humanColor, level));
  return { tree, nodeId: 0, mode, humanColor, level, timeControl, revision: 0 };
}

export function defaultTags(mode: GameMode, humanColor: Color, level: number): Record<string, string> {
  const engine = `Chess engine (level ${level})`;
  const you = 'You';
  const white = mode === 'engine-engine' ? engine : mode === 'human-human' ? 'White' : humanColor === WHITE ? you : engine;
  const black = mode === 'engine-engine' ? engine : mode === 'human-human' ? 'Black' : humanColor === WHITE ? engine : you;
  return { Event: 'Casual game', Site: 'NextOS', Date: todayTag(), Round: '-', White: white, Black: black };
}

export function getState(): GameState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Replaces the state and persists it. Every mutation goes through here,
 *  so there is exactly one place that remembers to save. */
export function update(next: Partial<GameState>, options: { persist?: boolean } = {}): GameState {
  state = { ...state, ...next, revision: state.revision + 1 };
  notify();
  if (options.persist !== false) schedulePersist();
  return state;
}

export function newGame(settings: {
  mode: GameMode;
  humanColor: Color;
  level: number;
  timeControl: TimeControl | null;
  startFen?: string;
}): GameState {
  const fresh = freshState(settings.mode, settings.humanColor, settings.level, settings.timeControl, settings.startFen);
  state = { ...fresh, revision: state.revision + 1 };
  notify();
  schedulePersist();
  return state;
}

export function loadTree(tree: GameTree, nodeId?: number): GameState {
  return update({ tree, nodeId: nodeId ?? mainLineEnd(tree) });
}

/** The current game as PGN, with the tags kept honest. */
export function currentPgn(): string {
  const tree = state.tree;
  const sans = mainLineSan(tree);
  const opening = openingLabel(sans);
  if (opening) {
    const [eco, ...rest] = opening.split(' ');
    tree.tags.ECO = eco;
    tree.tags.Opening = rest.join(' ');
  }
  return printPgn(tree);
}

function schedulePersist(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistNow();
  }, 500);
}

/** Writes the game out immediately - called on unmount and on blur, so
 *  a window closed half a second after a move still keeps it. */
export function persistNow(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    const pgn = currentPgn();
    sdk.storage.set(STORAGE_KEY, {
      pgn,
      nodeId: state.nodeId,
      mode: state.mode,
      humanColor: state.humanColor,
      level: state.level,
      timeControl: state.timeControl,
    });
    void writeCurrent(pgn);
  } catch {
    // Storage can be full or denied; a game that cannot be saved is
    // still a game that can be played.
  }
}

/** Brings back the game that was in progress, if there is one. Called
 *  once, from the window's first effect and from a tool's first use. */
export function restore(): boolean {
  try {
    const saved = sdk.storage.get<{
      pgn?: string;
      nodeId?: number;
      mode?: GameMode;
      humanColor?: Color;
      level?: number;
      timeControl?: TimeControl | null;
    }>(STORAGE_KEY);
    if (!saved?.pgn) return false;
    const { games } = parsePgn(saved.pgn);
    if (!games.length) return false;
    const tree = games[0];
    const end = mainLineEnd(tree);
    state = {
      tree,
      nodeId: typeof saved.nodeId === 'number' && saved.nodeId < tree.nodes.length ? saved.nodeId : end,
      mode: saved.mode ?? 'human-engine',
      humanColor: (saved.humanColor ?? WHITE) as Color,
      level: saved.level ?? 4,
      timeControl: saved.timeControl ?? null,
      revision: state.revision + 1,
    };
    notify();
    return true;
  } catch {
    return false;
  }
}

let hasRestored = false;

/** Restores the saved game exactly once per page, whether the window or
 *  a tool asks first. */
export function ensureRestored(): boolean {
  if (hasRestored) return false;
  hasRestored = true;
  return restore();
}

export function loadSettings(): Settings {
  try {
    const saved = sdk.storage.get<Partial<Settings>>(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    sdk.storage.set(SETTINGS_KEY, settings);
  } catch {
    // Settings are a convenience, not the game.
  }
}

/** The position the window is showing. */
export function currentPosition(): ReturnType<typeof positionAt> {
  return positionAt(state.tree, state.nodeId);
}
