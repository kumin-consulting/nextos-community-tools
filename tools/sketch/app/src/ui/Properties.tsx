// The properties panel: everything about how the selection looks, and
// everything you can do to it as a group. It shows what the next shape
// will look like when nothing is selected and a drawing tool is active,
// so the choices you make before drawing are the ones you get.

import React from 'react';
import { type SketchElement, FONT_SIZES, STROKE_WIDTHS, isLinear } from '../lib/types';
import { normalizeHex } from '../lib/palette';
import { Icon, type IconName } from './icons';
import { useSketch } from '../state/store';

interface SegOption<T> {
  value: T;
  label: string;
  icon?: IconName;
  text?: string;
}

function Seg<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: SegOption<T>[];
  onChange(next: T): void;
}): React.ReactElement {
  return (
    <div className="sk-field">
      <span className="sk-field-label" id={`sk-lbl-${label.replace(/\s+/g, '-')}`}>
        {label}
      </span>
      <div className="sk-seg" role="group" aria-labelledby={`sk-lbl-${label.replace(/\s+/g, '-')}`}>
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            className={`sk-seg-btn${opt.value === value ? ' is-active' : ''}`}
            aria-pressed={opt.value === value}
            title={opt.label}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon ? <Icon name={opt.icon} size={16} /> : <span className="sk-seg-text">{opt.text ?? opt.label}</span>}
            <span className="sk-sr">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Swatches({
  label,
  value,
  swatches,
  onChange,
}: {
  label: string;
  value: string;
  swatches: Array<{ name: string; value: string }>;
  onChange(next: string): void;
}): React.ReactElement {
  const [custom, setCustom] = React.useState('');
  const known = swatches.some((s) => s.value === value);
  return (
    <div className="sk-field">
      <span className="sk-field-label">{label}</span>
      <div className="sk-swatches" role="group" aria-label={label}>
        {swatches.map((s) => (
          <button
            key={s.value}
            type="button"
            className={`sk-swatch${s.value === value ? ' is-active' : ''}${s.value === 'transparent' ? ' is-none' : ''}`}
            style={s.value === 'transparent' ? undefined : { background: s.value }}
            title={s.name}
            aria-pressed={s.value === value}
            onClick={() => onChange(s.value)}
          >
            <span className="sk-sr">{s.name}</span>
          </button>
        ))}
        <label className="sk-swatch-custom" title="Custom colour">
          <span className="sk-sr">Custom {label.toLowerCase()} colour, as a hex code</span>
          <input
            type="text"
            inputMode="text"
            spellCheck={false}
            placeholder={known || !value.startsWith('#') ? '#hex' : value}
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              const hex = normalizeHex(e.target.value);
              if (hex) onChange(hex);
            }}
          />
        </label>
      </div>
    </div>
  );
}

const first = <T,>(list: T[]): T | undefined => list[0];

