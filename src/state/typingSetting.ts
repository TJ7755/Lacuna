import { createLocalSetting } from './localSetting';

/**
 * How the answer is given during Learn mode's question phase.
 *  - `reveal`: the default flip-card flow — tap/press to reveal the answer.
 *  - `type`: the learner types their answer before reveal; on reveal it is compared
 *    against the expected answer (see src/utils/answerComparison.ts) and shown
 *    alongside the correct answer. Self-grading still decides the FSRS grade.
 *
 * This was previously a per-card type ('typing'); it is now a global presentation
 * mode so any eligible card (front_back, basic_reversed, cloze) can be answered by
 * typing without needing a dedicated card type.
 */
export type TypingSetting = 'reveal' | 'type';

const setting = createLocalSetting<TypingSetting>({
  key: 'lacuna.typingSetting',
  event: 'lacuna:typing-setting',
  parse: (raw) => (raw === 'type' ? 'type' : 'reveal'),
});

export const readTypingSetting = setting.read;
export const writeTypingSetting = setting.write;
export const useTypingSetting = setting.use;
