import { expect, it } from 'vitest';
import { answerComparisonOptions } from './answerStrictness';

it.each([
  ['lenient', true, true],
  ['standard', true, false],
  ['exact', false, false],
] as const)('uses the comparison rules for %s', (strictness, ignoreCase, ignorePunctuation) => {
  expect(answerComparisonOptions(strictness)).toEqual({ ignoreCase, ignorePunctuation });
});
