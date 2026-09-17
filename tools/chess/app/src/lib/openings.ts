// src/lib/openings.ts
//
// A compact ECO opening book: 350 named lines, used for two things the
// app would be poorer without - telling you what you are playing ("Ruy
// Lopez, Berlin Defence") the moment the moves match, and giving the
// engine something human to play in the first dozen moves instead of
// grinding out the same search from move one every game.
//
// The index is built once, lazily, from openings.data.ts: a Map from the
// SAN move list joined with spaces to the entry, plus a Map from each
// position along every line to the moves the book plays there. Both are
// plain string keys, which keeps the whole thing a few hundred
// kilobytes of Map and needs no hashing scheme of its own.

import type { Move, Position } from './types';
import { INITIAL_FEN } from './types';
import { makeMove, unmakeMove } from './board';
import { fromFen, toPositionFen } from './fen';
import { parseSan } from './san';
import { OPENING_BOOK_TEXT } from './openings.data';

export interface Opening {
  eco: string;
  name: string;
  /** The line in SAN, e.g. ['e4', 'e5', 'Nf3']. */
  moves: string[];
}

export interface BookEntry {
  /** SAN of a move the book plays in this position. */
  san: string;
  /** How many book lines run through this move - a rough popularity
   *  weight, so the engine varies without playing something obscure as
   *  often as a main line. */
  weight: number;
}

let openings: Opening[] | null = null;
let byLine: Map<string, Opening> | null = null;
let byPosition: Map<string, BookEntry[]> | null = null;
let longestLine = 0;

/** Every entry in the book, parsed once. */
export function allOpenings(): Opening[] {
  if (!openings) build();
  return openings as Opening[];
}

export function openingCount(): number {
  return allOpenings().length;
}

function build(): void {
  const list: Opening[] = [];
  const lines = new Map<string, Opening>();
  const positions = new Map<string, BookEntry[]>();

  for (const raw of OPENING_BOOK_TEXT.split('\n')) {
    const text = raw.trim();
    if (!text) continue;
    const parts = text.split('|');
    if (parts.length !== 3) continue;
    const moves = parts[2].trim().split(/\s+/).filter(Boolean);
    const entry: Opening = { eco: parts[0].trim(), name: parts[1].trim(), moves };
    list.push(entry);
    const key = moves.join(' ');
    // Two entries can share a move order (the same line has more than
    // one traditional name); the first, shorter-named one wins.
    if (!lines.has(key)) lines.set(key, entry);
    if (moves.length > longestLine) longestLine = moves.length;
  }

  // Walk every line once on a shared position, recording what the book
  // plays at each point.
  const pos = fromFen(INITIAL_FEN);
  for (const entry of list) {
    const played: Move[] = [];
    let ok = true;
    for (const san of entry.moves) {
      const key = toPositionFen(pos);
      const move = parseSan(pos, san);
      if (move === null) {
        ok = false;
        break;
      }
      const bucket = positions.get(key);
      if (!bucket) positions.set(key, [{ san, weight: 1 }]);
      else {
        const existing = bucket.find((b) => b.san === san);
        if (existing) existing.weight++;
        else bucket.push({ san, weight: 1 });
      }
      makeMove(pos, move);
      played.push(move);
    }
    for (let i = played.length - 1; i >= 0; i--) unmakeMove(pos, played[i]);
    if (!ok) {
      // A line that does not replay is dropped rather than trusted; the
      // test suite fails on any such line, so this only ever runs if the
      // data file is edited without running the tests.
      const index = list.indexOf(entry);
      if (index >= 0) list.splice(index, 1);
      lines.delete(entry.moves.join(' '));
    }
  }

  openings = list;
  byLine = lines;
  byPosition = positions;
}

/**
 * Names the opening a line of SAN moves has reached: the longest book
 * line that is a prefix of it. Returns null before the line matches
 * anything, which for standard chess is only before the first move.
 */
export function nameOpening(sanMoves: string[]): Opening | null {
  if (!byLine) build();
  const lines = byLine as Map<string, Opening>;
  const limit = Math.min(sanMoves.length, longestLine);
  for (let n = limit; n > 0; n--) {
    const found = lines.get(sanMoves.slice(0, n).join(' '));
    if (found) return found;
  }
  return null;
}

/** 'C65 Ruy Lopez, Berlin Defence', or '' when nothing matches. */
export function openingLabel(sanMoves: string[]): string {
  const found = nameOpening(sanMoves);
  return found ? `${found.eco} ${found.name}` : '';
}

/** The book's moves in a position, most played first. Empty once the
 *  game leaves the book. */
export function bookMoves(pos: Position): BookEntry[] {
  if (!byPosition) build();
  const found = (byPosition as Map<string, BookEntry[]>).get(toPositionFen(pos));
  if (!found) return [];
  return [...found].sort((a, b) => b.weight - a.weight);
}

/**
 * Picks a book move for the engine, weighted by how many lines run
 * through it so main lines come up more often than sidelines. `random`
 * is injectable so a test can pin the choice.
 */
export function pickBookMove(pos: Position, random: () => number = Math.random): Move | null {
  const entries = bookMoves(pos);
  if (!entries.length) return null;
  let total = 0;
  for (const entry of entries) total += entry.weight;
  let roll = random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return parseSan(pos, entry.san);
  }
  return parseSan(pos, entries[0].san);
}

/** Free-text search over names and ECO codes - what the openings box in
 *  the app's analysis panel offers. */
export function searchOpenings(query: string, limit = 20): Opening[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const results: Opening[] = [];
  for (const entry of allOpenings()) {
    if (entry.name.toLowerCase().includes(needle) || entry.eco.toLowerCase() === needle) {
      results.push(entry);
      if (results.length >= limit) break;
    }
  }
  return results;
}
