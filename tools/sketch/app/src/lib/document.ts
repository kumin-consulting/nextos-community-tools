// The file format: what a .sketch.json holds, how it is written, how it
// is read back, and what happens when the bytes on disk are not what this
// version expects. Parsing NEVER throws - it returns a result the UI can
// render as a readable problem, because a whiteboard that shows a blank
// white window when a file is a byte short is worse than useless.

import {
  DEFAULT_ELEMENT,
  type ElementType,
  type FillStyle,
  type FontKey,
  type Point,
  type SketchElement,
  type StrokeStyle,
  type TextAlign,
  type ArrowHead,
  type EdgeShape,
  type Viewport,
  LINEAR_TYPES,
} from './types';
import { normalizeLinear } from './geometry';
import { estimateTextWidth, lineHeightFor } from './text';

export const SCHEMA_VERSION = 1;
export const FILE_EXTENSION = '.sketch.json';
export const FOLDER_NAME = 'Sketches';

export type BackgroundStyle = 'grid' | 'dots' | 'plain';

export interface SketchDocument {
  type: 'sketch';
  version: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  background: BackgroundStyle;
  view: Viewport;
  elements: SketchElement[];
}

/* -------------------------------------------------------------- ids */

let idCounter = 0;

/** Short, sortable-enough, collision-free within a document. Not a UUID
 *  on purpose: these end up in every serialised element, and 12 chars
 *  keeps a 2,000-element file readable in a diff. */
export function newId(prefix = 'e'): string {
  idCounter = (idCounter + 1) % 0xffff;
  const time = Date.now().toString(36).slice(-6);
  const rand = Math.floor(Math.random() * 0xffffff).toString(36).padStart(4, '0').slice(-4);
  return `${prefix}${time}${rand}${idCounter.toString(36)}`;
}

/* -------------------------------------------------------- factories */

export function createElement(type: ElementType, props: Partial<SketchElement> = {}): SketchElement {
  const el: SketchElement = { ...DEFAULT_ELEMENT, id: newId(), type, ...props };
  return LINEAR_TYPES.has(type) && el.points.length ? normalizeLinear(el) : el;
}

export function createDocument(name = 'Untitled', elements: SketchElement[] = []): SketchDocument {
  const now = new Date().toISOString();
  return {
    type: 'sketch',
    version: SCHEMA_VERSION,
    name,
    createdAt: now,
    updatedAt: now,
    background: 'grid',
    view: { scrollX: -400, scrollY: -300, zoom: 1 },
    elements,
  };
}

/* ------------------------------------------------------ coercion */

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

const ELEMENT_TYPES: ElementType[] = ['rect', 'ellipse', 'diamond', 'line', 'arrow', 'draw', 'text', 'sticky', 'frame'];
const FILL_STYLES: FillStyle[] = ['none', 'solid', 'hatch'];
const STROKE_STYLES: StrokeStyle[] = ['solid', 'dashed', 'dotted'];
const TEXT_ALIGNS: TextAlign[] = ['left', 'center', 'right'];
const ARROW_HEADS: ArrowHead[] = ['none', 'arrow', 'dot', 'bar'];
const EDGES: EdgeShape[] = ['straight', 'curved', 'elbow'];
const FONTS: FontKey[] = ['sans', 'serif', 'mono'];

function coercePoints(v: unknown): Point[] {
  if (!Array.isArray(v)) return [];
  const out: Point[] = [];
  for (const p of v) {
    if (Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number' && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
      out.push([p[0], p[1]]);
    }
  }
  return out;
}

function coerceBinding(v: unknown): SketchElement['startBinding'] {
  if (!v || typeof v !== 'object') return null;
  const raw = v as Record<string, unknown>;
  if (typeof raw.elementId !== 'string' || !raw.elementId) return null;
  return { elementId: raw.elementId, gap: num(raw.gap, 6) };
}

/** Turns anything into a valid element, defaulting every field it cannot
 *  read. Returns null only when there is nothing recognisable at all. */
