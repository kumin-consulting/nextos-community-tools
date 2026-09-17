// The renderer: one full redraw of the visible scene into a 2D context.
// It owns no state - everything it needs arrives in a RenderScene - so
// the same function draws the live board, the minimap and an exported
// PNG, and a test could hand it a stub context.
//
// Speed comes from three things and no cleverness: culling to the visible
// rectangle, drawing in scene coordinates under one transform (so stroke
// widths need no per-element maths), and a font string cache (setting
// ctx.font is the single most expensive call in a text-heavy board).

import {
  type SketchElement,
  type Viewport,
  FONT_STACKS,
  isLinear,
} from '../lib/types';
import { type Bounds, type Point } from '../lib/types';
import { type Palette } from '../lib/palette';
import { type BackgroundStyle } from '../lib/document';
import {
  boundsIntersect,
  diamondPoints,
  expandBounds,
  handlePositions,
  linearPathPoints,
  normalizeBounds,
  rotateHandlePosition,
  rotatedBounds,
  sceneToCanvas,
  visibleBounds,
} from '../lib/geometry';
import { commandsToPathData, cornerRadius, dashPattern, headsFor, linearCommands } from '../lib/shapes';
import { type MeasureText, elementTextLayout } from '../lib/textLayout';
import { type SnapLine } from '../lib/snap';

export interface RenderScene {
  elements: SketchElement[];
  viewport: Viewport;
  width: number;
  height: number;
  palette: Palette;
  background: BackgroundStyle;
  selectedIds: Set<string>;
  hoverId?: string | null;
  editingId?: string | null;
  marquee?: Bounds | null;
  snapLines?: SnapLine[];
  bindHighlightId?: string | null;
  /** Hides every piece of chrome: what PNG export draws. */
  chrome?: boolean;
  /** Paints the background colour (off for a transparent export). */
  paintBackground?: boolean;
  gridSize?: number;
}

export const GRID_SIZE = 20;

/* ------------------------------------------------------- measuring */

const fontCache = new WeakMap<CanvasRenderingContext2D, string>();

export function setFont(ctx: CanvasRenderingContext2D, fontSize: number, family: keyof typeof FONT_STACKS): void {
  const font = `${fontSize}px ${FONT_STACKS[family]}`;
  if (fontCache.get(ctx) === font) return;
  ctx.font = font;
  fontCache.set(ctx, font);
}

/** A measurer bound to a context - the exact widths the browser will use,
 *  which is what keeps the textarea overlay on top of the drawn text. */
