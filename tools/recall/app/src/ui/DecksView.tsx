// src/ui/DecksView.tsx
//
// The deck browser: what you are looking at when the app opens. The
// statistics across the top answer "am I keeping this up?" and the deck
// list answers "what shall I do now?" - in that order, because the first
// one is what makes somebody open the app again tomorrow.

import { useMemo, useState } from 'react';
import type { DeckRecord } from '../store';
import { countsFor, globalCtx, installSampleDeck, logOf, statesOf, useStore } from '../store';
import { averageDailyMinutes, breakdown, buildHeatmap, computeRetention, computeStreak, retentionSeries } from '../lib/stats';
import { DAY, formatDueDay } from '../lib/time';
import { HeatLegend, HeatmapChart, Sparkline } from './charts';
import { Button, Empty, IconButton, Pill } from './bits';
import {
  AlertIcon,
  BrainIcon,
  CopyIcon,
  DownloadIcon,
  FlameIcon,
  LayersIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  SettingsIcon,
  SparkIcon,
  TargetIcon,
  TrashIcon,
  UploadIcon,
} from './Icons';

export type DeckDialog =
  | { kind: 'new' }
  | { kind: 'notes' }
  | { kind: 'import' }
  | { kind: 'rename'; deck: string }
  | { kind: 'delete'; deck: string }
  | { kind: 'settings'; deck: string }
  | { kind: 'export'; deck: string };

function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

export function DecksView(props: { onStudy: (deck: string) => void; onDialog: (dialog: DeckDialog) => void; onBrowse: (deck: string) => void }) {
  const decks = useStore((state) => state.decks);
  const order = useStore((state) => state.order);
  const selected = useStore((state) => state.selected);
  const select = useStore((state) => state.select);
  const duplicate = useStore((state) => state.duplicateDeck);
  const tick = useStore((state) => state.tick);
  const [busy, setBusy] = useState(false);

  const records = useMemo(() => order.map((name) => decks[name]).filter(Boolean), [order, decks]);
  const stats = useMemo(() => {
    const ctx = globalCtx(records);
    const log = logOf(records);
    return {
      ctx,
      heat: buildHeatmap(log, ctx, 183),
      streak: computeStreak(log, ctx),
      retention: computeRetention(log, ctx, 30),
      series: retentionSeries(log, ctx, 30),
      minutes: averageDailyMinutes(log, ctx, 30),
      breakdown: breakdown(statesOf(records)),
    };
    // `tick` is a deliberate dependency: the clock moving is what makes
    // these numbers go stale, not any state change.
  }, [records, tick]);

  const counts = useMemo(() => {
    const now = Date.now();
    const map: Record<string, ReturnType<typeof countsFor>> = {};
    for (const record of records) map[record.name] = countsFor(record, now);
    return map;
  }, [records, tick]);

  if (!records.length) {
    return <EmptyDecks onDialog={props.onDialog} busy={busy} setBusy={setBusy} />;
  }

  const totalDue = records.reduce((sum, record) => sum + counts[record.name].due, 0);

  return (
    <div className="recall-page">
      <div className="recall-stats">
        <div className="recall-stat">
          <span className="recall-stat-label">
            <TargetIcon size={13} /> Due now
          </span>
          <span className="recall-stat-value">{totalDue}</span>
          <span className="recall-stat-sub">{stats.breakdown.total} cards in {records.length} deck{records.length === 1 ? '' : 's'}</span>
        </div>
        <div className="recall-stat">
          <span className="recall-stat-label">
            <FlameIcon size={13} /> Streak
          </span>
          <span className="recall-stat-value">
            {stats.streak.current}
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-3)' }}> day{stats.streak.current === 1 ? '' : 's'}</span>
          </span>
          <span className="recall-stat-sub">{stats.streak.studiedToday ? 'Today is done' : 'Nothing yet today'} · best {stats.streak.longest}</span>
        </div>
        <div className="recall-stat">
          <span className="recall-stat-label">
            <SparkIcon size={13} /> Retention (30 days)
          </span>
          <span className="recall-stat-value">{percent(stats.retention.mature.rate)}</span>
          <Sparkline points={stats.series} label={`Daily retention over the last 30 days, currently ${percent(stats.retention.mature.rate)}`} />
        </div>
        <div className="recall-stat">
          <span className="recall-stat-label">
            <LayersIcon size={13} /> Reviews (6 months)
          </span>
          <span className="recall-stat-value">{stats.heat.total}</span>
          <span className="recall-stat-sub">
            {stats.minutes >= 1 ? `${Math.round(stats.minutes)} min` : '<1 min'} on an average study day
          </span>
        </div>
      </div>

      <div className="recall-card recall-heat" style={{ marginBottom: 18 }}>
        <div className="recall-heat-head">
          <h3 className="recall-section-title" style={{ margin: 0 }}>
            Reviews a day
          </h3>
          <HeatLegend />
        </div>
        <HeatmapChart map={stats.heat} />
      </div>

      <div className="recall-between" style={{ marginBottom: 10 }}>
        <h3 className="recall-section-title" style={{ margin: 0 }}>
          Decks
        </h3>
        <div className="recall-row-gap">
          <Button onClick={() => props.onDialog({ kind: 'notes' })} title="Turn a page of notes into a deck">
            <SparkIcon /> From notes
          </Button>
          <Button onClick={() => props.onDialog({ kind: 'import' })} title="Import tab-separated cards">
            <UploadIcon /> Import
          </Button>
          <Button variant="primary" onClick={() => props.onDialog({ kind: 'new' })} title="New deck (N)">
            <PlusIcon /> New deck
          </Button>
        </div>
      </div>

      <div className="recall-deck-list">
        {records.map((record) => (
          <DeckRow
            key={record.name}
            record={record}
            counts={counts[record.name]}
            selected={selected === record.name}
            onSelect={() => select(record.name)}
            onStudy={() => props.onStudy(record.name)}
            onBrowse={() => props.onBrowse(record.name)}
            onDialog={props.onDialog}
            onDuplicate={async () => {
              setBusy(true);
              await duplicate(record.name);
              setBusy(false);
            }}
            busy={busy}
          />
        ))}
      </div>
    </div>
  );
}

