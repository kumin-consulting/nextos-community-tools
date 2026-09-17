// src/ui/MoveList.tsx
//
// The move list. Two columns and a move number, the way a scoresheet is
// written; comments under the move they belong to; variations as
// indented prose beneath the row that introduced them, which is what a
// printed book does and the only layout that survives a line branching
// three deep without turning into a tree widget nobody asked for.
//
// Each move is a button, so the list is navigable with the keyboard and
// a screen reader reads "3. Bb5, blunder" rather than "Bb5".

import { useEffect, useRef } from 'react';
import type { GameTree, MoveNode } from '../lib/game';
import { mainLine, moveNumberFor } from '../lib/game';
import { NAG_TEXT } from '../lib/pgn';
import type { MoveQuality } from '../lib/analysis';

export interface MoveListProps {
  tree: GameTree;
  currentNode: number;
  onSelect: (nodeId: number) => void;
  /** Node id to quality, from the analysis pass. Empty when the game has
   *  not been analysed. */
  quality: Map<number, MoveQuality>;
  showVariations: boolean;
}

const QUALITY_WORDS: Record<MoveQuality, string> = {
  book: 'book move',
  best: 'best move',
  good: 'good move',
  inaccuracy: 'inaccuracy',
  mistake: 'mistake',
  blunder: 'blunder',
};

export function MoveList(props: MoveListProps): JSX.Element {
  const { tree, currentNode, onSelect, quality, showVariations } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current?.querySelector<HTMLElement>('.chessapp-move.is-current');
    el?.scrollIntoView({ block: 'nearest' });
  }, [currentNode, tree]);

  const line = mainLine(tree);
  if (!line.length) {
    return (
      <div className="chessapp-empty">
        <h3>No moves yet</h3>
        <p>
          Play a move on the board, or type one in the box below - <b>e4</b>, <b>Nf3</b> and <b>e2e4</b> are all
          understood.
        </p>
      </div>
    );
  }

  const rows: JSX.Element[] = [];
  let index = 0;
  while (index < line.length) {
    const first = line[index];
    const { number, black } = moveNumberFor(tree, first);
    const whiteNode = black ? null : first;
    const blackNode = black ? first : line[index + 1] ?? null;
    const consumed = black ? 1 : blackNode ? 2 : 1;

    const cells: JSX.Element[] = [
      <span className="chessapp-movenum" key="n">
        {number}.
      </span>,
      whiteNode !== null ? (
        moveButton(tree, whiteNode, currentNode, onSelect, quality)
      ) : (
        <span className="chessapp-move" key="wempty" aria-hidden="true">
          …
        </span>
      ),
      blackNode !== null ? (
        moveButton(tree, blackNode, currentNode, onSelect, quality)
      ) : (
        <span key="bempty" />
      ),
    ];

    rows.push(
      <div className="chessapp-moverow" key={`row-${first}`}>
        {cells}
        {[whiteNode, blackNode].map((nodeId) => {
          if (nodeId === null) return null;
          const node = tree.nodes[nodeId];
          const parts: JSX.Element[] = [];
          if (node.comment) {
            parts.push(
              <div className="chessapp-comment" key={`c-${nodeId}`}>
                {node.comment}
              </div>
            );
          }
          if (showVariations) {
            const siblings = tree.nodes[node.parent]?.children ?? [];
            for (let s = 1; s < siblings.length; s++) {
              parts.push(
                <div className="chessapp-variation" key={`v-${siblings[s]}`}>
                  {variationText(tree, siblings[s], currentNode, onSelect, quality, 0)}
                </div>
              );
            }
          }
          return parts.length ? <div key={`extra-${nodeId}`} style={{ display: 'contents' }}>{parts}</div> : null;
        })}
      </div>
    );
    index += consumed;
  }

  return (
    <div className="chessapp-moves" ref={containerRef}>
      {rows}
    </div>
  );
}

function moveButton(
  tree: GameTree,
  nodeId: number,
  currentNode: number,
  onSelect: (id: number) => void,
  quality: Map<number, MoveQuality>
): JSX.Element {
  const node = tree.nodes[nodeId];
  const q = quality.get(nodeId);
  const classes = ['chessapp-move'];
  if (nodeId === currentNode) classes.push('is-current');
  if (q) classes.push(`q-${q}`);
  const nags = node.nags.map((n) => NAG_TEXT[n] ?? `$${n}`).join('');
  return (
    <button
      key={nodeId}
      type="button"
      className={classes.join(' ')}
      onClick={() => onSelect(nodeId)}
      aria-current={nodeId === currentNode ? 'true' : undefined}
      aria-label={q ? `${node.san}, ${QUALITY_WORDS[q]}` : node.san}
    >
      {node.san}
      {nags ? <span className="chessapp-nag">{nags}</span> : null}
    </button>
  );
}

/** A variation written the way a book writes it: '(4... Nf6 5. O-O Be7)',
 *  with every move clickable and nested variations two deep at most -
 *  beyond that a printed page gives up too. */
function variationText(
  tree: GameTree,
  nodeId: number,
  currentNode: number,
  onSelect: (id: number) => void,
  quality: Map<number, MoveQuality>,
  depth: number
): JSX.Element[] {
  const out: JSX.Element[] = [];
  out.push(<span key={`open-${nodeId}`}>(</span>);
  let id: number | null = nodeId;
  let needNumber = true;
  while (id !== null) {
    const node: MoveNode = tree.nodes[id];
    const { number, black } = moveNumberFor(tree, id);
    if (!black) out.push(<span key={`n-${id}`}>{number}. </span>);
    else if (needNumber) out.push(<span key={`n-${id}`}>{number}… </span>);
    needNumber = false;
    out.push(moveButton(tree, id, currentNode, onSelect, quality));
    if (node.comment) {
      out.push(
        <span key={`c-${id}`} style={{ fontStyle: 'italic' }}>
          {' '}
          {node.comment}{' '}
        </span>
      );
      needNumber = true;
    }
    if (depth < 1) {
      const siblings = tree.nodes[node.parent]?.children ?? [];
      for (let s = 1; s < siblings.length; s++) {
        if (siblings[s] === id) continue;
        out.push(<span key={`sp-${siblings[s]}`}> </span>);
        out.push(...variationText(tree, siblings[s], currentNode, onSelect, quality, depth + 1));
        needNumber = true;
      }
    }
    id = node.children.length ? node.children[0] : null;
  }
  out.push(<span key={`close-${nodeId}`}>)</span>);
  return out;
}
