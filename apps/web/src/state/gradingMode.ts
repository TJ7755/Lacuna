import { createLocalSetting } from './localSetting';

export type GradingMode = 'silent' | 'manual';

const setting = createLocalSetting<GradingMode>({
  key: 'lacuna.gradingMode',
  event: 'lacuna:grading-mode',
  parse: (raw) => (raw === 'manual' ? 'manual' : 'silent'),
});

export const readGradingMode = setting.read;
export const writeGradingMode = setting.write;
export const useGradingMode = setting.use;
