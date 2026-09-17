// SVG export. Not a screenshot in an <image> tag and not a pile of paths:
// a rectangle leaves as <rect>, an ellipse as <ellipse>, a diamond as
// <polygon>, text as real <text> with <tspan> lines, and only freehand
// and curved connectors become <path> - so the file opens in Figma,
// Illustrator or Inkscape as editable objects, and its text is
// selectable, searchable and translatable.
//
// Pure: builds a string. The text measurer is injected, so the exporter
// runs with no DOM at all (which is how `sketch_export_svg` answers an
// agent on a board that is not even open).

import { type Bounds, type FontKey, type SketchElement, FONT_STACKS, isLinear } from './types';
import { type SketchDocument } from './document';
import { boundsOfElements, diamondPoints, expandBounds, rotatedBounds } from './geometry';
import { type PathCommand, commandsToPathData, cornerRadius, dashPattern, headsFor, linearCommands } from './shapes';
import { type MeasureText, elementTextLayout } from './textLayout';
import { estimateTextWidth } from './text';

export interface SvgOptions {
  /** Paper colour; null or omitted exports with a transparent ground. */
  background?: string | null;
  padding?: number;
  /** Export just this region (a frame, or a selection's box). */
  bounds?: Bounds;
  measure?: MeasureText;
  /** Multiplies the width/height attributes; the viewBox is unchanged, so
   *  the file still scales losslessly. */
  scale?: number;
  frameStroke?: string;
  /** Written into the file as a comment - the board's name. */
  title?: string;
}

const defaultMeasure: MeasureText = (text, fontSize, font) => estimateTextWidth(text, fontSize, font);

const num = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const attrs = (map: Record<string, string | number | undefined>): string =>
  Object.entries(map)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}="${typeof v === 'number' ? num(v) : escapeXml(String(v))}"`)
    .join(' ');

const degrees = (radians: number): number => (radians * 180) / Math.PI;

/* ------------------------------------------------------------- fills */

interface Defs {
  /** Hatch pattern id per colour, so two hatched shapes in the same
   *  colour share one pattern instead of duplicating it. */
  hatch: Map<string, string>;
}

function fillFor(el: SketchElement, defs: Defs): string {
  if (el.fillStyle === 'none' || el.fill === 'transparent' || !el.fill) return 'none';
  if (el.fillStyle === 'hatch') {
    let id = defs.hatch.get(el.fill);
    if (!id) {
      id = `hatch-${defs.hatch.size + 1}`;
      defs.hatch.set(el.fill, id);
    }
    return `url(#${id})`;
  }
  return el.fill;
}

function strokeAttrs(el: SketchElement): Record<string, string | number | undefined> {
  const dash = dashPattern(el.strokeStyle, el.strokeWidth);
  return {
    stroke: el.stroke === 'transparent' ? undefined : el.stroke,
    'stroke-width': el.stroke === 'transparent' ? undefined : el.strokeWidth,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'stroke-dasharray': dash.length ? dash.map(num).join(' ') : undefined,
  };
}

/* ---------------------------------------------------------- elements */

function textSvg(el: SketchElement, measure: MeasureText): string {
  const layout = elementTextLayout(el, measure);
  if (!layout) return '';
  const anchor = layout.align === 'left' ? 'start' : layout.align === 'right' ? 'end' : 'middle';
  const colour = el.type === 'frame' ? el.stroke : el.textColor;
  const tspans = layout.lines
    .map((line, i) =>
      `<tspan ${attrs({ x: layout.anchorX, y: layout.firstBaselineY + i * layout.lineHeight })}>${escapeXml(line) || ' '}</tspan>`
    )
    .join('');
  return `<text ${attrs({
    'font-family': FONT_STACKS[el.fontFamily as FontKey],
    'font-size': el.fontSize,
    fill: colour,
    'text-anchor': anchor,
    'xml:space': 'preserve',
  })}>${tspans}</text>`;
}

function headSvg(el: SketchElement, which: 'start' | 'end'): string {
  const head = headsFor(el)[which];
  if (!head) return '';
  if (head.kind === 'dot') {
    return `<circle ${attrs({ cx: head.center[0], cy: head.center[1], r: head.radius, fill: el.stroke })} />`;
  }
  const commands: PathCommand[] = [
    ['M', head.points[0][0], head.points[0][1]],
    ...head.points.slice(1).map((p) => ['L', p[0], p[1]] as PathCommand),
  ];
  const d = commandsToPathData(commands);
  return `<path ${attrs({
    d,
    fill: 'none',
    stroke: el.stroke,
    'stroke-width': el.strokeWidth,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  })} />`;
}

