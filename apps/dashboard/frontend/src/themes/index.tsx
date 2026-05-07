import { useState } from 'react';

export const BUILTIN_THEMES: Record<string, {
  name: string;
  themeName: string;
  colors: Record<string, string>;
  palette?: { background: { hex: string }; midground: { hex: string }; warmGlow: string };
}> = {
  dark: {
    name: 'Linear Dark',
    themeName: 'linear',
    colors: {},
    palette: { background: { hex: '#08090a' }, midground: { hex: '#191a1b' }, warmGlow: '#7170ff' },
  },
};

export const THEME_LIST = Object.values(BUILTIN_THEMES).map(t => ({
  name: t.themeName,
  label: t.name,
}));

export interface Theme {
  id: string;
  name: string;
  themeName: string;
  colors: Record<string, string>;
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
