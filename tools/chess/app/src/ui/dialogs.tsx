// src/ui/dialogs.tsx
//
// The four things the app asks a person: what game do you want, which
// piece do you want that pawn to become, what does that key do, and
// what is the PGN you want to import. Each is a plain overlay with a
// real <form>, focus moved into it on open and Escape to leave, because
// a dialog you cannot dismiss from the keyboard is a trap.

import { useEffect, useRef, useState } from 'react';
import type { Color } from '../lib/types';
import { BISHOP, BLACK, KNIGHT, QUEEN, ROOK, WHITE } from '../lib/types';
import { LEVELS } from '../lib/engine';
import type { TimeControl } from '../lib/clock';
import { PRESETS, parseTimeControl } from '../lib/clock';
import { Piece } from './pieces';
import type { PieceSetId } from './pieces';
import { Icons } from './icons';

export type GameMode = 'human-engine' | 'human-human' | 'engine-engine';

export interface NewGameSettings {
  mode: GameMode;
  /** The colour the person plays in 'human-engine'. */
  humanColor: Color;
  level: number;
  /** null means no clock. */
  timeControl: TimeControl | null;
  /** A position to start from, or '' for the usual one. */
  startFen: string;
}

export interface NewGameDialogProps {
  initial: NewGameSettings;
  onStart: (settings: NewGameSettings) => void;
  onClose: () => void;
}

