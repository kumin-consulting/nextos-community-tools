// src/ui/dialogs.tsx
//
// The dialogs the deck browser opens: new deck, rename, delete, deck
// settings, import and export. They are here rather than inline so the
// browser itself stays readable, and so each one owns its own draft
// state and can be cancelled without leaving anything half-applied.

import { useMemo, useState } from 'react';
import { Button, Checkbox, Field, Modal, NumberInput, Select, TextInput } from './bits';
import { AlertIcon, CheckIcon, CopyIcon, DownloadIcon, SparkIcon } from './Icons';
import { DEFAULT_SETTINGS, resolveSettings } from '../lib/scheduler';
import type { DeckSettings, DraftCard } from '../lib/types';
import { parseTsv, toTsv } from '../lib/tsv';
import { extractCards, mergeDrafts, parseAssistantCards } from '../lib/extract';
import { serialiseDeck } from '../lib/markdown';
import { askAssistant, copyToClipboard, homeDir, readIfPresent, vfs } from '../files';
import type { DeckRecord } from '../store';

/* -------------------------------------------------------- new deck */

export function NewDeckDialog(props: { onClose: () => void; onCreate: (name: string, description: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  return (
    <Modal
      title="New deck"
      onClose={props.onClose}
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => props.onCreate(name.trim(), description.trim())}>
            Create deck
          </Button>
        </>
      }
    >
      <Field label="Name" hint="This becomes the file name: ~/Recall/<name>.md">
        <TextInput
          value={name}
          onChange={setName}
          autoFocus
          placeholder="Spanish verbs"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && name.trim()) props.onCreate(name.trim(), description.trim());
          }}
        />
      </Field>
      <Field label="Description" hint="Optional - shown under the deck's name.">
        <TextInput value={description} onChange={setDescription} placeholder="Irregular preterite forms" />
      </Field>
    </Modal>
  );
}

export function RenameDialog(props: { current: string; onClose: () => void; onRename: (name: string) => void }) {
  const [name, setName] = useState(props.current);
  return (
    <Modal
      title="Rename deck"
      onClose={props.onClose}
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim() || name === props.current} onClick={() => props.onRename(name.trim())}>
            Rename
          </Button>
        </>
      }
    >
      <Field label="Name" hint="The file is renamed too, and its scheduling goes with it.">
        <TextInput
          value={name}
          onChange={setName}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter' && name.trim()) props.onRename(name.trim());
          }}
        />
      </Field>
    </Modal>
  );
}

export function ConfirmDialog(props: { title: string; body: string; confirmLabel: string; danger?: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal
      title={props.title}
      onClose={props.onClose}
      footer={
        <>
          <Button onClick={props.onClose} autoFocus>
            Cancel
          </Button>
          <Button variant={props.danger ? 'danger' : 'primary'} onClick={props.onConfirm}>
            {props.confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, lineHeight: 1.6 }}>{props.body}</p>
    </Modal>
  );
}

/* --------------------------------------------------- deck settings */

const STEPS_HINT = 'Minutes, separated by spaces. A card answered Good moves to the next one.';

