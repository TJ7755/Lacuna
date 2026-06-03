import { useEffect, useState } from 'react';
import { useTheme } from '../../state/ThemeContext';

export interface ChartColours {
  accent: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  line: string;
  positive: string;
  surface: string;
}

function read(varName: string): string {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return raw ? `hsl(${raw})` : '#888';
}

/**
 * Resolve the palette's CSS custom properties to concrete `hsl(...)` strings that
 * Recharts can use as SVG fills/strokes. Re-reads whenever the theme changes.
 */
export function useChartColours(): ChartColours {
  const { theme } = useTheme();
  const [colours, setColours] = useState<ChartColours>(() => readAll());

  useEffect(() => {
    // Defer one frame so the `.dark` class toggle has applied before reading.
    const id = requestAnimationFrame(() => setColours(readAll()));
    return () => cancelAnimationFrame(id);
  }, [theme]);

  return colours;
}

function readAll(): ChartColours {
  return {
    accent: read('--accent'),
    ink: read('--ink'),
    inkSoft: read('--ink-soft'),
    inkFaint: read('--ink-faint'),
    line: read('--line'),
    positive: read('--positive'),
    surface: read('--surface-raised'),
  };
}
