import { useEffect, useState } from 'react';

export type SwipeAction = 'study' | 'archive' | 'none';

export interface GestureSettings {
  rightSwipe: SwipeAction;
  leftSwipe: SwipeAction;
}

const STORAGE_KEY = 'lacuna.gesture-settings';

const DEFAULTS: GestureSettings = {
  rightSwipe: 'study',
  leftSwipe: 'archive',
};

function readStored(): GestureSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GestureSettings>;
      return {
        rightSwipe: parsed.rightSwipe ?? DEFAULTS.rightSwipe,
        leftSwipe: parsed.leftSwipe ?? DEFAULTS.leftSwipe,
      };
    }
  } catch {
    // Ignore corrupted storage.
  }
  return { ...DEFAULTS };
}

function writeStored(settings: GestureSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Persistence is best-effort.
  }
}

export function useGestureSettings(): [GestureSettings, (settings: GestureSettings) => void] {
  const [settings, setSettings] = useState<GestureSettings>(readStored);

  useEffect(() => {
    const handler = () => setSettings(readStored());
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return [
    settings,
    (next) => {
      writeStored(next);
      setSettings(next);
    },
  ];
}
