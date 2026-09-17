// src/ui/TodayView.tsx
//
// One screen that answers "what should I do right now?" - everything due
// across every deck, one button to study all of it, and the next seven
// days so a backlog is visible before it arrives rather than after.

import { useMemo } from 'react';
import { dueEverywhere, globalCtx, logOf, statesOf, useStore } from '../store';
import { computeStreak, forecast, summarise } from '../lib/stats';
import { formatDelay } from '../lib/time';
import { nextDueAcross } from '../lib/deckfile';
import { ForecastBars } from './charts';
import { Button, Empty, Pill } from './bits';
import { BellIcon, BrainIcon, CalendarIcon, CheckIcon, FlameIcon, PlayIcon } from './Icons';

export function TodayView(props: { onStudy: (decks: string[]) => void; onSettings: () => void }) {
  const decks = useStore((state) => state.decks);
  const order = useStore((state) => state.order);
  const tick = useStore((state) => state.tick);
  const settings = useStore((state) => state.settings);

  const records = useMemo(() => order.map((name) => decks[name]).filter(Boolean), [order, decks]);
  const due = useMemo(() => dueEverywhere(records), [records, tick]);
  const ctx = useMemo(() => globalCtx(records), [records]);
  const days = useMemo(() => forecast(statesOf(records), ctx, 7), [records, ctx, tick]);
  const streak = useMemo(() => computeStreak(logOf(records), ctx), [records, ctx, tick]);
  const todaySummary = useMemo(() => {
    const today = logOf(records).filter((entry) => Math.floor((entry.t + ctx.tzOffsetMinutes * 60000 - ctx.cutoffHour * 3600000) / 86400000) === Math.floor((ctx.now + ctx.tzOffsetMinutes * 60000 - ctx.cutoffHour * 3600000) / 86400000));
    return summarise(today);
  }, [records, ctx, tick]);

  if (!records.length) {
    return (
      <Empty icon={<BrainIcon size={40} strokeWidth={1.2} />} title="Nothing scheduled">
        <p>Add a deck and Recall will tell you what is due here every day.</p>
      </Empty>
    );
  }

  const readyDecks = due.decks.filter((row) => row.counts.due > 0).map((row) => row.name);
  const next = nextDueAcross(statesOf(records), Date.now());

  return (
    <div className="recall-page recall-today">
      <div className="recall-card recall-hero">
        <div>
          <div className="recall-hero-number">{due.due}</div>
          <div className="recall-muted">
            {due.due ? 'cards waiting for you' : todaySummary.answered ? 'all caught up' : 'nothing due right now'}
          </div>
        </div>
        <div className="recall-col-gap" style={{ flex: 1, minWidth: 180 }}>
          <div className="recall-row-gap">
            <Pill kind="new" title={`${due.new} new`}>
              {due.new}
            </Pill>
            <span className="recall-muted">new</span>
            <Pill kind="learning" title={`${due.learning} learning`}>
              {due.learning}
            </Pill>
            <span className="recall-muted">learning</span>
            <Pill kind="review" title={`${due.review} to review`}>
              {due.review}
            </Pill>
            <span className="recall-muted">to review</span>
          </div>
          <div className="recall-row-gap recall-muted">
            <FlameIcon size={13} /> {streak.current} day streak
            {todaySummary.answered ? (
              <>
                <CheckIcon size={13} /> {todaySummary.answered} answered today
                {todaySummary.accuracy === null ? '' : ` (${Math.round(todaySummary.accuracy * 100)}% right)`}
              </>
            ) : null}
          </div>
        </div>
        <div className="recall-col-gap">
          <Button variant="primary" disabled={!readyDecks.length} onClick={() => props.onStudy(readyDecks)}>
            <PlayIcon /> Study everything <span className="recall-kbd">⏎</span>
          </Button>
          {!due.due && next ? <span className="recall-muted">Next card in {formatDelay(next - Date.now())}.</span> : null}
        </div>
      </div>

      <div>
        <h3 className="recall-section-title">
          <CalendarIcon size={12} /> The next seven days
        </h3>
        <ForecastBars days={days} />
        <p className="recall-muted" style={{ margin: '8px 2px 0' }}>
          {days.reduce((sum, day) => sum + day.due, 0)} reviews are already scheduled for this week - new cards are on top of that.
        </p>
      </div>

      <div>
        <h3 className="recall-section-title">By deck</h3>
        <div className="recall-deck-list">
          {due.decks.map((row) => (
            <div key={row.name} className="recall-deck" style={{ cursor: 'default' }}>
              <div className="recall-deck-name">
                <span>{row.name}</span>
              </div>
              <div className="recall-deck-desc">
                {row.counts.due
                  ? `${row.counts.due} ready`
                  : row.counts.nextDue
                    ? `next in ${formatDelay(row.counts.nextDue - Date.now())}`
                    : `${row.counts.total} card${row.counts.total === 1 ? '' : 's'}, nothing scheduled`}
              </div>
              <div className="recall-deck-counts">
                <Pill kind="new">{row.counts.new}</Pill>
                <Pill kind="learning">{row.counts.learning}</Pill>
                <Pill kind="review">{row.counts.review}</Pill>
                <Button disabled={!row.counts.due} onClick={() => props.onStudy([row.name])}>
                  <PlayIcon size={13} /> Study
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="recall-card" style={{ padding: 14 }}>
        <div className="recall-between">
          <div className="recall-row-gap">
            <BellIcon size={14} />
            <div>
              <div style={{ fontWeight: 500 }}>Daily reminder</div>
              <div className="recall-muted">
                {settings.reminder ? `Recall notifies you at ${settings.reminderTime} when cards are due.` : 'Off - Recall never interrupts you.'}
              </div>
            </div>
          </div>
          <Button onClick={props.onSettings}>{settings.reminder ? 'Change' : 'Turn on'}</Button>
        </div>
      </div>
    </div>
  );
}
