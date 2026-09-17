// The ? sheet. Every shortcut the app answers to, grouped the way people
// look for them, with the platform's own modifier symbols.

import React from 'react';
import { Modal } from './Modal';
import { useSketch } from '../state/store';

const isApple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = isApple ? '⌘' : 'Ctrl';
const ALT = isApple ? '⌥' : 'Alt';

export const SHORTCUT_GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: 'Tools',
    items: [
      ['V / 1', 'Select'],
      ['H / 2', 'Hand (pan)'],
      ['R / 3', 'Rectangle'],
      ['D / 4', 'Diamond'],
      ['O / 5', 'Ellipse'],
      ['A / 6', 'Arrow'],
      ['L / 7', 'Line'],
      ['P / 8', 'Draw'],
      ['T / 9', 'Text'],
      ['N / 0', 'Sticky note'],
      ['F', 'Frame'],
      ['E', 'Eraser'],
      ['/', 'Shape library'],
      ['Double-click a tool', 'Keep it after drawing'],
    ],
  },
  {
    title: 'Canvas',
    items: [
      ['Space + drag', 'Pan'],
      ['Middle or right drag', 'Pan'],
      ['Two fingers', 'Pan and pinch to zoom'],
      [`${MOD} + wheel`, 'Zoom to the cursor'],
      [`${MOD} + / ${MOD} −`, 'Zoom in / out'],
      [`${MOD}0`, 'Zoom to 100%'],
      ['⇧1', 'Zoom to fit'],
      ['⇧2', 'Zoom to selection'],
      ['G', 'Grid, dots or plain'],
      ['⇧S', 'Snapping on or off'],
      ['M', 'Minimap'],
    ],
  },
  {
    title: 'Editing',
    items: [
      [`${MOD}Z / ${MOD}⇧Z`, 'Undo / redo'],
      [`${MOD}C / ${MOD}V / ${MOD}X`, 'Copy / paste / cut'],
      [`${MOD}D`, 'Duplicate'],
      [`${ALT} + drag`, 'Duplicate as you drag'],
      ['Delete', 'Delete selection'],
      [`${MOD}A`, 'Select all'],
      ['Arrows', 'Nudge 1px (⇧ for 10px)'],
      ['Double-click', 'Edit text in place'],
      ['Enter', 'Edit the selected element'],
      ['Escape', 'Deselect or stop editing'],
    ],
  },
  {
    title: 'Arranging',
    items: [
      [`${MOD}G / ${MOD}⇧G`, 'Group / ungroup'],
      [`${MOD}] / ${MOD}[`, 'Bring forward / send backward'],
      [`${MOD}⇧] / ${MOD}⇧[`, 'Bring to front / send to back'],
      [`${MOD}⇧L`, 'Lock or unlock'],
      ['⇧H / ⇧V', 'Flip horizontally / vertically'],
      ['Shift + drag', 'Keep the aspect ratio, or one axis'],
      ['Shift while rotating', 'Snap to 15°'],
    ],
  },
  {
    title: 'Files',
    items: [
      [`${MOD}O`, 'All boards'],
      [`${MOD}N`, 'New board'],
      [`${MOD}E`, 'Export'],
      [`${MOD}S`, 'Save now (autosave is always on)'],
      ['?', 'This list'],
    ],
  },
];

export const Shortcuts: React.FC = () => {
  const setDialog = useSketch((s) => s.setDialog);
  return (
    <Modal title="Keyboard shortcuts" description="Everything here works without the mouse." wide onClose={() => setDialog('shortcuts', false)}>
      <div className="sk-shortcut-grid">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title}>
            <h3>{group.title}</h3>
            <dl>
              {group.items.map(([keys, what]) => (
                <div key={keys + what}>
                  <dt>
                    <kbd>{keys}</kbd>
                  </dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
};
