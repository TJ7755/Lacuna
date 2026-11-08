import { createLocalSetting, parseJson } from './localSetting';

// Device-local preference for which detail modules a dashboard course card
// reveals when hovered or focused.

export interface CourseCardDetailSettings {
  /** Show the time of the next scheduled review. */
  nextDue: boolean;
  /** Show the new / learnt / ready card breakdown. */
  breakdown: boolean;
  /** Show the recent review activity bars. */
  activity: boolean;
}

const DEFAULTS: CourseCardDetailSettings = {
  nextDue: true,
  breakdown: true,
  activity: true,
};

const setting = createLocalSetting<CourseCardDetailSettings>({
  key: 'lacuna.courseCardDetail',
  event: 'lacuna:course-card-detail',
  parse: (raw) =>
    parseJson(
      raw,
      () => ({ ...DEFAULTS }),
      (value) => {
        const parsed = value as Partial<CourseCardDetailSettings>;
        return {
          nextDue: parsed.nextDue ?? DEFAULTS.nextDue,
          breakdown: parsed.breakdown ?? DEFAULTS.breakdown,
          activity: parsed.activity ?? DEFAULTS.activity,
        };
      },
    ),
  serialise: JSON.stringify,
});

export function useCourseCardDetail(): [
  CourseCardDetailSettings,
  (patch: Partial<CourseCardDetailSettings>) => void,
] {
  const [settings, setSettings] = setting.use();
  return [settings, (patch) => setSettings({ ...setting.read(), ...patch })];
}
