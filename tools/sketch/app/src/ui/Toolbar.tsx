// The tool island. Twelve tools, each reachable by a letter and the
// first ten by a number, with the shortcut shown on the button so nobody
// has to open the help sheet twice.

import React from 'react';
import { Icon, type IconName } from './icons';
import { type Tool, useSketch } from '../state/store';

export interface ToolSpec {
  tool: Tool;
  icon: IconName;
  label: string;
  key: string;
  digit?: string;
}

export const TOOLS: ToolSpec[] = [
  { tool: 'select', icon: 'select', label: 'Select', key: 'V', digit: '1' },
  { tool: 'hand', icon: 'hand', label: 'Hand (pan)', key: 'H', digit: '2' },
  { tool: 'rect', icon: 'rect', label: 'Rectangle', key: 'R', digit: '3' },
  { tool: 'diamond', icon: 'diamond', label: 'Diamond', key: 'D', digit: '4' },
  { tool: 'ellipse', icon: 'ellipse', label: 'Ellipse', key: 'O', digit: '5' },
  { tool: 'arrow', icon: 'arrow', label: 'Arrow', key: 'A', digit: '6' },
  { tool: 'line', icon: 'line', label: 'Line', key: 'L', digit: '7' },
  { tool: 'draw', icon: 'draw', label: 'Draw', key: 'P', digit: '8' },
  { tool: 'text', icon: 'text', label: 'Text', key: 'T', digit: '9' },
  { tool: 'sticky', icon: 'sticky', label: 'Sticky note', key: 'N', digit: '0' },
  { tool: 'frame', icon: 'frame', label: 'Frame', key: 'F' },
  { tool: 'eraser', icon: 'eraser', label: 'Eraser', key: 'E' },
];

export const Toolbar: React.FC = () => {
  const tool = useSketch((s) => s.tool);
  const setTool = useSketch((s) => s.setTool);
  const setDialog = useSketch((s) => s.setDialog);
  return (
    <div className="sk-island sk-toolbar" role="toolbar" aria-label="Tools">
      {TOOLS.map((spec) => (
        <button
          key={spec.tool}
          type="button"
          className={`sk-tool${tool === spec.tool ? ' is-active' : ''}`}
          aria-pressed={tool === spec.tool}
          aria-keyshortcuts={spec.key}
          title={`${spec.label} — ${spec.key}`}
          onClick={() => setTool(spec.tool)}
          onDoubleClick={() => setTool(spec.tool, true)}
        >
          <Icon name={spec.icon} />
          {spec.digit ? <span className="sk-tool-digit" aria-hidden="true">{spec.digit}</span> : null}
          <span className="sk-sr">{spec.label}</span>
        </button>
      ))}
      <span className="sk-toolbar-divider" aria-hidden="true" />
      <button
        type="button"
        className="sk-tool"
        title="Shape library — /"
        aria-keyshortcuts="/"
        onClick={() => setDialog('slash', true)}
      >
        <Icon name="library" />
        <span className="sk-sr">Shape library</span>
      </button>
    </div>
  );
};
