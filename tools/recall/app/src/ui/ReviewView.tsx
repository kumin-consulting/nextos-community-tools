// src/ui/ReviewView.tsx
//
// One card at a time. The whole screen is a keyboard instrument: space
// flips, 1-4 grade, Z undoes, E edits, S suspends, B buries, M marks,
// Escape leaves. The mouse can do all of it too, but the shortcuts are
// on the buttons because that is how anybody who reviews every day ends
// up working.
//
// The four grade buttons show the interval they will really give -
// `projectionsFor` runs the actual scheduler for all four ratings rather
// than approximating it, which is why the fuzz has to be deterministic.

import { useEffect, useMemo, useRef, useState } from 'react';
import { currentCard, projectionsFor, useStore } from '../store';
import type { DeckRecord, SessionCard } from '../store';
import { RATING_LABELS } from '../lib/scheduler';
import type { Rating } from '../lib/types';
import { diffAnswer, suggestedRating } from '../lib/diff';
import { summarise } from '../lib/stats';
import { formatDelay } from '../lib/time';
import { Markdown } from './Markdown';
import { Button, IconButton, Modal, Pill } from './bits';
import { CardEditor } from './CardEditor';
import { CheckIcon, CloseIcon, PauseIcon, PencilIcon, StarIcon, TargetIcon, UndoIcon } from './Icons';

