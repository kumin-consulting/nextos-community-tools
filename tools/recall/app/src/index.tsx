// src/index.tsx
//
// Recall: spaced-repetition flash cards whose decks are plain Markdown
// files in ~/Recall. This module is the app's whole surface to the OS:
//
//   default export   the window's content
//   tools            what an agent can do with a deck (src/tools.ts)
//   intents          kumin://recall/open and /study
//   onInstall        makes ~/Recall so the first run has somewhere to go
//
// The component itself does four things: it wires the keyboard, it keeps
// the decks in step with the files on disk, it runs the daily reminder,
// and it decides which of the four screens you are looking at.

import { useCallback, useEffect, useMemo, useState } from 'react';
import sdk from '@kumin/sdk';
import './styles.css';
import { useStore } from './store';
import type { DeckRecord } from './store';
import { countsFor } from './store';
import { currentSaveState, flush, onSaveState, notify, type SaveState } from './files';
import { DecksView } from './ui/DecksView';
import type { DeckDialog } from './ui/DecksView';
import { TodayView } from './ui/TodayView';
import { BrowseView } from './ui/BrowseView';
import { ReviewView } from './ui/ReviewView';
import { ShortcutsOverlay } from './ui/ShortcutsOverlay';
import {
  AppSettingsDialog,
  ConfirmDialog,
  DeckSettingsDialog,
  ExportDialog,
  ImportDialog,
  NewDeckDialog,
  NotesDialog,
  RenameDialog,
} from './ui/dialogs';
import { IconButton } from './ui/bits';
import { AlertIcon, BrainIcon, CalendarIcon, KeyboardIcon, LayersIcon, SaveIcon, SlidersIcon, TargetIcon } from './ui/Icons';
import { emptyDeck, serialiseDeck } from './lib/markdown';

export { tools } from './tools';
export { intents, onInstall } from './tools';

type Dialog = DeckDialog | { kind: 'app-settings' } | null;

/** Typing somewhere? Then the single-letter shortcuts are just letters. */
function isTyping(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  if (!node || !node.tagName) return false;
  const tag = node.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || node.isContentEditable === true;
}

