import { useEffect, useState } from 'react';

// Global default for whether LessonView opens in study mode (read-only notes,
// a study-summary cards section) or edit mode (full notes/cards CRUD). Any
// course can override this individually via Course.lessonViewMode; see
// src/course/lessonViewMode.ts for the resolution logic and the
// canEditLessons() gate that call sites must go through rather than reading
// this value directly.

const KEY = 'lacuna.lessonViewMode';

export type LessonViewMode = 'study' | 'edit';

const FALLBACK: LessonViewMode = 'study';

export function readLessonViewMode(): LessonViewMode {
  const raw = localStorage.getItem(KEY) as LessonViewMode | null;
  return raw === 'study' || raw === 'edit' ? raw : FALLBACK;
}

export function writeLessonViewMode(mode: LessonViewMode): void {
  localStorage.setItem(KEY, mode);
  window.dispatchEvent(new CustomEvent('lacuna:lesson-view-mode', { detail: mode }));
}

export function useLessonViewMode(): [LessonViewMode, (mode: LessonViewMode) => void] {
  const [mode, setMode] = useState<LessonViewMode>(() => readLessonViewMode());

  useEffect(() => {
    const onChange = () => setMode(readLessonViewMode());
    window.addEventListener('storage', onChange);
    window.addEventListener('lacuna:lesson-view-mode', onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('lacuna:lesson-view-mode', onChange);
    };
  }, []);

  return [
    mode,
    (next) => {
      writeLessonViewMode(next);
      setMode(next);
    },
  ];
}
