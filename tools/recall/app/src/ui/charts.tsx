// src/ui/charts.tsx
//
// Three small SVG charts: the review heatmap, the retention sparkline
// and the seven-day forecast. All three are plain SVG with tokens for
// colour, so they are correct in both themes without a second code path,
// and every mark carries a <title> so hovering says what it is and a
// screen reader can read the same thing.

import type { Heatmap, SparkPoint, ForecastDay } from '../lib/stats';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

export function HeatmapChart(props: { map: Heatmap; cell?: number }) {
  const cell = props.cell ?? 11;
  const gap = 3;
  const step = cell + gap;
  const { days, firstWeekday } = props.map;
  const columns = Math.ceil((days.length + firstWeekday) / 7);
  const width = columns * step;
  const height = 7 * step + 16;

  const monthTicks: Array<{ x: number; label: string }> = [];
  days.forEach((day, index) => {
    const column = Math.floor((index + firstWeekday) / 7);
    const dayOfMonth = Number(day.date.slice(8, 10));
    if (dayOfMonth <= 7 && !monthTicks.some((tick) => tick.x === column * step)) {
      const month = Number(day.date.slice(5, 7)) - 1;
      if (!monthTicks.length || monthTicks[monthTicks.length - 1].label !== MONTHS[month]) {
        monthTicks.push({ x: column * step, label: MONTHS[month] });
      }
    }
  });

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${props.map.total} reviews over the last ${days.length} days, on ${props.map.active} days`}
    >
      {monthTicks.map((tick) => (
        <text key={tick.label + tick.x} x={tick.x} y={9} fontSize="9" fill="var(--text-3)">
          {tick.label}
        </text>
      ))}
      {days.map((day, index) => {
        const slot = index + firstWeekday;
        return (
          <rect
            key={day.date}
            x={Math.floor(slot / 7) * step}
            y={16 + (slot % 7) * step}
            width={cell}
            height={cell}
            rx="2.5"
            fill={`var(--heat-${day.level})`}
          >
            <title>{`${day.reviews} review${day.reviews === 1 ? '' : 's'} on ${dateLabel(day.date)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

export function HeatLegend() {
  return (
    <span className="recall-heat-legend">
      Less
      {[0, 1, 2, 3, 4].map((level) => (
        <svg key={level} width="10" height="10" aria-hidden="true">
          <rect width="10" height="10" rx="2.5" fill={`var(--heat-${level})`} />
        </svg>
      ))}
      More
    </span>
  );
}

export function Sparkline(props: { points: SparkPoint[]; width?: number; height?: number; label: string }) {
  const width = props.width ?? 180;
  const height = props.height ?? 34;
  const points = props.points;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((point, index) => {
    if (point.retention === null) {
      if (current.length > 1) segments.push(current.join(' '));
      current = [];
      return;
    }
    const x = index * step;
    const y = height - 2 - point.retention * (height - 4);
    current.push(`${current.length ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`);
  });
  if (current.length > 1) segments.push(current.join(' '));

  const dots = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point.retention !== null);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={props.label}>
      <line x1="0" y1={height - 2 - 0.9 * (height - 4)} x2={width} y2={height - 2 - 0.9 * (height - 4)} stroke="var(--line)" strokeDasharray="2 3" />
      {segments.map((segment, index) => (
        <path key={index} d={segment} fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {dots.length === 1 ? <circle cx={dots[0].index * step} cy={height - 2 - (dots[0].point.retention as number) * (height - 4)} r="2" fill="var(--accent)" /> : null}
    </svg>
  );
}

export function ForecastBars(props: { days: ForecastDay[]; onPick?: (day: ForecastDay) => void }) {
  const max = Math.max(1, ...props.days.map((day) => day.due));
  const weekday = (iso: string): string => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${iso}T12:00:00Z`).getUTCDay()];
  return (
    <div className="recall-forecast recall-card" role="group" aria-label="Cards due over the next seven days">
      {props.days.map((day, index) => (
        <div key={day.date} className="recall-forecast-day" data-today={index === 0}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{day.due || ''}</span>
          <div
            className="recall-forecast-bar"
            style={{ height: `${Math.max(2, (day.due / max) * 100)}%` }}
            title={`${day.due} card${day.due === 1 ? '' : 's'} due ${index === 0 ? 'today' : `on ${dateLabel(day.date)}`}`}
          />
          <span style={{ fontSize: 11, color: index === 0 ? 'var(--text)' : 'var(--text-3)', fontWeight: index === 0 ? 600 : 400 }}>
            {index === 0 ? 'Today' : weekday(day.date)}
          </span>
        </div>
      ))}
    </div>
  );
}