function elementSvg(el: SketchElement, defs: Defs, opts: SvgOptions, measure: MeasureText): string {
  const parts: string[] = [];
  const fill = fillFor(el, defs);
  const stroke = strokeAttrs(el);
  if (isLinear(el)) {
    const d = commandsToPathData(linearCommands(el));
    if (d) parts.push(`<path ${attrs({ d, fill: 'none', ...stroke })} />`);
    parts.push(headSvg(el, 'start'), headSvg(el, 'end'));
  } else if (el.type === 'rect' || el.type === 'sticky') {
    const r = el.type === 'sticky' ? 3 : cornerRadius(el);
    parts.push(
      `<rect ${attrs({
        x: el.x,
        y: el.y,
        width: el.w,
        height: el.h,
        rx: r || undefined,
        ry: r || undefined,
        fill: el.type === 'sticky' ? el.fill : fill,
        ...stroke,
      })} />`
    );
  } else if (el.type === 'ellipse') {
    parts.push(`<ellipse ${attrs({ cx: el.x + el.w / 2, cy: el.y + el.h / 2, rx: el.w / 2, ry: el.h / 2, fill, ...stroke })} />`);
  } else if (el.type === 'diamond') {
    const points = diamondPoints(el).map(([x, y]) => `${num(x)},${num(y)}`).join(' ');
    parts.push(`<polygon ${attrs({ points, fill, ...stroke })} />`);
  } else if (el.type === 'frame') {
    parts.push(
      `<rect ${attrs({
        x: el.x,
        y: el.y,
        width: el.w,
        height: el.h,
        fill: 'none',
        stroke: opts.frameStroke ?? el.stroke,
        'stroke-width': 1.5,
      })} />`
    );
  }
  const text = textSvg(el, measure);
  if (text) parts.push(text);
  const body = parts.filter(Boolean).join('');
  if (!body) return '';
  const wrapper: Record<string, string | number | undefined> = {};
  if (el.angle) {
    wrapper.transform = `rotate(${num(degrees(el.angle))} ${num(el.x + el.w / 2)} ${num(el.y + el.h / 2)})`;
  }
  if (el.opacity < 1) wrapper.opacity = el.opacity;
  const wrapperAttrs = attrs(wrapper);
  return wrapperAttrs ? `<g ${wrapperAttrs}>${body}</g>` : body;
}

/* ------------------------------------------------------------ export */

export function elementsToSvg(elements: SketchElement[], opts: SvgOptions = {}): string {
  const measure = opts.measure ?? defaultMeasure;
  const padding = opts.padding ?? 24;
  const box = opts.bounds ?? expandBounds(elements.length ? boundsOfElements(elements) : { x: 0, y: 0, w: 1, h: 1 }, padding);
  const width = Math.max(1, Math.round(box.w));
  const height = Math.max(1, Math.round(box.h));
  const scale = opts.scale ?? 1;
  const defs: Defs = { hatch: new Map() };
  // Frames first so their outlines never sit on top of their contents.
  const ordered = [...elements.filter((el) => el.type === 'frame'), ...elements.filter((el) => el.type !== 'frame')];
  const body = ordered.map((el) => elementSvg(el, defs, opts, measure)).filter(Boolean).join('\n  ');
  const patterns = Array.from(defs.hatch.entries())
    .map(
      ([colour, id]) =>
        `<pattern id="${id}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
        `<line ${attrs({ x1: 0, y1: 0, x2: 0, y2: 7, stroke: colour, 'stroke-width': 1.6 })} /></pattern>`
    )
    .join('');
  const background =
    opts.background && opts.background !== 'transparent'
      ? `\n  <rect ${attrs({ x: box.x, y: box.y, width, height, fill: opts.background })} />`
      : '';
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(width * scale)}" height="${num(height * scale)}" ` +
      `viewBox="${num(box.x)} ${num(box.y)} ${num(width)} ${num(height)}">`,
    opts.title ? `  <title>${escapeXml(opts.title)}</title>` : '',
    patterns ? `  <defs>${patterns}</defs>` : '',
    background.trim() ? background.trim().replace(/^/, '  ') : '',
    body ? `  ${body}` : '',
    '</svg>',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** The whole board, framed on its own contents. */
export const documentToSvg = (doc: SketchDocument, opts: SvgOptions = {}): string =>
  elementsToSvg(doc.elements, { title: doc.name, ...opts });

/** The box an export covers: the selection's, a frame's, or everything. */
export function exportBounds(elements: SketchElement[], padding = 24): Bounds {
  if (!elements.length) return { x: 0, y: 0, w: 1, h: 1 };
  return expandBounds(boundsOfElements(elements), padding);
}

export const frameBounds = (frame: SketchElement): Bounds => rotatedBounds(frame);
