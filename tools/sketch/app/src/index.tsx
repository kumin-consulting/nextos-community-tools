// Sketch - an infinite canvas for diagrams and thinking, as a native
// NextOS app.
//
// This file is the shell: it mounts the canvas and the chrome, owns the
// keyboard map (every action in the app is reachable from here without a
// mouse), keeps the store's idea of the theme in step with the OS's, and
// exports the app's real API - `tools` for agents and `intents` for other
// apps. Everything else lives in src/lib (pure, tested), src/canvas
// (drawing and pointers), src/state (the store and the VFS) and src/ui.

import React, { useCallback, useEffect } from 'react';
import sdk from '@kumin/sdk';
import './app.css';
import { Canvas } from './canvas/Canvas';
import { isTypingTarget } from './canvas/Canvas';
import { ActionBar, DocumentBar, StatusToast, ZoomBar } from './ui/Chrome';
import { Toolbar } from './ui/Toolbar';
import { Properties } from './ui/Properties';
import { FileSwitcher } from './ui/FileSwitcher';
import { ExportDialog } from './ui/ExportDialog';
import { Shortcuts } from './ui/Shortcuts';
import { SlashPalette } from './ui/SlashPalette';
import { Minimap } from './ui/Minimap';
import { CorruptNotice, EmptyHint } from './ui/Hints';
import { type Tool, useSketch } from './state/store';
import { canvasSize, sceneCenter, viewRef } from './state/view';
import { buildDiagram, type GraphSpec } from './lib/layout';
import { coerceElement, createDocument, describeDocument, sanitizeName, type SketchDocument } from './lib/document';
import { elementsToSvg } from './lib/svg';
import { type SketchElement } from './lib/types';
import { paletteFor } from './lib/palette';
import { listDocuments, pathFor, readDocumentFile, writeDocumentFile, ensureFolder, freeName } from './state/files';

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  h: 'hand',
  r: 'rect',
  d: 'diamond',
  o: 'ellipse',
  a: 'arrow',
  l: 'line',
  p: 'draw',
  t: 'text',
  n: 'sticky',
  f: 'frame',
  e: 'eraser',
  '1': 'select',
  '2': 'hand',
  '3': 'rect',
  '4': 'diamond',
  '5': 'ellipse',
  '6': 'arrow',
  '7': 'line',
  '8': 'draw',
  '9': 'text',
  '0': 'sticky',
};