export function measureWith(ctx: CanvasRenderingContext2D): MeasureText {
  const cache = new Map<string, number>();
  return (text, fontSize, family) => {
    const key = `${fontSize}|${family}|${text}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    setFont(ctx, fontSize, family);
    const width = ctx.measureText(text).width;
    if (cache.size > 4000) cache.clear();
    cache.set(key, width);
    return width;
  };
}

/* ------------------------------------------------------------ paths */

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  if (radius === 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function elementPath(ctx: CanvasRenderingContext2D, el: SketchElement): void {
  if (el.type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(el.x + el.w / 2, el.y + el.h / 2, Math.abs(el.w) / 2, Math.abs(el.h) / 2, 0, 0, Math.PI * 2);
    return;
  }
  if (el.type === 'diamond') {
    const pts = diamondPoints(el);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    return;
  }
  if (isLinear(el)) {
    ctx.beginPath();
    for (const c of linearCommands(el)) {
      if (c[0] === 'M') ctx.moveTo(c[1], c[2]);
      else if (c[0] === 'L') ctx.lineTo(c[1], c[2]);
      else if (c[0] === 'C') ctx.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
    }
    return;
  }
  roundRectPath(ctx, el.x, el.y, el.w, el.h, el.type === 'sticky' ? 3 : cornerRadius(el));
}

function fillHatched(ctx: CanvasRenderingContext2D, el: SketchElement, colour: string): void {
  const b = expandBounds(rotatedBounds(el), 8);
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(0.8, el.strokeWidth * 0.45);
  ctx.setLineDash([]);
  ctx.beginPath();
  const step = 8;
  const start = b.x - b.h;
  for (let x = start; x <= b.x + b.w; x += step) {
    ctx.moveTo(x, b.y);
    ctx.lineTo(x + b.h, b.y + b.h);
  }
  ctx.stroke();
  ctx.restore();
}

/* -------------------------------------------------------- elements */

export function drawElement(ctx: CanvasRenderingContext2D, el: SketchElement, palette: Palette, measure: MeasureText): void {
  ctx.save();
  ctx.globalAlpha = el.opacity;
  if (el.angle) {
    const cx = el.x + el.w / 2;
    const cy = el.y + el.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate(el.angle);
    ctx.translate(-cx, -cy);
  }
  const filled = el.fillStyle !== 'none' && el.fill && el.fill !== 'transparent';
  const stroked = el.stroke && el.stroke !== 'transparent' && el.type !== 'text';

  if (el.type === 'frame') {
    ctx.strokeStyle = palette.frameStroke;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    roundRectPath(ctx, el.x, el.y, el.w, el.h, 4);
    ctx.stroke();
  } else if (el.type !== 'text') {
    elementPath(ctx, el);
    if (filled) {
      if (el.fillStyle === 'hatch') {
        fillHatched(ctx, el, el.fill);
      } else {
        ctx.fillStyle = el.fill;
        if (el.type === 'sticky') {
          ctx.shadowColor = 'rgba(0,0,0,0.18)';
          ctx.shadowBlur = 8;
          ctx.shadowOffsetY = 2;
        }
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
      }
    }
    if (stroked) {
      ctx.strokeStyle = el.stroke;
      ctx.lineWidth = el.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash(dashPattern(el.strokeStyle, el.strokeWidth));
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  if (isLinear(el) && stroked) {
    const { start, end } = headsFor(el);
    ctx.strokeStyle = el.stroke;
    ctx.fillStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;
    for (const head of [start, end]) {
      if (!head) continue;
      if (head.kind === 'dot') {
        ctx.beginPath();
        ctx.arc(head.center[0], head.center[1], head.radius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(head.points[0][0], head.points[0][1]);
        for (const p of head.points.slice(1)) ctx.lineTo(p[0], p[1]);
        ctx.stroke();
      }
    }
  }

  drawElementText(ctx, el, palette, measure);
  ctx.restore();
}

export function drawElementText(ctx: CanvasRenderingContext2D, el: SketchElement, palette: Palette, measure: MeasureText): void {
  const layout = elementTextLayout(el, measure);
  if (!layout) return;
  setFont(ctx, el.fontSize, el.fontFamily);
  ctx.textAlign = layout.align === 'left' ? 'left' : layout.align === 'right' ? 'right' : 'center';
  ctx.textBaseline = 'alphabetic';
  if (isLinear(el)) {
    // A label on a connector gets the paper colour behind it so the line
    // does not run through the words.
    ctx.fillStyle = palette.background;
    roundRectPath(ctx, layout.x - 5, layout.y - 2, layout.width + 10, layout.height + 4, 4);
    ctx.fill();
  }
  ctx.fillStyle = el.type === 'frame' ? palette.textDim : el.textColor;
  for (let i = 0; i < layout.lines.length; i++) {
    ctx.fillText(layout.lines[i], layout.anchorX, layout.firstBaselineY + i * layout.lineHeight);
  }
}

/* ------------------------------------------------------ background */

function drawBackground(ctx: CanvasRenderingContext2D, scene: RenderScene): void {
  const { palette, viewport: v, width, height } = scene;
  if (scene.paintBackground !== false) {
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, width, height);
  }
  if (scene.background === 'plain' || scene.chrome === false) return;
  const size = (scene.gridSize ?? GRID_SIZE) * v.zoom;
  if (size < 6) return;
  const offsetX = -((v.scrollX * v.zoom) % size);
  const offsetY = -((v.scrollY * v.zoom) % size);
  const firstIndexX = Math.floor((v.scrollX * v.zoom) / size) + 1;
  const firstIndexY = Math.floor((v.scrollY * v.zoom) / size) + 1;
  if (scene.background === 'dots') {
    ctx.fillStyle = palette.gridStrong;
    for (let x = offsetX, i = firstIndexX; x < width; x += size, i++) {
      for (let y = offsetY, j = firstIndexY; y < height; y += size, j++) {
        const major = i % 5 === 0 && j % 5 === 0;
        ctx.globalAlpha = major ? 1 : 0.55;
        ctx.fillRect(Math.round(x), Math.round(y), major ? 2 : 1.4, major ? 2 : 1.4);
      }
    }
    ctx.globalAlpha = 1;
    return;
  }
  ctx.lineWidth = 1;
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass === 0 ? palette.grid : palette.gridStrong;
    ctx.beginPath();
    for (let x = offsetX, i = firstIndexX; x < width; x += size, i++) {
      if ((i % 5 === 0) !== (pass === 1)) continue;
      const px = Math.round(x) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
    }
    for (let y = offsetY, j = firstIndexY; y < height; y += size, j++) {
      if ((j % 5 === 0) !== (pass === 1)) continue;
      const py = Math.round(y) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
    }
    ctx.stroke();
  }
}

/* --------------------------------------------------------- overlays */

const HANDLE = 9;

function strokeScreenRect(ctx: CanvasRenderingContext2D, b: Bounds, colour: string, dash: number[] = []): void {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.5;
  ctx.setLineDash(dash);
  ctx.strokeRect(Math.round(b.x) + 0.5, Math.round(b.y) + 0.5, Math.round(b.w), Math.round(b.h));
  ctx.setLineDash([]);
}

function drawSelectionChrome(ctx: CanvasRenderingContext2D, scene: RenderScene): void {
  const { palette, viewport: v } = scene;
  const selected = scene.elements.filter((el) => scene.selectedIds.has(el.id));
  if (!selected.length) return;
  const single = selected.length === 1 ? selected[0] : null;

  if (single && !single.locked) {
    const b = { x: single.x, y: single.y, w: single.w, h: single.h };
    ctx.save();
    const [cx, cy] = sceneToCanvas([single.x + single.w / 2, single.y + single.h / 2], v);
    ctx.translate(cx, cy);
    ctx.rotate(single.angle);
    const w = single.w * v.zoom;
    const h = single.h * v.zoom;
    strokeScreenRect(ctx, { x: -w / 2 - 3, y: -h / 2 - 3, w: w + 6, h: h + 6 }, palette.selection);
    ctx.restore();
    if (!isLinear(single)) {
      ctx.fillStyle = palette.surface;
      ctx.strokeStyle = palette.selection;
      ctx.lineWidth = 1.5;
      for (const { point } of handlePositions(b, single.angle)) {
        const [hx, hy] = sceneToCanvas(point, v);
        ctx.beginPath();
        ctx.rect(hx - HANDLE / 2, hy - HANDLE / 2, HANDLE, HANDLE);
        ctx.fill();
        ctx.stroke();
      }
      const [rx, ry] = sceneToCanvas(rotateHandlePosition(b, single.angle, 28 / v.zoom), v);
      ctx.beginPath();
      ctx.arc(rx, ry, HANDLE / 2 + 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = palette.surface;
      ctx.strokeStyle = palette.selection;
      ctx.lineWidth = 1.5;
      for (const p of linearPathPoints(single)) {
        const [hx, hy] = sceneToCanvas(p, v);
        ctx.beginPath();
        ctx.arc(hx, hy, HANDLE / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    return;
  }

  for (const el of selected) {
    const b = rotatedBounds(el);
    const [x, y] = sceneToCanvas([b.x, b.y], v);
    strokeScreenRect(ctx, { x: x - 2, y: y - 2, w: b.w * v.zoom + 4, h: b.h * v.zoom + 4 }, palette.selection, [4, 4]);
  }
  const all = selected.map(rotatedBounds);
  const minX = Math.min(...all.map((b) => b.x));
  const minY = Math.min(...all.map((b) => b.y));
  const maxX = Math.max(...all.map((b) => b.x + b.w));
  const maxY = Math.max(...all.map((b) => b.y + b.h));
  const [sx, sy] = sceneToCanvas([minX, minY], v);
  const box = { x: sx - 4, y: sy - 4, w: (maxX - minX) * v.zoom + 8, h: (maxY - minY) * v.zoom + 8 };
  strokeScreenRect(ctx, box, palette.selection);
  ctx.fillStyle = palette.surface;
  ctx.strokeStyle = palette.selection;
  ctx.lineWidth = 1.5;
  for (const { point } of handlePositions({ x: minX, y: minY, w: maxX - minX, h: maxY - minY }, 0)) {
    const [hx, hy] = sceneToCanvas(point, v);
    ctx.beginPath();
    ctx.rect(hx - HANDLE / 2, hy - HANDLE / 2, HANDLE, HANDLE);
    ctx.fill();
    ctx.stroke();
  }
}

function drawLockBadges(ctx: CanvasRenderingContext2D, scene: RenderScene): void {
  const { palette, viewport: v } = scene;
  for (const el of scene.elements) {
    if (!el.locked || !scene.selectedIds.has(el.id)) continue;
    const b = rotatedBounds(el);
    const [x, y] = sceneToCanvas([b.x, b.y], v);
    strokeScreenRect(ctx, { x: x - 2, y: y - 2, w: b.w * v.zoom + 4, h: b.h * v.zoom + 4 }, palette.textDim, [2, 3]);
  }
}

/* ---------------------------------------------------------- scene */

export function renderScene(ctx: CanvasRenderingContext2D, scene: RenderScene): void {
  const { viewport: v, palette } = scene;
  const measure = measureWith(ctx);
  ctx.save();
  drawBackground(ctx, scene);

  const view = expandBounds(visibleBounds(v, scene.width, scene.height), 64 / v.zoom);
  ctx.save();
  ctx.translate(-v.scrollX * v.zoom, -v.scrollY * v.zoom);
  ctx.scale(v.zoom, v.zoom);
  const frames: SketchElement[] = [];
  const rest: SketchElement[] = [];
  for (const el of scene.elements) {
    if (el.id === scene.editingId) continue;
    const b = rotatedBounds(el);
    const padded = el.type === 'frame' ? expandBounds(b, 40) : expandBounds(b, el.strokeWidth + 4);
    if (!boundsIntersect(padded, view)) continue;
    (el.type === 'frame' ? frames : rest).push(el);
  }
  for (const el of frames) drawElement(ctx, el, palette, measure);
  for (const el of rest) drawElement(ctx, el, palette, measure);

  if (scene.bindHighlightId) {
    const target = scene.elements.find((el) => el.id === scene.bindHighlightId);
    if (target) {
      ctx.save();
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 2 / v.zoom;
      ctx.setLineDash([6 / v.zoom, 4 / v.zoom]);
      const b = expandBounds(rotatedBounds(target), 6 / v.zoom);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.restore();
    }
  }
  ctx.restore();

  if (scene.chrome !== false) {
    for (const line of scene.snapLines ?? []) {
      ctx.save();
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      if (line.x !== undefined) {
        const [x, y1] = sceneToCanvas([line.x, line.from], v);
        const [, y2] = sceneToCanvas([line.x, line.to], v);
        ctx.moveTo(Math.round(x) + 0.5, y1);
        ctx.lineTo(Math.round(x) + 0.5, y2);
      } else if (line.y !== undefined) {
        const [x1, y] = sceneToCanvas([line.from, line.y], v);
        const [x2] = sceneToCanvas([line.to, line.y], v);
        ctx.moveTo(x1, Math.round(y) + 0.5);
        ctx.lineTo(x2, Math.round(y) + 0.5);
      }
      ctx.stroke();
      ctx.restore();
    }
    drawSelectionChrome(ctx, scene);
    drawLockBadges(ctx, scene);
    if (scene.marquee) {
      const b = normalizeBounds(scene.marquee);
      const [x, y] = sceneToCanvas([b.x, b.y], v);
      const screen = { x, y, w: b.w * v.zoom, h: b.h * v.zoom };
      ctx.fillStyle = palette.accentSoft;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(screen.x, screen.y, screen.w, screen.h);
      ctx.globalAlpha = 1;
      strokeScreenRect(ctx, screen, palette.selection);
    }
  }
  ctx.restore();
}

/** Draws the elements alone, framed on `bounds` - what PNG export uses. */
export function renderExport(
  ctx: CanvasRenderingContext2D,
  elements: SketchElement[],
  bounds: Bounds,
  palette: Palette,
  scale: number,
  background: string | null
): void {
  ctx.save();
  ctx.scale(scale, scale);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, bounds.w, bounds.h);
  }
  ctx.translate(-bounds.x, -bounds.y);
  const measure = measureWith(ctx);
  const frames = elements.filter((el) => el.type === 'frame');
  const rest = elements.filter((el) => el.type !== 'frame');
  for (const el of [...frames, ...rest]) drawElement(ctx, el, palette, measure);
  ctx.restore();
}

export type { SnapLine };

export const pathDataFor = (el: SketchElement): string => commandsToPathData(linearCommands(el));
export type { Point };
