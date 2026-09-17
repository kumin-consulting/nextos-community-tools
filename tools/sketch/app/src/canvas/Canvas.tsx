// The board itself: one <canvas>, one pointer state machine, and a
// textarea that appears over an element while you type into it.
//
// The canvas never re-renders through React. It subscribes to the store
// once, marks itself dirty and repaints inside a requestAnimationFrame -
// so dragging 2,000 elements costs one redraw per frame and zero React
// work. Only the text overlay is React state, because it is the one
// thing that has to be a real DOM node (selection, IME, spellcheck).

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type Bounds, type Point, type SketchElement, isContainer, isLinear } from '../lib/types';
import { type ResizeHandle } from '../lib/geometry';
import {
  boundsOfElements,
  canvasToScene,
  clamp,
  elementsInBounds,
  handlePositions,
  hitTestElements,
  linearPathPoints,
  normalizeBounds,
  normalizeLinear,
  resizeElement,
  rotateAbout,
  rotateElementTo,
  rotateHandlePosition,
  rotatedBounds,
  sceneToCanvas,
  simplifyPoints,
  transformElement,
  zoomAt,
} from '../lib/geometry';
import { type SnapLine, snapDrag } from '../lib/snap';
import { bindableAt, makeBinding } from '../lib/binding';
import { elementTextLayout, requiredHeight } from '../lib/textLayout';
import { elementsInFrame } from '../lib/align';
import { FONT_STACKS } from '../lib/types';
import { type RenderScene, GRID_SIZE, measureWith, renderScene } from './render';
import { type Tool, elementFromStyle, useSketch } from '../state/store';

const DEFAULT_SIZE: Record<string, [number, number]> = {
  rect: [180, 110],
  ellipse: [170, 120],
  diamond: [180, 120],
  sticky: [180, 180],
  frame: [520, 360],
  text: [0, 24],
};

type Gesture =
  | { kind: 'none' }
  | { kind: 'pan'; start: Point; scroll: Point }
  | { kind: 'marquee'; origin: Point; additive: boolean; base: string[] }
  | { kind: 'move'; origin: Point; ids: string[]; before: SketchElement[]; moved: boolean }
  | { kind: 'resize'; handle: ResizeHandle; ids: string[]; before: SketchElement[]; box: Bounds }
  | { kind: 'rotate'; ids: string[]; before: SketchElement[]; center: Point }
  | { kind: 'create'; id: string; origin: Point; type: string }
  | { kind: 'draw'; id: string; points: Point[]; origin: Point }
  | { kind: 'linear'; id: string; origin: Point }
  | { kind: 'vertex'; id: string; index: number }
  | { kind: 'erase'; erased: Set<string> };

export interface CanvasHandle {
  toScene(clientX: number, clientY: number): Point;
  size(): { width: number; height: number };
  centerScene(): Point;
  measure: ReturnType<typeof measureWith> | null;
}

export interface CanvasProps {
  onReady?(handle: CanvasHandle): void;
}

