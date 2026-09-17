// Raster and file output. PNG is drawn by the same renderer the screen
// uses (renderExport), at whatever scale is asked for, so what is
// exported is what was on the board - not a second implementation that
// drifts from it.

import { type Bounds, type SketchElement } from '../lib/types';
import { type Palette } from '../lib/palette';
import { renderExport } from './render';

export interface RasterOptions {
  scale?: number;
  background?: string | null;
  palette: Palette;
}

export async function renderPngBlob(elements: SketchElement[], bounds: Bounds, opts: RasterOptions): Promise<Blob> {
  const scale = opts.scale ?? 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bounds.w * scale));
  canvas.height = Math.max(1, Math.round(bounds.h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser would not give Sketch a 2D canvas to draw the export on.');
  renderExport(ctx, elements, bounds, opts.palette, scale, opts.background ?? null);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The PNG could not be encoded.');
  return blob;
}

export const svgBlob = (svg: string): Blob => new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** True when the clipboard actually took it. Browsers differ wildly here
 *  (Firefox has no image support at the time of writing), so every caller
 *  has to be ready for a no. */
export async function copyBlobToClipboard(blob: Blob): Promise<boolean> {
  try {
    const anyWindow = window as unknown as { ClipboardItem?: new (items: Record<string, Blob>) => unknown };
    if (!navigator.clipboard || !anyWindow.ClipboardItem) return false;
    const item = new anyWindow.ClipboardItem({ [blob.type]: blob });
    await (navigator.clipboard as unknown as { write(items: unknown[]): Promise<void> }).write([item]);
    return true;
  } catch {
    return false;
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const blobToBytes = async (blob: Blob): Promise<Uint8Array> => new Uint8Array(await blob.arrayBuffer());
