// src/ui/Icons.tsx
//
// Every icon in the app, as inline SVG on a 16-unit grid. No emoji in
// the interface: an emoji is a different shape, weight and colour on
// every machine, and these have to sit on a 13px line without wobbling.
// They inherit `currentColor` and are marked aria-hidden - the control
// around them carries the label.

import type { ReactElement } from 'react';

interface IconProps {
  size?: number;
  strokeWidth?: number;
}

function svg(path: ReactElement, { size = 16, strokeWidth = 1.6 }: IconProps = {}): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  );
}

export const BrainIcon = (p: IconProps = {}) =>
  svg(
    <>
      <path d="M5.7 13.2A3 3 0 0 1 3 10.4a2.6 2.6 0 0 1-.7-3.8A2.5 2.5 0 0 1 3.6 3 2.7 2.7 0 0 1 8 2.5a2.7 2.7 0 0 1 4.4.5 2.5 2.5 0 0 1 1.3 3.6 2.6 2.6 0 0 1-.7 3.8 3 3 0 0 1-2.7 2.8" />
      <path d="M8 2.5v10.7" />
    </>,
    p
  );

export const PlayIcon = (p: IconProps = {}) => svg(<path d="M4.5 2.9 12.6 8l-8.1 5.1V2.9Z" />, p);
export const PlusIcon = (p: IconProps = {}) => svg(<><path d="M8 3.2v9.6" /><path d="M3.2 8h9.6" /></>, p);
export const SearchIcon = (p: IconProps = {}) => svg(<><circle cx="7.2" cy="7.2" r="4" /><path d="m10.2 10.2 3 3" /></>, p);
export const SettingsIcon = (p: IconProps = {}) =>
  svg(
    <>
      <path d="M6.6 2.2h2.8l.3 1.6 1.3.8 1.5-.6 1.4 2.4-1.2 1.1v1.5l1.2 1-1.4 2.5-1.5-.6-1.3.7-.3 1.6H6.6l-.3-1.6-1.3-.7-1.5.6L2.1 10l1.2-1V7.5L2.1 6.4l1.4-2.4 1.5.6 1.3-.8Z" />
      <circle cx="8" cy="8" r="1.9" />
    </>,
    p
  );
export const SlidersIcon = (p: IconProps = {}) =>
  svg(
    <>
      <path d="M2.6 4.6h5M10.6 4.6h2.8M2.6 11.4h2.8M8.6 11.4h4.8" />
      <circle cx="9" cy="4.6" r="1.6" />
      <circle cx="7" cy="11.4" r="1.6" />
    </>,
    p
  );
