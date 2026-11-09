import { expect, it } from 'vitest';
import { lessonDistractorAnswerKey, lessonDistractorCandidates } from '../../jev/protocol';
import { canOfferChoices, lessonChoices } from './simpleLearnQuestions';

it('keeps equivalent initialisms out of local and Jev choices', () => {
  const target = { id: 'us', prompt: 'What is the abbreviation for United States?', answer: 'US' };
  const variant = { id: 'us-dotted', prompt: 'Abbreviate United States.', answer: 'U.S.' };
  const alternative = { id: 'uk', prompt: 'Abbreviate United Kingdom.', answer: 'UK' };
  expect(canOfferChoices(target, [target, variant])).toBe(false);
  expect(canOfferChoices(target, [target, variant, alternative])).toBe(true);
  expect(lessonChoices(target, [target, variant, alternative], [variant.id]).sort()).toEqual([
    'UK',
    'US',
  ]);
  expect(lessonDistractorCandidates([target, variant, alternative], 0)).toEqual([2]);
  expect(lessonDistractorAnswerKey('l’avion')).toBe(lessonDistractorAnswerKey("l'avion"));
});
