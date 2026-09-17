// Every icon in the app, as inline SVG on a 24x24 grid, stroked in
// currentColor so one component works in both themes and on every button
// state. No icon font, no emoji: an emoji is somebody else's drawing at
// somebody else's size, and it cannot inherit a focus ring's colour.

import React from 'react';

export type IconName =
  | 'select'
  | 'hand'
  | 'rect'
  | 'ellipse'
  | 'diamond'
  | 'line'
  | 'arrow'
  | 'draw'
  | 'text'
  | 'sticky'
  | 'frame'
  | 'eraser'
  | 'undo'
  | 'redo'
  | 'zoom-in'
  | 'zoom-out'
  | 'fit'
  | 'map'
  | 'grid'
  | 'magnet'
  | 'lock'
  | 'unlock'
  | 'trash'
  | 'copy'
  | 'group'
  | 'ungroup'
  | 'to-front'
  | 'to-back'
  | 'forward'
  | 'backward'
  | 'align-left'
  | 'align-center-x'
  | 'align-right'
  | 'align-top'
  | 'align-center-y'
  | 'align-bottom'
  | 'distribute-x'
  | 'distribute-y'
  | 'flip-x'
  | 'flip-y'
  | 'download'
  | 'image'
  | 'code'
  | 'file'
  | 'files'
  | 'plus'
  | 'check'
  | 'close'
  | 'help'
  | 'search'
  | 'cloud'
  | 'library'
  | 'more'
  | 'pencil'
  | 'upload'
  | 'sparkle';

const P = (d: string, key?: string | number): React.ReactElement => <path key={key} d={d} />;

