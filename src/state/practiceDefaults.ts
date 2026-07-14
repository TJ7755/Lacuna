import { useEffect, useState } from 'react';

// Global defaults for a course's practice-node settings (see Course in
// src/db/types.ts). These seed createCourse for new courses; each course can
// then override any of them individually, and a course's own settings
// always win over these defaults.

const KEY = 'lacuna.practiceDefaults';

export interface PracticeDefaults {
  autoPractice: boolean;
  practiceThresholdMinutesFar: number;
  practiceThresholdMinutesNear: number;
  practiceUrgentWindowDays: number;
  practiceMaxGap: number;
}

const FALLBACK: PracticeDefaults = {
  autoPractice: true,
  practiceThresholdMinutesFar: 8,
  practiceThresholdMinutesNear: 4,
  practiceUrgentWindowDays: 7,
  practiceMaxGap: 2,
};

export function readPracticeDefaults(): PracticeDefaults {
  const raw = localStorage.getItem(KEY);
  if (!raw) return FALLBACK;
  try {
    const parsed = JSON.parse(raw) as Partial<PracticeDefaults>;
    return { ...FALLBACK, ...parsed };
  } catch {
    return FALLBACK;
  }
}

export function writePracticeDefaults(defaults: PracticeDefaults): void {
  localStorage.setItem(KEY, JSON.stringify(defaults));
  window.dispatchEvent(new CustomEvent('lacuna:practice-defaults', { detail: defaults }));
}

export function usePracticeDefaults(): [PracticeDefaults, (next: PracticeDefaults) => void] {
  const [defaults, setDefaults] = useState<PracticeDefaults>(() => readPracticeDefaults());

  useEffect(() => {
    const onChange = () => setDefaults(readPracticeDefaults());
    window.addEventListener('storage', onChange);
    window.addEventListener('lacuna:practice-defaults', onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('lacuna:practice-defaults', onChange);
    };
  }, []);

  return [
    defaults,
    (next) => {
      writePracticeDefaults(next);
      setDefaults(next);
    },
  ];
}