export function ReviewView(props: { onExit: () => void }) {
  const session = useStore((state) => state.session);
  const decks = useStore((state) => state.decks);
  const grade = useStore((state) => state.grade);
  const flip = useStore((state) => state.flip);
  const undoGrade = useStore((state) => state.undoGrade);
  const setTyped = useStore((state) => state.setTyped);
  const checkTyped = useStore((state) => state.checkTyped);
  const sessionAction = useStore((state) => state.sessionAction);
  const current = currentCard(session, decks);
  const [editing, setEditing] = useState(false);
  const typedRef = useRef<HTMLInputElement | null>(null);

  const record = current?.record;
  const typing = Boolean(record?.settings.typedAnswers) && !session?.finished;

  useEffect(() => {
    if (typing && !session?.flipped) typedRef.current?.focus();
  }, [typing, session?.flipped, current?.card.id]);

  if (!session) return null;

  if (!session.queue.length || !current) {
    return <Summary onExit={props.onExit} />;
  }

  const { card, cardState } = current;
  const projections = projectionsFor(current.record, card.id, cardState);
  const diff = session.checked ? diffAnswer(session.typed, card.answerText) : null;
  const suggestion = diff ? suggestedRating(diff) : null;
  const done = session.answered.length;
  const remaining = session.queue.length;
  const left = remainingByState(session.queue, decks);
  const progress = done + remaining === 0 ? 1 : done / (done + remaining);

  return (
    <div className="recall-review">
      <div className="recall-progress">
        <IconButton label="End the session (Escape)" onClick={props.onExit}>
          <CloseIcon />
        </IconButton>
        <strong style={{ fontSize: 13, fontWeight: 600 }}>{current.record.name}</strong>
        <div className="recall-progress-bar" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={done + remaining}>
          <i style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <div className="recall-row-gap" title="New, learning and review cards left in this session">
          <Pill kind="new" title={`${left.new} new`}>{left.new}</Pill>
          <Pill kind="learning" title={`${left.learning} learning`}>{left.learning}</Pill>
          <Pill kind="review" title={`${left.review} to review`}>{left.review}</Pill>
        </div>
        <span className="recall-muted recall-nowrap">{remaining} left</span>
        <IconButton label="Undo the last answer (Z)" onClick={undoGrade} disabled={!session.undo.length}>
          <UndoIcon />
        </IconButton>
        <IconButton label={cardState.marked ? 'Unmark this card (M)' : 'Mark this card (M)'} pressed={cardState.marked} onClick={() => sessionAction('mark')}>
          <StarIcon />
        </IconButton>
        <IconButton label="Edit this card (E)" onClick={() => setEditing(true)}>
          <PencilIcon />
        </IconButton>
        <IconButton label="Bury until tomorrow (B)" onClick={() => sessionAction('bury')}>
          <PauseIcon />
        </IconButton>
      </div>

      <div className="recall-card-area">
        <div className="recall-card-inner">
          <div className="recall-front">
            <Markdown text={card.front} blanks />
          </div>
          {card.tags.length ? (
            <div className="recall-wrap">
              {card.tags.map((tag) => (
                <span key={tag} className="recall-tag">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          {typing && !session.checked ? (
            <div className="recall-typed">
              <input
                ref={typedRef}
                className="recall-input"
                value={session.typed}
                aria-label="Type the answer"
                placeholder="Type the answer, then press Enter"
                onChange={(event) => setTyped(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    checkTyped();
                  }
                }}
              />
            </div>
          ) : null}

          {session.flipped ? (
            <>
              <div className="recall-divider" />
              {diff ? (
                <div>
                  <p className="recall-section-title" style={{ marginBottom: 5 }}>
                    {diff.correct ? 'You typed - correct' : 'You typed'}
                  </p>
                  <div className="recall-diff" aria-label="What you typed, compared with the answer">
                    {diff.parts.map((part, index) => (
                      <span key={index} className={part.type}>
                        {part.text}
                        {index < diff.parts.length - 1 ? ' ' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="recall-back">
                <Markdown text={card.back} />
              </div>
              {cardState.leech ? (
                <p className="recall-muted recall-row-gap" style={{ margin: 0 }}>
                  <TargetIcon size={13} /> This card has lapsed {cardState.lapses} times. It may be worth rewriting.
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {session.flipped ? (
        <div className="recall-grades" role="group" aria-label="Grade this card">
          {projections.map((projection) => (
            <button
              key={projection.rating}
              type="button"
              className="recall-grade"
              data-rating={projection.rating}
              data-suggested={suggestion === projection.rating}
              onClick={() => grade(projection.rating as Rating)}
              aria-label={`${RATING_LABELS[projection.rating]} - next in ${projection.label}, keyboard ${projection.rating}`}
            >
              <b>{RATING_LABELS[projection.rating]}</b>
              <i>{projection.label}</i>
              <span className="recall-kbd">{projection.rating}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="recall-flip">
          <Button variant="primary" onClick={typing ? checkTyped : flip}>
            {typing ? 'Check answer' : 'Show answer'} <span className="recall-kbd">{typing ? '⏎' : 'Space'}</span>
          </Button>
        </div>
      )}

      {editing ? (
        <Modal title="Edit this card" onClose={() => setEditing(false)} wide>
          <CardEditor record={current.record} noteIndex={card.noteIndex} compact onDone={() => setEditing(false)} />
        </Modal>
      ) : null}
    </div>
  );
}

/** What is still ahead in this session, by card state - the three pills
 *  in the progress strip. Cheap enough to do on every render (a session
 *  queue is tens of cards, not thousands). */
function remainingByState(queue: SessionCard[], decks: Record<string, DeckRecord>): { new: number; learning: number; review: number } {
  const out = { new: 0, learning: 0, review: 0 };
  for (const item of queue) {
    const state = decks[item.deck]?.sidecar.cards[item.id];
    if (!state) continue;
    if (state.state === 'new') out.new++;
    else if (state.state === 'review') out.review++;
    else out.learning++;
  }
  return out;
}

function Summary(props: { onExit: () => void }) {
  const session = useStore((state) => state.session);
  const endSession = useStore((state) => state.endSession);
  const startSession = useStore((state) => state.startSession);
  const decks = useStore((state) => state.decks);
  const summary = useMemo(() => summarise(session?.answered ?? []), [session]);

  if (!session) return null;

  const elapsed = Date.now() - session.startedAt;
  const nextDue = session.decks
    .map((name) => decks[name])
    .filter(Boolean)
    .flatMap((record) => Object.values(record.sidecar.cards))
    .filter((state) => !state.suspended && state.due > Date.now())
    .reduce<number | null>((soonest, state) => (soonest === null ? state.due : Math.min(soonest, state.due)), null);

  return (
    <div className="recall-page">
      <div className="recall-summary">
        <div>
          <CheckIcon size={40} strokeWidth={1.4} />
          <h2 style={{ margin: '8px 0 2px', fontSize: 20, letterSpacing: '-0.02em' }}>
            {summary.answered ? 'Session finished' : 'Nothing due here'}
          </h2>
          <p className="recall-muted" style={{ margin: 0 }}>
            {summary.answered
              ? `${summary.answered} answer${summary.answered === 1 ? '' : 's'} in ${formatDelay(elapsed)} · ${Math.round((summary.medianMs / 1000) * 10) / 10}s a card`
              : 'Everything in this deck is waiting for its next interval.'}
          </p>
        </div>

        {summary.answered ? (
          <>
            <div className="recall-summary-grid">
              {(['Again', 'Hard', 'Good', 'Easy'] as const).map((label, index) => (
                <div key={label} className="recall-stat" style={{ alignItems: 'center' }}>
                  <span className="recall-stat-value" style={{ color: `var(--${['again', 'hard', 'good', 'easy'][index]})` }}>
                    {summary.counts[index]}
                  </span>
                  <span className="recall-stat-label">{label}</span>
                </div>
              ))}
            </div>
            <p className="recall-muted" style={{ margin: 0 }}>
              {summary.accuracy === null ? '' : `${Math.round(summary.accuracy * 100)}% answered correctly`}
              {summary.newCards ? ` · ${summary.newCards} new card${summary.newCards === 1 ? '' : 's'} introduced` : ''}
              {summary.graduated ? ` · ${summary.graduated} graduated` : ''}
            </p>
          </>
        ) : null}

        {nextDue ? <p className="recall-muted" style={{ margin: 0 }}>Next card due in {formatDelay(nextDue - Date.now())}.</p> : null}

        <div className="recall-row-gap" style={{ justifyContent: 'center' }}>
          <Button variant="primary" onClick={props.onExit} autoFocus>
            Back to decks
          </Button>
          <Button
            onClick={() => {
              endSession();
              startSession(session.decks);
            }}
          >
            Study again
          </Button>
        </div>
      </div>
    </div>
  );
}