function parseSteps(value: string): number[] {
  return value
    .split(/[\s,]+/)
    .map((part) => Number(part))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function DeckSettingsDialog(props: { record: DeckRecord; onClose: () => void; onSave: (patch: Partial<DeckSettings>) => void }) {
  const [draft, setDraft] = useState<DeckSettings>(props.record.settings);
  const [learning, setLearning] = useState(props.record.settings.learningSteps.join(' '));
  const [relearning, setRelearning] = useState(props.record.settings.relearningSteps.join(' '));
  const patch = (next: Partial<DeckSettings>): void => setDraft((current) => ({ ...current, ...next }));

  const save = (): void => {
    props.onSave(
      resolveSettings({
        ...draft,
        learningSteps: parseSteps(learning),
        relearningSteps: parseSteps(relearning),
      })
    );
  };

  return (
    <Modal
      title={`${props.record.name} - settings`}
      onClose={props.onClose}
      wide
      footer={
        <>
          <Button onClick={() => { setDraft(resolveSettings({})); setLearning(DEFAULT_SETTINGS.learningSteps.join(' ')); setRelearning(DEFAULT_SETTINGS.relearningSteps.join(' ')); }}>
            Reset to defaults
          </Button>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="recall-grid-2">
        <Field label="New cards a day" hint="How many unseen cards this deck introduces.">
          <NumberInput value={draft.newPerDay} min={0} max={9999} onChange={(value) => patch({ newPerDay: value })} />
        </Field>
        <Field label="Reviews a day" hint="A ceiling on how big a backlog day can get.">
          <NumberInput value={draft.reviewsPerDay} min={0} max={99999} onChange={(value) => patch({ reviewsPerDay: value })} />
        </Field>
        <Field label="Learning steps" hint={STEPS_HINT}>
          <TextInput value={learning} onChange={setLearning} placeholder="1 10" />
        </Field>
        <Field label="Relearning steps" hint="The steps a lapsed card goes back through.">
          <TextInput value={relearning} onChange={setRelearning} placeholder="10" />
        </Field>
        <Field label="Graduating interval (days)" hint="The first real interval, after the last learning step.">
          <NumberInput value={draft.graduatingInterval} min={1} max={365} onChange={(value) => patch({ graduatingInterval: value })} />
        </Field>
        <Field label="Easy interval (days)" hint="What Easy gives a card that is still learning.">
          <NumberInput value={draft.easyInterval} min={1} max={365} onChange={(value) => patch({ easyInterval: value })} />
        </Field>
        <Field label="Interval modifier" hint="Scales every review interval. Below 1 means more reviews.">
          <NumberInput value={draft.intervalModifier} min={0.1} max={3} onChange={(value) => patch({ intervalModifier: value })} />
        </Field>
        <Field label="Maximum interval (days)" hint="Nothing is ever scheduled further out than this.">
          <NumberInput value={draft.maximumInterval} min={1} max={36500} onChange={(value) => patch({ maximumInterval: value })} />
        </Field>
        <Field label="Leech threshold" hint="Lapses before a card is tagged a leech and suspended.">
          <NumberInput value={draft.leechThreshold} min={1} max={99} onChange={(value) => patch({ leechThreshold: value })} />
        </Field>
        <Field label="Day starts at" hint="A late night still counts as the day before.">
          <Select
            value={String(draft.dayCutoffHour)}
            onChange={(value) => patch({ dayCutoffHour: Number(value) })}
            options={Array.from({ length: 24 }, (_unused, hour) => ({ value: String(hour), label: `${String(hour).padStart(2, '0')}:00` }))}
          />
        </Field>
        <Field label="Order" hint="How today's cards are lined up.">
          <Select
            value={draft.order}
            onChange={(value) => patch({ order: value })}
            options={[
              { value: 'due', label: 'Most overdue first' },
              { value: 'random', label: 'Random' },
              { value: 'added', label: 'The order they were added' },
            ]}
          />
        </Field>
      </div>
      <Checkbox
        checked={draft.typedAnswers}
        onChange={(value) => patch({ typedAnswers: value })}
        label="Type the answer"
        hint="Reviews in this deck ask you to type the answer, and show you exactly what was different."
      />
      <Checkbox
        checked={draft.fuzz}
        onChange={(value) => patch({ fuzz: value })}
        label="Spread intervals out"
        hint="Nudges each interval a little so cards learned together do not come back together for ever."
      />
    </Modal>
  );
}

/* --------------------------------------------------------- export */

export function ExportDialog(props: { record: DeckRecord; onClose: () => void; onToast: (text: string) => void }) {
  const [format, setFormat] = useState<'md' | 'tsv'>('md');
  const text = useMemo(() => {
    if (format === 'md') return serialiseDeck(props.record.deck);
    return toTsv(
      props.record.cards.map((card) => ({ question: card.kind === 'cloze' ? card.back : card.front, answer: card.kind === 'cloze' ? card.answerText : card.back, tags: card.tags }))
    );
  }, [format, props.record]);

  const saveToFile = async (): Promise<void> => {
    const dir = `${homeDir()}/Exports`;
    const path = `${dir}/${props.record.name}.${format}`;
    try {
      await vfs().mkdir(dir, { recursive: true });
      await vfs().writeFile(path, text);
      props.onToast(`Saved to ${path}`);
      props.onClose();
    } catch (err) {
      props.onToast(`Could not save: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <Modal
      title={`Export ${props.record.name}`}
      onClose={props.onClose}
      wide
      footer={
        <>
          <Button onClick={props.onClose}>Close</Button>
          <Button
            onClick={async () => {
              props.onToast((await copyToClipboard(text)) ? 'Copied to the clipboard' : 'The clipboard is not available');
            }}
          >
            <CopyIcon /> Copy
          </Button>
          <Button variant="primary" onClick={saveToFile}>
            <DownloadIcon /> Save to ~/Exports
          </Button>
        </>
      }
    >
      <Field label="Format" hint={format === 'md' ? "Recall's own format - the deck file exactly as it is on disk." : 'Tab separated: front, back, tags. What Anki imports.'}>
        <Select
          value={format}
          onChange={setFormat}
          options={[
            { value: 'md', label: 'Markdown (.md)' },
            { value: 'tsv', label: 'Anki TSV (.tsv)' },
          ]}
        />
      </Field>
      <textarea className="recall-textarea recall-mono" readOnly value={text} rows={12} aria-label="Exported deck" />
    </Modal>
  );
}

/* --------------------------------------------------------- import */

export function ImportDialog(props: {
  decks: string[];
  defaultDeck: string | null;
  onClose: () => void;
  onImport: (deck: string | { create: string }, cards: DraftCard[]) => void;
}) {
  const [text, setText] = useState('');
  const [path, setPath] = useState('');
  const [target, setTarget] = useState<string>(props.defaultDeck ?? '__new__');
  const [newName, setNewName] = useState('Imported');
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseTsv(text), [text]);

  const readFile = async (): Promise<void> => {
    const full = path.startsWith('/') ? path : `${homeDir()}/${path.replace(/^~\/?/, '')}`;
    const content = await readIfPresent(full);
    if (content === null) setError(`Nothing readable at ${full}`);
    else {
      setError(null);
      setText(content);
    }
  };

  return (
    <Modal
      title="Import cards"
      onClose={props.onClose}
      wide
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!parsed.cards.length || (target === '__new__' && !newName.trim())}
            onClick={() => props.onImport(target === '__new__' ? { create: newName.trim() } : target, parsed.cards)}
          >
            Import {parsed.cards.length} card{parsed.cards.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <Field label="Paste tab-separated cards" hint="One card a line: front, tab, back, and optionally a third column of tags.">
        <textarea
          className="recall-textarea recall-mono"
          value={text}
          rows={8}
          placeholder={'What is the capital of Peru?\tLima\tgeography'}
          onChange={(event) => setText(event.target.value)}
          aria-label="Tab separated cards"
        />
      </Field>
      <div className="recall-row-gap">
        <div style={{ flex: 1 }}>
          <Field label="...or read a file" hint="A path in your home folder, e.g. Downloads/deck.tsv">
            <TextInput value={path} onChange={setPath} placeholder="Downloads/deck.tsv" />
          </Field>
        </div>
        <Button onClick={readFile} disabled={!path.trim()}>
          Read file
        </Button>
      </div>
      {error ? (
        <p className="recall-row-gap" style={{ color: 'var(--again)', margin: 0 }}>
          <AlertIcon /> {error}
        </p>
      ) : null}
      {text.trim() ? (
        <p className="recall-muted" style={{ margin: 0 }}>
          {parsed.cards.length} card{parsed.cards.length === 1 ? '' : 's'} ready{parsed.skipped ? `, ${parsed.skipped} line${parsed.skipped === 1 ? '' : 's'} without a back skipped` : ''}
          {parsed.tagged ? `, ${parsed.tagged} tagged` : ''}.
        </p>
      ) : null}
      <Field label="Into" hint="An existing deck, or a new one.">
        <Select
          value={target}
          onChange={setTarget}
          options={[{ value: '__new__', label: 'A new deck...' }, ...props.decks.map((name) => ({ value: name, label: name }))]}
        />
      </Field>
      {target === '__new__' ? (
        <Field label="New deck name">
          <TextInput value={newName} onChange={setNewName} />
        </Field>
      ) : null}
    </Modal>
  );
}

/* ------------------------------------------------ deck from notes */

export function NotesDialog(props: {
  decks: string[];
  onClose: () => void;
  onCreate: (name: string, cards: DraftCard[]) => void;
  onToast: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [asking, setAsking] = useState(false);
  const [extra, setExtra] = useState<DraftCard[]>([]);

  const result = useMemo(() => extractCards(text), [text]);
  const cards = useMemo(() => mergeDrafts(result.cards, extra), [result, extra]);
  const deckName = name.trim() || result.title || 'New deck';

  const ask = async (): Promise<void> => {
    setAsking(true);
    const reply = await askAssistant(
      'Turn the following notes into flash cards. Reply with a JSON array of objects with "question" and "answer" keys and nothing else. ' +
        'Keep each answer to one or two sentences.\n\n' +
        text.slice(0, 6000)
    );
    setAsking(false);
    if (!reply) {
      props.onToast('No assistant is available for this app right now.');
      return;
    }
    const drafted = parseAssistantCards(reply);
    if (!drafted.length) props.onToast('The assistant replied, but nothing in it looked like a card.');
    else {
      setExtra(drafted);
      props.onToast(`The assistant drafted ${drafted.length} card${drafted.length === 1 ? '' : 's'}.`);
    }
  };

  return (
    <Modal
      title="Make a deck from notes"
      onClose={props.onClose}
      wide
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button onClick={ask} disabled={asking || text.trim().length < 20}>
            <SparkIcon /> {asking ? 'Asking...' : 'Ask the assistant too'}
          </Button>
          <Button variant="primary" disabled={!cards.length} onClick={() => props.onCreate(deckName, cards)}>
            Create with {cards.length} card{cards.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <Field label="Paste your notes" hint="Headings, bullets, 'term: meaning' lines and Q:/A: pairs all become cards.">
        <textarea
          className="recall-textarea"
          rows={10}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setExtra([]);
          }}
          placeholder={'## Units\n\n- Ampere - the unit of electric current\n- Volt - the unit of potential difference'}
          aria-label="Notes"
        />
      </Field>
      <Field label="Deck name" hint={result.title ? `Taken from the "# ${result.title}" heading unless you change it.` : 'What to call the new deck.'}>
        <TextInput value={name} onChange={setName} placeholder={deckName} />
      </Field>
      {cards.length ? (
        <div>
          <p className="recall-section-title">{cards.length} cards found</p>
          <div className="recall-col-gap" style={{ maxHeight: 220, overflow: 'auto' }}>
            {cards.slice(0, 40).map((card, index) => (
              <div key={index} className="recall-card" style={{ padding: '7px 10px' }}>
                <div style={{ fontWeight: 500 }}>{card.question}</div>
                {card.answer ? <div className="recall-muted">{card.answer}</div> : null}
              </div>
            ))}
            {cards.length > 40 ? <p className="recall-muted">...and {cards.length - 40} more.</p> : null}
          </div>
        </div>
      ) : text.trim() ? (
        <p className="recall-row-gap recall-muted" style={{ margin: 0 }}>
          <AlertIcon /> Nothing in that text looked like a card yet. Try a heading with a body, or lines like "Term: meaning".
        </p>
      ) : null}
      {extra.length ? (
        <p className="recall-row-gap recall-muted" style={{ margin: 0 }}>
          <CheckIcon /> {extra.length} of these came from the assistant.
        </p>
      ) : null}
    </Modal>
  );
}

/* --------------------------------------------------- app settings */

export function AppSettingsDialog(props: {
  reminder: boolean;
  reminderTime: string;
  onClose: () => void;
  onSave: (patch: { reminder: boolean; reminderTime: string }) => void;
}) {
  const [reminder, setReminder] = useState(props.reminder);
  const [time, setTime] = useState(props.reminderTime);
  return (
    <Modal
      title="Recall settings"
      onClose={props.onClose}
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => props.onSave({ reminder, reminderTime: time })}>
            Save
          </Button>
        </>
      }
    >
      <Checkbox
        checked={reminder}
        onChange={setReminder}
        label="Remind me once a day"
        hint="A notification at the time below, but only when something is actually due, and only ever once a day."
      />
      <Field label="Time" hint="Recall can only check while it is open - it will catch up the next time you open it.">
        <TextInput value={time} onChange={setTime} type="time" />
      </Field>
    </Modal>
  );
}
