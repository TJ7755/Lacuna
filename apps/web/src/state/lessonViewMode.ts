// LessonViewMode type, plus the reader for the retired global default that
// used to live at localStorage key 'lacuna.lessonViewMode'. The global
// setting itself is gone (every course now carries its own explicit
// Course.lessonViewMode — see src/course/lessonViewMode.ts); this reader
// survives only so the one-shot migration in App.tsx can seed existing
// courses with whatever that default last was.

const KEY = 'lacuna.lessonViewMode';

export type LessonViewMode = 'study' | 'edit';

const FALLBACK: LessonViewMode = 'study';

export function readLessonViewMode(): LessonViewMode {
  const raw = localStorage.getItem(KEY) as LessonViewMode | null;
  return raw === 'study' || raw === 'edit' ? raw : FALLBACK;
}
