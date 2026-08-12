import { useEffect, useState } from 'react';

// Device-local preference for which stat pills appear in a course header. Mirrors
// sidebarSettings deliberately: same storage-plus-event shape, same merge-with-defaults
// behaviour, so there is one way to express "the user chose what to show", not two.
//
// Which of these read as useful depends entirely on how someone studies — a fixed exam
// date makes the countdown matter, an open-ended course makes it noise — so the header
// offers them all and lets the reader keep the two or three they act on.

const KEY = 'lacuna.courseHeaderSettings';

export type CourseStatId = 'due' | 'unmapped' | 'mastery' | 'exam' | 'lessons';

export interface CourseStatPill {
  id: CourseStatId;
  label: string;
  visible: boolean;
}

export interface CourseHeaderSettings {
  statPills: CourseStatPill[];
}

export const DEFAULT_STAT_PILLS: CourseStatPill[] = [
  { id: 'due', label: 'Cards due now', visible: true },
  { id: 'exam', label: 'Days until the exam', visible: true },
  { id: 'unmapped', label: 'Unmapped cards', visible: true },
  { id: 'mastery', label: 'Mastery', visible: true },
  { id: 'lessons', label: 'Lessons reached', visible: true },
];

export const DEFAULTS: CourseHeaderSettings = { statPills: DEFAULT_STAT_PILLS };

export function readStored(): CourseHeaderSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CourseHeaderSettings>;
      const stored = parsed.statPills ?? DEFAULTS.statPills;
      // Drop stored pills that no longer exist, then append any newly added defaults,
      // preserving the stored order and visibility of everything that survives.
      const merged = stored.filter((pill) =>
        DEFAULT_STAT_PILLS.some((def) => def.id === pill.id),
      );
      for (const def of DEFAULT_STAT_PILLS) {
        if (!merged.find((pill) => pill.id === def.id)) merged.push(def);
      }
      return { statPills: merged };
    }
  } catch {
    // Ignore parse errors and fall back to defaults.
  }
  return { statPills: [...DEFAULT_STAT_PILLS] };
}

export function writeCourseHeaderSettings(settings: Partial<CourseHeaderSettings>): void {
  const next = { ...readStored(), ...settings };
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('lacuna:course-header-settings', { detail: next }));
}

export function useCourseHeaderSettings(): [
  CourseHeaderSettings,
  (patch: Partial<CourseHeaderSettings>) => void,
] {
  const [settings, setSettings] = useState<CourseHeaderSettings>(() => readStored());

  useEffect(() => {
    const onChange = () => setSettings(readStored());
    window.addEventListener('storage', onChange);
    window.addEventListener('lacuna:course-header-settings', onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('lacuna:course-header-settings', onChange);
    };
  }, []);

  return [
    settings,
    (patch) => {
      writeCourseHeaderSettings(patch);
      setSettings(readStored());
    },
  ];
}