export const Canvas: React.FC<CanvasProps> = ({ onReady }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const measureRef = useRef<ReturnType<typeof measureWith> | null>(null);
  const sizeRef = useRef({ width: 800, height: 600 });
  const dirtyRef = useRef(true);
  const gestureRef = useRef<Gesture>({ kind: 'none' });
  const spaceRef = useRef(false);
  const snapRef = useRef<SnapLine[]>([]);
  const hoverBindRef = useRef<string | null>(null);
  const marqueeRef = useRef<Bounds | null>(null);
  const [cursor, setCursor] = useState('default');
  const [editing, setEditing] = useState<{ id: string; value: string; created: boolean } | null>(null);
  const editRef = useRef<HTMLTextAreaElement | null>(null);

  const toScene = useCallback((clientX: number, clientY: number): Point => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const v = useSketch.getState().viewport;
    return canvasToScene([clientX - (rect?.left ?? 0), clientY - (rect?.top ?? 0)], v);
  }, []);

  /* ------------------------------------------------------- painting */

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctxRef.current = ctx;
    measureRef.current = measureWith(ctx);

    const resize = (): void => {
      const rect = host.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      sizeRef.current = { width, height };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirtyRef.current = true;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let frame = 0;
    const loop = (): void => {
      frame = requestAnimationFrame(loop);
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      const s = useSketch.getState();
      const scene: RenderScene = {
        elements: s.elements,
        viewport: s.viewport,
        width: sizeRef.current.width,
        height: sizeRef.current.height,
        palette: s.palette,
        background: s.background,
        selectedIds: new Set(s.selectedIds),
        editingId: s.editingId,
        marquee: marqueeRef.current,
        snapLines: snapRef.current,
        bindHighlightId: hoverBindRef.current,
      };
      renderScene(ctx, scene);
    };
    frame = requestAnimationFrame(loop);
    const unsubscribe = useSketch.subscribe(() => {
      dirtyRef.current = true;
    });
    onReady?.({
      toScene,
      size: () => sizeRef.current,
      centerScene: () => {
        const v = useSketch.getState().viewport;
        return canvasToScene([sizeRef.current.width / 2, sizeRef.current.height / 2], v);
      },
      measure: measureRef.current,
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      unsubscribe();
    };
  }, [onReady, toScene]);

  /* ---------------------------------------------------------- wheel */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const state = useSketch.getState();
      const rect = canvas.getBoundingClientRect();
      const at: Point = [e.clientX - rect.left, e.clientY - rect.top];
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01);
        state.setViewport(zoomAt(state.viewport, state.viewport.zoom * factor, at) as typeof state.viewport);
        return;
      }
      const { zoom, scrollX, scrollY } = state.viewport;
      state.setViewport({ zoom, scrollX: scrollX + e.deltaX / zoom, scrollY: scrollY + e.deltaY / zoom });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  /* ------------------------------------------------- space to pan */

  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && !isTypingTarget(e.target)) {
        spaceRef.current = true;
        setCursor('grab');
      }
    };
    const up = (e: KeyboardEvent): void => {
      if (e.code === 'Space') {
        spaceRef.current = false;
        setCursor('default');
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  /* --------------------------------------------------- text editing */

  const startEditing = useCallback((el: SketchElement, created = false) => {
    useSketch.getState().setEditing(el.id);
    setEditing({ id: el.id, value: el.type === 'frame' ? el.name : el.text, created });
  }, []);

  const finishEditing = useCallback(() => {
    const current = editing;
    if (!current) return;
    const state = useSketch.getState();
    const el = state.elements.find((e) => e.id === current.id);
    setEditing(null);
    state.setEditing(null);
    if (!el) return;
    const value = current.value;
    const isFrame = el.type === 'frame';
    if (current.created && !value.trim() && el.type === 'text') {
      // A text element nobody typed into never existed.
      state.commit(state.elements.filter((e) => e.id !== el.id), { label: 'Delete', selectedIds: [] });
      return;
    }
    const measure = measureRef.current;
    let next: SketchElement = isFrame ? { ...el, name: value } : { ...el, text: value };
    if (!isFrame && measure) next = fitToText(next, measure);
    state.commit(
      state.elements.map((e) => (e.id === el.id ? next : e)),
      { label: 'Text' }
    );
  }, [editing]);

  useLayoutEffect(() => {
    if (editing && editRef.current) {
      const node = editRef.current;
      node.focus();
      node.setSelectionRange(node.value.length, node.value.length);
    }
  }, [editing?.id]);

  // Enter (and the agent's own "edit this" path) asks the canvas to open
  // the text editor on an element it does not otherwise know about.
  const editRequest = useSketch((s) => s.editRequest);
  useEffect(() => {
    if (!editRequest) return;
    const el = useSketch.getState().elements.find((item) => item.id === editRequest);
    if (el && !el.locked) startEditing(el);
    else useSketch.getState().requestEdit(null);
  }, [editRequest, startEditing]);

  /* -------------------------------------------------------- pointer */

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (editing) finishEditing();
      canvas.setPointerCapture(e.pointerId);
      const state = useSketch.getState();
      const scene = toScene(e.clientX, e.clientY);
      const panning = spaceRef.current || state.tool === 'hand' || e.button === 1 || e.button === 2;
      if (panning) {
        gestureRef.current = { kind: 'pan', start: [e.clientX, e.clientY], scroll: [state.viewport.scrollX, state.viewport.scrollY] };
        setCursor('grabbing');
        return;
      }
      if (e.button !== 0) return;

      if (state.tool === 'eraser') {
        gestureRef.current = { kind: 'erase', erased: new Set() };
        eraseAt(scene);
        return;
      }

      if (state.tool === 'select') {
        const handled = beginSelectGesture(scene, e.shiftKey, e.altKey);
        if (handled) return;
      }

      if (state.tool === 'text') {
        const el = elementFromStyle('text', { x: scene[0], y: scene[1], w: 0, h: state.style.fontSize * 1.25 }, state.style);
        state.addElements([el], { label: 'Text' });
        startEditing(el, true);
        gestureRef.current = { kind: 'none' };
        if (!state.keepTool) state.setTool('select');
        return;
      }

      if (state.tool === 'draw') {
        const el = elementFromStyle(
          'draw',
          {
            x: scene[0],
            y: scene[1],
            points: [
              [0, 0],
              [0, 0],
            ],
            fill: 'transparent',
            fillStyle: 'none',
            startArrow: 'none',
            endArrow: 'none',
          },
          state.style
        );
        state.addElements([el], { label: 'Draw' });
        gestureRef.current = { kind: 'draw', id: el.id, points: [[0, 0]], origin: scene };
        return;
      }

      if (state.tool === 'line' || state.tool === 'arrow') {
        const start = bindableAt(state.elements, scene);
        const el = elementFromStyle(
          state.tool,
          {
            x: scene[0],
            y: scene[1],
            points: [
              [0, 0],
              [0, 0],
            ],
            startBinding: start ? makeBinding(start, scene) : null,
          },
          state.style
        );
        state.addElements([el], { label: state.tool === 'arrow' ? 'Arrow' : 'Line' });
        gestureRef.current = { kind: 'linear', id: el.id, origin: scene };
        return;
      }

      const type = state.tool as 'rect' | 'ellipse' | 'diamond' | 'sticky' | 'frame';
      if (DEFAULT_SIZE[type]) {
        const el = elementFromStyle(
          type,
          {
            x: scene[0],
            y: scene[1],
            w: 0,
            h: 0,
            ...(type === 'sticky' ? { fill: state.palette.stickyFill, textColor: state.palette.stickyText } : {}),
            ...(type === 'frame' ? { name: `Frame ${state.elements.filter((el2) => el2.type === 'frame').length + 1}` } : {}),
          },
          state.style
        );
        state.addElements([el], { label: 'Draw' });
        gestureRef.current = { kind: 'create', id: el.id, origin: scene, type };
      }
    },
    [editing, finishEditing, startEditing, toScene]
  );

  const beginSelectGesture = useCallback(
    (scene: Point, shift: boolean, alt: boolean): boolean => {
      const state = useSketch.getState();
      const tolerance = 8 / state.viewport.zoom;
      const selected = state.elements.filter((el) => state.selectedIds.includes(el.id));
      const unlocked = selected.filter((el) => !el.locked);

      if (unlocked.length) {
        const box = unlocked.length === 1 ? { x: unlocked[0].x, y: unlocked[0].y, w: unlocked[0].w, h: unlocked[0].h } : boundsOfElements(unlocked);
        const angle = unlocked.length === 1 ? unlocked[0].angle : 0;
        const grab = 10 / state.viewport.zoom;
        if (unlocked.length === 1 && isLinear(unlocked[0])) {
          const pts = linearPathPoints(unlocked[0]);
          for (let i = 0; i < unlocked[0].points.length; i++) {
            const p = pts[Math.min(i, pts.length - 1)];
            if (Math.hypot(p[0] - scene[0], p[1] - scene[1]) <= grab) {
              gestureRef.current = { kind: 'vertex', id: unlocked[0].id, index: i };
              return true;
            }
          }
        } else {
          const rotateAt = rotateHandlePosition(box, angle, 28 / state.viewport.zoom);
          if (Math.hypot(rotateAt[0] - scene[0], rotateAt[1] - scene[1]) <= grab) {
            gestureRef.current = {
              kind: 'rotate',
              ids: unlocked.map((el) => el.id),
              before: unlocked,
              center: [box.x + box.w / 2, box.y + box.h / 2],
            };
            return true;
          }
          for (const { handle, point } of handlePositions(box, angle)) {
            if (Math.hypot(point[0] - scene[0], point[1] - scene[1]) <= grab) {
              gestureRef.current = { kind: 'resize', handle, ids: unlocked.map((el) => el.id), before: unlocked, box };
              return true;
            }
          }
        }
      }

      const hit = hitTestElements(state.elements, scene, tolerance);
      if (!hit) {
        marqueeRef.current = { x: scene[0], y: scene[1], w: 0, h: 0 };
        gestureRef.current = { kind: 'marquee', origin: scene, additive: shift, base: shift ? state.selectedIds : [] };
        if (!shift) state.setSelection([]);
        return true;
      }
      let ids = state.selectedIds;
      if (shift) {
        ids = state.selectedIds.includes(hit.id) ? state.selectedIds.filter((id) => id !== hit.id) : [...state.selectedIds, hit.id];
        state.setSelection(ids);
      } else if (!state.selectedIds.includes(hit.id)) {
        ids = [hit.id];
        state.setSelection(ids);
      }
      const current = useSketch.getState();
      let moving = current.elements.filter((el) => current.selectedIds.includes(el.id) && !el.locked);
      if (alt && moving.length) {
        current.duplicateSelected();
        const after = useSketch.getState();
        moving = after.elements.filter((el) => after.selectedIds.includes(el.id));
      }
      if (!moving.length) return true;
      // A frame carries whatever sits inside it, decided once here rather
      // than recomputed every frame (otherwise a shape dragged past the
      // frame's edge would join the drag half way through it).
      const movingIds = new Set(moving.map((el) => el.id));
      for (const el of moving) {
        if (el.type !== 'frame') continue;
        for (const child of elementsInFrame(current.elements, el)) if (!child.locked) movingIds.add(child.id);
      }
      const before = current.elements.filter((el) => movingIds.has(el.id));
      gestureRef.current = { kind: 'move', origin: scene, ids: Array.from(movingIds), before, moved: false };
      return true;
    },
    []
  );

  const eraseAt = useCallback((scene: Point) => {
    const state = useSketch.getState();
    const gesture = gestureRef.current;
    if (gesture.kind !== 'erase') return;
    const tolerance = 10 / state.viewport.zoom;
    const hit = hitTestElements(state.elements, scene, tolerance);
    if (!hit || gesture.erased.has(hit.id)) return;
    gesture.erased.add(hit.id);
    state.commit(
      state.elements.filter((el) => el.id !== hit.id),
      { label: 'Erase', coalesce: 'erase' }
    );
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const gesture = gestureRef.current;
      const state = useSketch.getState();
      const scene = toScene(e.clientX, e.clientY);
      if (gesture.kind === 'none') {
        if (state.tool === 'select' && !spaceRef.current) {
          const hit = hitTestElements(state.elements, scene, 8 / state.viewport.zoom);
          setCursor(hit ? 'move' : 'default');
        }
        return;
      }
      switch (gesture.kind) {
        case 'pan': {
          const zoom = state.viewport.zoom;
          state.setViewport({
            zoom,
            scrollX: gesture.scroll[0] - (e.clientX - gesture.start[0]) / zoom,
            scrollY: gesture.scroll[1] - (e.clientY - gesture.start[1]) / zoom,
          });
          break;
        }
        case 'marquee': {
          const box = { x: gesture.origin[0], y: gesture.origin[1], w: scene[0] - gesture.origin[0], h: scene[1] - gesture.origin[1] };
          marqueeRef.current = box;
          const inside = elementsInBounds(state.elements, box).map((el) => el.id);
          state.setSelection(gesture.additive ? Array.from(new Set([...gesture.base, ...inside])) : inside);
          break;
        }
        case 'move': {
          let dx = scene[0] - gesture.origin[0];
          let dy = scene[1] - gesture.origin[1];
          if (e.shiftKey) {
            if (Math.abs(dx) > Math.abs(dy)) dy = 0;
            else dx = 0;
          }
          const ids = new Set(gesture.ids);
          const box = boundsOfElements(gesture.before);
          let snapLines: SnapLine[] = [];
          if (state.snapEnabled) {
            const others = state.elements.filter((el) => !ids.has(el.id) && el.type !== 'frame').map(rotatedBounds);
            const snap = snapDrag({ ...box, x: box.x + dx, y: box.y + dy }, others, {
              grid: GRID_SIZE / 2,
              threshold: 6 / state.viewport.zoom,
            });
            dx += snap.dx;
            dy += snap.dy;
            snapLines = snap.lines;
          }
          snapRef.current = snapLines;
          const beforeById = new Map(gesture.before.map((el) => [el.id, el]));
          state.commit(
            state.elements.map((el) => {
              const base = beforeById.get(el.id);
              return base ? { ...base, x: base.x + dx, y: base.y + dy } : el;
            }),
            { label: 'Move', coalesce: 'move' }
          );
          gestureRef.current = { ...gesture, moved: true };
          break;
        }
        case 'resize': {
          const beforeById = new Map(gesture.before.map((el) => [el.id, el]));
          const measure = measureRef.current;
          if (gesture.before.length === 1) {
            const el = gesture.before[0];
            let next = resizeElement(el, gesture.handle, scene, e.shiftKey);
            if (el.type === 'text' && measure) next = scaleText(el, next, measure);
            else if (isContainer(next) && measure) next = { ...next, h: Math.max(next.h, requiredHeight(next, measure)) };
            state.commit(
              state.elements.map((item) => (item.id === el.id ? next : item)),
              { label: 'Resize', coalesce: 'resize' }
            );
          } else {
            const to = resizeBox(gesture.box, gesture.handle, scene, e.shiftKey);
            state.commit(
              state.elements.map((item) => {
                const base = beforeById.get(item.id);
                return base ? transformElement(base, gesture.box, to) : item;
              }),
              { label: 'Resize', coalesce: 'resize' }
            );
          }
          break;
        }
        case 'rotate': {
          if (gesture.before.length === 1) {
            const next = rotateElementTo(gesture.before[0], scene, e.shiftKey);
            state.commit(
              state.elements.map((item) => (item.id === next.id ? next : item)),
              { label: 'Rotate', coalesce: 'rotate' }
            );
          } else {
            const [cx, cy] = gesture.center;
            const start = gesture.before[0];
            const angle = Math.atan2(scene[1] - cy, scene[0] - cx) + Math.PI / 2;
            const delta = e.shiftKey ? Math.round(angle / (Math.PI / 12)) * (Math.PI / 12) - start.angle : angle - start.angle;
            const beforeById = new Map(gesture.before.map((el) => [el.id, el]));
            state.commit(
              state.elements.map((item) => {
                const base = beforeById.get(item.id);
                return base ? rotateAbout(base, cx, cy, delta) : item;
              }),
              { label: 'Rotate', coalesce: 'rotate' }
            );
          }
          break;
        }
        case 'create': {
          const box = normalizeBounds({
            x: gesture.origin[0],
            y: gesture.origin[1],
            w: scene[0] - gesture.origin[0],
            h: scene[1] - gesture.origin[1],
          });
          let { w, h } = box;
          if (e.shiftKey) {
            const side = Math.max(w, h);
            w = side;
            h = side;
          }
          const x = scene[0] < gesture.origin[0] ? gesture.origin[0] - w : box.x;
          const y = scene[1] < gesture.origin[1] ? gesture.origin[1] - h : box.y;
          const step = state.snapEnabled ? GRID_SIZE / 2 : 0;
          const grid = (n: number): number => (step ? Math.round(n / step) * step : n);
          state.commit(
            state.elements.map((el) =>
              el.id === gesture.id ? { ...el, x: grid(x), y: grid(y), w: Math.max(grid(w), 1), h: Math.max(grid(h), 1) } : el
            ),
            { label: 'Draw', coalesce: 'create' }
          );
          break;
        }
        case 'draw': {
          const local: Point = [scene[0] - gesture.origin[0], scene[1] - gesture.origin[1]];
          const points = [...gesture.points, local];
          gestureRef.current = { ...gesture, points };
          state.commit(
            state.elements.map((el) => (el.id === gesture.id ? normalizeLinear({ ...el, x: gesture.origin[0], y: gesture.origin[1], points }) : el)),
            { label: 'Draw', coalesce: 'draw' }
          );
          break;
        }
        case 'linear': {
          let end: Point = [scene[0] - gesture.origin[0], scene[1] - gesture.origin[1]];
          if (e.shiftKey) {
            const angle = Math.atan2(end[1], end[0]);
            const step = Math.PI / 4;
            const snappedAngle = Math.round(angle / step) * step;
            const length = Math.hypot(end[0], end[1]);
            end = [Math.cos(snappedAngle) * length, Math.sin(snappedAngle) * length];
          }
          const target = bindableAt(state.elements, scene, 18 / state.viewport.zoom, gesture.id);
          hoverBindRef.current = target?.id ?? null;
          state.commit(
            state.elements.map((el) =>
              el.id === gesture.id ? normalizeLinear({ ...el, x: gesture.origin[0], y: gesture.origin[1], points: [[0, 0], end] }) : el
            ),
            { label: 'Draw', coalesce: 'linear' }
          );
          break;
        }
        case 'vertex': {
          const el = state.elements.find((item) => item.id === gesture.id);
          if (!el) break;
          const points = el.points.map((p, i) => (i === gesture.index ? ([scene[0] - el.x, scene[1] - el.y] as Point) : p));
          const target = bindableAt(state.elements, scene, 18 / state.viewport.zoom, el.id);
          hoverBindRef.current = target?.id ?? null;
          const bindingKey = gesture.index === 0 ? 'startBinding' : gesture.index === el.points.length - 1 ? 'endBinding' : null;
          const next = normalizeLinear({
            ...el,
            points,
            ...(bindingKey ? { [bindingKey]: target ? makeBinding(target, scene) : null } : {}),
          });
          state.commit(
            state.elements.map((item) => (item.id === el.id ? next : item)),
            { label: 'Edit line', coalesce: 'vertex' }
          );
          break;
        }
        case 'erase': {
          eraseAt(scene);
          break;
        }
        default:
          break;
      }
    },
    [eraseAt, toScene]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const gesture = gestureRef.current;
      const state = useSketch.getState();
      const scene = toScene(e.clientX, e.clientY);
      gestureRef.current = { kind: 'none' };
      marqueeRef.current = null;
      snapRef.current = [];
      hoverBindRef.current = null;
      canvasRef.current?.releasePointerCapture?.(e.pointerId);
      setCursor(spaceRef.current ? 'grab' : 'default');

      if (gesture.kind === 'create') {
        const el = state.elements.find((item) => item.id === gesture.id);
        if (el && (el.w < 6 || el.h < 6)) {
          const [w, h] = DEFAULT_SIZE[gesture.type] ?? [160, 100];
          state.commit(
            state.elements.map((item) => (item.id === el.id ? { ...item, x: gesture.origin[0] - w / 2, y: gesture.origin[1] - h / 2, w, h } : item)),
            { label: 'Draw', coalesce: 'create' }
          );
        }
        const created = useSketch.getState().elements.find((item) => item.id === gesture.id);
        if (created && created.type !== 'frame' && isContainer(created)) {
          // A shape drawn with the sticky tool is ready for its note.
          if (created.type === 'sticky') startEditing(created, true);
        }
      }

      if (gesture.kind === 'linear') {
        const el = state.elements.find((item) => item.id === gesture.id);
        if (el) {
          const pts = linearPathPoints(el);
          const tip = pts[pts.length - 1];
          const length = Math.hypot(tip[0] - pts[0][0], tip[1] - pts[0][1]);
          if (length < 6) {
            state.commit(state.elements.filter((item) => item.id !== el.id), { label: 'Draw', selectedIds: [] });
          } else {
            const target = bindableAt(state.elements, scene, 18 / state.viewport.zoom, el.id);
            if (target) {
              state.commit(
                state.elements.map((item) => (item.id === el.id ? { ...item, endBinding: makeBinding(target, tip) } : item)),
                { label: 'Bind' }
              );
            }
          }
        }
      }

      if (gesture.kind === 'draw') {
        const el = useSketch.getState().elements.find((item) => item.id === gesture.id);
        if (el) {
          const simplified = simplifyPoints(el.points, 0.7 / state.viewport.zoom);
          if (simplified.length < 2) {
            state.commit(state.elements.filter((item) => item.id !== el.id), { label: 'Draw', selectedIds: [] });
          } else {
            state.commit(
              state.elements.map((item) => (item.id === el.id ? normalizeLinear({ ...item, points: simplified }) : item)),
              { label: 'Draw' }
            );
          }
        }
      }

      const finished = useSketch.getState();
      finished.seal();
      if (!finished.keepTool && finished.tool !== 'select' && finished.tool !== 'hand' && finished.tool !== 'eraser') {
        finished.setTool('select');
      }
    },
    [startEditing, toScene]
  );

  const onDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const state = useSketch.getState();
      const scene = toScene(e.clientX, e.clientY);
      const hit = hitTestElements(state.elements, scene, 8 / state.viewport.zoom);
      if (hit && !hit.locked) {
        startEditing(hit);
        state.setSelection([hit.id]);
        return;
      }
      const el = elementFromStyle('text', { x: scene[0], y: scene[1], w: 0, h: state.style.fontSize * 1.25 }, state.style);
      state.addElements([el], { label: 'Text' });
      startEditing(el, true);
    },
    [startEditing, toScene]
  );

  /* ------------------------------------------------ text overlay */

  const overlay = useOverlayStyle(editing?.id ?? null);

  return (
    <div className="sk-canvas-host" ref={hostRef}>
      <canvas
        ref={canvasRef}
        className="sk-canvas"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
        role="application"
        aria-label="Drawing canvas"
      />
      {editing && overlay ? (
        <textarea
          ref={editRef}
          className="sk-text-editor"
          value={editing.value}
          aria-label="Element text"
          spellCheck={false}
          style={overlay}
          onChange={(e) => {
            const value = e.target.value;
            setEditing((cur) => (cur ? { ...cur, value } : cur));
            const state = useSketch.getState();
            const measure = measureRef.current;
            state.commit(
              state.elements.map((el) => {
                if (el.id !== editing.id) return el;
                const next = el.type === 'frame' ? { ...el, name: value } : { ...el, text: value };
                return measure && el.type !== 'frame' ? fitToText(next, measure) : next;
              }),
              { label: 'Text', coalesce: `text:${editing.id}` }
            );
          }}
          onBlur={finishEditing}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              finishEditing();
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              finishEditing();
            }
            e.stopPropagation();
          }}
        />
      ) : null}
    </div>
  );
};

