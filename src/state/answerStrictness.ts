import { createLocalSetting, oneOf } from './localSetting';
import type { AnswerComparisonOptions } from '../utils/answerComparison';

/**
 * How strictly a typed answer (see src/state/typingSetting.ts) is compared against
 * the expected answer, per src/utils/answerComparison.ts's AnswerComparisonOptions.
 *  - `lenient`: ignore case and punctuation (default — the pre-existing behaviour).
 *  - `standard`: ignore case, but punctuation must match.
 *  - `exact`: case and punctuation both matter.
 */
export type AnswerStrictness = 'lenient' | 'standard' | 'exact';

const setting = createLocalSetting<AnswerStrictness>({
  key: 'lacuna.answerStrictness',
  event: 'lacuna:answer-strictness',
  parse: oneOf(['lenient', 'standard', 'exact'], 'lenient'),
});

export const readAnswerStrictness = setting.read;
export const writeAnswerStrictness = setting.write;
export const useAnswerStrictness = setting.use;

/** Translate a strictness level into the comparison flags compareAnswer expects. */
export function answerComparisonOptions(strictness: AnswerStrictness): AnswerComparisonOptions {
  switch (strictness) {
    case 'exact':
      return { ignoreCase: false, ignorePunctuation: false };
    case 'standard':
      return { ignoreCase: true, ignorePunctuation: false };
    case 'lenient':
    default:
      return { ignoreCase: true, ignorePunctuation: true };
  }
}