const SketchApp: React.FC = () => {
  const isDark = sdk.theme.useIsDark();
  const ready = useSketch((s) => s.ready);
  const dialogs = useSketch((s) => s.dialogs);
  const corrupt = useSketch((s) => s.corrupt);
  const setDark = useSketch((s) => s.setDark);

  useEffect(() => {
    setDark(isDark);
  }, [isDark, setDark]);

  useEffect(() => {
    void useSketch.getState().boot();
    const flush = (): void => {
      void useSketch.getState().flush();
    };
    window.addEventListener('blur', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('blur', flush);
      document.removeEventListener('visibilitychange', flush);
      flush();
    };
  }, []);

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    const state = useSketch.getState();
    if (isTypingTarget(e.target)) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key;
    const lower = key.length === 1 ? key.toLowerCase() : key;

    if (key === 'Escape') {
      const open = (Object.keys(state.dialogs) as Array<keyof typeof state.dialogs>).find((k) => k !== 'minimap' && state.dialogs[k]);
      if (open) state.setDialog(open, false);
      else if (state.selectedIds.length) state.setSelection([]);
      else state.setTool('select');
      return;
    }
    if (key === '?' || (key === '/' && e.shiftKey)) {
      e.preventDefault();
      state.setDialog('shortcuts', !state.dialogs.shortcuts);
      return;
    }
    if (key === '/' && !mod) {
      e.preventDefault();
      state.setDialog('slash', true);
      return;
    }

    if (mod) {
      switch (lower) {
        case 'z':
          e.preventDefault();
          if (e.shiftKey) state.redo();
          else state.undo();
          return;
        case 'y':
          e.preventDefault();
          state.redo();
          return;
        case 'a':
          e.preventDefault();
          state.selectAll();
          return;
        case 'c':
          e.preventDefault();
          state.copySelection(false);
          return;
        case 'x':
          e.preventDefault();
          state.copySelection(true);
          return;
        case 'v':
          e.preventDefault();
          state.paste(sceneCenter());
          return;
        case 'd':
          e.preventDefault();
          state.duplicateSelected();
          return;
        case 'g':
          e.preventDefault();
          if (e.shiftKey) state.ungroup();
          else state.group();
          return;
        case 'l':
          if (e.shiftKey) {
            e.preventDefault();
            state.toggleLock();
          }
          return;
        case 'e':
          e.preventDefault();
          state.setDialog('export', true);
          return;
        case 'o':
          e.preventDefault();
          state.setDialog('files', true);
          return;
        case 'n':
          e.preventDefault();
          void state.newDocument('Untitled');
          return;
        case 's':
          e.preventDefault();
          void state.flush();
          state.setStatus('Saved');
          return;
        case ']':
          e.preventDefault();
          state.order(e.shiftKey ? 'front' : 'forward');
          return;
        case '[':
          e.preventDefault();
          state.order(e.shiftKey ? 'back' : 'backward');
          return;
        case '=':
        case '+':
          e.preventDefault();
          state.zoomTo(state.viewport.zoom * 1.2, [canvasSize().width / 2, canvasSize().height / 2]);
          return;
        case '-':
          e.preventDefault();
          state.zoomTo(state.viewport.zoom / 1.2, [canvasSize().width / 2, canvasSize().height / 2]);
          return;
        case '0':
          e.preventDefault();
          state.zoomTo(1, [canvasSize().width / 2, canvasSize().height / 2]);
          return;
        default:
          return;
      }
    }

    if (e.shiftKey) {
      if (key === '!' || key === '1') {
        e.preventDefault();
        state.zoomToFit(canvasSize(), false);
        return;
      }
      if (key === '@' || key === '2') {
        e.preventDefault();
        state.zoomToFit(canvasSize(), true);
        return;
      }
      if (lower === 'h') {
        e.preventDefault();
        state.flip('horizontal');
        return;
      }
      if (lower === 'v') {
        e.preventDefault();
        state.flip('vertical');
        return;
      }
      if (lower === 's') {
        e.preventDefault();
        state.toggleSnap();
        return;
      }
    }

    if (key === 'Delete' || key === 'Backspace') {
      e.preventDefault();
      state.deleteSelected();
      return;
    }
    if (key === 'Enter' && state.selectedIds.length === 1) {
      e.preventDefault();
      state.requestEdit(state.selectedIds[0]);
      return;
    }
    if (key.startsWith('Arrow')) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
      const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
      state.nudge(dx, dy);
      return;
    }
    if (lower === 'g') {
      e.preventDefault();
      state.setBackground(state.background === 'grid' ? 'dots' : state.background === 'dots' ? 'plain' : 'grid');
      return;
    }
    if (lower === 'm') {
      e.preventDefault();
      state.setDialog('minimap', !state.dialogs.minimap);
      return;
    }
    const tool = TOOL_KEYS[lower];
    if (tool) {
      e.preventDefault();
      state.setTool(tool);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  return (
    <div className={`sk-root${isDark ? ' sk-dark' : ''}`}>
      <Canvas onReady={(handle) => (viewRef.current = handle)} />
      <EmptyHint />
      <div className="sk-chrome sk-chrome-top">
        <DocumentBar />
        <Toolbar />
        <ActionBar />
      </div>
      <div className="sk-chrome sk-chrome-left">
        <Properties />
      </div>
      <div className="sk-chrome sk-chrome-bottom">
        <ZoomBar />
        {dialogs.minimap ? <Minimap /> : null}
      </div>
      <StatusToast />
      {dialogs.files ? <FileSwitcher /> : null}
      {dialogs.export ? <ExportDialog /> : null}
      {dialogs.shortcuts ? <Shortcuts /> : null}
      {dialogs.slash ? <SlashPalette /> : null}
      {corrupt ? <CorruptNotice /> : null}
      {!ready ? <div className="sk-booting">Opening your boards…</div> : null}
    </div>
  );
};

export default SketchApp;

/* --------------------------------------------------------------- tools */

const PREFIX = `${sdk.app.id.replace(/-/g, '_')}_`;

interface ResolvedDocument {
  doc: SketchDocument;
  path: string;
  live: boolean;
}