/* ----------------------------------------------------------- helpers */

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true;
}

/** Grows a shape (or a text element) to hold the text it now contains. */
export function fitToText(el: SketchElement, measure: ReturnType<typeof measureWith>): SketchElement {
  if (isLinear(el) || el.type === 'frame') return el;
  const layout = elementTextLayout(el, measure);
  if (!layout) return el;
  if (el.type === 'text') {
    let width = 0;
    for (const line of layout.lines) width = Math.max(width, measure(line, el.fontSize, el.fontFamily));
    return { ...el, w: Math.max(width, 8), h: layout.height };
  }
  const needed = requiredHeight(el, measure);
  return needed > el.h ? { ...el, h: needed } : el;
}

/** Resizing a text element scales the type rather than re-wrapping it -
 *  what a person means when they drag the corner of a word. */
function scaleText(before: SketchElement, after: SketchElement, measure: ReturnType<typeof measureWith>): SketchElement {
  const scale = before.h === 0 ? 1 : Math.abs(after.h / before.h);
  const fontSize = clamp(Math.round(before.fontSize * scale), 6, 240);
  return fitToText({ ...after, fontSize, x: after.x, y: after.y }, measure);
}

function resizeBox(box: Bounds, handle: ResizeHandle, pointer: Point, keepAspect: boolean): Bounds {
  let { x, y, w, h } = box;
  let x1 = x + w;
  let y1 = y + h;
  if (handle.includes('w')) x = pointer[0];
  if (handle.includes('e')) x1 = pointer[0];
  if (handle.includes('n')) y = pointer[1];
  if (handle.includes('s')) y1 = pointer[1];
  let nw = x1 - x;
  let nh = y1 - y;
  if (keepAspect && box.w && box.h && handle.length === 2) {
    const ratio = box.h / box.w;
    const mag = Math.max(Math.abs(nw), Math.abs(nh) / ratio);
    const signW = nw < 0 ? -1 : 1;
    const signH = nh < 0 ? -1 : 1;
    nw = mag * signW;
    nh = mag * ratio * signH;
    if (handle.includes('w')) x = x1 - nw;
    if (handle.includes('n')) y = y1 - nh;
  }
  return { x, y, w: nw || 1, h: nh || 1 };
}

