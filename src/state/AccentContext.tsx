import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

// A device-local accent-colour control. The chosen accent is applied as a
// `data-accent` attribute on the document root; index.css then switches the
// --accent custom properties (with separate light/dark variants) to match.
// Mirrors ThemeContext and FontScaleContext.

const STORAGE_KEY = 'lacuna-accent';

export interface Accent {
  key: string;
  label: string;
  /** Representative colour used for the swatch shown in Settings. */
  swatch: string;
}

/** The selectable accents. The first entry is the default. */
export const ACCENTS: readonly Accent[] = [
  { key: 'amber', label: 'Amber', swatch: 'hsl(32 90% 48%)' },
  { key: 'red', label: 'Red', swatch: 'hsl(6 90% 48%)' },
  { key: 'rose', label: 'Rose', swatch: 'hsl(340 90% 48%)' },
  { key: 'pink', label: 'Pink', swatch: 'hsl(320 80% 52%)' },
  { key: 'violet', label: 'Violet', swatch: 'hsl(265 80% 55%)' },
  { key: 'blue', label: 'Blue', swatch: 'hsl(217 90% 52%)' },
  { key: 'teal', label: 'Teal', swatch: 'hsl(186 90% 38%)' },
  { key: 'green', label: 'Green', swatch: 'hsl(150 70% 38%)' },
] as const;

export const DEFAULT_ACCENT = ACCENTS[0].key;

interface AccentValue {
  accent: string;
  setAccent: (accent: string) => void;
}

const AccentContext = createContext<AccentValue | null>(null);

function readStored(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && ACCENTS.some((a) => a.key === stored)) return stored;
  } catch {
    // Ignore storage access errors and fall back to the default.
  }
  return DEFAULT_ACCENT;
}

export function AccentProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState<string>(readStored);

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
    try {
      localStorage.setItem(STORAGE_KEY, accent);
    } catch {
      // Persistence is best-effort.
    }
  }, [accent]);

  const setAccent = useCallback((next: string) => {
    setAccentState(ACCENTS.some((a) => a.key === next) ? next : DEFAULT_ACCENT);
  }, []);

  return (
    <AccentContext.Provider value={{ accent, setAccent }}>
      {children}
    </AccentContext.Provider>
  );
}

export function useAccent(): AccentValue {
  const ctx = useContext(AccentContext);
  if (!ctx) throw new Error('useAccent must be used within an AccentProvider');
  return ctx;
}