export function coerceElement(raw: unknown): SketchElement | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const type = oneOf(r.type, ELEMENT_TYPES, 'rect');
  const el: SketchElement = {
    ...DEFAULT_ELEMENT,
    id: str(r.id, '') || newId(),
    type,
    x: num(r.x, 0),
    y: num(r.y, 0),
    w: Math.max(0, num(r.w, 0)),
    h: Math.max(0, num(r.h, 0)),
    angle: num(r.angle, 0),
    stroke: str(r.stroke, DEFAULT_ELEMENT.stroke),
    fill: str(r.fill, DEFAULT_ELEMENT.fill),
    fillStyle: oneOf(r.fillStyle, FILL_STYLES, DEFAULT_ELEMENT.fillStyle),
    strokeWidth: Math.max(0.25, num(r.strokeWidth, DEFAULT_ELEMENT.strokeWidth)),
    strokeStyle: oneOf(r.strokeStyle, STROKE_STYLES, DEFAULT_ELEMENT.strokeStyle),
    opacity: Math.min(1, Math.max(0.05, num(r.opacity, 1))),
    roundness: Math.min(0.5, Math.max(0, num(r.roundness, DEFAULT_ELEMENT.roundness))),
    locked: bool(r.locked, false),
    groupId: typeof r.groupId === 'string' && r.groupId ? r.groupId : null,
    text: str(r.text, ''),
    fontSize: Math.max(6, num(r.fontSize, DEFAULT_ELEMENT.fontSize)),
    fontFamily: oneOf(r.fontFamily, FONTS, 'sans'),
    textAlign: oneOf(r.textAlign, TEXT_ALIGNS, 'center'),
    textColor: str(r.textColor, DEFAULT_ELEMENT.textColor),
    points: coercePoints(r.points),
    edge: oneOf(r.edge, EDGES, 'straight'),
    startArrow: oneOf(r.startArrow, ARROW_HEADS, 'none'),
    endArrow: oneOf(r.endArrow, ARROW_HEADS, 'none'),
    startBinding: coerceBinding(r.startBinding),
    endBinding: coerceBinding(r.endBinding),
    name: str(r.name, ''),
  };
  if (LINEAR_TYPES.has(el.type)) {
    if (el.points.length < 2 && el.type !== 'draw') return null;
    if (!el.points.length) return null;
    return normalizeLinear(el);
  }
  if (el.type === 'text' && el.text) return sizeTextElement(el);
  return el;
}

/** A free text element's box IS its text - everything downstream (the
 *  selection box, zoom-to-fit, the export frame) reads w/h rather than
 *  re-measuring. A file written by hand or by an agent rarely gets those
 *  right, so a box that is clearly too small for what it holds is
 *  re-sized from the estimator here. A box within a few per cent of the
 *  estimate is left exactly as it was: the app measures with the real
 *  font and its numbers are better than this one's. */
export function sizeTextElement(el: SketchElement): SketchElement {
  const lines = el.text.split('\n');
  let width = 0;
  for (const line of lines) width = Math.max(width, estimateTextWidth(line, el.fontSize, el.fontFamily));
  const height = lines.length * lineHeightFor(el.fontSize);
  if (el.w >= width * 0.8 && el.h >= height * 0.8) return el;
  return { ...el, w: Math.max(el.w, Math.round(width)), h: Math.max(el.h, height) };
}

function coerceView(v: unknown): Viewport {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    scrollX: num(r.scrollX, 0),
    scrollY: num(r.scrollY, 0),
    zoom: Math.min(30, Math.max(0.05, num(r.zoom, 1))),
  };
}

/* ---------------------------------------------------- serialisation */

export function serializeDocument(doc: SketchDocument): string {
  return `${JSON.stringify({ ...doc, type: 'sketch', version: SCHEMA_VERSION }, null, 2)}\n`;
}

export interface ParseOk {
  ok: true;
  doc: SketchDocument;
  /** Elements that could not be read and were dropped. */
  dropped: number;
  /** True when the file was written by an older or looser shape. */
  migrated: boolean;
}

export interface ParseFail {
  ok: false;
  /** One sentence a person can act on. */
  error: string;
  /** The raw text, so the UI can offer "open a copy" without re-reading. */
  raw: string;
}

export type ParseResult = ParseOk | ParseFail;

/** Reads a .sketch.json. Tolerates a bare element array (what an early
 *  export wrote) and anything with recognisable elements; only genuinely
 *  unreadable bytes fail. */
export function parseDocument(text: string, fallbackName = 'Untitled'): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `This file is not valid JSON (${message}).`, raw: text };
  }
  let migrated = false;
  let rawElements: unknown[];
  let base: Record<string, unknown>;
  if (Array.isArray(data)) {
    // Version 0: a bare array of elements.
    rawElements = data;
    base = {};
    migrated = true;
  } else if (data && typeof data === 'object') {
    base = data as Record<string, unknown>;
    if (base.type !== undefined && base.type !== 'sketch') {
      return { ok: false, error: `This is a "${String(base.type)}" file, not a Sketch board.`, raw: text };
    }
    if (!Array.isArray(base.elements)) {
      return { ok: false, error: 'This Sketch file has no "elements" list, so there is nothing to draw.', raw: text };
    }
    rawElements = base.elements;
    if (num(base.version, 0) !== SCHEMA_VERSION) migrated = true;
  } else {
    return { ok: false, error: 'This file does not contain a Sketch board.', raw: text };
  }

  const elements: SketchElement[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const raw of rawElements) {
    const el = coerceElement(raw);
    if (!el) {
      dropped++;
      continue;
    }
    if (seen.has(el.id)) el.id = newId();
    seen.add(el.id);
    elements.push(el);
  }
  const created = str(base.createdAt, '') || new Date().toISOString();
  const doc: SketchDocument = {
    type: 'sketch',
    version: SCHEMA_VERSION,
    name: str(base.name, '') || fallbackName,
    createdAt: created,
    updatedAt: str(base.updatedAt, '') || created,
    background: oneOf(base.background, ['grid', 'dots', 'plain'] as const, 'grid'),
    view: coerceView(base.view),
    elements,
  };
  return { ok: true, doc, dropped, migrated };
}