export function NewGameDialog({ initial, onStart, onClose }: NewGameDialogProps): JSX.Element {
  const [mode, setMode] = useState<GameMode>(initial.mode);
  const [humanColor, setHumanColor] = useState<Color>(initial.humanColor);
  const [level, setLevel] = useState(initial.level);
  const [clockChoice, setClockChoice] = useState<string>(initial.timeControl ? 'custom-preset' : 'none');
  const [customText, setCustomText] = useState('5+3');
  const [fen, setFen] = useState(initial.startFen);
  const firstRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const resolveControl = (): TimeControl | null => {
    if (clockChoice === 'none') return null;
    if (clockChoice === 'custom') return parseTimeControl(customText);
    const preset = PRESETS.find((p) => p.label === clockChoice);
    return preset ? preset.control : null;
  };

  return (
    <Overlay onClose={onClose} label="New game">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onStart({ mode, humanColor, level, timeControl: resolveControl(), startFen: fen.trim() });
        }}
      >
        <h2>New game</h2>
        <p className="chessapp-lede">Everything here can be changed again from the toolbar.</p>

        <label className="chessapp-field">
          <span>Who is playing</span>
          <div className="chessapp-choices" role="group">
            {(
              [
                ['human-engine', 'You vs the engine'],
                ['human-human', 'Two people, one board'],
                ['engine-engine', 'Engine vs engine'],
              ] as Array<[GameMode, string]>
            ).map(([id, label], i) => (
              <button
                key={id}
                ref={i === 0 ? firstRef : undefined}
                type="button"
                className={`chessapp-btn${mode === id ? ' is-on' : ''}`}
                aria-pressed={mode === id}
                onClick={() => setMode(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </label>

        {mode === 'human-engine' ? (
          <label className="chessapp-field">
            <span>You play</span>
            <div className="chessapp-choices" role="group">
              {(
                [
                  [WHITE, 'White'],
                  [BLACK, 'Black'],
                ] as Array<[Color, string]>
              ).map(([color, label]) => (
                <button
                  key={label}
                  type="button"
                  className={`chessapp-btn${humanColor === color ? ' is-on' : ''}`}
                  aria-pressed={humanColor === color}
                  onClick={() => setHumanColor(color)}
                >
                  <span className="chessapp-swatch" style={{ background: color === WHITE ? '#f4f2ee' : '#26232b' }} />
                  {label}
                </button>
              ))}
            </div>
          </label>
        ) : null}

        {mode !== 'human-human' ? (
          <label className="chessapp-field">
            <span>Engine strength</span>
            <select className="chessapp-select" value={level} onChange={(e) => setLevel(Number(e.target.value))}>
              {LEVELS.map((entry) => (
                <option key={entry.level} value={entry.level}>
                  {entry.level} · {entry.name} — depth {entry.depth}, {(entry.movetimeMs / 1000).toFixed(1)}s a move
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="chessapp-field">
          <span>Clock</span>
          <select className="chessapp-select" value={clockChoice} onChange={(e) => setClockChoice(e.target.value)}>
            <option value="none">No clock</option>
            {PRESETS.map((preset) => (
              <option key={preset.label} value={preset.label}>
                {preset.label}
              </option>
            ))}
            <option value="custom">Something else…</option>
          </select>
          {clockChoice === 'custom' ? (
            <input
              className="chessapp-input"
              style={{ marginTop: 6 }}
              value={customText}
              aria-label="Time control, minutes plus increment"
              placeholder="5+3"
              onChange={(e) => setCustomText(e.target.value)}
            />
          ) : null}
        </label>

        <label className="chessapp-field">
          <span>Start from a position (optional FEN)</span>
          <input
            className="chessapp-input"
            value={fen}
            placeholder="Leave empty for the usual starting position"
            onChange={(e) => setFen(e.target.value)}
          />
        </label>

        <div className="chessapp-actions">
          <button type="button" className="chessapp-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="chessapp-btn is-primary">
            Start
          </button>
        </div>
      </form>
    </Overlay>
  );
}

// ---------------------------------------------------------------------

export interface PromotionDialogProps {
  color: Color;
  set: PieceSetId;
  onChoose: (pieceType: number) => void;
  onCancel: () => void;
}

export function PromotionDialog({ color, set, onChoose, onCancel }: PromotionDialogProps): JSX.Element {
  const firstRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);
  const names: Record<number, string> = { [QUEEN]: 'Queen', [ROOK]: 'Rook', [BISHOP]: 'Bishop', [KNIGHT]: 'Knight' };
  return (
    <Overlay onClose={onCancel} label="Choose a promotion piece">
      <div style={{ textAlign: 'center' }}>
        <h2>Promote to</h2>
        <p className="chessapp-lede">Press Q, R, B or N, or click.</p>
        <div className="chessapp-promo">
          {[QUEEN, ROOK, BISHOP, KNIGHT].map((type, i) => (
            <button
              key={type}
              ref={i === 0 ? firstRef : undefined}
              type="button"
              onClick={() => onChoose(type)}
              aria-label={names[type]}
              title={names[type]}
            >
              <Piece code={type | (color << 3)} set={set} />
            </button>
          ))}
        </div>
        <div className="chessapp-actions" style={{ justifyContent: 'center' }}>
          <button type="button" className="chessapp-btn" onClick={onCancel}>
            Cancel the move
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ---------------------------------------------------------------------

export const SHORTCUTS: Array<[string, string]> = [
  ['←  →', 'One move back or forward'],
  ['Home  End', 'The start or the end of the game'],
  ['⇧ + arrows', 'Move the cursor on the board'],
  ['Enter', 'Pick the piece up, and put it down'],
  ['F', 'Flip the board'],
  ['N', 'New game'],
  ['T', 'Take back the last move'],
  ['Space', 'Play through the game, or stop'],
  ['A', 'Turn the engine analysis on or off'],
  ['E', 'Ask the engine to move now'],
  ['M  /', 'Type a move in algebraic notation'],
  ['S', 'Sound on or off'],
  ['C', 'Coordinates on or off'],
  ['P', 'Next piece set'],
  ['B', 'Next board theme'],
  ['R', 'Analyse the whole game'],
  ['Ctrl/⌘ S', 'Save this game as a PGN file'],
  ['Ctrl/⌘ C', 'Copy the game as PGN'],
  ['1 – 8', 'Set the engine strength'],
  ['?', 'This list'],
  ['Esc', 'Close whatever is open'],
];

export function ShortcutsOverlay({ onClose }: { onClose: () => void }): JSX.Element {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  return (
    <Overlay onClose={onClose} label="Keyboard shortcuts">
      <h2>Keyboard shortcuts</h2>
      <p className="chessapp-lede">
        Every action in the app is on this list. The bare arrow keys always walk through the game; hold Shift to move
        the cursor around the board instead, and press Enter to pick a piece up and put it down.
      </p>
      <div className="chessapp-keys">
        {SHORTCUTS.map(([keys, what]) => (
          <div className="chessapp-key" key={keys}>
            <kbd>{keys}</kbd>
            <span>{what}</span>
          </div>
        ))}
      </div>
      <div className="chessapp-actions">
        <button ref={closeRef} type="button" className="chessapp-btn is-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </Overlay>
  );
}

// ---------------------------------------------------------------------

export interface ImportDialogProps {
  onImport: (text: string) => string | null;
  onClose: () => void;
}

export function ImportDialog({ onImport, onClose }: ImportDialogProps): JSX.Element {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    areaRef.current?.focus();
  }, []);

  const submit = (value: string): void => {
    const problem = onImport(value);
    if (problem) setError(problem);
  };

  return (
    <Overlay onClose={onClose} label="Import PGN">
      <h2>Import a game</h2>
      <p className="chessapp-lede">Paste PGN, or choose a .pgn file. Variations, comments and annotations all come in.</p>
      <textarea
        ref={areaRef}
        className="chessapp-textarea"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        placeholder={'[Event "Casual game"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *'}
        aria-label="PGN text"
      />
      {error ? <p className="chessapp-error">{error}</p> : null}
      <div className="chessapp-actions">
        <label className="chessapp-btn" style={{ cursor: 'pointer' }}>
          <Icons.folder />
          Choose a file…
          <input
            type="file"
            accept=".pgn,text/plain"
            style={{ display: 'none' }}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const content = await file.text();
              setText(content);
              submit(content);
            }}
          />
        </label>
        <span style={{ flex: 1 }} />
        <button type="button" className="chessapp-btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="chessapp-btn is-primary" disabled={!text.trim()} onClick={() => submit(text)}>
          Import
        </button>
      </div>
    </Overlay>
  );
}

// ---------------------------------------------------------------------

export function Overlay({
  children,
  onClose,
  label,
}: {
  children: React.ReactNode;
  onClose: () => void;
  label: string;
}): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  return (
    <div
      className="chessapp-overlay"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="chessapp-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
            return;
          }
          if (event.key !== 'Tab' || !ref.current) return;
          // Keep the focus inside: a modal that lets Tab wander into the
          // board behind it is not modal.
          const focusable = ref.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input, select, textarea, [href], [tabindex]:not([tabindex="-1"])'
          );
          if (!focusable.length) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
