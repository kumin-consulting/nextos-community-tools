// The slash palette: type / anywhere on the board and the ready-made
// shapes appear, filtered as you type, chosen with the arrow keys. It is
// the fastest way to put a flowchart together without touching the mouse.

import React, { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { Icon, type IconName } from './icons';
import { LIBRARY, searchLibrary } from '../lib/library';
import { useSketch } from '../state/store';
import { sceneCenter } from '../state/view';

const ICONS: Record<string, IconName> = {
  start: 'ellipse',
  process: 'rect',
  decision: 'diamond',
  database: 'files',
  cloud: 'cloud',
  person: 'sparkle',
};

export const SlashPalette: React.FC = () => {
  const store = useSketch;
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const results = useMemo(() => (query ? searchLibrary(query) : LIBRARY), [query]);
  const close = (): void => store.getState().setDialog('slash', false);

  const insert = (id: string): void => {
    store.getState().insertLibrary(id, sceneCenter());
    close();
  };

  return (
    <Modal title="Shape library" description="Ready-made pieces, dropped into the middle of the view." onClose={close}>
      <label className="sk-search">
        <Icon name="search" size={16} />
        <input
          type="search"
          autoFocus
          value={query}
          placeholder="Search shapes"
          aria-label="Search shapes"
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter' && results[index]) {
              e.preventDefault();
              insert(results[index].id);
            }
          }}
        />
      </label>
      {results.length === 0 ? (
        <p className="sk-empty">Nothing matches "{query}".</p>
      ) : (
        <ul className="sk-palette" role="listbox" aria-label="Shapes">
          {results.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === index}
                className={`sk-palette-item${i === index ? ' is-active' : ''}`}
                onMouseEnter={() => setIndex(i)}
                onClick={() => insert(item.id)}
              >
                <Icon name={ICONS[item.id] ?? 'rect'} />
                <span className="sk-palette-name">{item.name}</span>
                <span className="sk-palette-keys">{item.keywords.slice(0, 3).join(', ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};
