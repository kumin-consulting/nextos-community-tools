// src/ui/BrowseView.tsx
//
// Every card in a deck, in a table you can search, sort, select and act
// on in bulk - the screen you go to when a deck has drifted and needs
// tidying rather than reviewing. The search box speaks the small query
// language in lib/search.ts; the panel on the right edits whichever card
// has the cursor.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ctxFor, useStore } from '../store';
import type { DeckRecord } from '../store';
import { compareCards, matches, parseQuery } from '../lib/search';
import type { SearchSubject, SortKey } from '../lib/search';
import { plainText } from '../lib/md';
import { formatInterval } from '../lib/time';
import { Button, Empty, Modal, Select, TextInput } from './bits';
import { CardEditor } from './CardEditor';
import { ChevronDown, ChevronUp, LayersIcon, PauseIcon, PlayIcon, SearchIcon, StarIcon, TagIcon, TrashIcon } from './Icons';

const STATE_LABEL: Record<string, string> = { new: 'New', learning: 'Learning', relearning: 'Relearning', review: 'Review' };

export function BrowseView(props: { deck: string | null; onPickDeck: (deck: string) => void }) {
  const decks = useStore((state) => state.decks);
  const order = useStore((state) => state.order);
  const tick = useStore((state) => state.tick);
  const setCardFlag = useStore((state) => state.setCardFlag);
  const buryCards = useStore((state) => state.buryCards);
  const deleteCards = useStore((state) => state.deleteCards);
  const tagCards = useStore((state) => state.tagCards);
  const moveCards = useStore((state) => state.moveCards);
  const resetCards = useStore((state) => state.resetCards);
  const toast = useStore((state) => state.toast);

  const record: DeckRecord | undefined = props.deck ? decks[props.deck] : undefined;
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({ key: 'position', ascending: true });
  const [selection, setSelection] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'tag' | 'untag' | 'move' | 'delete' | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSelection([]);
    setCursor(null);
  }, [props.deck]);

  const subjects = useMemo<SearchSubject[]>(() => {
    if (!record) return [];
    return record.cards.map((card) => ({
      card,
      state: record.sidecar.cards[card.id] ?? { state: 'new', due: 0, interval: 0, ease: 2.5, reps: 0, lapses: 0, step: 0 },
      haystack: `${plainText(card.front)} ${plainText(card.back)} ${card.tags.join(' ')}`.toLowerCase(),
    }));
  }, [record]);

  const positions = useMemo(() => {
    const map = new Map<string, number>();
    subjects.forEach((subject, index) => map.set(subject.card.id, index));
    return map;
  }, [subjects]);

  const rows = useMemo(() => {
    if (!record) return [];
    const ctx = ctxFor(record.settings);
    const terms = parseQuery(query);
    const filtered = subjects.filter((subject) => matches(terms, subject, ctx));
    return filtered.sort((a, b) => compareCards(a, b, sort.key, sort.ascending, (card) => positions.get(card.id) ?? 0));
  }, [subjects, query, sort, record, positions, tick]);

  if (!order.length) {
    return (
      <Empty icon={<LayersIcon size={40} strokeWidth={1.2} />} title="No decks to browse">
        <p>Make a deck first and its cards will show up here.</p>
      </Empty>
    );
  }

  if (!record) {
    return (
      <div className="recall-page recall-page-wide">
        <DeckPicker decks={order} value={props.deck} onChange={props.onPickDeck} />
      </div>
    );
  }

  const cursorSubject = rows.find((row) => row.card.id === cursor) ?? rows[0];
  const selected = new Set(selection);
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.card.id));

  const toggle = (id: string, range: boolean): void => {
    if (range && cursor) {
      const from = rows.findIndex((row) => row.card.id === cursor);
      const to = rows.findIndex((row) => row.card.id === id);
      if (from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from];
        const ids = rows.slice(start, end + 1).map((row) => row.card.id);
        setSelection(Array.from(new Set([...selection, ...ids])));
        setCursor(id);
        return;
      }
    }
    setSelection(selected.has(id) ? selection.filter((value) => value !== id) : [...selection, id]);
    setCursor(id);
  };

  const act = (fn: () => void, message: string): void => {
    fn();
    toast(message);
  };

  const ids = selection.length ? selection : cursorSubject ? [cursorSubject.card.id] : [];
  const anySuspended = ids.some((id) => record.sidecar.cards[id]?.suspended);

  return (
    <div className="recall-page recall-page-wide">
      <div className="recall-toolbar" ref={searchRef}>
        <DeckPicker decks={order} value={props.deck} onChange={props.onPickDeck} />
        <div className="recall-search">
          <SearchIcon size={14} />
          <TextInput
            value={query}
            onChange={setQuery}
            label="Search cards"
            placeholder="capital  tag:geo  is:due  due<7  prop:lapses>2"
          />
        </div>
        <span className="recall-muted recall-nowrap">
          {rows.length} of {subjects.length}
          {selection.length ? ` · ${selection.length} selected` : ''}
        </span>
      </div>

      {ids.length ? (
        <div className="recall-toolbar" role="group" aria-label="Actions for the selected cards">
          <Button onClick={() => act(() => setCardFlag(record.name, ids, 'suspended', !anySuspended), anySuspended ? 'Unsuspended' : 'Suspended')}>
            {anySuspended ? <PlayIcon size={13} /> : <PauseIcon size={13} />} {anySuspended ? 'Unsuspend' : 'Suspend'}
          </Button>
          <Button onClick={() => act(() => buryCards(record.name, ids), 'Buried until tomorrow')}>Bury</Button>
          <Button onClick={() => act(() => setCardFlag(record.name, ids, 'marked', true), 'Marked')}>
            <StarIcon size={13} /> Mark
          </Button>
          <Button onClick={() => setDialog('tag')}>
            <TagIcon size={13} /> Tag
          </Button>
          <Button onClick={() => setDialog('untag')}>Remove tag</Button>
          <Button onClick={() => setDialog('move')} disabled={order.length < 2}>
            Move to deck
          </Button>
          <Button onClick={() => act(() => resetCards(record.name, ids), 'Scheduling reset - these cards are new again')}>Forget</Button>
          <Button variant="danger" onClick={() => setDialog('delete')}>
            <TrashIcon size={13} /> Delete
          </Button>
        </div>
      ) : null}

      <div className="recall-browse">
        <div className="recall-table-wrap">
          <div className="recall-scroll">
            <table className="recall-table">
              <thead>
                <tr>
                  <th style={{ width: 28 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      aria-label="Select every card shown"
                      onChange={() => setSelection(allSelected ? [] : rows.map((row) => row.card.id))}
                    />
                  </th>
                  <SortHeader label="Question" column="front" sort={sort} onSort={setSort} />
                  <SortHeader label="State" column="state" sort={sort} onSort={setSort} />
                  <SortHeader label="Due" column="due" sort={sort} onSort={setSort} />
                  <SortHeader label="Interval" column="interval" sort={sort} onSort={setSort} />
                  <SortHeader label="Ease" column="ease" sort={sort} onSort={setSort} />
                  <SortHeader label="Lapses" column="lapses" sort={sort} onSort={setSort} />
                  <th>Tags</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const state = row.state;
                  const days = Math.ceil((state.due - Date.now()) / 86400000);
                  return (
                    <tr
                      key={row.card.id}
                      className="recall-row"
                      data-selected={selected.has(row.card.id) || cursorSubject?.card.id === row.card.id}
                      data-suspended={state.suspended === true}
                      onClick={(event) => {
                        if (event.metaKey || event.ctrlKey || event.shiftKey) toggle(row.card.id, event.shiftKey);
                        else {
                          setCursor(row.card.id);
                          setSelection([]);
                        }
                      }}
                    >
                      <td onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(row.card.id)}
                          aria-label={`Select ${plainText(row.card.front).slice(0, 40)}`}
                          onChange={() => toggle(row.card.id, false)}
                        />
                      </td>
                      <td className="recall-cell-front">
                        {state.marked ? <StarIcon size={11} /> : null} {plainText(row.card.front)}
                      </td>
                      <td className="recall-nowrap">{state.suspended ? 'Suspended' : STATE_LABEL[state.state]}</td>
                      <td className="recall-nowrap recall-muted">
                        {state.state === 'new' ? '—' : days <= 0 ? 'now' : formatInterval(days)}
                      </td>
                      <td className="recall-nowrap recall-muted">{state.interval ? formatInterval(state.interval) : '—'}</td>
                      <td className="recall-nowrap recall-muted">{state.reps ? state.ease.toFixed(2) : '—'}</td>
                      <td className="recall-nowrap recall-muted">{state.lapses || '—'}</td>
                      <td>
                        <div className="recall-wrap">
                          {row.card.tags.map((tag) => (
                            <span key={tag} className="recall-tag">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!rows.length ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 24, textAlign: 'center' }} className="recall-muted">
                      {subjects.length ? 'No card matches that search.' : 'This deck has no cards yet.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="recall-card recall-editor">
          {cursorSubject ? (
            <>
              <p className="recall-section-title" style={{ margin: 0 }}>
                {cursorSubject.card.kind === 'cloze' ? `Cloze card ${cursorSubject.card.ordinal}` : 'Card'}
              </p>
              <CardEditor record={record} noteIndex={cursorSubject.card.noteIndex} compact />
            </>
          ) : (
            <p className="recall-muted" style={{ margin: 0 }}>
              Pick a card to edit it.
            </p>
          )}
        </div>
      </div>

      {dialog === 'tag' || dialog === 'untag' ? (
        <TagDialog
          mode={dialog}
          count={ids.length}
          existing={Array.from(new Set(record.cards.flatMap((card) => card.tags))).sort()}
          onClose={() => setDialog(null)}
          onApply={(tag) => {
            tagCards(record.name, ids, tag, dialog === 'tag');
            setDialog(null);
            toast(dialog === 'tag' ? `Tagged ${ids.length} card${ids.length === 1 ? '' : 's'} "${tag}"` : `Removed "${tag}"`);
          }}
        />
      ) : null}

      {dialog === 'move' ? (
        <MoveDialog
          decks={order.filter((name) => name !== record.name)}
          count={ids.length}
          onClose={() => setDialog(null)}
          onMove={async (target) => {
            setDialog(null);
            await moveCards(record.name, ids, target);
            setSelection([]);
            toast(`Moved ${ids.length} card${ids.length === 1 ? '' : 's'} to ${target}`);
          }}
        />
      ) : null}

      {dialog === 'delete' ? (
        <Modal
          title="Delete cards"
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button onClick={() => setDialog(null)} autoFocus>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  deleteCards(record.name, ids);
                  setSelection([]);
                  setCursor(null);
                  setDialog(null);
                  toast(`Deleted ${ids.length} card${ids.length === 1 ? '' : 's'}`);
                }}
              >
                Delete
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            {ids.length === 1 ? 'This card' : `These ${ids.length} cards`} will be removed from{' '}
            <strong>{record.name}.md</strong>, along with {ids.length === 1 ? 'its' : 'their'} scheduling. A cloze card takes the
            whole line it belongs to with it.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}

function DeckPicker(props: { decks: string[]; value: string | null; onChange: (deck: string) => void }) {
  return (
    <div style={{ width: 220, flex: '0 0 auto' }}>
      <Select
        value={props.value ?? props.decks[0] ?? ''}
        onChange={props.onChange}
        label="Deck"
        options={props.decks.map((name) => ({ value: name, label: name }))}
      />
    </div>
  );
}

function SortHeader(props: {
  label: string;
  column: SortKey;
  sort: { key: SortKey; ascending: boolean };
  onSort: (sort: { key: SortKey; ascending: boolean }) => void;
}) {
  const active = props.sort.key === props.column;
  return (
    <th aria-sort={active ? (props.sort.ascending ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => props.onSort({ key: props.column, ascending: active ? !props.sort.ascending : true })}>
        {props.label}
        {active ? props.sort.ascending ? <ChevronUp size={12} /> : <ChevronDown size={12} /> : null}
      </button>
    </th>
  );
}

function TagDialog(props: { mode: 'tag' | 'untag'; count: number; existing: string[]; onClose: () => void; onApply: (tag: string) => void }) {
  const [tag, setTag] = useState(props.mode === 'untag' ? props.existing[0] ?? '' : '');
  return (
    <Modal
      title={props.mode === 'tag' ? `Tag ${props.count} card${props.count === 1 ? '' : 's'}` : 'Remove a tag'}
      onClose={props.onClose}
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" disabled={!tag.trim()} onClick={() => props.onApply(tag.trim())}>
            {props.mode === 'tag' ? 'Add tag' : 'Remove tag'}
          </Button>
        </>
      }
    >
      {props.mode === 'untag' && props.existing.length ? (
        <Select value={tag} onChange={setTag} label="Tag" options={props.existing.map((name) => ({ value: name, label: name }))} />
      ) : (
        <TextInput
          value={tag}
          onChange={setTag}
          autoFocus
          label="Tag"
          placeholder="chapter-3"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && tag.trim()) props.onApply(tag.trim());
          }}
        />
      )}
      {props.mode === 'tag' && props.existing.length ? (
        <div className="recall-wrap">
          {props.existing.slice(0, 20).map((name) => (
            <button key={name} type="button" className="recall-tag" onClick={() => setTag(name)}>
              {name}
            </button>
          ))}
        </div>
      ) : null}
    </Modal>
  );
}

function MoveDialog(props: { decks: string[]; count: number; onClose: () => void; onMove: (deck: string) => void }) {
  const [target, setTarget] = useState(props.decks[0] ?? '');
  return (
    <Modal
      title={`Move ${props.count} card${props.count === 1 ? '' : 's'}`}
      onClose={props.onClose}
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" disabled={!target} onClick={() => props.onMove(target)}>
            Move
          </Button>
        </>
      }
    >
      <p className="recall-muted" style={{ margin: 0 }}>
        The cards keep their scheduling. A card the target deck already has is left where it is.
      </p>
      <Select value={target} onChange={setTarget} label="Deck" options={props.decks.map((name) => ({ value: name, label: name }))} />
    </Modal>
  );
}
