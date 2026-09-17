// A single mutable handle onto the live canvas: its size in CSS pixels
// and the scene point at its centre. The zoom controls, the shape
// library and the agent tools all need those two facts and none of them
// should re-render when the window is resized, so they live in a ref
// rather than in the store.

import { type Point } from '../lib/types';

export interface ViewHandle {
  toScene(clientX: number, clientY: number): Point;
  size(): { width: number; height: number };
  centerScene(): Point;
  measure: ((text: string, fontSize: number, family: 'sans' | 'serif' | 'mono') => number) | null;
}

export const viewRef: { current: ViewHandle | null } = { current: null };

export const canvasSize = (): { width: number; height: number } => viewRef.current?.size() ?? { width: 1000, height: 700 };

export const sceneCenter = (): Point => viewRef.current?.centerScene() ?? [0, 0];
