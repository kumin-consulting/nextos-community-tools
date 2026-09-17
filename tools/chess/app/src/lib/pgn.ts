// src/lib/pgn.ts
//
// PGN in and out: the seven-tag roster and any other tag, the movetext
// with comments (both `{ braced }` and `; to end of line`), recursive
// variations, numeric annotation glyphs, the suffix annotations ('!?')
// that are really NAGs in disguise, and the result token. A file may
// hold many games; `parsePgn` returns all of them.
//
// Parsing is forgiving by design - the PGN in the world is written by
// dozens of programs and a fair amount of it by hand. Anything that is
// not understood is reported as a problem on the game it came from
// rather than thrown, so a person who pastes a slightly broken file sees
// the games that did load and a line saying what went wrong, which is
// far more useful than an exception.

import type { Position } from './types';
import { INITIAL_FEN } from './types';
import { parseFen, toFen } from './fen';
import { makeMove } from './board';
import { parseSan } from './san';
import type { GameTree, MoveNode } from './game';
import { STANDARD_TAG_ORDER, addMove, createTree, mainLine, moveNumberFor, positionAt } from './game';
import type { Result } from './rules';

export interface PgnParseResult {
  games: GameTree[];
  /** Human-readable notes about anything that did not parse. */
  problems: string[];
}

const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '1/2', '*']);

/** '!' is NAG 1, '?' is 2, '!!' 3, '??' 4, '!?' 5, '?!' 6 - the standard
 *  mapping, so a suffix survives a round trip as the glyph it means. */
const SUFFIX_NAGS: Record<string, number> = { '!': 1, '?': 2, '!!': 3, '??': 4, '!?': 5, '?!': 6 };
export const NAG_TEXT: Record<number, string> = {
  1: '!',
  2: '?',
  3: '!!',
  4: '??',
  5: '!?',
  6: '?!',
  7: '□',
  10: '=',
  13: '∞',
  14: '⩲',
  15: '⩱',
  16: '±',
  17: '∓',
  18: '+-',
  19: '-+',
  22: '⨀',
  32: '⟳',
  36: '↑',
  40: '→',
  132: '⇆',
  140: '∆',
};

