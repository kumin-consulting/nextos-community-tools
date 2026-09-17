// Every board you have, newest first: open one, rename it, duplicate it,
// delete it, start a new one, or bring a .sketch.json in from elsewhere.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from './Modal';
import { Icon } from './icons';
import { useSketch } from '../state/store';
import { FILE_EXTENSION } from '../state/files';

const when = (mtime: number): string => {
  if (!mtime) return '';
  const date = new Date(mtime);
  const days = Math.floor((Date.now() - mtime) / 86_400_000);
  if (days <= 0) return `today, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
};

export const FileSwitcher: React.FC = () => {
  const files = useSketch((s) => s.files);
  const path = useSketch((s) => s.path);
  const recent = useSketch((s) => s.recent);
  const store = useSketch;
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void store.getState().refreshFiles();
  }, [store]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? files.filter((f) => f.name.toLowerCase().includes(q)) : files;
    const recentFirst = [...list].sort((a, b) => {
      const ra = recent.indexOf(a.path);
      const rb = recent.indexOf(b.path);
      if (ra === rb) return b.mtime - a.mtime;
      if (ra === -1) return 1;
      if (rb === -1) return -1;
      return ra - rb;
    });
    return recentFirst;
  }, [files, query, recent]);

  const close = (): void => store.getState().setDialog('files', false);

  return (
    <Modal
      title="Boards"
      description={`Saved in your Sketches folder as ${FILE_EXTENSION} files.`}
      onClose={close}
      footer={
        <>
          <button
            type="button"
            className="sk-btn"
            onClick={() => {
              void store.getState().newDocument('Untitled');
              close();
            }}
          >
            <Icon name="plus" size={16} /> New board
          </button>
          <button type="button" className="sk-btn" onClick={() => fileInput.current?.click()}>
            <Icon name="upload" size={16} /> Import a file
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="sk-sr"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const text = await file.text();
              await store.getState().importDocument(text, file.name.replace(/\.sketch\.json$|\.json$/, ''));
              close();
            }}
          />
        </>
      }
    >
      <label className="sk-search">
        <Icon name="search" size={16} />
        <input
          type="search"
          value={query}
          placeholder="Search boards"
          aria-label="Search boards"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </label>
      {shown.length === 0 ? (
        <p className="sk-empty">{files.length ? 'No board matches that.' : 'No boards yet - the one you are on will appear here once it is saved.'}</p>
      ) : (
        <ul className="sk-filelist">
          {shown.map((file) => (
            <li key={file.path} className={file.path === path ? 'is-current' : undefined}>
              <button
                type="button"
                className="sk-file-open"
                onClick={() => {
                  void store.getState().openDocument(file.path);
                  close();
                }}
              >
                <Icon name="file" size={16} />
                <span className="sk-file-name">{file.name}</span>
                <span className="sk-file-meta">{when(file.mtime)}</span>
              </button>
              <span className="sk-file-actions">
                {file.path === path ? (
                  <button
                    type="button"
                    className="sk-icon-btn"
                    title="Duplicate this board"
                    onClick={() => {
                      void store.getState().duplicateDocument();
                      close();
                    }}
                  >
                    <Icon name="copy" size={16} />
                    <span className="sk-sr">Duplicate {file.name}</span>
                  </button>
                ) : null}
                {confirming === file.path ? (
                  <button
                    type="button"
                    className="sk-btn sk-btn-danger sk-btn-small"
                    onClick={() => {
                      void store.getState().deleteDocument(file.path);
                      setConfirming(null);
                    }}
                  >
                    Delete for good
                  </button>
                ) : (
                  <button type="button" className="sk-icon-btn" title={`Delete ${file.name}`} onClick={() => setConfirming(file.path)}>
                    <Icon name="trash" size={16} />
                    <span className="sk-sr">Delete {file.name}</span>
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};
