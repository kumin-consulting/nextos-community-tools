// Text measuring and wrapping, with the measurer injected so the same
// wrapping runs on the canvas (real `ctx.measureText`) and in the SVG
// exporter / diagram layout (a table-driven estimate, no DOM needed).

import { type FontKey } from './types';

export type Measure = (text: string) => number;

export const LINE_HEIGHT_RATIO = 1.25;

export const lineHeightFor = (fontSize: number): number => Math.round(fontSize * LINE_HEIGHT_RATIO);

/** Average advance width as a fraction of the font size, per family.
 *  Calibrated against the browser stacks in types.ts - good to a few per
 *  cent, which is all layout and SVG sizing need. */
const AVERAGE_ADVANCE: Record<FontKey, number> = { sans: 0.52, serif: 0.5, mono: 0.6 };

const WIDE = new Set('MMWWmw@%'.split(''));
const NARROW = new Set("iljtfrI!.,;:'|()[]{}".split(''));

/** Estimated width of `text` with no DOM available. */
export function estimateTextWidth(text: string, fontSize: number, font: FontKey = 'sans'): number {
  const base = AVERAGE_ADVANCE[font] ?? 0.52;
  if (font === 'mono') return text.length * fontSize * base;
  let units = 0;
  for (const ch of text) {
    if (WIDE.has(ch)) units += 0.95;
    else if (NARROW.has(ch)) units += 0.42;
    else if (ch >= 'A' && ch <= 'Z') units += 0.78;
    else if (ch === ' ') units += 0.55;
    else units += 1;
  }
  return units * fontSize * base;
}

export const estimateMeasure = (fontSize: number, font: FontKey = 'sans'): Measure => (text) => estimateTextWidth(text, fontSize, font);

/** Greedy word wrap honouring explicit newlines; a single word longer
 *  than the line is broken by characters rather than overflowing. */
export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  const out: string[] = [];
  const limit = Math.max(maxWidth, 1);
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      out.push('');
      continue;
    }
    const words = paragraph.split(' ');
    let line = '';
    for (const word of words) {
      const candidate = line === '' ? word : `${line} ${word}`;
      if (measure(candidate) <= limit || line === '') {
        if (measure(candidate) > limit && line === '' && measure(word) > limit) {
          // Break the oversized word itself.
          let chunk = '';
          for (const ch of word) {
            if (chunk && measure(chunk + ch) > limit) {
              out.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          line = chunk;
          continue;
        }
        line = candidate;
      } else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out.length ? out : [''];
}

/** Width and height of a wrapped block. */
export function measureBlock(lines: string[], fontSize: number, measure: Measure): { width: number; height: number } {
  let width = 0;
  for (const line of lines) width = Math.max(width, measure(line));
  return { width, height: lines.length * lineHeightFor(fontSize) };
}

/** Padding between a container's edge and the text inside it. */
export const TEXT_PADDING = 10;
