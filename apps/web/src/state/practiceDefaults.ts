import { createLocalSetting, parseJson } from './localSetting';

// Global defaults for a course's practice-node settings (see Course in
// src/db/types.ts). These seed createCourse for new courses; each course can
// then override any of them individually, and a course's own settings
// always win over these defaults.

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

const setting = createLocalSetting<PracticeDefaults>({
  key: 'lacuna.practiceDefaults',
  event: 'lacuna:practice-defaults',
  parse: (raw) =>
    parseJson(
      raw,
      () => FALLBACK,
      (value) => ({ ...FALLBACK, ...(value as Partial<PracticeDefaults>) }),
    ),
  serialise: JSON.stringify,
});

export const readPracticeDefaults = setting.read;
export const writePracticeDefaults = setting.write;
export const usePracticeDefaults = setting.use;
