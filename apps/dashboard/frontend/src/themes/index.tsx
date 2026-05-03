import { useState } from 'react';

export const BUILTIN_THEMES: Record<string, { name: string; themeName: string; colors: Record<string, string>; palette: { background: { hex: string }; midground: { hex: string }; warmGlow: string } }> = {
  dark: { name: 'Dark', themeName: 'dark', colors: {}, palette: { background: { hex: '#0f0f0f' }, midground: { hex: '#1a1a1a' }, warmGlow: '#2d1f0f' } },
  light: { name: 'Light', themeName: 'light', colors: {}, palette: { background: { hex: '#ffffff' }, midground: { hex: '#f5f5f5' }, warmGlow: '#f0e8d8' } },
};

export const THEME_LIST = Object.values(BUILTIN_THEMES).map(t => ({ name: t.themeName, label: t.name }));

export interface Theme {
  id: string;
  name: string;
  themeName: string;
  colors: Record<string, string>;
  /** For ThemeSwatch swatch rendering */
  palette?: { background: { hex: string }; midground: { hex: string }; warmGlow: string };
}

export function useTheme(): {
  theme: Theme;
  themeName: string;
  availableThemes: Array<{ name: string; label: string; description?: string }>;
  setTheme: (t: string) => void;
} {
  const [themeId, setThemeId] = useState('dark');
  const theme = BUILTIN_THEMES[themeId] ?? BUILTIN_THEMES['dark'];
  return {
    theme: { ...theme, id: themeId },
    themeName: theme.themeName,
    availableThemes: THEME_LIST,
    setTheme: setThemeId,
  };
}
