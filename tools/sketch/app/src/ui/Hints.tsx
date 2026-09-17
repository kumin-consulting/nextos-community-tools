// Two things that appear only when they should: the hint on a board with
// nothing on it, and the notice that replaces the canvas when a file on
// disk cannot be read. Neither is ever a blank white window.

import React from 'react';
import { Icon } from './icons';
import { useSketch } from '../state/store';

export const EmptyHint: React.FC = () => {
  const count = useSketch((s) => s.elements.length);
  const ready = useSketch((s) => s.ready);
  const setTool = useSketch((s) => s.setTool);
  const setDialog = useSketch((s) => s.setDialog);
  if (!ready || count > 0) return null;
  return (
    <div className="sk-firstrun" aria-live="polite">
      <h2>An empty board</h2>
      <ul>
        <li>
          <kbd>R</kbd> <kbd>O</kbd> <kbd>D</kbd> draw a rectangle, an ellipse, a diamond
        </li>
        <li>
          <kbd>A</kbd> drag from one shape to another - the arrow stays attached
        </li>
        <li>
          Double-click anywhere to type, or <kbd>/</kbd> for ready-made shapes
        </li>
        <li>
          <kbd>?</kbd> shows every shortcut
        </li>
      </ul>
      <div className="sk-firstrun-actions">
        <button type="button" className="sk-btn sk-btn-primary" onClick={() => setTool('rect')}>
          <Icon name="rect" size={16} /> Draw a rectangle
        </button>
        <button type="button" className="sk-btn" onClick={() => setDialog('slash', true)}>
          <Icon name="library" size={16} /> Shape library
        </button>
      </div>
    </div>
  );
};

export const CorruptNotice: React.FC = () => {
  const corrupt = useSketch((s) => s.corrupt);
  const store = useSketch;
  if (!corrupt) return null;
  return (
    <div className="sk-corrupt" role="alert">
      <div className="sk-corrupt-card">
        <h2>{corrupt.name} could not be opened</h2>
        <p>{corrupt.error}</p>
        {corrupt.raw ? (
          <pre className="sk-corrupt-raw">{corrupt.raw.slice(0, 400)}{corrupt.raw.length > 400 ? '…' : ''}</pre>
        ) : null}
        <p className="sk-hint">The file on disk has not been touched, and nothing will be written over it.</p>
        <div className="sk-firstrun-actions">
          <button type="button" className="sk-btn sk-btn-primary" onClick={() => void store.getState().openCorruptAsCopy()}>
            Start a fresh copy
          </button>
          <button type="button" className="sk-btn" onClick={() => store.getState().setDialog('files', true)}>
            Open another board
          </button>
        </div>
      </div>
    </div>
  );
};
