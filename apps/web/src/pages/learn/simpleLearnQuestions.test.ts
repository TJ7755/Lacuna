import { expect, it } from 'vitest';
import { lessonDistractorAnswerKey, lessonDistractorCandidates } from '../../jev/protocol';
import { canOfferChoices, lessonChoices } from './simpleLearnQuestions';
import { lessonChoiceCandidates } from './simpleLearnQuestions';
import { card } from '../../fsrs/session.testFixtures';

it('offers formatted maths choices while excluding duplicate rendered prompts and answers', () => {
  const maths = card('maths', 'lesson', {
    front: 'What is the derivative of $e^x$?',
    back: '$e^x$',
  });
  const other = card('other', 'lesson', { front: 'Derivative of $x$?', back: '$1$' });
  const candidates = lessonChoiceCandidates([maths, other]);
  expect(candidates).toHaveLength(2);
  expect(lessonChoices(candidates[0], candidates, []).sort()).toEqual(['$1$', '$e^x$']);
  expect(
    lessonChoiceCandidates([
      card('plain', 'lesson', { front: 'Capital?', back: 'Paris' }),
      card('bold', 'lesson', { front: '**Capital?**', back: 'Rome' }),
    ]),
  ).toEqual([]);
  const equivalent = lessonChoiceCandidates([
    card('plain', 'lesson', { front: 'Capital?', back: 'Paris' }),
    card('bold', 'lesson', { front: 'City?', back: '**Paris**' }),
  ]);
  expect(canOfferChoices(equivalent[0], equivalent)).toBe(false);
});

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

it('does not offer identical rendered formulae as wrong answers or ambiguous prompts', () => {
  const target = { id: 'a', prompt: 'Square?', answer: '$x^2$' };
  const equivalent = { id: 'b', prompt: 'Power of two?', answer: '$x^{2}$' };
  const different = { id: 'c', prompt: 'Subscript?', answer: '$x_2$' };
  expect(canOfferChoices(target, [target, equivalent])).toBe(false);
  expect(lessonChoices(target, [target, equivalent, different], []).sort()).toEqual([
    '$x^2$',
    '$x_2$',
  ]);
  expect(
    lessonChoiceCandidates([
      card('a', 'lesson', { front: 'Evaluate $x^2$', back: 'One' }),
      card('b', 'lesson', { front: 'Evaluate $x^{2}$', back: 'Two' }),
    ]),
  ).toEqual([]);
});
