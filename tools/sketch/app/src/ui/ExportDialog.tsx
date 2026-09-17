// Export: PNG or SVG, the whole board, the selection or one frame, with
// or without the paper colour, at 1x or 2x. A live preview shows exactly
// what will land in the file, because the preview is drawn by the same
// two functions that write it.

import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { Icon } from './icons';
import { type SketchElement } from '../lib/types';
import { boundsOfElements, expandBounds, rotatedBounds } from '../lib/geometry';
import { elementsToSvg } from '../lib/svg';
import { elementsInFrame } from '../lib/align';
import { sanitizeName } from '../lib/document';
import { copyBlobToClipboard, copyTextToClipboard, downloadBlob, renderPngBlob, svgBlob } from '../canvas/png';
import { useSketch } from '../state/store';
import { viewRef } from '../state/view';

type Scope = { kind: 'board' } | { kind: 'selection' } | { kind: 'frame'; id: string };

const PAD = 24;

export const ExportDialog: React.FC = () => {
  const elements = useSketch((s) => s.elements);
  const selectedIds = useSketch((s) => s.selectedIds);
  const palette = useSketch((s) => s.palette);
  const name = useSketch((s) => s.name);
  const store = useSketch;
  const frames = useMemo(() => elements.filter((el) => el.type === 'frame'), [elements]);

  const [scope, setScope] = useState<Scope>(selectedIds.length ? { kind: 'selection' } : { kind: 'board' });
  const [format, setFormat] = useState<'png' | 'svg'>('png');
  const [scale, setScale] = useState(2);
  const [withBackground, setWithBackground] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const chosen = useMemo((): { elements: SketchElement[]; bounds: ReturnType<typeof boundsOfElements> } => {
    if (scope.kind === 'selection') {
      const ids = new Set(selectedIds);
      const picked = elements.filter((el) => ids.has(el.id));
      return { elements: picked, bounds: expandBounds(picked.length ? boundsOfElements(picked) : { x: 0, y: 0, w: 1, h: 1 }, PAD) };
    }
    if (scope.kind === 'frame') {
      const frame = elements.find((el) => el.id === scope.id);
      if (frame) {
        const inside = elementsInFrame(elements, frame);
        return { elements: inside, bounds: rotatedBounds(frame) };
      }
    }
    const drawable = elements;
    return { elements: drawable, bounds: expandBounds(drawable.length ? boundsOfElements(drawable) : { x: 0, y: 0, w: 1, h: 1 }, PAD) };
  }, [elements, scope, selectedIds]);

  const background = withBackground ? palette.background : null;
  const fileStem = sanitizeName(name) + (scope.kind === 'frame' ? ` - ${elements.find((el) => el.id === scope.id)?.name || 'frame'}` : '');

  const svgText = useMemo(
    () =>
      elementsToSvg(chosen.elements, {
        bounds: chosen.bounds,
        background,
        title: name,
        frameStroke: palette.frameStroke,
        measure: viewRef.current?.measure ?? undefined,
      }),
    [background, chosen, name, palette.frameStroke]
  );

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    const run = async (): Promise<void> => {
      try {
        const previewScale = Math.min(1.5, 520 / Math.max(chosen.bounds.w, 1));
        const blob = await renderPngBlob(chosen.elements, chosen.bounds, { scale: previewScale, background: background ?? null, palette });
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPreview(url);
      } catch {
        setPreview(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [background, chosen, palette]);

  const close = (): void => store.getState().setDialog('export', false);

  const doDownload = async (): Promise<void> => {
    if (format === 'svg') {
      downloadBlob(svgBlob(svgText), `${fileStem}.svg`);
      return;
    }
    const blob = await renderPngBlob(chosen.elements, chosen.bounds, { scale, background, palette });
    downloadBlob(blob, `${fileStem}.png`);
  };

  const doCopy = async (): Promise<void> => {
    if (format === 'svg') {
      const ok = await copyTextToClipboard(svgText);
      setNote(ok ? 'SVG copied to the clipboard.' : 'This browser would not let Sketch write to the clipboard.');
      return;
    }
    const blob = await renderPngBlob(chosen.elements, chosen.bounds, { scale, background, palette });
    const ok = await copyBlobToClipboard(blob);
    setNote(ok ? 'PNG copied to the clipboard.' : 'This browser will not copy images - download it instead.');
  };

  const empty = chosen.elements.length === 0;

  return (
    <Modal
      title="Export"
      description={`${Math.round(chosen.bounds.w)} x ${Math.round(chosen.bounds.h)} points${format === 'png' ? ` - ${Math.round(chosen.bounds.w * scale)} x ${Math.round(chosen.bounds.h * scale)} pixels` : ''}`}
      wide
      onClose={close}
      footer={
        <>
          <span className="sk-modal-note" role="status" aria-live="polite">
            {note}
          </span>
          <button type="button" className="sk-btn" disabled={empty} onClick={() => void doCopy()}>
            <Icon name="copy" size={16} /> Copy
          </button>
          <button type="button" className="sk-btn sk-btn-primary" disabled={empty} onClick={() => void doDownload()}>
            <Icon name="download" size={16} /> Download {format.toUpperCase()}
          </button>
        </>
      }
    >
      <div className="sk-export">
        <div className="sk-export-preview">
          {preview && !empty ? (
            <img src={preview} alt={`Preview of the ${format.toUpperCase()} export`} />
          ) : (
            <p className="sk-empty">Nothing to export yet.</p>
          )}
        </div>
        <div className="sk-export-options">
          <div className="sk-field">
            <span className="sk-field-label">What</span>
            <div className="sk-seg sk-seg-wrap" role="group" aria-label="What to export">
              <button type="button" className={`sk-seg-btn${scope.kind === 'board' ? ' is-active' : ''}`} onClick={() => setScope({ kind: 'board' })}>
                Whole board
              </button>
              <button
                type="button"
                className={`sk-seg-btn${scope.kind === 'selection' ? ' is-active' : ''}`}
                disabled={!selectedIds.length}
                onClick={() => setScope({ kind: 'selection' })}
              >
                Selection
              </button>
              {frames.map((frame) => (
                <button
                  key={frame.id}
                  type="button"
                  className={`sk-seg-btn${scope.kind === 'frame' && scope.id === frame.id ? ' is-active' : ''}`}
                  onClick={() => setScope({ kind: 'frame', id: frame.id })}
                >
                  {frame.name || 'Frame'}
                </button>
              ))}
            </div>
          </div>
          <div className="sk-field">
            <span className="sk-field-label">Format</span>
            <div className="sk-seg" role="group" aria-label="Format">
              <button type="button" className={`sk-seg-btn${format === 'png' ? ' is-active' : ''}`} onClick={() => setFormat('png')}>
                <Icon name="image" size={16} /> PNG
              </button>
              <button type="button" className={`sk-seg-btn${format === 'svg' ? ' is-active' : ''}`} onClick={() => setFormat('svg')}>
                <Icon name="code" size={16} /> SVG
              </button>
            </div>
          </div>
          {format === 'png' ? (
            <div className="sk-field">
              <span className="sk-field-label">Size</span>
              <div className="sk-seg" role="group" aria-label="Pixel scale">
                <button type="button" className={`sk-seg-btn${scale === 1 ? ' is-active' : ''}`} onClick={() => setScale(1)}>
                  1x
                </button>
                <button type="button" className={`sk-seg-btn${scale === 2 ? ' is-active' : ''}`} onClick={() => setScale(2)}>
                  2x
                </button>
              </div>
            </div>
          ) : null}
          <label className="sk-check">
            <input type="checkbox" checked={withBackground} onChange={(e) => setWithBackground(e.target.checked)} />
            <span>Include the background colour</span>
          </label>
          <p className="sk-hint">
            SVG keeps every shape editable and every word searchable. PNG is the one to paste into a chat.
          </p>
        </div>
      </div>
    </Modal>
  );
};
