import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeName =
  | 'bento'
  | 'matrix'
  | 'matrix-light'
  | 'claude-official'
  | 'claude-official-light'
  | 'claude-classic'
  | 'claude-classic-light'
  | 'claude-slate'
  | 'claude-slate-light'
  | 'claude-nous'
  | 'claude-nous-light';

interface ThemeContextType {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  themes: { name: ThemeName; label: string; dark: boolean }[];
}

export const THEMES: { name: ThemeName; label: string; dark: boolean }[] = [
  { name: 'bento', label: 'Warm Bento', dark: false },
  { name: 'claude-official', label: 'Claude Official', dark: true },
  { name: 'claude-official-light', label: 'Claude Light', dark: false },
  { name: 'claude-classic', label: 'Claude Classic', dark: true },
  { name: 'claude-classic-light', label: 'Classic Light', dark: false },
  { name: 'claude-slate', label: 'Claude Slate', dark: true },
  { name: 'claude-slate-light', label: 'Slate Light', dark: false },
  { name: 'claude-nous', label: 'Nous Dark', dark: true },
  { name: 'claude-nous-light', label: 'Nous Light', dark: false },
  { name: 'matrix', label: 'Matrix', dark: true },
  { name: 'matrix-light', label: 'Matrix Light', dark: false },
];

const ThemeContext = createContext<ThemeContextType | null>(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('agent-os-theme') as ThemeName) || 'bento';
    }
    return 'bento';
  });

  const setTheme = (newTheme: ThemeName) => {
    setThemeState(newTheme);
    localStorage.setItem('agent-os-theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}
