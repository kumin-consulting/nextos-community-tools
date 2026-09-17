// Where an element's text goes. One function answers it for every case -
// a free text element, a label centred inside a shape, the caption on an
// arrow's midpoint, a sticky note - and the canvas renderer, the SVG
// exporter and the in-place editing overlay all position themselves from
// its answer, so what you type, what you see and what you export line up
// to the pixel.
//
// Pure: the text measurer is injected (ctx.measureText on screen, the
// estimator from text.ts everywhere else).

import { type FontKey, type SketchElement, type TextAlign, isContainer, isLinear } from './types';
import { lineHeightFor, wrapText, TEXT_PADDING } from './text';
import { labelAnchor } from './binding';

export type MeasureText = (text: string, fontSize: number, font: FontKey) => number;

export interface TextLayout {
  lines: string[];
  /** Horizontal anchor for every line, matching `align`. */
  anchorX: number;
  /** Baseline of the first line (alphabetic baseline). */
  firstBaselineY: number;
  lineHeight: number;
  align: TextAlign;
  /** The block's own box, in the element's unrotated frame. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The width text was wrapped to. */
  wrapWidth: number;
}

/** The fraction of the font size between a line's vertical centre and its
 *  alphabetic baseline. Measured once against the three font stacks in
 *  types.ts; it is what keeps canvas text and SVG text on the same line. */
export const BASELINE_OFFSET = 0.355;

const anchorFor = (align: TextAlign, x: number, width: number): number =>
  align === 'left' ? x : align === 'right' ? x + width : x + width / 2;

/** Wrap width for text living inside a shape: a diamond and an ellipse
 *  lose room to their curved sides, a rectangle only to its padding. */
export function innerWidth(el: SketchElement): number {
  if (el.type === 'diamond') return Math.max(16, el.w * 0.58);
  if (el.type === 'ellipse') return Math.max(16, el.w * 0.72);
  return Math.max(16, el.w - TEXT_PADDING * 2);
}

/** Null when the element carries no text at all. */
export function elementTextLayout(el: SketchElement, measure: MeasureText): TextLayout | null {
  const content = el.type === 'frame' ? el.name : el.text;
  if (!content) return null;
  const fontSize = el.fontSize;
  const lineHeight = lineHeightFor(fontSize);
  const m = (t: string): number => measure(t, fontSize, el.fontFamily);

  if (el.type === 'frame') {
    // A frame's name sits on the strip above it, left aligned, never wrapped.
    const width = m(content);
    return {
      lines: [content],
      anchorX: el.x,
      firstBaselineY: el.y - 9 + fontSize * BASELINE_OFFSET,
      lineHeight,
      align: 'left',
      x: el.x,
      y: el.y - 9 - lineHeight / 2,
      width,
      height: lineHeight,
      wrapWidth: width,
    };
  }

  if (isLinear(el)) {
    // An arrow's label rides the midpoint of the route it actually draws.
    const [cx, cy] = labelAnchor(el);
    const lines = content.split('\n');
    let width = 0;
    for (const line of lines) width = Math.max(width, m(line));
    const height = lines.length * lineHeight;
    return {
      lines,
      anchorX: cx,
      firstBaselineY: cy - height / 2 + lineHeight / 2 + fontSize * BASELINE_OFFSET,
      lineHeight,
      align: 'center',
      x: cx - width / 2,
      y: cy - height / 2,
      width,
      height,
      wrapWidth: width,
    };
  }

  if (el.type === 'text') {
    // A free text element never wraps on its own: it grows sideways and
    // breaks only where someone pressed Enter. (Wrapping to its own
    // width would be a feedback loop - the box is sized FROM the text,
    // so the next character would re-wrap what the last one widened.
    // Text that must wrap goes inside a shape, which has a fixed width.)
    const lines = content.split('\n');
    let width = 0;
    for (const line of lines) width = Math.max(width, m(line));
    const boxWidth = width;
    return {
      lines,
      anchorX: anchorFor(el.textAlign, el.x, boxWidth),
      firstBaselineY: el.y + lineHeight / 2 + fontSize * BASELINE_OFFSET,
      lineHeight,
      align: el.textAlign,
      x: el.x,
      y: el.y,
      width: boxWidth,
      height: lines.length * lineHeight,
      wrapWidth: boxWidth,
    };
  }

  // A container: wrapped, centred on the shape in both directions.
  const wrapWidth = isContainer(el) ? innerWidth(el) : Math.max(16, el.w - TEXT_PADDING * 2);
  const lines = wrapText(content, wrapWidth, m);
  const height = lines.length * lineHeight;
  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  return {
    lines,
    anchorX: anchorFor(el.textAlign, cx - wrapWidth / 2, wrapWidth),
    firstBaselineY: cy - height / 2 + lineHeight / 2 + fontSize * BASELINE_OFFSET,
    lineHeight,
    align: el.textAlign,
    x: cx - wrapWidth / 2,
    y: cy - height / 2,
    width: wrapWidth,
    height,
    wrapWidth,
  };
}

/** Height a container needs to hold its text - used to grow a shape (and
 *  a text element) as someone types into it. */
export function requiredHeight(el: SketchElement, measure: MeasureText): number {
  const layout = elementTextLayout(el, measure);
  if (!layout) return el.h;
  if (el.type === 'text') return layout.height;
  return layout.height + TEXT_PADDING * 2 * (el.type === 'diamond' ? 2.2 : 1);
}
