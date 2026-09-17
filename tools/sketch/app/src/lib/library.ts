// The shape library: the pieces people reach for over and over, built
// from the same nine element types the tools draw, never from a special
// case in the renderer. A database is a rectangle between two ellipses; a
// cloud is one closed curve; a person is a head and four strokes - each
// returned as a group, so it moves, styles, exports and undoes exactly
// like anything drawn by hand.
//
// Pure: element factories only.

import { type ElementType, type Point, type SketchElement } from './types';
import { createElement, newId } from './document';
import { type DiagramStyle, DEFAULT_DIAGRAM_STYLE } from './layout';

export interface LibraryItem {
  id: string;
  name: string;
  /** What someone would type in the slash palette to find it. */
  keywords: string[];
  w: number;
  h: number;
  /** Builds the item with its top-left at (x, y). */
  build(x: number, y: number, style: DiagramStyle): SketchElement[];
}

const scalePoints = (points: Point[], x: number, y: number, w: number, h: number): Point[] =>
  points.map(([px, py]) => [x + px * w, y + py * h] as Point);

/** One filled, closed curve - what the cloud is made of. */
function closedCurve(points: Point[], style: DiagramStyle, extra: Partial<SketchElement> = {}): SketchElement {
  const [ox, oy] = points[0];
  return createElement('line', {
    x: ox,
    y: oy,
    edge: 'curved',
    points: points.map(([px, py]) => [px - ox, py - oy] as Point),
    stroke: style.stroke,
    fill: style.fill,
    fillStyle: style.fillStyle === 'none' ? 'solid' : style.fillStyle,
    ...extra,
  });
}

function labelled(type: ElementType, x: number, y: number, w: number, h: number, text: string, style: DiagramStyle): SketchElement {
  return createElement(type, {
    x,
    y,
    w,
    h,
    text,
    fontSize: style.fontSize,
    textAlign: 'center',
    stroke: style.stroke,
    fill: style.fill,
    fillStyle: 'solid',
    textColor: style.textColor,
  });
}

const CLOUD: Point[] = [
  [0.1, 0.78],
  [0.03, 0.62],
  [0.09, 0.46],
  [0.22, 0.42],
  [0.24, 0.26],
  [0.38, 0.16],
  [0.54, 0.2],
  [0.65, 0.08],
  [0.81, 0.13],
  [0.88, 0.28],
  [0.97, 0.41],
  [0.94, 0.61],
  [0.85, 0.76],
  [0.66, 0.83],
  [0.4, 0.84],
  [0.19, 0.83],
  [0.1, 0.78],
];

function grouped(elements: SketchElement[]): SketchElement[] {
  if (elements.length < 2) return elements;
  const groupId = newId('g');
  return elements.map((el) => ({ ...el, groupId }));
}