/** Positions the textarea exactly over the text it is editing. */
function useOverlayStyle(id: string | null): React.CSSProperties | null {
  const element = useSketch((s) => (id ? s.elements.find((el) => el.id === id) ?? null : null));
  const viewport = useSketch((s) => s.viewport);
  const palette = useSketch((s) => s.palette);
  return useMemo(() => {
    if (!element) return null;
    const zoom = viewport.zoom;
    const isFrame = element.type === 'frame';
    const box: Bounds = isFrame
      ? { x: element.x, y: element.y - 28, w: Math.max(120, element.w), h: 24 }
      : element.type === 'text'
        ? { x: element.x, y: element.y, w: Math.max(element.w, 40), h: Math.max(element.h, element.fontSize * 1.3) }
        : isLinear(element)
          ? { x: element.x + element.w / 2 - 80, y: element.y + element.h / 2 - 16, w: 160, h: 32 }
          : { x: element.x + 8, y: element.y + 6, w: Math.max(24, element.w - 16), h: Math.max(24, element.h - 12) };
    const [left, top] = sceneToCanvas([box.x, box.y], viewport);
    const align = isFrame || element.type === 'text' ? element.textAlign : 'center';
    return {
      left,
      top,
      width: box.w * zoom,
      height: box.h * zoom,
      fontSize: element.fontSize * zoom,
      lineHeight: `${Math.round(element.fontSize * 1.25) * zoom}px`,
      fontFamily: FONT_STACKS[element.fontFamily],
      color: isFrame ? palette.textDim : element.textColor,
      textAlign: align,
      transform: element.angle ? `rotate(${element.angle}rad)` : undefined,
      transformOrigin: 'center',
      display: isLinear(element) || isContainer(element) ? 'flex' : 'block',
    } as React.CSSProperties;
  }, [element, palette, viewport]);
}

export type { Tool };