export const TrashIcon = (p: IconProps = {}) => svg(<><path d="M2.8 4.2h10.4" /><path d="M6.4 4.2V2.9h3.2v1.3" /><path d="M4.1 4.2 4.7 13h6.6l.6-8.8" /><path d="M6.7 6.6v4M9.3 6.6v4" /></>, p);
export const CopyIcon = (p: IconProps = {}) => svg(<><rect x="5.4" y="5.4" width="7.4" height="7.4" rx="1.4" /><path d="M10.6 5.4V4.6a1.4 1.4 0 0 0-1.4-1.4H4.6a1.4 1.4 0 0 0-1.4 1.4v4.6a1.4 1.4 0 0 0 1.4 1.4h.8" /></>, p);
export const PencilIcon = (p: IconProps = {}) => svg(<><path d="M11.1 2.9 13.1 4.9 5.6 12.4 2.9 13.1 3.6 10.4Z" /><path d="m9.8 4.2 2 2" /></>, p);
export const DownloadIcon = (p: IconProps = {}) => svg(<><path d="M8 2.6v7.2" /><path d="m5.2 7 2.8 2.8L10.8 7" /><path d="M2.9 12.4h10.2" /></>, p);
export const UploadIcon = (p: IconProps = {}) => svg(<><path d="M8 10.2V3" /><path d="M5.2 5.8 8 3l2.8 2.8" /><path d="M2.9 12.4h10.2" /></>, p);
export const CheckIcon = (p: IconProps = {}) => svg(<path d="m3.2 8.4 3.1 3.1 6.5-7" />, p);
export const CloseIcon = (p: IconProps = {}) => svg(<><path d="m3.8 3.8 8.4 8.4" /><path d="m12.2 3.8-8.4 8.4" /></>, p);
export const UndoIcon = (p: IconProps = {}) => svg(<><path d="M3.2 6.6h6.3a3.4 3.4 0 0 1 0 6.8H6.2" /><path d="m5.6 3.4-2.4 3.2 2.4 2.6" /></>, p);
export const KeyboardIcon = (p: IconProps = {}) => svg(<><rect x="1.6" y="4" width="12.8" height="8" rx="1.6" /><path d="M4.2 6.6h.01M6.6 6.6h.01M9 6.6h.01M11.4 6.6h.01M4.8 9.4h6.4" /></>, p);
export const BellIcon = (p: IconProps = {}) => svg(<><path d="M4.4 6.6a3.6 3.6 0 0 1 7.2 0c0 3 1.1 4 1.1 4H3.3s1.1-1 1.1-4Z" /><path d="M6.7 12.7a1.5 1.5 0 0 0 2.6 0" /></>, p);
export const LayersIcon = (p: IconProps = {}) => svg(<><path d="M8 2.2 14 5.4 8 8.6 2 5.4Z" /><path d="m2 8.8 6 3.2 6-3.2" /></>, p);
export const CalendarIcon = (p: IconProps = {}) => svg(<><rect x="2.4" y="3.4" width="11.2" height="10.2" rx="1.6" /><path d="M2.4 6.6h11.2" /><path d="M5.6 2.2v2.4M10.4 2.2v2.4" /></>, p);
export const FlameIcon = (p: IconProps = {}) => svg(<path d="M8 1.8s.6 2 2 3.4c1.5 1.5 2.4 2.6 2.4 4.4a4.4 4.4 0 1 1-8.8 0c0-1.3.5-2.2 1.2-3 .2.9.8 1.4 1.5 1.4 1 0 1.5-.8 1.2-2.2-.2-1.2-.2-2.7.5-4Z" />, p);
export const TargetIcon = (p: IconProps = {}) => svg(<><circle cx="8" cy="8" r="5.4" /><circle cx="8" cy="8" r="2.2" /></>, p);
export const PauseIcon = (p: IconProps = {}) => svg(<><path d="M6 3.4v9.2" /><path d="M10 3.4v9.2" /></>, p);
export const TagIcon = (p: IconProps = {}) => svg(<><path d="M2.8 7.4V3.4a.6.6 0 0 1 .6-.6h4l6.2 6.2-4.6 4.6L2.8 7.4Z" /><path d="M5.4 5.4h.01" /></>, p);
export const StarIcon = (p: IconProps = {}) => svg(<path d="m8 2.4 1.7 3.5 3.9.5-2.8 2.7.7 3.8L8 11.1l-3.5 1.8.7-3.8L2.4 6.4l3.9-.5Z" />, p);
export const ChevronDown = (p: IconProps = {}) => svg(<path d="m4 6 4 4 4-4" />, p);
export const ChevronUp = (p: IconProps = {}) => svg(<path d="m4 10 4-4 4 4" />, p);
export const ChevronLeft = (p: IconProps = {}) => svg(<path d="m10 3.5-4.5 4.5 4.5 4.5" />, p);
export const SparkIcon = (p: IconProps = {}) => svg(<><path d="M8 2.2v3M8 11v2.8M2.4 8h3M10.8 8h2.8" /><path d="m4.4 4.4 1.8 1.8M9.8 9.8l1.8 1.8M11.6 4.4 9.8 6.2M6.2 9.8l-1.8 1.8" /></>, p);
export const FileIcon = (p: IconProps = {}) => svg(<><path d="M9 2.2H4.8a1.4 1.4 0 0 0-1.4 1.4v8.8a1.4 1.4 0 0 0 1.4 1.4h6.4a1.4 1.4 0 0 0 1.4-1.4V5.6Z" /><path d="M9 2.2v3.4h3.6" /></>, p);
export const SaveIcon = (p: IconProps = {}) => svg(<><circle cx="8" cy="8" r="5.6" /><path d="m5.6 8.2 1.7 1.7 3.2-3.6" /></>, p);
export const AlertIcon = (p: IconProps = {}) => svg(<><path d="M8 2.6 14 13H2Z" /><path d="M8 6.6v3M8 11.4h.01" /></>, p);
export const ImageIcon = (p: IconProps = {}) => svg(<><rect x="2.4" y="3.4" width="11.2" height="9.2" rx="1.4" /><circle cx="5.8" cy="6.6" r="1" /><path d="m3 11.4 3.2-3 2.4 2.2 2-1.8 2.4 2.2" /></>, p);
