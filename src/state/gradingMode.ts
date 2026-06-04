import { useEffect, useState } from 'react';

export type GradingMode = 'silent' | 'manual';

const KEY = 'lacuna.gradingMode';

export function readGradingMode(): GradingMode {
  return localStorage.getItem(KEY) === 'manual' ? 'manual' : 'silent';
}

export function writeGradingMode(mode: GradingMode): void {
  localStorage.setItem(KEY, mode);
  window.dispatchEvent(new CustomEvent('lacuna:grading-mode', { detail: mode }));
}

export function useGradingMode(): [GradingMode, (mode: GradingMode) => void] {
  const [mode, setMode] = useState<GradingMode>(() => readGradingMode());

  useEffect(() => {
    const onChange = () => setMode(readGradingMode());
    window.addEventListener('storage', onChange);
    window.addEventListener('lacuna:grading-mode', onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('lacuna:grading-mode', onChange);
    };
  }, []);

  return [
    mode,
    (next) => {
      writeGradingMode(next);
      setMode(next);
    },
  ];
}
