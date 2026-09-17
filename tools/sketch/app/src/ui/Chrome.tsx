// The window furniture: the document bar (name, save state, file menu),
// the action bar (undo/redo, view toggles, export, help) and the zoom
// controls. Small, but this is where most keyboard shortcuts become
// visible - every button says its own shortcut.

import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { useSketch } from '../state/store';
import { canvasSize } from '../state/view';
import { canRedo, canUndo } from '../lib/history';

const SAVE_LABEL: Record<string, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  dirty: 'Unsaved changes',
  error: 'Not saved',
};

export const DocumentBar: React.FC = () => {
  const name = useSketch((s) => s.name);
  const saveState = useSketch((s) => s.saveState);
  const saveError = useSketch((s) => s.saveError);
  const setDialog = useSketch((s) => s.setDialog);
  const renameDocument = useSketch((s) => s.renameDocument);
  const [editing, setEditing] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keyed on "is the field open", not on its value: keying it on the
  // value would re-select the text after every keystroke, and the next
  // character would replace the name instead of extending it.
  const isEditing = editing !== null;
  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  return (
    <div className="sk-island sk-docbar">
      <button type="button" className="sk-icon-btn" title="All boards — ⌘O" onClick={() => setDialog('files', true)} aria-keyshortcuts="Meta+O">
        <Icon name="files" />
        <span className="sk-sr">All boards</span>
      </button>
      {editing !== null ? (
        <input
          ref={inputRef}
          className="sk-name-input"
          value={editing}
          aria-label="Board name"
          onChange={(e) => setEditing(e.target.value)}
          onBlur={() => {
            void renameDocument(editing);
            setEditing(null);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              void renameDocument(editing);
              setEditing(null);
            }
            if (e.key === 'Escape') setEditing(null);
          }}
        />
      ) : (
        <button type="button" className="sk-name" title="Rename this board" onClick={() => setEditing(name)}>
          {name}
          <Icon name="pencil" size={14} />
        </button>
      )}
      <span
        className={`sk-save sk-save-${saveState}`}
        title={saveError ?? undefined}
        role="status"
        aria-live="polite"
      >
        {SAVE_LABEL[saveState]}
      </span>
    </div>
  );
};

export const ActionBar: React.FC = () => {
  const history = useSketch((s) => s.history);
  const dialogs = useSketch((s) => s.dialogs);
  const snapEnabled = useSketch((s) => s.snapEnabled);
  const background = useSketch((s) => s.background);
  const store = useSketch;
  return (
    <div className="sk-island sk-actionbar" role="toolbar" aria-label="Board actions">
      <button
        type="button"
        className="sk-icon-btn"
        title="Undo — ⌘Z"
        aria-keyshortcuts="Meta+Z"
        disabled={!canUndo(history)}
        onClick={() => store.getState().undo()}
      >
        <Icon name="undo" />
        <span className="sk-sr">Undo</span>
      </button>
      <button
        type="button"
        className="sk-icon-btn"
        title="Redo — ⌘⇧Z"
        aria-keyshortcuts="Meta+Shift+Z"
        disabled={!canRedo(history)}
        onClick={() => store.getState().redo()}
      >
        <Icon name="redo" />
        <span className="sk-sr">Redo</span>
      </button>
      <span className="sk-toolbar-divider" aria-hidden="true" />
      <button
        type="button"
        className={`sk-icon-btn${background !== 'plain' ? ' is-active' : ''}`}
        title={background === 'grid' ? 'Grid background — G' : background === 'dots' ? 'Dotted background — G' : 'Plain background — G'}
        aria-keyshortcuts="G"
        onClick={() => store.getState().setBackground(background === 'grid' ? 'dots' : background === 'dots' ? 'plain' : 'grid')}
      >
        <Icon name="grid" />
        <span className="sk-sr">Background style</span>
      </button>
      <button
        type="button"
        className={`sk-icon-btn${snapEnabled ? ' is-active' : ''}`}
        title="Snap to guides — ⇧S"
        aria-pressed={snapEnabled}
        aria-keyshortcuts="Shift+S"
        onClick={() => store.getState().toggleSnap()}
      >
        <Icon name="magnet" />
        <span className="sk-sr">Snap to guides</span>
      </button>
      <button
        type="button"
        className={`sk-icon-btn${dialogs.minimap ? ' is-active' : ''}`}
        title="Minimap — M"
        aria-pressed={dialogs.minimap}
        aria-keyshortcuts="M"
        onClick={() => store.getState().setDialog('minimap', !dialogs.minimap)}
      >
        <Icon name="map" />
        <span className="sk-sr">Minimap</span>
      </button>
      <span className="sk-toolbar-divider" aria-hidden="true" />
      <button type="button" className="sk-icon-btn" title="Export — ⌘E" aria-keyshortcuts="Meta+E" onClick={() => store.getState().setDialog('export', true)}>
        <Icon name="download" />
        <span className="sk-sr">Export</span>
      </button>
      <button type="button" className="sk-icon-btn" title="Keyboard shortcuts — ?" aria-keyshortcuts="?" onClick={() => store.getState().setDialog('shortcuts', true)}>
        <Icon name="help" />
        <span className="sk-sr">Keyboard shortcuts</span>
      </button>
    </div>
  );
};

export const ZoomBar: React.FC = () => {
  const zoom = useSketch((s) => s.viewport.zoom);
  const store = useSketch;
  const step = (factor: number): void => {
    const size = canvasSize();
    store.getState().zoomTo(zoom * factor, [size.width / 2, size.height / 2]);
  };
  return (
    <div className="sk-island sk-zoombar" role="toolbar" aria-label="Zoom">
      <button type="button" className="sk-icon-btn" title="Zoom out — ⌘−" onClick={() => step(1 / 1.2)}>
        <Icon name="zoom-out" size={16} />
        <span className="sk-sr">Zoom out</span>
      </button>
      <button
        type="button"
        className="sk-zoom-value"
        title="Reset zoom to 100% — ⌘0"
        onClick={() => {
          const size = canvasSize();
          store.getState().zoomTo(1, [size.width / 2, size.height / 2]);
        }}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" className="sk-icon-btn" title="Zoom in — ⌘+" onClick={() => step(1.2)}>
        <Icon name="zoom-in" size={16} />
        <span className="sk-sr">Zoom in</span>
      </button>
      <span className="sk-toolbar-divider" aria-hidden="true" />
      <button
        type="button"
        className="sk-icon-btn"
        title="Zoom to fit — ⇧1 (selection: ⇧2)"
        onClick={() => store.getState().zoomToFit(canvasSize(), false)}
      >
        <Icon name="fit" size={16} />
        <span className="sk-sr">Zoom to fit</span>
      </button>
    </div>
  );
};

export const StatusToast: React.FC = () => {
  const status = useSketch((s) => s.status);
  const setStatus = useSketch((s) => s.setStatus);
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 3200);
    return () => clearTimeout(timer);
  }, [status, setStatus]);
  if (!status) return null;
  return (
    <div className="sk-toast" role="status" aria-live="polite">
      {status}
    </div>
  );
};
