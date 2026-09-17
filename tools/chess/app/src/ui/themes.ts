// src/ui/themes.ts
//
// Board themes. Each one is four colours: the two squares, the wash over
// the last move and the dot colour for legal moves. Every theme has a
// light and a dark variant, because a board that looks warm on a white
// page is a glare in a dark room.

export type BoardThemeId = 'walnut' | 'sea' | 'slate';

export interface BoardPalette {
  light: string;
  dark: string;
  lastMove: string;
  selected: string;
  hint: string;
  /** Text colour for the coordinate on a light square / a dark one. */
  coordOnLight: string;
  coordOnDark: string;
  arrow: string;
}

export interface BoardTheme {
  id: BoardThemeId;
  name: string;
  lightMode: BoardPalette;
  darkMode: BoardPalette;
}

export const BOARD_THEMES: BoardTheme[] = [
  {
    id: 'walnut',
    name: 'Walnut',
    lightMode: {
      light: '#efe0c7',
      dark: '#b68a5e',
      lastMove: 'rgba(224, 196, 74, 0.42)',
      selected: 'rgba(90, 150, 230, 0.32)',
      hint: 'rgba(60, 46, 28, 0.30)',
      coordOnLight: '#8a6a45',
      coordOnDark: '#f0e2ca',
      arrow: 'rgba(48, 110, 175, 0.72)',
    },
    darkMode: {
      light: '#b59374',
      dark: '#6f5238',
      lastMove: 'rgba(214, 178, 62, 0.34)',
      selected: 'rgba(110, 165, 235, 0.30)',
      hint: 'rgba(22, 16, 10, 0.42)',
      coordOnLight: '#5b4530',
      coordOnDark: '#cbb195',
      arrow: 'rgba(120, 175, 240, 0.75)',
    },
  },
  {
    id: 'sea',
    name: 'Sea glass',
    lightMode: {
      light: '#e5eef0',
      dark: '#7fa3ab',
      lastMove: 'rgba(120, 200, 205, 0.45)',
      selected: 'rgba(60, 130, 200, 0.30)',
      hint: 'rgba(24, 52, 60, 0.28)',
      coordOnLight: '#5d8089',
      coordOnDark: '#e7f0f2',
      arrow: 'rgba(22, 105, 130, 0.72)',
    },
    darkMode: {
      light: '#7c9aa2',
      dark: '#3d565e',
      lastMove: 'rgba(110, 190, 200, 0.32)',
      selected: 'rgba(95, 160, 220, 0.30)',
      hint: 'rgba(10, 24, 28, 0.44)',
      coordOnLight: '#33474d',
      coordOnDark: '#9fb8bd',
      arrow: 'rgba(110, 190, 225, 0.75)',
    },
  },
  {
    id: 'slate',
    name: 'Slate',
    lightMode: {
      light: '#e9e7e4',
      dark: '#8f8b86',
      lastMove: 'rgba(200, 175, 90, 0.42)',
      selected: 'rgba(90, 140, 210, 0.30)',
      hint: 'rgba(38, 35, 32, 0.28)',
      coordOnLight: '#726d67',
      coordOnDark: '#ecebe9',
      arrow: 'rgba(70, 95, 130, 0.72)',
    },
    darkMode: {
      light: '#7c7881',
      dark: '#494551',
      lastMove: 'rgba(196, 168, 88, 0.30)',
      selected: 'rgba(110, 155, 220, 0.30)',
      hint: 'rgba(12, 11, 15, 0.46)',
      coordOnLight: '#3d3a44',
      coordOnDark: '#a8a3af',
      arrow: 'rgba(140, 170, 225, 0.78)',
    },
  },
];

export function paletteFor(id: BoardThemeId, isDark: boolean): BoardPalette {
  const theme = BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0];
  return isDark ? theme.darkMode : theme.lightMode;
}

/** The custom properties the board's CSS reads. */
export function boardStyle(palette: BoardPalette): Record<string, string> {
  return {
    '--sq-light': palette.light,
    '--sq-dark': palette.dark,
    '--sq-last': palette.lastMove,
    '--sq-selected': palette.selected,
    '--sq-hint': palette.hint,
    '--sq-coord-light': palette.coordOnLight,
    '--sq-coord-dark': palette.coordOnDark,
  };
}
