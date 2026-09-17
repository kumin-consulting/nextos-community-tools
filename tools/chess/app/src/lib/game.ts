// src/lib/game.ts
//
// A game as a tree of moves, not a list. Variations are the reason: the
// moment you want to try "what if I had played Nf3 instead?" while
// keeping the game you actually played, a list stops being enough. The
// tree is a flat array of nodes with parent/children indices, which
// makes it trivially serialisable (it is what goes into the app's
// autosave slot) and cheap for React to hold in state - a node is a
// number, and moving through the game changes one number.
//
// Node 0 is always the root: no move, the starting position. The main
// line of any node is `children[0]`; every other child is a variation,
// and promoting one is a swap of two array entries.

import type { Move, Position } from './types';
import { WHITE } from './types';
import { INITIAL_FEN } from './types';
import { makeMove } from './board';
import { fromFen, parseFen, toFen } from './fen';
import { parseSan, toSan, toUci } from './san';
import type { Result } from './rules';

export interface MoveNode {
  id: number;
  parent: number;
  children: number[];
  /** The packed move that leads INTO this node. 0 at the root. */
  move: Move;
  san: string;
  uci: string;
  /** Distance from the root in plies. 0 at the root. */
  ply: number;
  /** A comment that follows the move, `{ like this }` in PGN. */
  comment: string;
  /** A comment that comes before the move. */
  preComment: string;
  /** Numeric annotation glyphs: 1 is '!', 2 is '?', and so on. */
  nags: number[];
}

export interface GameTree {
  nodes: MoveNode[];
  startFen: string;
  tags: Record<string, string>;
  result: Result;
}

export const STANDARD_TAG_ORDER = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];

export function createTree(startFen: string = INITIAL_FEN, tags: Record<string, string> = {}): GameTree {
  return {
    nodes: [
      { id: 0, parent: -1, children: [], move: 0, san: '', uci: '', ply: 0, comment: '', preComment: '', nags: [] },
    ],
    startFen,
    tags: { ...tags },
    result: '*',
  };
}

/** The position at a node, replayed from the start so that the repetition
 *  history and the halfmove clock are real rather than reconstructed. */
export function positionAt(tree: GameTree, nodeId: number): Position {
  const parsed = parseFen(tree.startFen);
  const pos = parsed.ok ? parsed.position : fromFen(INITIAL_FEN);
  for (const id of pathTo(tree, nodeId)) {
    makeMove(pos, tree.nodes[id].move);
  }
  return pos;
}

/** Node ids from just after the root down to `nodeId`, in order. */
export function pathTo(tree: GameTree, nodeId: number): number[] {
  const path: number[] = [];
  let id = nodeId;
  while (id > 0) {
    path.push(id);
    id = tree.nodes[id].parent;
  }
  path.reverse();
  return path;
}

/** The moves along that path - what perft-style replays and the engine's
 *  repetition table want. */
export function movesTo(tree: GameTree, nodeId: number): Move[] {
  return pathTo(tree, nodeId).map((id) => tree.nodes[id].move);
}

/**
 * Adds `move` as a child of `nodeId`, or returns the existing child when
 * the same move is already there - which is what makes replaying a line
 * you have already seen extend nothing and simply walk into it.
 * Mutates the tree and returns the child's id.
 */
export function addMove(tree: GameTree, nodeId: number, move: Move, pos?: Position): number {
  const parent = tree.nodes[nodeId];
  for (const childId of parent.children) {
    if (tree.nodes[childId].move === move) return childId;
  }
  const at = pos ?? positionAt(tree, nodeId);
  const san = toSan(at, move);
  const node: MoveNode = {
    id: tree.nodes.length,
    parent: nodeId,
    children: [],
    move,
    san,
    uci: toUci(move),
    ply: parent.ply + 1,
    comment: '',
    preComment: '',
    nags: [],
  };
  tree.nodes.push(node);
  parent.children.push(node.id);
  return node.id;
}

/** Plays SAN (or coordinate) text at a node. Returns the new node id, or
 *  null when the text names no legal move. */
export function playSan(tree: GameTree, nodeId: number, text: string): number | null {
  const pos = positionAt(tree, nodeId);
  const move = parseSan(pos, text);
  if (move === null) return null;
  return addMove(tree, nodeId, move, pos);
}

/** The main line from the root: children[0] all the way down. */
export function mainLine(tree: GameTree): number[] {
  const line: number[] = [];
  let id = 0;
  while (tree.nodes[id].children.length) {
    id = tree.nodes[id].children[0];
    line.push(id);
  }
  return line;
}

/** The last node of the main line - where a new move is appended. */
export function mainLineEnd(tree: GameTree): number {
  const line = mainLine(tree);
  return line.length ? line[line.length - 1] : 0;
}

/** Makes a variation the main line at its parent. */
export function promoteVariation(tree: GameTree, nodeId: number): void {
  const node = tree.nodes[nodeId];
  if (node.parent < 0) return;
  const siblings = tree.nodes[node.parent].children;
  const index = siblings.indexOf(nodeId);
  if (index <= 0) return;
  siblings.splice(index, 1);
  siblings.unshift(nodeId);
}

/** Removes a node and everything below it. Ids of other nodes never
 *  change - the array keeps its holes as tombstones with an empty san,
 *  which keeps every id anyone is holding valid. */
export function deleteNode(tree: GameTree, nodeId: number): void {
  if (nodeId === 0) return;
  const node = tree.nodes[nodeId];
  const siblings = tree.nodes[node.parent].children;
  const index = siblings.indexOf(nodeId);
  if (index >= 0) siblings.splice(index, 1);
  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop() as number;
    const n = tree.nodes[id];
    stack.push(...n.children);
    n.children = [];
    n.parent = -1;
    n.san = '';
  }
}

/** Cuts every move after `nodeId` on its own line - what "take back and
 *  play something else" does when the user does not want a variation. */
export function truncateAfter(tree: GameTree, nodeId: number): void {
  for (const childId of [...tree.nodes[nodeId].children]) deleteNode(tree, childId);
}

export function isLive(tree: GameTree, nodeId: number): boolean {
  return nodeId === 0 || tree.nodes[nodeId].parent >= 0;
}

/** '1.', '1...' - the move number a node is written with. */
export function moveNumberFor(tree: GameTree, nodeId: number): { number: number; black: boolean } {
  const startParsed = parseFen(tree.startFen);
  const startMove = startParsed.ok ? startParsed.position.fullmove : 1;
  const startWhite = startParsed.ok ? startParsed.position.turn === WHITE : true;
  const ply = tree.nodes[nodeId].ply - 1 + (startWhite ? 0 : 1);
  return { number: startMove + (ply >> 1), black: (ply & 1) === 1 };
}

/** The FEN after a node's move. */
export function fenAt(tree: GameTree, nodeId: number): string {
  return toFen(positionAt(tree, nodeId));
}

/** A shallow structural copy - enough for React to see a change without
 *  copying every node's arrays when nothing below has moved. */
export function cloneTree(tree: GameTree): GameTree {
  return {
    nodes: tree.nodes.map((n) => ({ ...n, children: [...n.children], nags: [...n.nags] })),
    startFen: tree.startFen,
    tags: { ...tree.tags },
    result: tree.result,
  };
}