/** Finds a board by name, preferring the one already open (so an agent
 *  writing to the board a person is looking at changes what they see
 *  rather than a stale copy on disk). */
async function resolveDocument(name?: string): Promise<ResolvedDocument> {
  const state = useSketch.getState();
  const wanted = name ? sanitizeName(name) : null;
  if (!wanted || wanted.toLowerCase() === state.name.toLowerCase()) {
    if (state.path) {
      return {
        doc: {
          type: 'sketch',
          version: 1,
          name: state.name,
          createdAt: state.createdAt,
          updatedAt: new Date().toISOString(),
          background: state.background,
          view: state.viewport,
          elements: state.elements,
        },
        path: state.path,
        live: true,
      };
    }
  }
  const files = await listDocuments();
  const match = files.find((f) => f.name.toLowerCase() === (wanted ?? '').toLowerCase());
  if (!match) throw new Error(`No board called "${name}". Use ${PREFIX}list_documents to see what exists.`);
  const parsed = await readDocumentFile(match.path);
  if (!parsed.ok) throw new Error(`"${match.name}" could not be read: ${parsed.error}`);
  return { doc: parsed.doc, path: match.path, live: false };
}

async function persist(target: ResolvedDocument, elements: SketchElement[]): Promise<void> {
  if (target.live) {
    useSketch.getState().commit(elements, { label: 'Agent edit' });
    await useSketch.getState().flush();
    return;
  }
  await writeDocumentFile(target.path, { ...target.doc, elements });
}