const PATHS: Record<IconName, React.ReactNode> = {
  select: P('M5.5 3.2 18 11.2l-5.4 1.1-2.4 5.1z'),
  hand: P('M8 11V5.6a1.4 1.4 0 0 1 2.8 0V11m0-.4V4.6a1.4 1.4 0 0 1 2.8 0V11m0-.6V6a1.4 1.4 0 0 1 2.8 0v6.4c0 3.6-2 6.6-5.3 6.6-2.6 0-3.9-1.3-5.2-3.6l-1.6-2.9a1.4 1.4 0 0 1 2.3-1.6L8 12.4'),
  rect: P('M4 5.5h16v13H4z'),
  ellipse: P('M12 5.5c4.4 0 8 2.9 8 6.5s-3.6 6.5-8 6.5-8-2.9-8-6.5 3.6-6.5 8-6.5z'),
  diamond: P('m12 4 8 8-8 8-8-8z'),
  line: P('M4 19 20 5'),
  arrow: [P('M4 19 19 5', 'a'), P('M12.5 5H19v6.5', 'b')],
  draw: P('M4 17.5c3-1 4-8 6.2-8 1.6 0 .6 5 2.2 5 1.3 0 2-4.5 3.4-4.5 1.6 0 1.4 6.4 4.2 6.4'),
  text: [P('M5 6.5V4.8h14v1.7', 'a'), P('M12 5v14', 'b'), P('M9 19h6', 'c')],
  sticky: [P('M4.5 4.5h15v9.5l-5.5 5.5h-9.5z', 'a'), P('M19.5 14H14v5.5', 'b')],
  frame: [P('M7 3v18M17 3v18', 'a'), P('M3 7h18M3 17h18', 'b')],
  eraser: [P('m9.5 19-5-5a1.6 1.6 0 0 1 0-2.3l7.2-7.2a1.6 1.6 0 0 1 2.3 0l4.6 4.6a1.6 1.6 0 0 1 0 2.3L11.8 19z', 'a'), P('M9.5 19H19', 'b')],
  undo: [P('M4 9h10a5.5 5.5 0 0 1 0 11H8', 'a'), P('m8 4.5-4 4.5 4 4.5', 'b')],
  redo: [P('M20 9H10a5.5 5.5 0 0 0 0 11h6', 'a'), P('m16 4.5 4 4.5-4 4.5', 'b')],
  'zoom-in': [P('M11 4.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z', 'a'), P('m16 16 4 4', 'b'), P('M8.5 11h5M11 8.5v5', 'c')],
  'zoom-out': [P('M11 4.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z', 'a'), P('m16 16 4 4', 'b'), P('M8.5 11h5', 'c')],
  fit: P('M4 9V4.5h4.5M20 9V4.5h-4.5M4 15v4.5h4.5M20 15v4.5h-4.5'),
  map: [P('M4 6.5 9.5 4.5 15 6.5 20 4.5v13L15 19.5 9.5 17.5 4 19.5z', 'a'), P('M9.5 4.5v13M15 6.5v13', 'b')],
  grid: [P('M4 4.5h16v15H4z', 'a'), P('M9.3 4.5v15M14.7 4.5v15M4 9.5h16M4 14.5h16', 'b')],
  magnet: [P('M6 4.5v7a6 6 0 0 0 12 0v-7h-4v7a2 2 0 0 1-4 0v-7z', 'a'), P('M6 8.5h4M14 8.5h4', 'b')],
  lock: [P('M6 10.5h12v9H6z', 'a'), P('M8.8 10.5V7.8a3.2 3.2 0 0 1 6.4 0v2.7', 'b')],
  unlock: [P('M6 10.5h12v9H6z', 'a'), P('M8.8 10.5V7.8a3.2 3.2 0 0 1 6.2-1.1', 'b')],
  trash: [P('M5 6.5h14', 'a'), P('M7.5 6.5 8.3 20h7.4l.8-13.5', 'b'), P('M10 6.5V4h4v2.5', 'c')],
  copy: [P('M8.5 8.5h11v11h-11z', 'a'), P('M15.5 5.5v-1h-11v11h1', 'b')],
  group: [P('M7 7h10v10H7z', 'a'), P('M4 4h2.5M17.5 4H20M4 20h2.5M17.5 20H20M4 4v2.5M4 17.5V20M20 4v2.5M20 17.5V20', 'b')],
  ungroup: [P('M4 4h8v8H4z', 'a'), P('M12 12h8v8h-8z', 'b')],
  'to-front': [P('M8 4.5h11v11H8z', 'a'), P('M15.5 19.5h-11v-11', 'b')],
  'to-back': [P('M4.5 8.5h11v11h-11z', 'a'), P('M8.5 4.5h11v11', 'b')],
  forward: [P('M12 3.5 20 8l-8 4.5L4 8z', 'a'), P('m4 14 8 4.5 8-4.5', 'b')],
  backward: [P('M12 11.5 20 16l-8 4.5L4 16z', 'a'), P('m4 10 8-4.5L20 10', 'b')],
  'align-left': [P('M4 3.5v17', 'a'), P('M6.5 7h12v3.5h-12zM6.5 13.5h8V17h-8z', 'b')],
  'align-center-x': [P('M12 3.5v17', 'a'), P('M6 7h12v3.5H6zM8 13.5h8V17H8z', 'b')],
  'align-right': [P('M20 3.5v17', 'a'), P('M5.5 7h12v3.5h-12zM9.5 13.5h8V17h-8z', 'b')],
  'align-top': [P('M3.5 4h17', 'a'), P('M7 6.5h3.5v12H7zM13.5 6.5H17v8h-3.5z', 'b')],
  'align-center-y': [P('M3.5 12h17', 'a'), P('M7 6h3.5v12H7zM13.5 8H17v8h-3.5z', 'b')],
  'align-bottom': [P('M3.5 20h17', 'a'), P('M7 5.5h3.5v12H7zM13.5 9.5H17v8h-3.5z', 'b')],
  'distribute-x': [P('M3.5 4v16M20.5 4v16', 'a'), P('M9.5 7h5v10h-5z', 'b')],
  'distribute-y': [P('M4 3.5h16M4 20.5h16', 'a'), P('M7 9.5h10v5H7z', 'b')],
  'flip-x': [P('M12 3.5v17', 'a'), P('M9.5 7 4 12l5.5 5zM14.5 7l5.5 5-5.5 5z', 'b')],
  'flip-y': [P('M3.5 12h17', 'a'), P('M7 9.5 12 4l5 5.5zM7 14.5 12 20l5-5.5z', 'b')],
  download: [P('M12 4v11', 'a'), P('m7.5 10.5 4.5 4.5 4.5-4.5', 'b'), P('M4.5 19.5h15', 'c')],
  image: [P('M4 5.5h16v13H4z', 'a'), P('m4 15 4.5-4.5 4 4 3-2.5L20 16', 'b'), P('M9 9.5a1.2 1.2 0 1 0 0-.1z', 'c')],
  code: P('m9 7-5 5 5 5M15 7l5 5-5 5'),
  file: [P('M6 3.5h7.5L18 8v12.5H6z', 'a'), P('M13.5 3.5V8H18', 'b')],
  files: [P('M4.5 7.5h6l1.5 2h7.5v10h-15z', 'a'), P('M4.5 7.5v-3h5l1.5 2', 'b')],
  plus: P('M12 5v14M5 12h14'),
  check: P('m5 12.5 4.5 4.5L19 7'),
  close: P('M6 6l12 12M18 6 6 18'),
  help: [P('M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z', 'a'), P('M9.4 9.4a2.6 2.6 0 1 1 3.4 2.5c-.6.2-.8.7-.8 1.3v.6', 'b'), P('M12 17.2v.1', 'c')],
  search: [P('M11 4.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z', 'a'), P('m16 16 4 4', 'b')],
  cloud: P('M7 18.5a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17.4 10a3.9 3.9 0 0 1 .4 7.8z'),
  library: [P('M4 4.5h6v6H4zM14 4.5h6v6h-6zM4 13.5h6v6H4zM14 13.5h6v6h-6z', 'a')],
  more: [P('M6 12h.1', 'a'), P('M12 12h.1', 'b'), P('M18 12h.1', 'c')],
  pencil: [P('M4.5 19.5h4L19 9a2.1 2.1 0 0 0-3-3L5 16.5z', 'a'), P('m14.5 7.5 2 2', 'b')],
  upload: [P('M12 15V4', 'a'), P('m7.5 8.5 4.5-4.5 4.5 4.5', 'b'), P('M4.5 19.5h15', 'c')],
  sparkle: P('M12 4.5 13.6 10l5.4 1.6-5.4 1.6L12 18.6 10.4 13.2 5 11.6 10.4 10z'),
};

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export const Icon: React.FC<IconProps> = React.memo(({ name, size = 18, className }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {PATHS[name]}
  </svg>
));
Icon.displayName = 'Icon';
