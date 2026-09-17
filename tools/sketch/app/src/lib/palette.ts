// The curated colours, one set per theme, plus the canvas chrome colours
// the renderer needs. Two palettes rather than one because a stroke that
// reads as "ink" on paper reads as mud on a dark board: the dark set is
// lighter, less saturated and tuned to sit on #16171b.

export interface Swatch {
  name: string;
  value: string;
}

export interface Palette {
  strokes: Swatch[];
  fills: Swatch[];
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textDim: string;
  accent: string;
  accentSoft: string;
  selection: string;
  grid: string;
  gridStrong: string;
  defaultStroke: string;
  defaultText: string;
  stickyFill: string;
  stickyText: string;
  frameStroke: string;
}

export const LIGHT: Palette = {
  strokes: [
    { name: 'Ink', value: '#1e1e1e' },
    { name: 'Slate', value: '#5b6472' },
    { name: 'Red', value: '#c2372b' },
    { name: 'Orange', value: '#c2610b' },
    { name: 'Green', value: '#2e7d4f' },
    { name: 'Teal', value: '#0f7a8a' },
    { name: 'Blue', value: '#1c62c9' },
    { name: 'Violet', value: '#6a41c4' },
  ],
  fills: [
    { name: 'None', value: 'transparent' },
    { name: 'Paper', value: '#f3f3f1' },
    { name: 'Rose', value: '#fbdcd8' },
    { name: 'Amber', value: '#fbe6c4' },
    { name: 'Mint', value: '#d4eedd' },
    { name: 'Sky', value: '#d6e6fb' },
    { name: 'Lilac', value: '#e3daf8' },
    { name: 'Stone', value: '#e2e3e6' },
  ],
  background: '#fbfbfa',
  surface: '#ffffff',
  surfaceRaised: '#ffffff',
  border: '#e3e3e0',
  text: '#1e1e1e',
  textDim: '#6c6f76',
  accent: '#3b5bdb',
  accentSoft: '#e7ecfd',
  selection: '#3b5bdb',
  grid: '#ececea',
  gridStrong: '#dedede',
  defaultStroke: '#1e1e1e',
  defaultText: '#1e1e1e',
  stickyFill: '#fde9a9',
  stickyText: '#413a1c',
  frameStroke: '#b8bbc2',
};

export const DARK: Palette = {
  strokes: [
    { name: 'Chalk', value: '#e6e7ea' },
    { name: 'Slate', value: '#9aa3b2' },
    { name: 'Red', value: '#f08a7d' },
    { name: 'Orange', value: '#efb063' },
    { name: 'Green', value: '#77d39a' },
    { name: 'Teal', value: '#63cbd9' },
    { name: 'Blue', value: '#7fa9f5' },
    { name: 'Violet', value: '#b49af0' },
  ],
  fills: [
    { name: 'None', value: 'transparent' },
    { name: 'Charcoal', value: '#2a2c33' },
    { name: 'Rose', value: '#4a2b2a' },
    { name: 'Amber', value: '#4a3a22' },
    { name: 'Mint', value: '#22412f' },
    { name: 'Sky', value: '#23374f' },
    { name: 'Lilac', value: '#3a3151' },
    { name: 'Stone', value: '#33363d' },
  ],
  background: '#16171b',
  surface: '#1e2026',
  surfaceRaised: '#24272e',
  border: '#31343c',
  text: '#e6e7ea',
  textDim: '#9096a1',
  accent: '#7fa9f5',
  accentSoft: '#23304a',
  selection: '#7fa9f5',
  grid: '#1e2026',
  gridStrong: '#272a31',
  defaultStroke: '#e6e7ea',
  defaultText: '#e6e7ea',
  stickyFill: '#6b5a1f',
  stickyText: '#fdf3d3',
  frameStroke: '#454952',
};

export const paletteFor = (isDark: boolean): Palette => (isDark ? DARK : LIGHT);

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export const isHexColor = (value: string): boolean => HEX.test(value.trim());

export function normalizeHex(value: string): string | null {
  const v = value.trim();
  const withHash = v.startsWith('#') ? v : `#${v}`;
  return HEX.test(withHash) ? withHash.toLowerCase() : null;
}

/** Same stroke colour expressed for the other theme, so a document made
 *  in light mode is still legible in dark mode and back. Only the exact
 *  palette entries are mapped; a custom colour is left alone. */
export function translateColor(value: string, toDark: boolean): string {
  const from = toDark ? LIGHT : DARK;
  const to = toDark ? DARK : LIGHT;
  const i = from.strokes.findIndex((s) => s.value === value);
  if (i >= 0) return to.strokes[i].value;
  const j = from.fills.findIndex((s) => s.value === value);
  if (j >= 0) return to.fills[j].value;
  return value;
}

/** Relative luminance, for picking readable text over a fill. */
export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return 0.5;
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * (n & 255);
}

export const readableTextOn = (background: string, light = '#ffffff', dark = '#1e1e1e'): string =>
  background === 'transparent' ? dark : luminance(background) > 0.5 ? dark : light;