export const tools = [
  {
    name: `${PREFIX}list_documents`,
    description:
      'List every Sketch board in the user\'s Sketches folder, newest first, with the name to pass to the other sketch tools, the file path and when it was last changed. Also says which board is open right now.',
    inputSchema: { type: 'object' as const, properties: {} },
    readOnly: true,
    async execute(): Promise<unknown> {
      await ensureFolder();
      const files = await listDocuments();
      const open = useSketch.getState().name;
      return {
        open,
        documents: files.map((f) => ({ name: f.name, path: f.path, updatedAt: new Date(f.mtime).toISOString(), bytes: f.size })),
      };
    },
  },
  {
    name: `${PREFIX}create_diagram`,
    description:
      'Draw a node-and-edge diagram on a new Sketch board and open it. Give the nodes ids and labels (shape: process, decision, start, end, database or note) and the edges the ids they run between; Sketch lays them out in layers, draws the boxes and connects them with arrows that stay attached when anything is moved afterwards.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Name for the new board, e.g. "Checkout flow". A number is added if that name is taken.' },
        graph: {
          type: 'object',
          description: 'The diagram itself.',
          properties: {
            nodes: {
              type: 'array',
              description: 'The boxes.',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Unique within this graph; edges refer to it.' },
                  label: { type: 'string', description: 'The words inside the box.' },
                  shape: { type: 'string', description: 'process (default), decision, start, end, database or note.' },
                },
                required: ['id', 'label'],
              },
            },
            edges: {
              type: 'array',
              description: 'The arrows.',
              items: {
                type: 'object',
                properties: {
                  from: { type: 'string' },
                  to: { type: 'string' },
                  label: { type: 'string', description: 'Optional words on the arrow, e.g. "yes".' },
                },
                required: ['from', 'to'],
              },
            },
            direction: { type: 'string', description: 'TB (top to bottom, the default) or LR (left to right).' },
          },
          required: ['nodes'],
        },
      },
      required: ['name', 'graph'],
    },
    async execute(input: unknown): Promise<unknown> {
      const { name, graph } = (input ?? {}) as { name?: string; graph?: GraphSpec };
      if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) throw new Error('graph.nodes must list at least one node.');
      const state = useSketch.getState();
      const palette = paletteFor(state.isDark);
      const elements = buildDiagram(graph, {
        stroke: palette.defaultStroke,
        fill: palette.fills[5]?.value ?? '#d6e6fb',
        fillStyle: 'solid',
        textColor: palette.defaultText,
        stickyFill: palette.stickyFill,
        stickyText: palette.stickyText,
        fontSize: 20,
      });
      const unique = await freeName(sanitizeName(name || 'Diagram'));
      const doc = createDocument(unique, elements);
      const path = pathFor(unique);
      await writeDocumentFile(path, doc);
      await state.openDocument(path);
      useSketch.getState().zoomToFit(canvasSize(), false);
      return {
        name: unique,
        path,
        nodes: graph.nodes.length,
        edges: (graph.edges ?? []).length,
        elements: elements.length,
        opened: true,
      };
    },
  },
  {
    name: `${PREFIX}add_elements`,
    description:
      'Append elements to a Sketch board. Each element is { type, x, y, w, h, text?, stroke?, fill?, points? }; type is rect, ellipse, diamond, line, arrow, draw, text, sticky or frame. Coordinates are board coordinates - read them back with sketch_describe first when adding next to something that already exists.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Which board. Defaults to the one that is open.' },
        elements: {
          type: 'array',
          description: 'The elements to add.',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', description: 'rect, ellipse, diamond, line, arrow, draw, text, sticky or frame.' },
              x: { type: 'number' },
              y: { type: 'number' },
              w: { type: 'number' },
              h: { type: 'number' },
              text: { type: 'string' },
              stroke: { type: 'string', description: 'A hex colour.' },
              fill: { type: 'string', description: 'A hex colour, or "transparent".' },
              points: { type: 'array', description: 'For line/arrow/draw: [[x,y], ...] relative to x,y.', items: { type: 'array', items: { type: 'number' } } },
            },
            required: ['type'],
          },
        },
      },
      required: ['elements'],
    },
    async execute(input: unknown): Promise<unknown> {
      const { name, elements } = (input ?? {}) as { name?: string; elements?: unknown[] };
      if (!Array.isArray(elements) || !elements.length) throw new Error('elements must be a non-empty array.');
      const target = await resolveDocument(name);
      const added: SketchElement[] = [];
      for (const raw of elements) {
        const el = coerceElement(raw);
        if (el) added.push(el);
      }
      if (!added.length) throw new Error('None of those elements could be read - each needs at least a type, and a line needs points.');
      await persist(target, [...target.doc.elements, ...added]);
      return { name: target.doc.name, added: added.length, total: target.doc.elements.length + added.length };
    },
  },
  {
    name: `${PREFIX}export_svg`,
    description: 'Return a Sketch board as SVG text - real shapes and real text, ready to paste into a document or a web page.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Which board. Defaults to the one that is open.' },
        background: { type: 'boolean', description: 'Include the paper colour behind the drawing. Default false.' },
      },
    },
    readOnly: true,
    async execute(input: unknown): Promise<unknown> {
      const { name, background } = (input ?? {}) as { name?: string; background?: boolean };
      const target = await resolveDocument(name);
      const palette = paletteFor(useSketch.getState().isDark);
      const svg = elementsToSvg(target.doc.elements, {
        background: background ? palette.background : null,
        title: target.doc.name,
        frameStroke: palette.frameStroke,
      });
      return { name: target.doc.name, svg };
    },
  },
  {
    name: `${PREFIX}describe`,
    description:
      'Describe what is on a Sketch board in plain words: every shape with its label and position, and every arrow with what it connects. Use this before adding to a board, or to answer questions about a diagram.',
    inputSchema: {
      type: 'object' as const,
      properties: { name: { type: 'string', description: 'Which board. Defaults to the one that is open.' } },
    },
    readOnly: true,
    async execute(input: unknown): Promise<unknown> {
      const { name } = (input ?? {}) as { name?: string };
      const target = await resolveDocument(name);
      return { name: target.doc.name, path: target.path, elements: target.doc.elements.length, outline: describeDocument(target.doc) };
    },
  },
];

/* ------------------------------------------------------------- intents */

export const intents = {
  /** kumin://sketch/open?file=<path or name> */
  async open(params: Record<string, string>): Promise<unknown> {
    const file = params.file ?? params.path ?? params.name;
    if (!file) throw new Error('open needs a "file" - a board name or a path in the Sketches folder.');
    const state = useSketch.getState();
    if (file.startsWith('/')) {
      await state.openDocument(file);
      return { opened: file };
    }
    const target = await resolveDocument(file);
    await useSketch.getState().openDocument(target.path);
    return { opened: target.path };
  },
};

/* ------------------------------------------------------------- install */

export async function onInstall(): Promise<void> {
  try {
    await ensureFolder();
  } catch {
    // The folder is created again on first save; an install must never fail
    // because the VFS was busy.
  }
}
