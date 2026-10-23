import { createLocalSetting, oneOf } from './localSetting';

export type AnswerInputPreference = 'course' | 'type' | 'reveal';

const setting = createLocalSetting<AnswerInputPreference>({
  key: 'lacuna.answerInput',
  event: 'lacuna:answer-input',
  parse: oneOf(['course', 'type', 'reveal'], 'course'),
});

export const readAnswerInput = setting.read;
export const writeAnswerInput = setting.write;
export const useAnswerInput = setting.use;
