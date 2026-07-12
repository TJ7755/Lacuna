import { useEffect, useState } from 'react';

// Device-local preference for which detail modules a dashboard course card
// reveals when hovered or focused.

const KEY = 'lacuna.courseCardDetail';

export interface CourseCardDetailSettings {
  /** Show the time of the next scheduled review. */
  nextDue: boolean;
  /** Show the new / learnt / due card breakdown. */
  breakdown: boolean;
  /** Show the recent review activity bars. */
  activity: boolean;
}

export const DEFAULTS: CourseCardDetailSettings = {
  nextDue: true,
  breakdown: true,
  activity: true,
};

export function readCourseCardDetail(): CourseCardDetailSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CourseCardDetailSettings>;
      return {
        nextDue: parsed.nextDue ?? DEFAULTS.nextDue,
        breakdown: parsed.breakdown ?? DEFAULTS.breakdown,
        activity: parsed.activity ?? DEFAULTS.activity,
      };
    }
  } catch {
    // Ignore parse errors and fall back to defaults.
  }
  return { ...DEFAULTS };
}

export function writeCourseCardDetail(
  patch: Partial<CourseCardDetailSettings>,
): void {
  const next = { ...readCourseCardDetail(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(
    new CustomEvent('lacuna:course-card-detail', { detail: next }),
  );
}

export function useCourseCardDetail(): [
  CourseCardDetailSettings,
  (patch: Partial<CourseCardDetailSettings>) => void,
] {
  const [settings, setSettings] = useState<CourseCardDetailSettings>(() =>
    readCourseCardDetail(),
  );

  useEffect(() => {
    const onChange = () => setSettings(readCourseCardDetail());
    window.addEventListener('storage', onChange);
    window.addEventListener('lacuna:course-card-detail', onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('lacuna:course-card-detail', onChange);
    };
  }, []);

  return [
    settings,
    (patch) => {
      writeCourseCardDetail(patch);
      setSettings(readCourseCardDetail());
    },
  ];
}