export const LIBRARY: LibraryItem[] = [
  {
    id: 'start',
    name: 'Start / End',
    keywords: ['start', 'end', 'terminator', 'flowchart', 'oval'],
    w: 160,
    h: 64,
    build: (x, y, style) => [labelled('ellipse', x, y, 160, 64, 'Start', style)],
  },
  {
    id: 'process',
    name: 'Process',
    keywords: ['process', 'step', 'action', 'flowchart', 'box'],
    w: 180,
    h: 80,
    build: (x, y, style) => [labelled('rect', x, y, 180, 80, 'Process', style)],
  },
  {
    id: 'decision',
    name: 'Decision',
    keywords: ['decision', 'branch', 'if', 'diamond', 'flowchart'],
    w: 190,
    h: 120,
    build: (x, y, style) => [labelled('diamond', x, y, 190, 120, 'Decision?', style)],
  },
  {
    id: 'database',
    name: 'Database',
    keywords: ['database', 'db', 'store', 'cylinder', 'storage'],
    w: 150,
    h: 130,
    build: (x, y, style) => {
      const w = 150;
      const h = 130;
      const cap = 34;
      const body = createElement('rect', {
        x,
        y: y + cap / 2,
        w,
        h: h - cap,
        stroke: 'transparent',
        fill: style.fill,
        fillStyle: 'solid',
        roundness: 0,
        text: 'Database',
        fontSize: style.fontSize,
        textColor: style.textColor,
      });
      const bottom = createElement('ellipse', { x, y: y + h - cap, w, h: cap, stroke: style.stroke, fill: style.fill, fillStyle: 'solid' });
      const left = createElement('line', {
        x,
        y: y + cap / 2,
        points: [
          [0, 0],
          [0, h - cap],
        ],
        stroke: style.stroke,
      });
      const right = createElement('line', {
        x: x + w,
        y: y + cap / 2,
        points: [
          [0, 0],
          [0, h - cap],
        ],
        stroke: style.stroke,
      });
      const top = createElement('ellipse', { x, y, w, h: cap, stroke: style.stroke, fill: style.fill, fillStyle: 'solid' });
      return grouped([bottom, body, left, right, top]);
    },
  },
  {
    id: 'cloud',
    name: 'Cloud',
    keywords: ['cloud', 'internet', 'service', 'network'],
    w: 210,
    h: 130,
    build: (x, y, style) => {
      const w = 210;
      const h = 130;
      const cloud = closedCurve(scalePoints(CLOUD, x, y, w, h), style);
      const label = createElement('text', {
        x: x + w * 0.2,
        y: y + h * 0.44,
        w: w * 0.6,
        h: 24,
        text: 'Cloud',
        fontSize: style.fontSize,
        textAlign: 'center',
        textColor: style.textColor,
        stroke: 'transparent',
      });
      return grouped([cloud, label]);
    },
  },
  {
    id: 'person',
    name: 'Person',
    keywords: ['person', 'user', 'actor', 'stick figure', 'human'],
    w: 96,
    h: 150,
    build: (x, y, style) => {
      const w = 96;
      const h = 150;
      const headR = 21;
      const cx = x + w / 2;
      const neck = y + headR * 2;
      const hip = neck + 52;
      const stroke = { stroke: style.stroke, strokeWidth: 3 };
      const head = createElement('ellipse', { x: cx - headR, y, w: headR * 2, h: headR * 2, ...stroke, fill: style.fill, fillStyle: 'solid' });
      const spine = createElement('line', { x: cx, y: neck, points: [[0, 0], [0, hip - neck]], ...stroke });
      const arms = createElement('line', { x: cx - 30, y: neck + 18, points: [[0, 0], [60, 0]], ...stroke });
      const legL = createElement('line', { x: cx, y: hip, points: [[0, 0], [-24, 44]], ...stroke });
      const legR = createElement('line', { x: cx, y: hip, points: [[0, 0], [24, 44]], ...stroke });
      const label = createElement('text', {
        x: x - 22,
        y: y + h - 22,
        w: w + 44,
        h: 24,
        text: 'Person',
        fontSize: style.fontSize,
        textAlign: 'center',
        textColor: style.textColor,
        stroke: 'transparent',
      });
      return grouped([head, spine, arms, legL, legR, label]);
    },
  },
];

export const libraryItem = (id: string): LibraryItem | undefined => LIBRARY.find((i) => i.id === id);

/** Builds an item centred on a scene point. */
export function insertLibraryItem(id: string, center: Point, style: Partial<DiagramStyle> = {}): SketchElement[] {
  const item = libraryItem(id);
  if (!item) return [];
  const s = { ...DEFAULT_DIAGRAM_STYLE, ...style };
  return item.build(Math.round(center[0] - item.w / 2), Math.round(center[1] - item.h / 2), s);
}

/** Fuzzy-ish search for the slash palette: name first, then keywords. */
export function searchLibrary(query: string): LibraryItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return LIBRARY;
  const score = (item: LibraryItem): number => {
    const name = item.name.toLowerCase();
    if (name.startsWith(q)) return 0;
    if (name.includes(q)) return 1;
    if (item.keywords.some((k) => k.startsWith(q))) return 2;
    if (item.keywords.some((k) => k.includes(q))) return 3;
    return Infinity;
  };
  return LIBRARY.map((item) => ({ item, s: score(item) }))
    .filter((e) => e.s !== Infinity)
    .sort((a, b) => a.s - b.s)
    .map((e) => e.item);
}
