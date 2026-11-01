import { createLocalSetting } from './localSetting';

export type StudyMode = 'fsrs' | 'simple';

const setting = createLocalSetting<StudyMode>({
  key: 'lacuna.studyMode',
  event: 'lacuna:study-mode',
  parse: (raw) => (raw === 'simple' ? 'simple' : 'fsrs'),
});

export const useStudyMode = setting.use;
