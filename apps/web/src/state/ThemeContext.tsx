import { createStoredValue, oneOf } from './localSetting';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'dark' | 'light' | 'auto';
type ResolvedTheme = 'dark' | 'light';

const storedTheme = createStoredValue<Theme>({
  key: 'lacuna-theme',
  parse: oneOf<Theme>(['dark', 'light', 'auto'], 'dark'),
});

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme {
  try {
    return storedTheme.read();
  } catch {
    // Ignore storage access errors and fall back to the default.
  }
  return 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  const resolvedTheme: ResolvedTheme = theme === 'auto' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
    // Update the theme-color meta tag so the browser chrome (e.g. mobile status bar)
    // matches the current palette.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const paper = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
      if (paper) meta.setAttribute('content', `hsl(${paper})`);
    }
  }, [resolvedTheme]);

  useEffect(() => {
    try {
      storedTheme.write(theme);
    } catch {
      // Persistence is best-effort.
    }
  }, [theme]);

  // Keep the system preference in React state so every consumer, including
  // charts and browser theme metadata, updates with automatic theme changes.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setSystemDark(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const toggleTheme = useCallback(
    () => setThemeState((t) => (t === 'dark' ? 'light' : t === 'light' ? 'auto' : 'dark')),
    [],
  );

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
