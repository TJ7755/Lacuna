import { createLocalSetting, parseJson } from './localSetting';

// Device-local preference for which stat pills appear in a course header. Mirrors
// sidebarSettings deliberately: same local-setting factory, same merge-with-defaults
// behaviour, so there is one way to express "the user chose what to show", not two.
//
// Which of these read as useful depends entirely on how someone studies — a fixed exam
// date makes the countdown matter, an open-ended course makes it noise — so the header
// offers them all and lets the reader keep the two or three they act on.

export type CourseStatId = 'due' | 'unmapped' | 'mastery' | 'exam' | 'lessons';

export interface CourseStatPill {
  id: CourseStatId;
  label: string;
  visible: boolean;
}

export interface CourseHeaderSettings {
  statPills: CourseStatPill[];
}

// Two by default: what is due now and how well the course is known. The rest are
// available but off, because five figures at once read as a dashboard rather than a
// heading, and most of them are not acted on before pressing Study.
export const DEFAULT_STAT_PILLS: CourseStatPill[] = [
  { id: 'due', label: 'Cards due now', visible: true },
  { id: 'mastery', label: 'Mastery', visible: true },
  { id: 'exam', label: 'Days until the exam', visible: false },
  { id: 'unmapped', label: 'Unmapped cards', visible: false },
  { id: 'lessons', label: 'Lessons reached', visible: false },
];

export const DEFAULTS: CourseHeaderSettings = { statPills: DEFAULT_STAT_PILLS };

const setting = createLocalSetting<CourseHeaderSettings>({
  key: 'lacuna.courseHeaderSettings',
  event: 'lacuna:course-header-settings',
  parse: (raw) =>
    parseJson(
      raw,
      () => ({ statPills: [...DEFAULT_STAT_PILLS] }),
      (value) => {
        const parsed = value as Partial<CourseHeaderSettings>;
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
      },
    ),
  serialise: JSON.stringify,
});

export const readStored = setting.read;

export function writeCourseHeaderSettings(settings: Partial<CourseHeaderSettings>): void {
  setting.write({ ...setting.read(), ...settings });
}

export function useCourseHeaderSettings(): [
  CourseHeaderSettings,
  (patch: Partial<CourseHeaderSettings>) => void,
] {
  const [settings, setSettings] = setting.use();
  return [settings, (patch) => setSettings({ ...setting.read(), ...patch })];
}
