import { useState } from 'react';

export const BUILTIN_THEMES = [
  { id: 'dark', name: 'Dark', themeName: 'dark', colors: {}, palette: { background: { hex: '#0f0f0f' }, midground: { hex: '#1a1a1a' }, warmGlow: '#2d1f0f' } },
  { id: 'light', name: 'Light', themeName: 'light', colors: {}, palette: { background: { hex: '#ffffff' }, midground: { hex: '#f5f5f5' }, warmGlow: '#f0e8d8' } },
] as const;

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
  const theme = (BUILTIN_THEMES as unknown as Theme[]).find(t => t.id === themeId) ?? BUILTIN_THEMES[0] as unknown as Theme;
  return {
    theme,
    themeName: theme.themeName,
    availableThemes: BUILTIN_THEMES.map(t => ({ name: t.name, label: t.name })),
    setTheme: setThemeId,
  };
}