type Token =
  | { kind: 'tag'; key: string; value: string }
  | { kind: 'move'; text: string }
  | { kind: 'number' }
  | { kind: 'comment'; text: string }
  | { kind: 'nag'; value: number }
  | { kind: 'open' }
  | { kind: 'close' }
  | { kind: 'result'; value: string };

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      i++;
      continue;
    }
    // A '%' in the first column escapes the whole line.
    if (ch === '%' && (i === 0 || text[i - 1] === '\n')) {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (ch === '[') {
      const end = findTagEnd(text, i);
      const inner = text.slice(i + 1, end);
      const match = /^\s*([A-Za-z0-9_+#=:-]+)\s*"((?:[^"\\]|\\.)*)"\s*$/.exec(inner);
      if (match) {
        tokens.push({ kind: 'tag', key: match[1], value: match[2].replace(/\\(["\\])/g, '$1') });
      }
      i = end + 1;
      continue;
    }
    if (ch === '{') {
      const end = text.indexOf('}', i + 1);
      const stop = end === -1 ? n : end;
      tokens.push({ kind: 'comment', text: text.slice(i + 1, stop).trim() });
      i = stop + 1;
      continue;
    }
    if (ch === ';') {
      let end = text.indexOf('\n', i);
      if (end === -1) end = n;
      tokens.push({ kind: 'comment', text: text.slice(i + 1, end).trim() });
      i = end;
      continue;
    }
    if (ch === '(') {
      tokens.push({ kind: 'open' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'close' });
      i++;
      continue;
    }
    if (ch === '<' || ch === '>') {
      i++;
      continue;
    }
    if (ch === '$') {
      let j = i + 1;
      while (j < n && text[j] >= '0' && text[j] <= '9') j++;
      tokens.push({ kind: 'nag', value: Number(text.slice(i + 1, j)) || 0 });
      i = j;
      continue;
    }
    // A bare word: a move number, a move, a result, or an annotation.
    let j = i;
    while (j < n && !' \t\r\n{}()<>;$'.includes(text[j])) j++;
    const word = text.slice(i, j);
    i = j;
    if (!word) continue;
    if (RESULTS.has(word)) {
      tokens.push({ kind: 'result', value: word === '1/2' ? '1/2-1/2' : word });
      continue;
    }
    if (/^\d+\.*$/.test(word)) {
      tokens.push({ kind: 'number' });
      continue;
    }
    if (/^\.+$/.test(word)) continue;
    // '12.Nf3' - a number glued to its move.
    const glued = /^(\d+)\.*(.+)$/.exec(word);
    if (glued) {
      tokens.push({ kind: 'number' });
      tokens.push({ kind: 'move', text: glued[2] });
      continue;
    }
    tokens.push({ kind: 'move', text: word });
  }
  return tokens;
}

/** Finds the ']' that closes a tag, respecting quoted strings. */
function findTagEnd(text: string, start: number): number {
  let inString = false;
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === ']') return i;
    else if (ch === '\n' && text[i + 1] === '[') return i;
  }
  return text.length;
}

/** Splits a suffix annotation off a move token: 'Nf3!?' -> ['Nf3', 5]. */
function splitSuffix(text: string): { san: string; nag: number } {
  const match = /^(.*?)(\?\?|!!|!\?|\?!|!|\?)$/.exec(text);
  if (!match || !match[1]) return { san: text, nag: 0 };
  return { san: match[1], nag: SUFFIX_NAGS[match[2]] ?? 0 };
}

/** Reads every game in a PGN file. */
export function parsePgn(text: string): PgnParseResult {
  const tokens = tokenize(text);
  const games: GameTree[] = [];
  const problems: string[] = [];
  let i = 0;

  while (i < tokens.length) {
    // Skip anything before the first tag or move of a game.
    while (i < tokens.length && tokens[i].kind === 'result') i++;
    if (i >= tokens.length) break;

    const tags: Record<string, string> = {};
    while (i < tokens.length && tokens[i].kind === 'tag') {
      const tag = tokens[i] as { kind: 'tag'; key: string; value: string };
      tags[tag.key] = tag.value;
      i++;
    }

    let startFen = INITIAL_FEN;
    if (tags.FEN) {
      const parsed = parseFen(tags.FEN);
      if (parsed.ok) startFen = toFen(parsed.position);
      else problems.push(`Game ${games.length + 1}: the FEN tag is not a position (${parsed.error}) - started from the usual place instead.`);
    }
    const tree = createTree(startFen, tags);
    if (tags.Result && RESULTS.has(tags.Result)) tree.result = tags.Result as Result;

    const consumed = readMovetext(tokens, i, tree, problems, games.length + 1);
    i = consumed;
    if (tree.nodes.length > 1 || Object.keys(tags).length) games.push(tree);
    else break;
  }

  if (!games.length && text.trim()) {
    problems.push('No games were found - a PGN needs at least a move or a tag pair.');
  }
  return { games, problems };
}

/** Reads one game's movetext, returning the index just past it.
 *
 *  `fenCache` maps a node id to the FEN after its move, so replaying a
 *  five-hundred-move game costs one make-move per move rather than one
 *  full replay per move - the difference between instant and a visible
 *  pause on a large file. */
function readMovetext(
  tokens: Token[],
  start: number,
  tree: GameTree,
  problems: string[],
  gameNumber: number
): number {
  const fenCache = new Map<number, string>([[0, tree.startFen]]);
  let i = start;
  // The node each open bracket returns to: a variation starts at the
  // parent of the move it comments on.
  const stack: number[] = [];
  let current = 0;
  // The node a bare comment attaches to: the move just played on this
  // line, or -1 just inside a bracket, where a comment introduces the
  // variation instead of annotating the move before it.
  let lastMoveNode = -1;
  let pending = '';
  let lastFailed = false;

  const positionOf = (nodeId: number): Position => {
    const fen = fenCache.get(nodeId);
    if (fen) {
      const parsed = parseFen(fen);
      if (parsed.ok) return parsed.position;
    }
    return positionAt(tree, nodeId);
  };

  while (i < tokens.length) {
    const token = tokens[i];
    if (token.kind === 'tag') break;
    i++;

    switch (token.kind) {
      case 'number':
        break;
      case 'open': {
        stack.push(current);
        current = tree.nodes[current].parent >= 0 ? tree.nodes[current].parent : 0;
        lastMoveNode = -1;
        break;
      }
      case 'close': {
        current = stack.pop() ?? 0;
        lastMoveNode = current > 0 ? current : -1;
        break;
      }
      case 'comment': {
        if (lastMoveNode > 0) {
          const node = tree.nodes[lastMoveNode];
          node.comment = node.comment ? `${node.comment} ${token.text}` : token.text;
        } else {
          pending = pending ? `${pending} ${token.text}` : token.text;
        }
        break;
      }
      case 'nag': {
        if (lastMoveNode > 0) tree.nodes[lastMoveNode].nags.push(token.value);
        break;
      }
      case 'result': {
        tree.result = token.value as Result;
        if (!stack.length) return i;
        break;
      }
      case 'move': {
        const { san, nag } = splitSuffix(token.text);
        const pos = positionOf(current);
        const move = parseSan(pos, san);
        if (move === null) {
          if (!lastFailed) {
            problems.push(
              `Game ${gameNumber}: "${token.text}" is not a legal move here - the rest of that line was skipped.`
            );
          }
          lastFailed = true;
          // Skip to the end of this variation, or of this game.
          let depth = 0;
          while (i < tokens.length) {
            const t = tokens[i];
            if (t.kind === 'open') depth++;
            else if (t.kind === 'close') {
              if (depth === 0) break;
              depth--;
            } else if (t.kind === 'tag' || (t.kind === 'result' && depth === 0 && !stack.length)) break;
            i++;
          }
          break;
        }
        lastFailed = false;
        const child = addMove(tree, current, move, pos);
        makeMove(pos, move);
        fenCache.set(child, toFen(pos));
        current = child;
        lastMoveNode = child;
        if (pending) {
          tree.nodes[current].preComment = pending;
          pending = '';
        }
        if (nag) tree.nodes[current].nags.push(nag);
        break;
      }
      default:
        break;
    }
  }
  return i;
}

// ---------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------

export interface PgnPrintOptions {
  /** Wrap the movetext at this column. 0 leaves it on one line. */
  width?: number;
  /** Leave comments and variations out - the "just the moves" form the
   *  clipboard button offers. */
  movesOnly?: boolean;
}

/** Prints one game as PGN, tags and all. */
export function printPgn(tree: GameTree, options: PgnPrintOptions = {}): string {
  const width = options.width ?? 80;
  const tags = { ...tree.tags };
  tags.Result = tree.result;
  if (tree.startFen !== INITIAL_FEN) {
    tags.FEN = tree.startFen;
    tags.SetUp = '1';
  }
  for (const key of STANDARD_TAG_ORDER) if (!(key in tags)) tags[key] = key === 'Result' ? tree.result : '?';
  if (tags.Date === '?') tags.Date = '????.??.??';
  if (tags.Round === '?') tags.Round = '-';

  const lines: string[] = [];
  for (const key of STANDARD_TAG_ORDER) lines.push(tagLine(key, tags[key]));
  for (const key of Object.keys(tags).sort()) {
    if (STANDARD_TAG_ORDER.includes(key)) continue;
    lines.push(tagLine(key, tags[key]));
  }
  lines.push('');

  const words: string[] = [];
  writeLine(tree, 0, words, options.movesOnly ?? false, true);
  words.push(tree.result);
  lines.push(wrap(words, width));
  return `${lines.join('\n')}\n`;
}

function tagLine(key: string, value: string): string {
  return `[${key} "${String(value ?? '?').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
}

/** Writes the moves below `nodeId` as PGN words, recursing into
 *  variations. `forceNumber` makes the next move carry its number even
 *  when it is Black's, which is what a variation and a comment both
 *  require. */
function writeLine(tree: GameTree, nodeId: number, out: string[], movesOnly: boolean, forceNumber: boolean): void {
  let current = nodeId;
  let needNumber = forceNumber;
  while (tree.nodes[current].children.length) {
    const childId = tree.nodes[current].children[0];
    const node = tree.nodes[childId];
    const { number, black } = moveNumberFor(tree, childId);
    if (!movesOnly && node.preComment) {
      out.push(`{${node.preComment}}`);
      needNumber = true;
    }
    if (!black) out.push(`${number}.`);
    else if (needNumber) out.push(`${number}...`);
    needNumber = false;
    out.push(node.san);
    if (!movesOnly) {
      for (const nag of node.nags) out.push(`$${nag}`);
      if (node.comment) {
        out.push(`{${node.comment}}`);
        needNumber = true;
      }
      const siblings = tree.nodes[current].children;
      for (let s = 1; s < siblings.length; s++) {
        const variation: string[] = [];
        writeVariation(tree, siblings[s], variation, movesOnly);
        out.push(`(${variation.join(' ')})`);
        needNumber = true;
      }
    }
    current = childId;
  }
}

function writeVariation(tree: GameTree, childId: number, out: string[], movesOnly: boolean): void {
  const node = tree.nodes[childId];
  const { number, black } = moveNumberFor(tree, childId);
  if (node.preComment) out.push(`{${node.preComment}}`);
  out.push(black ? `${number}...` : `${number}.`);
  out.push(node.san);
  for (const nag of node.nags) out.push(`$${nag}`);
  if (node.comment) out.push(`{${node.comment}}`);
  writeLine(tree, childId, out, movesOnly, Boolean(node.comment));
}

function wrap(words: string[], width: number): string {
  if (!width) return words.join(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

/** Just the moves of the main line in SAN - for a compact summary and
 *  for the opening book lookup. */
export function mainLineSan(tree: GameTree): string[] {
  return mainLine(tree).map((id) => tree.nodes[id].san);
}

/** The node list of the main line, handy next to `mainLineSan`. */
export function mainLineNodes(tree: GameTree): MoveNode[] {
  return mainLine(tree).map((id) => tree.nodes[id]);
}