function DeckRow(props: {
  record: DeckRecord;
  counts: ReturnType<typeof countsFor>;
  selected: boolean;
  onSelect: () => void;
  onStudy: () => void;
  onBrowse: () => void;
  onDuplicate: () => void;
  onDialog: (dialog: DeckDialog) => void;
  busy: boolean;
}) {
  const { record, counts } = props;
  const parts = useMemo(() => breakdown(record.cards.map((card) => record.sidecar.cards[card.id]).filter(Boolean)), [record]);
  const total = Math.max(1, parts.total);
  const problems = record.deck.problems.length;
  const next = counts.nextDue;

  return (
    <div
      className="recall-deck"
      data-selected={props.selected}
      onClick={props.onSelect}
      onDoubleClick={props.onStudy}
      role="group"
      aria-label={record.name}
    >
      <div className="recall-deck-name">
        <span>{record.name}</span>
        {record.problem || problems ? (
          <span
            className="recall-row-gap"
            style={{ color: 'var(--hard)', fontSize: 11, fontWeight: 500 }}
            title={record.problem ?? `${problems} line${problems === 1 ? '' : 's'} in the file could not be read as a card`}
          >
            <AlertIcon size={13} /> {record.problem ? 'scheduling reset' : `${problems} problem${problems === 1 ? '' : 's'}`}
          </span>
        ) : null}
      </div>
      <div className="recall-deck-desc">
        {record.deck.description
          ? record.deck.description.split('\n')[0]
          : counts.due > 0
            ? `${counts.due} to study now`
            : next
              ? `Nothing due · next ${formatDueDay(Math.max(0, Math.ceil((next - Date.now()) / DAY)))}`
              : `${parts.total} card${parts.total === 1 ? '' : 's'}`}
      </div>
      <div className="recall-deck-counts">
        <Pill kind="new" title={`${counts.new} new`}>
          {counts.new}
        </Pill>
        <Pill kind="learning" title={`${counts.learning} learning`}>
          {counts.learning}
        </Pill>
        <Pill kind="review" title={`${counts.review} to review`}>
          {counts.review}
        </Pill>
        <div className="recall-deck-actions" onClick={(event) => event.stopPropagation()}>
          <Button variant={counts.due ? 'primary' : 'default'} onClick={props.onStudy} disabled={!counts.due} title="Study this deck (Enter)">
            <PlayIcon size={13} /> Study
          </Button>
          <IconButton label={`Browse the cards in ${record.name}`} onClick={props.onBrowse}>
            <LayersIcon />
          </IconButton>
          <IconButton label={`Settings for ${record.name}`} onClick={() => props.onDialog({ kind: 'settings', deck: record.name })}>
            <SettingsIcon />
          </IconButton>
          <IconButton label={`Rename ${record.name}`} onClick={() => props.onDialog({ kind: 'rename', deck: record.name })}>
            <PencilIcon />
          </IconButton>
          <IconButton label={`Duplicate ${record.name}`} onClick={props.onDuplicate} disabled={props.busy}>
            <CopyIcon />
          </IconButton>
          <IconButton label={`Export ${record.name}`} onClick={() => props.onDialog({ kind: 'export', deck: record.name })}>
            <DownloadIcon />
          </IconButton>
          <IconButton label={`Delete ${record.name}`} onClick={() => props.onDialog({ kind: 'delete', deck: record.name })}>
            <TrashIcon />
          </IconButton>
        </div>
      </div>
      <div className="recall-bar" title={`${parts.new} new, ${parts.learning} learning, ${parts.young} young, ${parts.mature} mature, ${parts.suspended} suspended`}>
        <i style={{ width: `${(parts.new / total) * 100}%`, background: 'var(--easy)' }} />
        <i style={{ width: `${(parts.learning / total) * 100}%`, background: 'var(--again)' }} />
        <i style={{ width: `${(parts.young / total) * 100}%`, background: 'var(--heat-2)' }} />
        <i style={{ width: `${(parts.mature / total) * 100}%`, background: 'var(--good)' }} />
        <i style={{ width: `${(parts.suspended / total) * 100}%`, background: 'var(--line-strong)' }} />
      </div>
    </div>
  );
}

function EmptyDecks(props: { onDialog: (dialog: DeckDialog) => void; busy: boolean; setBusy: (value: boolean) => void }) {
  const toast = useStore((state) => state.toast);
  return (
    <Empty icon={<BrainIcon size={44} strokeWidth={1.2} />} title="Nothing to remember yet">
      <p>
        A deck is a Markdown file in <span className="recall-mono">~/Recall</span> - a <span className="recall-mono">Q:</span> line, an{' '}
        <span className="recall-mono">A:</span> line, and Recall works out when to show it to you next.
      </p>
      <div className="recall-row-gap" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
        <Button
          variant="primary"
          disabled={props.busy}
          onClick={async () => {
            props.setBusy(true);
            const name = await installSampleDeck();
            props.setBusy(false);
            toast(`Added "${name}" - twelve cards about Recall itself.`);
          }}
        >
          <PlusIcon /> Add the sample deck
        </Button>
        <Button onClick={() => props.onDialog({ kind: 'new' })}>Start an empty deck</Button>
        <Button onClick={() => props.onDialog({ kind: 'notes' })}>
          <SparkIcon /> From my notes
        </Button>
      </div>
    </Empty>
  );
}