export const Properties: React.FC = () => {
  const elements = useSketch((s) => s.elements);
  const selectedIds = useSketch((s) => s.selectedIds);
  const style = useSketch((s) => s.style);
  const palette = useSketch((s) => s.palette);
  const tool = useSketch((s) => s.tool);
  const setStyle = useSketch((s) => s.setStyle);
  const store = useSketch;

  const selected = React.useMemo(() => {
    const ids = new Set(selectedIds);
    return elements.filter((el) => ids.has(el.id));
  }, [elements, selectedIds]);

  const drawing = tool !== 'select' && tool !== 'hand' && tool !== 'eraser';
  if (!selected.length && !drawing) return null;

  const sample: Pick<
    SketchElement,
    'stroke' | 'fill' | 'fillStyle' | 'strokeWidth' | 'strokeStyle' | 'opacity' | 'roundness' | 'fontSize' | 'fontFamily' | 'textAlign' | 'edge' | 'startArrow' | 'endArrow' | 'textColor'
  > = first(selected) ?? style;

  const types = new Set(selected.map((el) => el.type));
  const anyLinear = selected.some(isLinear) || tool === 'arrow' || tool === 'line' || tool === 'draw';
  const anyShape = selected.some((el) => !isLinear(el) && el.type !== 'text') || ['rect', 'ellipse', 'diamond', 'sticky', 'frame'].includes(tool);
  const anyRect = types.has('rect') || tool === 'rect';
  const anyArrow = selected.some((el) => el.type === 'arrow') || tool === 'arrow';
  const hasText = selected.some((el) => el.text || el.type === 'text' || el.type === 'sticky') || tool === 'text' || tool === 'sticky';
  const multiple = selected.length > 1;
  const locked = selected.length > 0 && selected.every((el) => el.locked);

  const onlyText = selected.length > 0 && selected.every((el) => el.type === 'text');

  return (
    <aside className="sk-island sk-properties" aria-label="Properties">
      {onlyText ? null : (
        <Swatches label="Stroke" value={sample.stroke} swatches={palette.strokes} onChange={(stroke) => setStyle({ stroke })} />
      )}
      {anyShape || anyLinear ? (
        <>
          <Swatches label="Fill" value={sample.fill} swatches={palette.fills} onChange={(fill) => setStyle({ fill, fillStyle: fill === 'transparent' ? 'none' : sample.fillStyle === 'none' ? 'solid' : sample.fillStyle })} />
          <Seg
            label="Fill style"
            value={sample.fillStyle}
            onChange={(fillStyle) => setStyle({ fillStyle })}
            options={[
              { value: 'none', label: 'No fill', text: 'None' },
              { value: 'solid', label: 'Solid fill', text: 'Solid' },
              { value: 'hatch', label: 'Hatched fill', text: 'Hatch' },
            ]}
          />
        </>
      ) : null}
      <Seg
        label="Stroke width"
        value={sample.strokeWidth}
        onChange={(strokeWidth) => setStyle({ strokeWidth })}
        options={[
          { value: STROKE_WIDTHS[0], label: 'Thin', text: 'S' },
          { value: STROKE_WIDTHS[1], label: 'Medium', text: 'M' },
          { value: STROKE_WIDTHS[2], label: 'Bold', text: 'L' },
        ]}
      />
      <Seg
        label="Stroke style"
        value={sample.strokeStyle}
        onChange={(strokeStyle) => setStyle({ strokeStyle })}
        options={[
          { value: 'solid', label: 'Solid line', text: '───' },
          { value: 'dashed', label: 'Dashed line', text: '– –' },
          { value: 'dotted', label: 'Dotted line', text: '· ·' },
        ]}
      />
      {anyRect ? (
        <Seg
          label="Corners"
          value={sample.roundness > 0.02 ? 'round' : 'sharp'}
          onChange={(v) => setStyle({ roundness: v === 'round' ? 0.16 : 0 })}
          options={[
            { value: 'sharp', label: 'Sharp corners', text: 'Sharp' },
            { value: 'round', label: 'Rounded corners', text: 'Round' },
          ]}
        />
      ) : null}
      {anyLinear ? (
        <Seg
          label="Line shape"
          value={sample.edge}
          onChange={(edge) => setStyle({ edge })}
          options={[
            { value: 'straight', label: 'Straight', text: 'Straight' },
            { value: 'curved', label: 'Curved', text: 'Curved' },
            { value: 'elbow', label: 'Elbow', text: 'Elbow' },
          ]}
        />
      ) : null}
      {anyArrow ? (
        <div className="sk-field">
          <span className="sk-field-label">Arrowheads</span>
          <div className="sk-arrowheads">
            <Seg
              label="Start"
              value={sample.startArrow}
              onChange={(startArrow) => setStyle({ startArrow })}
              options={[
                { value: 'none', label: 'No head at the start', text: '—' },
                { value: 'arrow', label: 'Arrow at the start', text: '<' },
                { value: 'dot', label: 'Dot at the start', text: '•' },
                { value: 'bar', label: 'Bar at the start', text: '|' },
              ]}
            />
            <Seg
              label="End"
              value={sample.endArrow}
              onChange={(endArrow) => setStyle({ endArrow })}
              options={[
                { value: 'none', label: 'No head at the end', text: '—' },
                { value: 'arrow', label: 'Arrow at the end', text: '>' },
                { value: 'dot', label: 'Dot at the end', text: '•' },
                { value: 'bar', label: 'Bar at the end', text: '|' },
              ]}
            />
          </div>
        </div>
      ) : null}
      {hasText ? (
        <>
          <Seg
            label="Font size"
            value={sample.fontSize}
            onChange={(fontSize) => setStyle({ fontSize })}
            options={[
              { value: FONT_SIZES[0], label: 'Small', text: 'S' },
              { value: FONT_SIZES[1], label: 'Medium', text: 'M' },
              { value: FONT_SIZES[2], label: 'Large', text: 'L' },
              { value: FONT_SIZES[3], label: 'Extra large', text: 'XL' },
            ]}
          />
          <Seg
            label="Font"
            value={sample.fontFamily}
            onChange={(fontFamily) => setStyle({ fontFamily })}
            options={[
              { value: 'sans', label: 'Sans serif', text: 'Aa' },
              { value: 'serif', label: 'Serif', text: 'Aa' },
              { value: 'mono', label: 'Monospace', text: 'Aa' },
            ]}
          />
          <Seg
            label="Align text"
            value={sample.textAlign}
            onChange={(textAlign) => setStyle({ textAlign })}
            options={[
              { value: 'left', label: 'Align left', icon: 'align-left' },
              { value: 'center', label: 'Align centre', icon: 'align-center-x' },
              { value: 'right', label: 'Align right', icon: 'align-right' },
            ]}
          />
          <Swatches label="Text colour" value={sample.textColor} swatches={palette.strokes} onChange={(textColor) => setStyle({ textColor })} />
        </>
      ) : null}
      <div className="sk-field">
        <label className="sk-field-label" htmlFor="sk-opacity">
          Opacity
        </label>
        <input
          id="sk-opacity"
          className="sk-range"
          type="range"
          min={10}
          max={100}
          step={5}
          value={Math.round(sample.opacity * 100)}
          onChange={(e) => setStyle({ opacity: Number(e.target.value) / 100 })}
        />
      </div>

      {selected.length ? (
        <>
          <div className="sk-field">
            <span className="sk-field-label">Layers</span>
            <div className="sk-seg" role="group" aria-label="Layers">
              <button type="button" className="sk-seg-btn" title="Send to back — ⌘⇧[" onClick={() => store.getState().order('back')}>
                <Icon name="to-back" size={16} />
                <span className="sk-sr">Send to back</span>
              </button>
              <button type="button" className="sk-seg-btn" title="Send backward — ⌘[" onClick={() => store.getState().order('backward')}>
                <Icon name="backward" size={16} />
                <span className="sk-sr">Send backward</span>
              </button>
              <button type="button" className="sk-seg-btn" title="Bring forward — ⌘]" onClick={() => store.getState().order('forward')}>
                <Icon name="forward" size={16} />
                <span className="sk-sr">Bring forward</span>
              </button>
              <button type="button" className="sk-seg-btn" title="Bring to front — ⌘⇧]" onClick={() => store.getState().order('front')}>
                <Icon name="to-front" size={16} />
                <span className="sk-sr">Bring to front</span>
              </button>
            </div>
          </div>
          {multiple ? (
            <div className="sk-field">
              <span className="sk-field-label">Align</span>
              <div className="sk-seg sk-seg-wrap" role="group" aria-label="Align and distribute">
                {(
                  [
                    ['left', 'align-left', 'Align left'],
                    ['center-x', 'align-center-x', 'Align centres horizontally'],
                    ['right', 'align-right', 'Align right'],
                    ['top', 'align-top', 'Align top'],
                    ['center-y', 'align-center-y', 'Align centres vertically'],
                    ['bottom', 'align-bottom', 'Align bottom'],
                  ] as const
                ).map(([mode, icon, label]) => (
                  <button key={mode} type="button" className="sk-seg-btn" title={label} onClick={() => store.getState().align(mode)}>
                    <Icon name={icon} size={16} />
                    <span className="sk-sr">{label}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className="sk-seg-btn"
                  title="Distribute horizontally"
                  disabled={selected.length < 3}
                  onClick={() => store.getState().distribute('horizontal')}
                >
                  <Icon name="distribute-x" size={16} />
                  <span className="sk-sr">Distribute horizontally</span>
                </button>
                <button
                  type="button"
                  className="sk-seg-btn"
                  title="Distribute vertically"
                  disabled={selected.length < 3}
                  onClick={() => store.getState().distribute('vertical')}
                >
                  <Icon name="distribute-y" size={16} />
                  <span className="sk-sr">Distribute vertically</span>
                </button>
              </div>
            </div>
          ) : null}
          <div className="sk-field">
            <span className="sk-field-label">Actions</span>
            <div className="sk-seg sk-seg-wrap" role="group" aria-label="Actions">
              <button type="button" className="sk-seg-btn" title="Duplicate — ⌘D" onClick={() => store.getState().duplicateSelected()}>
                <Icon name="copy" size={16} />
                <span className="sk-sr">Duplicate</span>
              </button>
              <button type="button" className="sk-seg-btn" title="Flip horizontally — ⇧H" onClick={() => store.getState().flip('horizontal')}>
                <Icon name="flip-x" size={16} />
                <span className="sk-sr">Flip horizontally</span>
              </button>
              <button type="button" className="sk-seg-btn" title="Flip vertically — ⇧V" onClick={() => store.getState().flip('vertical')}>
                <Icon name="flip-y" size={16} />
                <span className="sk-sr">Flip vertically</span>
              </button>
              <button
                type="button"
                className="sk-seg-btn"
                title={multiple ? 'Group — ⌘G' : 'Group needs two or more elements'}
                disabled={!multiple}
                onClick={() => store.getState().group()}
              >
                <Icon name="group" size={16} />
                <span className="sk-sr">Group</span>
              </button>
              <button type="button" className="sk-seg-btn" title="Ungroup — ⌘⇧G" onClick={() => store.getState().ungroup()}>
                <Icon name="ungroup" size={16} />
                <span className="sk-sr">Ungroup</span>
              </button>
              <button
                type="button"
                className={`sk-seg-btn${locked ? ' is-active' : ''}`}
                title={locked ? 'Unlock — ⌘⇧L' : 'Lock — ⌘⇧L'}
                aria-pressed={locked}
                onClick={() => store.getState().toggleLock()}
              >
                <Icon name={locked ? 'lock' : 'unlock'} size={16} />
                <span className="sk-sr">{locked ? 'Unlock' : 'Lock'}</span>
              </button>
              <button type="button" className="sk-seg-btn sk-danger" title="Delete — Del" onClick={() => store.getState().deleteSelected()}>
                <Icon name="trash" size={16} />
                <span className="sk-sr">Delete</span>
              </button>
            </div>
          </div>
        </>
      ) : null}
    </aside>
  );
};
