// A small map of the whole board with the current view drawn on it.
// Click or drag it to go somewhere. It redraws only when something
// actually changed, and it draws elements as plain boxes - at this size
// a faithful render would be mud.

import React, { useCallback, useEffect, useRef } from 'react';
import { boundsOfElements, expandBounds, rotatedBounds } from '../lib/geometry';
import { isLinear } from '../lib/types';
import { useSketch } from '../state/store';
import { canvasSize } from '../state/view';

const WIDTH = 188;
const HEIGHT = 124;

export const Minimap: React.FC = () => {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const dragging = useRef(false);

  const draw = useCallback(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { elements, viewport, palette } = useSketch.getState();
    const view = canvasSize();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    const viewBounds = { x: viewport.scrollX, y: viewport.scrollY, w: view.width / viewport.zoom, h: view.height / viewport.zoom };
    const content = elements.length ? boundsOfElements(elements) : viewBounds;
    const world = expandBounds(
      {
        x: Math.min(content.x, viewBounds.x),
        y: Math.min(content.y, viewBounds.y),
        w: Math.max(content.x + content.w, viewBounds.x + viewBounds.w) - Math.min(content.x, viewBounds.x),
        h: Math.max(content.y + content.h, viewBounds.y + viewBounds.h) - Math.min(content.y, viewBounds.y),
      },
      40
    );
    const scale = Math.min(WIDTH / Math.max(world.w, 1), HEIGHT / Math.max(world.h, 1));
    const ox = (WIDTH - world.w * scale) / 2;
    const oy = (HEIGHT - world.h * scale) / 2;
    const px = (x: number): number => ox + (x - world.x) * scale;
    const py = (y: number): number => oy + (y - world.y) * scale;

    for (const el of elements) {
      const b = rotatedBounds(el);
      ctx.fillStyle = el.type === 'frame' ? 'transparent' : el.fill !== 'transparent' && el.fillStyle !== 'none' ? el.fill : el.stroke;
      ctx.globalAlpha = isLinear(el) ? 0.75 : 0.85;
      const w = Math.max(1.5, b.w * scale);
      const h = Math.max(1.5, b.h * scale);
      if (isLinear(el)) {
        ctx.strokeStyle = el.stroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(px(b.x), py(b.y), w, h);
      } else {
        ctx.fillRect(px(b.x), py(b.y), w, h);
      }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.selection;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px(viewBounds.x) + 0.5, py(viewBounds.y) + 0.5, viewBounds.w * scale, viewBounds.h * scale);

    return { world, scale, ox, oy };
  }, []);

  useEffect(() => {
    let frame = 0;
    let dirty = true;
    const loop = (): void => {
      frame = requestAnimationFrame(loop);
      if (!dirty) return;
      dirty = false;
      draw();
    };
    frame = requestAnimationFrame(loop);
    const unsubscribe = useSketch.subscribe(() => {
      dirty = true;
    });
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [draw]);

  const goTo = useCallback((clientX: number, clientY: number) => {
    const canvas = ref.current;
    const info = draw();
    if (!canvas || !info) return;
    const rect = canvas.getBoundingClientRect();
    const x = info.world.x + (clientX - rect.left - info.ox) / info.scale;
    const y = info.world.y + (clientY - rect.top - info.oy) / info.scale;
    const state = useSketch.getState();
    const view = canvasSize();
    state.setViewport({
      zoom: state.viewport.zoom,
      scrollX: x - view.width / 2 / state.viewport.zoom,
      scrollY: y - view.height / 2 / state.viewport.zoom,
    });
  }, [draw]);

  return (
    <div className="sk-island sk-minimap">
      <canvas
        ref={ref}
        style={{ width: WIDTH, height: HEIGHT }}
        aria-label="Minimap - click to move the view"
        role="img"
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          goTo(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => dragging.current && goTo(e.clientX, e.clientY)}
        onPointerUp={(e) => {
          dragging.current = false;
          (e.target as HTMLCanvasElement).releasePointerCapture?.(e.pointerId);
        }}
      />
    </div>
  );
};
