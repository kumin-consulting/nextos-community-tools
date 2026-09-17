// src/ui/CardEditor.tsx
//
// Editing a card, in the browser's side panel and in the dialog the
// review screen opens with E. One component for both, because a card
// edited mid-review and a card edited from the table have to behave
// identically - including the part where an edited question keeps its
// schedule (store.editNote carries the state across to the new id).

import { useEffect, useMemo, useState } from 'react';
import type { DeckRecord } from '../store';
import { useStore } from '../store';
import { basicNote, clozeNote, clozeNumbers, parseTagList } from '../lib/markdown';
import type { Note } from '../lib/types';
import { Button, Field, TextInput } from './bits';
import { Markdown } from './Markdown';
import { CheckIcon, TagIcon } from './Icons';

export function CardEditor(props: { record: DeckRecord; noteIndex: number; onDone?: () => void; compact?: boolean }) {
  const note = props.record.deck.notes[props.noteIndex];
  const editNote = useStore((state) => state.editNote);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [tags, setTags] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!note) return;
    setQuestion(note.kind === 'basic' ? note.question : note.text);
    setAnswer(note.kind === 'basic' ? note.answer : '');
    setTags(note.tags.join(' '));
    setSaved(false);
  }, [note, props.noteIndex, props.record.name]);

  const isCloze = useMemo(() => clozeNumbers(question).length > 0, [question]);
  const dirty = note
    ? question !== (note.kind === 'basic' ? note.question : note.text) ||
      answer !== (note.kind === 'basic' ? note.answer : '') ||
      tags.trim() !== note.tags.join(' ')
    : false;

  if (!note) {
    return <p className="recall-muted">This card is no longer in the deck.</p>;
  }

  const save = (): void => {
    const tagList = parseTagList(tags);
    const next: Note = isCloze && !answer.trim() ? clozeNote(question.trim(), tagList) : basicNote(question.trim(), answer.trim(), tagList);
    if (note.kind === next.kind) next.tagStyle = note.tags.length ? note.tagStyle : next.tagStyle;
    editNote(props.record.name, props.noteIndex, next);
    setSaved(true);
    props.onDone?.();
  };

  return (
    <div className="recall-col-gap">
      <Field label={isCloze ? 'Text (with {{c1::deletions}})' : 'Question'}>
        <textarea
          className="recall-textarea"
          value={question}
          rows={props.compact ? 3 : 4}
          onChange={(event) => setQuestion(event.target.value)}
          aria-label="Question"
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && question.trim()) save();
          }}
        />
      </Field>
      {!isCloze ? (
        <Field label="Answer">
          <textarea
            className="recall-textarea"
            value={answer}
            rows={props.compact ? 3 : 5}
            onChange={(event) => setAnswer(event.target.value)}
            aria-label="Answer"
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && question.trim()) save();
            }}
          />
        </Field>
      ) : (
        <p className="recall-muted recall-row-gap" style={{ margin: 0 }}>
          <CheckIcon size={13} /> {clozeNumbers(question).length} cloze card{clozeNumbers(question).length === 1 ? '' : 's'} from this text.
        </p>
      )}
      <Field label="Tags" hint="Separated by spaces.">
        <TextInput value={tags} onChange={setTags} placeholder="chapter-3 hard" />
      </Field>
      <div>
        <p className="recall-section-title" style={{ marginBottom: 6 }}>
          Preview
        </p>
        <div className="recall-preview">
          <Markdown text={question} blanks />
          {!isCloze && answer.trim() ? (
            <>
              <div className="recall-divider" style={{ margin: '8px 0' }} />
              <Markdown text={answer} />
            </>
          ) : null}
          {parseTagList(tags).length ? (
            <div className="recall-wrap" style={{ marginTop: 8 }}>
              {parseTagList(tags).map((tag) => (
                <span key={tag} className="recall-tag">
                  <TagIcon size={10} /> {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="recall-row-gap" style={{ justifyContent: 'flex-end' }}>
        {saved && !dirty ? (
          <span className="recall-muted recall-row-gap">
            <CheckIcon size={13} /> Saved
          </span>
        ) : null}
        <Button variant="primary" onClick={save} disabled={!question.trim() || !dirty}>
          Save card
        </Button>
      </div>
    </div>
  );
}