/* ------------------------------------------------------------ names */

const ILLEGAL_CHARS = new Set(('/:*?"<>|' + String.fromCharCode(92)).split(''));

/** A safe, human-looking file stem: path separators, the Windows-reserved
 *  punctuation and control characters become spaces, but commas, hyphens
 *  and spaces survive - a board called "Q3 plan, v2" keeps its name.
 *  Never empty, never a dotfile. */
export function sanitizeName(name: string): string {
  let swapped = '';
  for (const ch of name) {
    const code = ch.codePointAt(0) ?? 0;
    swapped += ILLEGAL_CHARS.has(ch) || code < 32 || code === 127 ? ' ' : ch;
  }
  const cleaned = swapped.replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 80).trim();
  return cleaned || 'Untitled';
}

export const fileNameFor = (name: string): string => `${sanitizeName(name)}${FILE_EXTENSION}`;

export const documentPath = (folder: string, name: string): string => `${folder}/${fileNameFor(name)}`;

export function nameFromFileName(fileName: string): string {
  return fileName.endsWith(FILE_EXTENSION) ? fileName.slice(0, -FILE_EXTENSION.length) : fileName.replace(/\.json$/, '');
}

export const isSketchFile = (fileName: string): boolean => fileName.endsWith(FILE_EXTENSION);

/** "Board", "Board 2", "Board 3"... against names already taken. */
export function uniqueName(existing: Iterable<string>, base: string): string {
  const taken = new Set(Array.from(existing, (n) => n.toLowerCase()));
  const clean = sanitizeName(base);
  if (!taken.has(clean.toLowerCase())) return clean;
  for (let i = 2; i < 10000; i++) {
    const candidate = `${clean} ${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${clean} ${Date.now()}`;
}

/* -------------------------------------------------------- describing */

const TYPE_LABEL: Record<ElementType, string> = {
  rect: 'rectangle',
  ellipse: 'ellipse',
  diamond: 'diamond',
  line: 'line',
  arrow: 'arrow',
  draw: 'freehand stroke',
  text: 'text',
  sticky: 'sticky note',
  frame: 'frame',
};

/** A plain-text outline of a board: what is on it and what points at what.
 *  This is what `sketch_describe` returns, so an assistant can talk about
 *  a diagram it cannot see. */
export function describeDocument(doc: SketchDocument): string {
  const lines: string[] = [];
  const byId = new Map(doc.elements.map((el) => [el.id, el]));
  const labelFor = (el: SketchElement): string => {
    const t = (el.text || el.name).replace(/\s+/g, ' ').trim();
    return t ? `"${t}"` : `${TYPE_LABEL[el.type]} ${el.id}`;
  };
  const shapes = doc.elements.filter((el) => !LINEAR_TYPES.has(el.type));
  const connectors = doc.elements.filter((el) => el.type === 'arrow' || el.type === 'line');
  const strokes = doc.elements.filter((el) => el.type === 'draw');
  lines.push(`Board "${doc.name}" - ${doc.elements.length} element${doc.elements.length === 1 ? '' : 's'}.`);
  const frames = shapes.filter((el) => el.type === 'frame');
  if (frames.length) lines.push(`Frames: ${frames.map((f) => `"${f.name || 'Frame'}"`).join(', ')}.`);
  if (shapes.length) {
    lines.push('', 'Shapes:');
    for (const el of shapes) {
      if (el.type === 'frame') continue;
      const pos = `at (${Math.round(el.x)}, ${Math.round(el.y)}), ${Math.round(el.w)}x${Math.round(el.h)}`;
      lines.push(`- ${TYPE_LABEL[el.type]} ${labelFor(el)} ${pos}`);
    }
  }
  if (connectors.length) {
    lines.push('', 'Connections:');
    for (const el of connectors) {
      const from = el.startBinding ? byId.get(el.startBinding.elementId) : undefined;
      const to = el.endBinding ? byId.get(el.endBinding.elementId) : undefined;
      const label = el.text ? ` labelled "${el.text}"` : '';
      if (from && to) lines.push(`- ${labelFor(from)} -> ${labelFor(to)}${label}`);
      else if (to) lines.push(`- (unattached) -> ${labelFor(to)}${label}`);
      else if (from) lines.push(`- ${labelFor(from)} -> (unattached)${label}`);
      else lines.push(`- free ${TYPE_LABEL[el.type]}${label}`);
    }
  }
  if (strokes.length) lines.push('', `${strokes.length} freehand stroke${strokes.length === 1 ? '' : 's'}.`);
  if (doc.elements.length === 0) lines.push('', 'The board is empty.');
  return lines.join('\n');
}
