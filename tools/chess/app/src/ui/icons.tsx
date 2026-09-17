// src/ui/icons.tsx
//
// The interface's icons, as inline SVG on a 16x16 grid. No emoji: an
// emoji is a different glyph on every platform and at the mercy of the
// user's font stack, and half of them are unreadable at 14 pixels.

interface IconProps {
  size?: number;
}

function svg(path: JSX.Element, size = 15): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  );
}

export const Icons = {
  first: ({ size }: IconProps = {}) => svg(<><path d="M11.5 3 6 8l5.5 5" /><path d="M4 3v10" /></>, size),
  previous: ({ size }: IconProps = {}) => svg(<path d="M10 3 5 8l5 5" />, size),
  next: ({ size }: IconProps = {}) => svg(<path d="M6 3l5 5-5 5" />, size),
  last: ({ size }: IconProps = {}) => svg(<><path d="M4.5 3 10 8l-5.5 5" /><path d="M12 3v10" /></>, size),
  play: ({ size }: IconProps = {}) => svg(<path d="M4.5 3.2v9.6L12.5 8z" />, size),
  pause: ({ size }: IconProps = {}) => svg(<><path d="M5.5 3v10" /><path d="M10.5 3v10" /></>, size),
  flip: ({ size }: IconProps = {}) => svg(<><path d="M3 6.5 8 2l5 4.5" /><path d="M13 9.5 8 14l-5-4.5" /></>, size),
  sound: ({ size }: IconProps = {}) => svg(<><path d="M3 6.2h2.4L8.5 3.4v9.2L5.4 9.8H3z" /><path d="M11 5.8a3 3 0 0 1 0 4.4" /></>, size),
  mute: ({ size }: IconProps = {}) => svg(<><path d="M3 6.2h2.4L8.5 3.4v9.2L5.4 9.8H3z" /><path d="m11 6 3 4M14 6l-3 4" /></>, size),
  undo: ({ size }: IconProps = {}) => svg(<><path d="M3 8h7a3 3 0 0 1 0 6H7" /><path d="M5.5 5.2 2.8 8l2.7 2.8" /></>, size),
  question: ({ size }: IconProps = {}) => svg(<><circle cx="8" cy="8" r="6" /><path d="M6.4 6.3a1.7 1.7 0 0 1 3.3.5c0 1.2-1.7 1.4-1.7 2.6" /><path d="M8 11.7h.01" /></>, size),
  close: ({ size }: IconProps = {}) => svg(<><path d="m4 4 8 8" /><path d="m12 4-8 8" /></>, size),
  plus: ({ size }: IconProps = {}) => svg(<><path d="M8 3.2v9.6" /><path d="M3.2 8h9.6" /></>, size),
  save: ({ size }: IconProps = {}) => svg(<><path d="M3 3h7.5L13 5.5V13H3z" /><path d="M5.5 3v3.5h5V3" /><path d="M5.5 13v-3.5h5V13" /></>, size),
  copy: ({ size }: IconProps = {}) => svg(<><rect x="5.5" y="5.5" width="8" height="8" rx="1.3" /><path d="M10.5 3.5h-8v8" /></>, size),
  chart: ({ size }: IconProps = {}) => svg(<><path d="M2.5 13.5h11" /><path d="M4.5 11V7" /><path d="M8 11V3.5" /><path d="M11.5 11V8.5" /></>, size),
  brain: ({ size }: IconProps = {}) => svg(<><circle cx="8" cy="8" r="5.2" /><path d="M8 2.8v10.4" /><path d="M4.4 5.4c1.6 1 5.6 1 7.2 0" /><path d="M4.4 10.6c1.6-1 5.6-1 7.2 0" /></>, size),
  target: ({ size }: IconProps = {}) => svg(<><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="2" /></>, size),
  list: ({ size }: IconProps = {}) => svg(<><path d="M5.5 4.5h8" /><path d="M5.5 8h8" /><path d="M5.5 11.5h8" /><path d="M2.6 4.5h.01M2.6 8h.01M2.6 11.5h.01" /></>, size),
  folder: ({ size }: IconProps = {}) => svg(<path d="M2.5 12.5v-9h4l1.4 1.8h5.6v7.2z" />, size),
  flag: ({ size }: IconProps = {}) => svg(<><path d="M4 14V2.5" /><path d="M4 3.2h8l-1.7 2.6L12 8.4H4z" /></>, size),
  handshake: ({ size }: IconProps = {}) => svg(<><path d="M2 7.5 5 5l3 2 3-2 3 2.5" /><path d="M5 5v5.5" /><path d="M11 5v5.5" /><path d="M6.5 11h3" /></>, size),
  settings: ({ size }: IconProps = {}) => svg(<><circle cx="8" cy="8" r="2.2" /><path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6" /></>, size),
};
