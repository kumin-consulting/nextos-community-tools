// The retained element model. One flat shape covers every element type so
// serialisation, history snapshots and generic transforms (move, resize,
// align, z-order) never need a discriminated-union switch; the fields a
// given type does not use are simply left at their defaults.
//
// Pure: no React, no DOM, no SDK. Everything under src/lib is importable
// from a plain `node --experimental-transform-types` test.

export type ElementType = 'rect' | 'ellipse' | 'diamond' | 'line' | 'arrow' | 'draw' | 'text' | 'sticky' | 'frame';

export type FillStyle = 'none' | 'solid' | 'hatch';
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
export type TextAlign = 'left' | 'center' | 'right';
export type ArrowHead = 'none' | 'arrow' | 'dot' | 'bar';
export type EdgeShape = 'straight' | 'curved' | 'elbow';
export type FontKey = 'sans' | 'serif' | 'mono';

/** An endpoint fastened to a shape: the arrow re-aims itself at the
 *  shape's boundary whenever that shape moves, resizes or rotates. */
export interface Binding {
  elementId: string;
  /** Distance kept between the shape's edge and the arrow tip, in scene units. */
  gap: number;
}

export interface SketchElement {
  id: string;
  type: ElementType;
  /** Top-left of the unrotated bounding box, in scene coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation in radians about the bounding box centre. */
  angle: number;
  stroke: string;
  fill: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  opacity: number;
  /** 0..1 - fraction of the shorter side used as the corner radius. */
  roundness: number;
  locked: boolean;
  groupId: string | null;
  /** Text drawn inside a shape, or the content of a text/sticky element,
   *  or the label sitting on an arrow's midpoint. */
  text: string;
  fontSize: number;
  fontFamily: FontKey;
  textAlign: TextAlign;
  textColor: string;
  /** line / arrow / draw only: vertices relative to (x, y). */
  points: Array<[number, number]>;
  edge: EdgeShape;
  startArrow: ArrowHead;
  endArrow: ArrowHead;
  startBinding: Binding | null;
  endBinding: Binding | null;
  /** frame only. */
  name: string;
}

export interface Viewport {
  /** Scene coordinate shown at the canvas origin. */
  scrollX: number;
  scrollY: number;
  zoom: number;
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Point = [number, number];

export const LINEAR_TYPES: ReadonlySet<ElementType> = new Set<ElementType>(['line', 'arrow', 'draw']);
export const BINDABLE_TYPES: ReadonlySet<ElementType> = new Set<ElementType>(['rect', 'ellipse', 'diamond', 'sticky', 'text', 'frame']);
export const CONTAINER_TYPES: ReadonlySet<ElementType> = new Set<ElementType>(['rect', 'ellipse', 'diamond', 'sticky']);

export const isLinear = (el: SketchElement): boolean => LINEAR_TYPES.has(el.type);
export const isBindable = (el: SketchElement): boolean => BINDABLE_TYPES.has(el.type);
/** Double-clicking one of these edits text centred inside the shape. */
export const isContainer = (el: SketchElement): boolean => CONTAINER_TYPES.has(el.type);

export const FONT_STACKS: Record<FontKey, string> = {
  sans: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
  serif: "'Iowan Old Style', Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace",
};

export const FONT_SIZES = [14, 20, 28, 40] as const;
export const STROKE_WIDTHS = [1.5, 3, 6] as const;

export const DEFAULT_ELEMENT: Omit<SketchElement, 'id' | 'type'> = {
  x: 0,
  y: 0,
  w: 0,
  h: 0,
  angle: 0,
  stroke: '#1e1e1e',
  fill: 'transparent',
  fillStyle: 'none',
  strokeWidth: 3,
  strokeStyle: 'solid',
  opacity: 1,
  roundness: 0.12,
  locked: false,
  groupId: null,
  text: '',
  fontSize: 20,
  fontFamily: 'sans',
  textAlign: 'center',
  textColor: '#1e1e1e',
  points: [],
  edge: 'straight',
  startArrow: 'none',
  endArrow: 'none',
  startBinding: null,
  endBinding: null,
  name: '',
};