export default function Recall() {
  const isDark = sdk.theme.useIsDark();
  const store = useStore();
  const { view, session, decks, order, selected } = store;
  const [dialog, setDialog] = useState<Dialog>(null);
  const [shortcuts, setShortcuts] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>(currentSaveState());

  /* ------------------------------------------------------ lifecycle */

  useEffect(() => {
    void store.init();
    return onSaveState(setSaveState);
    // The store is a stable singleton; this runs once, on purpose.
  }, []);

  // Everything outstanding reaches the disk when the window goes away.
  useEffect(() => {
    const onHide = (): void => {
      void flush();
    };
    const onFocus = (): void => {
      void store.reloadIfChanged();
    };
    window.addEventListener('blur', onHide);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('blur', onHide);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onHide);
      void flush();
    };
  }, []);

  // A minute is fine: it is what turns "due in 1 minute" into "due".
  useEffect(() => {
    const timer = setInterval(() => store.bump(), 60000);
    return () => clearInterval(timer);
  }, []);

  const records = useMemo(() => order.map((name) => decks[name]).filter(Boolean), [order, decks]);
  const totalDue = useMemo(() => {
    const now = Date.now();
    return records.reduce((sum, record) => sum + countsFor(record, now).due, 0);
  }, [records, store.tick]);

  useReminder(totalDue);

  /* -------------------------------------------------------- actions */

  const startStudy = useCallback((deckNames: string[]) => {
    const names = deckNames.filter((name) => useStore.getState().decks[name]);
    if (!names.length) return;
    useStore.getState().startSession(names);
  }, []);

  const openDialog = useCallback((next: DeckDialog) => setDialog(next), []);

  /* ------------------------------------------------------- keyboard */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const state = useStore.getState();
      const typing = isTyping(event.target);
      const key = event.key;

      if (key === '?' && !typing) {
        event.preventDefault();
        setShortcuts((value) => !value);
        return;
      }
      if (key === 'Escape') {
        if (shortcuts) {
          setShortcuts(false);
          return;
        }
        if (dialog) return; // the modal handles its own Escape
        if (state.session) {
          event.preventDefault();
          state.endSession();
        }
        return;
      }
      if (dialog || shortcuts) return;

      if (state.session) {
        if (typing && key !== 'Escape') return;
        switch (key) {
          case ' ':
            event.preventDefault();
            if (state.session.flipped) state.grade(3);
            else state.flip();
            return;
          case '1':
          case '2':
          case '3':
          case '4':
            if (state.session.flipped) {
              event.preventDefault();
              state.grade(Number(key) as 1 | 2 | 3 | 4);
            }
            return;
          case 'z':
          case 'Z':
            event.preventDefault();
            state.undoGrade();
            return;
          case 's':
          case 'S':
            event.preventDefault();
            state.sessionAction('suspend');
            return;
          case 'b':
          case 'B':
            event.preventDefault();
            state.sessionAction('bury');
            return;
          case 'm':
          case 'M':
            event.preventDefault();
            state.sessionAction('mark');
            return;
          default:
            return;
        }
      }

      if (typing) return;

      switch (key) {
        case '1':
          state.setView('decks');
          return;
        case '2':
          state.setView('today');
          return;
        case '3':
          state.setView('browse');
          return;
        case 'n':
        case 'N':
          event.preventDefault();
          setDialog({ kind: 'new' });
          return;
        case 'i':
        case 'I':
          event.preventDefault();
          setDialog({ kind: 'import' });
          return;
        case 'g':
        case 'G':
          event.preventDefault();
          setDialog({ kind: 'notes' });
          return;
        case 'r':
        case 'R':
          event.preventDefault();
          void state.reload();
          state.toast('Reloaded from ~/Recall');
          return;
        case '/':
          if (state.view !== 'browse') {
            event.preventDefault();
            state.setView('browse');
            setTimeout(() => {
              const input = document.querySelector<HTMLInputElement>('.recall-search input');
              input?.focus();
            }, 0);
          }
          return;
        default:
          break;
      }

      if (state.view !== 'decks' || !state.order.length) return;
      const index = state.selected ? state.order.indexOf(state.selected) : -1;
      switch (key) {
        case 'ArrowDown':
          event.preventDefault();
          state.select(state.order[Math.min(state.order.length - 1, index + 1)] ?? state.order[0]);
          return;
        case 'ArrowUp':
          event.preventDefault();
          state.select(state.order[Math.max(0, index - 1)] ?? state.order[0]);
          return;
        case 'Enter': {
          if (!state.selected) return;
          event.preventDefault();
          startStudy([state.selected]);
          return;
        }
        case 'e':
        case 'E':
          if (!state.selected) return;
          event.preventDefault();
          state.setView('browse');
          return;
        case 's':
        case 'S':
          if (!state.selected) return;
          event.preventDefault();
          setDialog({ kind: 'settings', deck: state.selected });
          return;
        case 'Backspace':
          if (!state.selected) return;
          event.preventDefault();
          setDialog({ kind: 'delete', deck: state.selected });
          return;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialog, shortcuts, startStudy]);

  /* ---------------------------------------------------------- render */

  const record: DeckRecord | undefined = dialog && 'deck' in dialog ? decks[dialog.deck] : undefined;

  return (
    <div className="recall" data-theme={isDark ? 'dark' : 'light'}>
      {!session ? (
        <header className="recall-top">
          <span className="recall-brand">
            <BrainIcon size={18} />
            Recall
          </span>
          <div className="recall-tabs" role="tablist" aria-label="Views">
            <button type="button" className="recall-tab" role="tab" aria-selected={view === 'decks'} onClick={() => store.setView('decks')}>
              <LayersIcon size={13} /> Decks
            </button>
            <button type="button" className="recall-tab" role="tab" aria-selected={view === 'today'} onClick={() => store.setView('today')}>
              <CalendarIcon size={13} /> Today
              {totalDue ? <span className="recall-pill">{totalDue}</span> : null}
            </button>
            <button type="button" className="recall-tab" role="tab" aria-selected={view === 'browse'} onClick={() => store.setView('browse')}>
              <TargetIcon size={13} /> Cards
            </button>
          </div>
          <span className="recall-spacer" />
          <div className="recall-status">
            <SavedIndicator state={saveState} />
            {store.loadError ? (
              <span className="recall-row-gap" style={{ color: 'var(--again)' }} title={store.loadError}>
                <AlertIcon size={13} /> ~/Recall could not be read
              </span>
            ) : null}
            <IconButton label="Recall settings" onClick={() => setDialog({ kind: 'app-settings' })}>
              <SlidersIcon />
            </IconButton>
            <IconButton label="Keyboard shortcuts (?)" onClick={() => setShortcuts(true)}>
              <KeyboardIcon />
            </IconButton>
          </div>
        </header>
      ) : null}

      <div className="recall-body">
        {!store.ready ? (
          <p className="recall-muted" style={{ padding: 24 }}>
            Reading ~/Recall...
          </p>
        ) : session ? (
          <ReviewView onExit={() => store.endSession()} />
        ) : view === 'decks' ? (
          <DecksView onStudy={(deck) => startStudy([deck])} onDialog={openDialog} onBrowse={(deck) => { store.select(deck); store.setView('browse'); }} />
        ) : view === 'today' ? (
          <TodayView onStudy={startStudy} onSettings={() => setDialog({ kind: 'app-settings' })} />
        ) : (
          <BrowseView deck={selected} onPickDeck={(deck) => store.select(deck)} />
        )}

        {store.toasts.length ? (
          <div className="recall-toasts">
            {store.toasts.map((toast) => (
              <div key={toast.id} className="recall-toast" role="status">
                <span>{toast.text}</span>
                {toast.action ? (
                  <button
                    type="button"
                    onClick={() => {
                      toast.action?.run();
                      store.dismissToast(toast.id);
                    }}
                  >
                    {toast.action.label}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {shortcuts ? <ShortcutsOverlay onClose={() => setShortcuts(false)} /> : null}

      {dialog?.kind === 'new' ? (
        <NewDeckDialog
          onClose={() => setDialog(null)}
          onCreate={async (name, description) => {
            setDialog(null);
            const text = serialiseDeck(emptyDeck(name, description));
            const created = await store.createDeck(name, text);
            store.toast(`Created ${created}.md - add cards in the Cards view, from notes, or in any editor.`);
            store.setView('browse');
          }}
        />
      ) : null}

      {dialog?.kind === 'rename' && record ? (
        <RenameDialog
          current={record.name}
          onClose={() => setDialog(null)}
          onRename={async (name) => {
            setDialog(null);
            await store.renameDeck(record.name, name);
          }}
        />
      ) : null}

      {dialog?.kind === 'delete' && record ? (
        <ConfirmDialog
          title={`Delete ${record.name}?`}
          body={`${record.name}.md and its scheduling file are removed from ~/Recall. ${record.cards.length} card${record.cards.length === 1 ? '' : 's'} and their review history go with them. This cannot be undone.`}
          confirmLabel="Delete deck"
          danger
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            const name = record.name;
            setDialog(null);
            await store.deleteDeck(name);
            store.toast(`Deleted ${name}`);
          }}
        />
      ) : null}

      {dialog?.kind === 'settings' && record ? (
        <DeckSettingsDialog
          record={record}
          onClose={() => setDialog(null)}
          onSave={(patch) => {
            store.saveDeckSettings(record.name, patch);
            setDialog(null);
            store.toast('Deck settings saved');
          }}
        />
      ) : null}

      {dialog?.kind === 'export' && record ? (
        <ExportDialog record={record} onClose={() => setDialog(null)} onToast={store.toast} />
      ) : null}

      {dialog?.kind === 'import' ? (
        <ImportDialog
          decks={order}
          defaultDeck={selected}
          onClose={() => setDialog(null)}
          onImport={async (target, cards) => {
            setDialog(null);
            const name = typeof target === 'string' ? target : await store.createDeck(target.create);
            const result = await store.addDrafts(name, cards);
            store.toast(`Imported ${result.added} card${result.added === 1 ? '' : 's'} into ${name}${result.duplicates ? `, skipped ${result.duplicates} already there` : ''}`);
          }}
        />
      ) : null}

      {dialog?.kind === 'notes' ? (
        <NotesDialog
          decks={order}
          onClose={() => setDialog(null)}
          onToast={store.toast}
          onCreate={async (name, cards) => {
            setDialog(null);
            const created = await store.createDeck(name);
            const result = await store.addDrafts(created, cards);
            store.toast(`${created}: ${result.added} card${result.added === 1 ? '' : 's'} added`);
          }}
        />
      ) : null}

      {dialog?.kind === 'app-settings' ? (
        <AppSettingsDialog
          reminder={store.settings.reminder}
          reminderTime={store.settings.reminderTime}
          onClose={() => setDialog(null)}
          onSave={(patch) => {
            store.patchSettings(patch);
            setDialog(null);
            store.toast(patch.reminder ? `Reminder set for ${patch.reminderTime}` : 'Reminder off');
          }}
        />
      ) : null}
    </div>
  );
}

function SavedIndicator(props: { state: SaveState }) {
  if (props.state === 'idle') return null;
  const label =
    props.state === 'error' ? 'Could not write to ~/Recall' : props.state === 'saving' || props.state === 'pending' ? 'Saving...' : 'Saved';
  return (
    <span className="recall-saved" data-state={props.state} title={label}>
      {props.state === 'error' ? <AlertIcon size={13} /> : <SaveIcon size={13} />}
      {label}
    </span>
  );
}

/**
 * The daily reminder. There is no background timer in the OS for an app
 * to book, so this is honest about what it is: while Recall is open it
 * checks once a minute, and when it is opened it reconciles - if the
 * chosen time has already passed today and cards are due, the reminder
 * arrives then rather than never.
 */
function useReminder(totalDue: number): void {
  const settings = useStore((state) => state.settings);
  const patchSettings = useStore((state) => state.patchSettings);

  useEffect(() => {
    if (!settings.reminder) return;
    const check = (): void => {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (settings.reminderSent === today) return;
      const [hours, minutes] = settings.reminderTime.split(':').map(Number);
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      if (nowMinutes < hours * 60 + minutes) return;
      if (totalDue <= 0) return;
      patchSettings({ reminderSent: today });
      void notify('Cards are due in Recall', `${totalDue} card${totalDue === 1 ? '' : 's'} are waiting.`);
    };
    check();
    const timer = setInterval(check, 60000);
    return () => clearInterval(timer);
  }, [settings.reminder, settings.reminderTime, settings.reminderSent, totalDue, patchSettings]);
}
