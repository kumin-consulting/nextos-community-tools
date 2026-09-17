// src/ui/panels.tsx
//
// The small presentational pieces of the right-hand panel: the
// evaluation bar, the clocks, the captured-material row, the engine's
// running commentary and the game report. All of them take props and
// return markup - none of them reach for state, which is what keeps the
// window's own file about the game rather than about layout.

import type { Color } from '../lib/types';
import { BLACK, WHITE } from '../lib/types';
import { evalBarFraction, formatScore } from '../lib/analysis';
import type { GameReport, MoveReport } from '../lib/analysis';
import type { ClockState } from '../lib/clock';
import { formatClock, isCritical } from '../lib/clock';
import type { EngineUpdate } from '../engineClient';
import { Piece } from './pieces';
import type { PieceSetId } from './pieces';
import { Icons } from './icons';

// ---------------------------------------------------------------------

export interface EvalBarProps {
  /** Centipawns from White's point of view. */
  score: number;
  mate: number | null;
  flipped: boolean;
  active: boolean;
  /** Set once the game is over: the bar shows the result rather than a
   *  number, because a finished position has no evaluation. */
  result?: string | null;
}

export function EvalBar({ score, mate, flipped, active, result }: EvalBarProps): JSX.Element {
  const finished = result && result !== '*' ? result : null;
  const fraction = finished
    ? finished === '1-0'
      ? 1
      : finished === '0-1'
        ? 0
        : 0.5
    : active
      ? evalBarFraction(score, mate)
      : 0.5;
  const whiteShare = flipped ? 1 - fraction : fraction;
  const text = finished ? (finished === '1/2-1/2' ? '½' : finished) : active ? shortScore(score, mate) : '–';
  const labelAtTop = whiteShare < 0.5;
  return (
    <div
      className="chessapp-evalbar"
      role="img"
      aria-label={finished ? `The game ended ${text}` : active ? `Evaluation ${text} for White` : 'Evaluation not running'}
      title={finished ? `Result: ${text}` : active ? `${text} (White)` : 'Turn on analysis to see the evaluation'}
    >
      <div className="chessapp-evalbar-fill" style={{ height: `${whiteShare * 100}%` }} />
      <div className="chessapp-evalbar-mid" />
      <div
        className="chessapp-evalbar-text"
        style={{
          [labelAtTop ? 'top' : 'bottom']: '3px',
          color: labelAtTop ? 'var(--eval-white)' : 'var(--eval-black)',
        }}
      >
        {text}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------

export interface ClockRowProps {
  clock: ClockState;
  now: number;
  color: Color;
  name: string;
  running: boolean;
}

/** '+0.4', 'M3' - the eval bar is twenty-six pixels wide, so the number
 *  beside it has to be four characters at most. */
export function shortScore(score: number, mate: number | null): string {
  if (mate !== null) return `${mate > 0 ? 'M' : '-M'}${Math.abs(mate)}`;
  const pawns = score / 100;
  if (Math.abs(pawns) >= 10) return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(0)}`;
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(1)}`;
}

export function ClockRow({ clock, now, color, name, running }: ClockRowProps): JSX.Element {
  const elapsed =
    clock.running === color && clock.flagged === null ? Math.max(0, now - clock.since) : 0;
  const remaining = Math.max(0, clock.remaining[color] - elapsed);
  const classes = ['chessapp-clock'];
  if (running) classes.push('is-running');
  if (isCritical(remaining)) classes.push('is-low');
  return (
    <div className={classes.join(' ')}>
      <span className="chessapp-playername">
        <span className="chessapp-swatch" style={{ background: color === WHITE ? '#f4f2ee' : '#26232b' }} />
        {name}
      </span>
      <span className="chessapp-clock-time" aria-label={`${name} has ${formatClock(remaining)} left`}>
        {formatClock(remaining)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------

export interface CapturedProps {
  /** Piece codes this side has captured. */
  captured: number[];
  /** Material advantage in pawns; only shown when positive. */
  advantage: number;
  set: PieceSetId;
}

export function CapturedRow({ captured, advantage, set }: CapturedProps): JSX.Element {
  const order = [5, 4, 3, 2, 1];
  const sorted = [...captured].sort((a, b) => order.indexOf(b & 7) - order.indexOf(a & 7));
  return (
    <div className="chessapp-captures">
      {sorted.map((code, i) => (
        <Piece key={i} code={code} set={set} title={undefined} />
      ))}
      {advantage > 0 ? <span className="chessapp-plus">+{advantage}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------------

export interface EngineInfoProps {
  update: EngineUpdate | null;
  thinking: boolean;
  /** The principal variation, already turned into SAN. */
  pvSan: string[];
  /** Move number and side the line starts from. */
  firstMoveNumber: number;
  firstIsBlack: boolean;
  levelName: string;
  note: string | null;
}

export function EngineInfo(props: EngineInfoProps): JSX.Element {
  const { update, thinking, pvSan, firstMoveNumber, firstIsBlack, levelName, note } = props;
  return (
    <div className="chessapp-section">
      <h3 className="chessapp-section-title">Engine</h3>
      <div className="chessapp-row">
        <span className="chessapp-kv">
          {thinking ? (
            <span className="chessapp-thinking">
              <span className="chessapp-spinner" />
              thinking
            </span>
          ) : (
            <span className="chessapp-strong">{levelName}</span>
          )}
        </span>
        <span className="chessapp-kv">
          {update ? (
            <>
              depth <span className="chessapp-strong">{update.depth}</span>
              {update.seldepth > update.depth ? `/${update.seldepth}` : ''} · {formatNodes(update.nodes)} nodes ·{' '}
              {formatNodes(update.nps)}/s
            </>
          ) : (
            'idle'
          )}
        </span>
      </div>
      {pvSan.length ? (
        <p className="chessapp-pv" style={{ margin: '6px 0 0' }}>
          <b>{update ? formatScore(update.score, update.mate) : ''}</b> {formatPv(pvSan, firstMoveNumber, firstIsBlack)}
        </p>
      ) : null}
      {update?.fromBook ? (
        <p className="chessapp-pv" style={{ margin: '6px 0 0' }}>
          Played from the opening book.
        </p>
      ) : null}
      {note ? (
        <p className="chessapp-pv" style={{ margin: '6px 0 0' }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

export function formatNodes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

/** '12. Nf3 Nc6 13. Bb5' - a principal variation written with move
 *  numbers, so it can be read rather than decoded. */
export function formatPv(sans: string[], firstNumber: number, firstIsBlack: boolean): string {
  const parts: string[] = [];
  let number = firstNumber;
  let black = firstIsBlack;
  for (const san of sans) {
    if (!black) parts.push(`${number}.`);
    else if (parts.length === 0) parts.push(`${number}…`);
    parts.push(san);
    if (black) number++;
    black = !black;
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------

export interface ReportPanelProps {
  report: GameReport | null;
  summaryWhite: string;
  summaryBlack: string;
  onSelectMove: (nodeId: number) => void;
  progress: { done: number; total: number } | null;
  onAnalyse: () => void;
}

export function ReportPanel(props: ReportPanelProps): JSX.Element {
  const { report, summaryWhite, summaryBlack, onSelectMove, progress, onAnalyse } = props;
  if (progress) {
    return (
      <div className="chessapp-empty">
        <Icons.chart size={22} />
        <h3>Looking at every move</h3>
        <p>
          {progress.done} of {progress.total} positions. This runs in the engine worker, so the board stays usable.
        </p>
      </div>
    );
  }
  if (!report) {
    return (
      <div className="chessapp-empty">
        <Icons.chart size={22} />
        <h3>No report yet</h3>
        <p>Analyse the game to find the moves that cost the most, and to turn the ones you missed into puzzles.</p>
        <button type="button" className="chessapp-btn is-primary" style={{ marginTop: 12 }} onClick={onAnalyse}>
          Analyse this game
        </button>
      </div>
    );
  }
  return (
    <>
      <div className="chessapp-section">
        <h3 className="chessapp-section-title">Accuracy</h3>
        {[report.white, report.black].map((side) => (
          <div className="chessapp-row" key={side.color}>
            <span className="chessapp-playername">
              <span className="chessapp-swatch" style={{ background: side.color === WHITE ? '#f4f2ee' : '#26232b' }} />
              {side.color === WHITE ? 'White' : 'Black'}
            </span>
            <span className="chessapp-kv">
              <span className="chessapp-strong">{side.accuracy}%</span> · {side.averageLoss} cp average loss
            </span>
          </div>
        ))}
        <div className="chessapp-row" style={{ marginTop: 8 }}>
          <span className="chessapp-kv">White</span>
          <span>
            <Badges side={report.white} />
          </span>
        </div>
        <div className="chessapp-row">
          <span className="chessapp-kv">Black</span>
          <span>
            <Badges side={report.black} />
          </span>
        </div>
      </div>
      <div className="chessapp-section">
        <h3 className="chessapp-section-title">Why the game went the way it did</h3>
        <p className="chessapp-pv" style={{ margin: 0 }}>
          {summaryWhite}
        </p>
        <p className="chessapp-pv" style={{ margin: '8px 0 0' }}>
          {summaryBlack}
        </p>
      </div>
      <div className="chessapp-scroll">
        <h3 className="chessapp-section-title" style={{ padding: '10px 12px 0' }}>
          The costliest moves
        </h3>
        <ul className="chessapp-list">
          {report.worst
            .filter((m) => m.loss > 0)
            .map((move) => (
              <li key={move.nodeId}>
                <button type="button" className="chessapp-listitem" onClick={() => onSelectMove(move.nodeId)}>
                  <span className="chessapp-listitem-title">
                    <span>
                      {moveLabel(move)} <span className={`chessapp-badge is-${badgeTone(move)}`}>{move.quality}</span>
                    </span>
                    <span className="chessapp-kv">−{(move.loss / 100).toFixed(1)}</span>
                  </span>
                  <span className="chessapp-listitem-sub">
                    {move.bestSan && move.bestSan !== move.san
                      ? `${move.bestSan} was the move`
                      : 'nothing better was available'}
                  </span>
                </button>
              </li>
            ))}
        </ul>
      </div>
    </>
  );
}

function Badges({ side }: { side: GameReport['white'] }): JSX.Element {
  return (
    <>
      <span className={`chessapp-badge${side.blunders ? ' is-bad' : ''}`}>
        {side.blunders} {side.blunders === 1 ? 'blunder' : 'blunders'}
      </span>{' '}
      <span className={`chessapp-badge${side.mistakes ? ' is-warn' : ''}`}>
        {side.mistakes} {side.mistakes === 1 ? 'mistake' : 'mistakes'}
      </span>{' '}
      <span className="chessapp-badge">
        {side.inaccuracies} {side.inaccuracies === 1 ? 'inaccuracy' : 'inaccuracies'}
      </span>
    </>
  );
}

function badgeTone(move: MoveReport): string {
  if (move.quality === 'blunder') return 'bad';
  if (move.quality === 'mistake') return 'warn';
  return 'good';
}

export function moveLabel(move: MoveReport): string {
  const number = Math.floor((move.ply - 1) / 2) + 1;
  return `${number}${move.color === BLACK ? '…' : '.'} ${move.san}`;
}
