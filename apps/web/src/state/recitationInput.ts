import { createLocalSetting, oneOf } from './localSetting';

/**
 * How lines are recalled in cumulative recitation (src/pages/learn/recitation):
 *  - `type`: each line is typed, then shown against the source (default).
 *  - `aloud`: the learner recites without typing, then reveals the source.
 * Either way the learner marks which lines were wrong.
 */
export type RecitationInput = 'type' | 'aloud';

const setting = createLocalSetting<RecitationInput>({
  key: 'lacuna.recitationInput',
  event: 'lacuna:recitation-input',
  parse: oneOf(['type', 'aloud'], 'type'),
});

export const useRecitationInput = setting.use;
