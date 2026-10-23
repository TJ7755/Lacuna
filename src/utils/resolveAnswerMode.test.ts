import { describe, expect, it } from 'vitest';
import type { Card } from '../db/types';
import { JEV_TYPED_MAX_PARTS } from '../jev/protocol';
import {
  PREFERRED_TYPING_MAX_CHARACTERS,
  resolveAnswerMode,
  reviewAnswerInput,
} from './resolveAnswerMode';

const card = { type: 'front_back', front: 'Question', back: 'Answer' } as Card;

describe('resolveAnswerMode', () => {
  it.each(['course', 'type', 'reveal'] as const)(
    'keeps structural eligibility and card opt-outs under %s',
    (preference) => {
      expect(
        resolveAnswerMode({ ...card, type: 'unsupported' as Card['type'] }, 'type', preference),
      ).toBe('reveal');
      expect(
        resolveAnswerMode({ ...card, payload: { v: 1, kind: 'scaffold' } }, 'type', preference),
      ).toBe('reveal');
      expect(resolveAnswerMode({ ...card, answerMode: 'reveal' }, 'type', preference)).toBe(
        'reveal',
      );
      expect(resolveAnswerMode({ ...card, occlusionRegionId: 'region' }, 'type', preference)).toBe(
        'reveal',
      );
    },
  );

  it('follows card, lesson and fallback suggestions in course mode', () => {
    expect(resolveAnswerMode(card, undefined, 'course')).toBe('reveal');
    expect(resolveAnswerMode(card, 'reveal', 'course')).toBe('reveal');
    expect(resolveAnswerMode(card, 'type', 'course')).toBe('type');
    expect(resolveAnswerMode({ ...card, answerMode: 'type' }, 'reveal', 'course')).toBe('type');
  });

  it('lets the learner override suggestions', () => {
    expect(resolveAnswerMode(card, undefined, 'type')).toBe('type');
    expect(resolveAnswerMode(card, 'reveal', 'type')).toBe('type');
    expect(resolveAnswerMode(card, 'type', 'reveal')).toBe('reveal');
    expect(resolveAnswerMode({ ...card, answerMode: 'type' }, 'type', 'reveal')).toBe('reveal');
  });

  const unsuitable = [
    '![Diagram](https://example.com/image.png)',
    '![Diagram][figure]\n\n[figure]: https://example.com/image.png',
    '<img src="https://example.com/image.png" alt="Diagram">',
    '| Name | Value |\n| --- | --- |\n| A | B |',
    '<table><tr><td>A</td></tr></table>',
    'x'.repeat(PREFERRED_TYPING_MAX_CHARACTERS + 1),
    Array.from({ length: JEV_TYPED_MAX_PARTS + 1 }, (_, i) => `part ${i}`).join(', '),
    Array.from({ length: JEV_TYPED_MAX_PARTS + 1 }, (_, i) => `- part ${i}`).join('\n'),
  ];
  it.each(unsuitable)('limits only typing introduced by the preference: %s', (back) => {
    const shaped = { ...card, back };
    expect(resolveAnswerMode(shaped, 'reveal', 'type')).toBe('reveal');
    expect(resolveAnswerMode(shaped, 'type', 'type')).toBe('type');
    expect(resolveAnswerMode(shaped, 'type', 'course')).toBe('type');
    expect(resolveAnswerMode({ ...shaped, answerMode: 'type' }, 'reveal', 'type')).toBe('type');
  });

  it('uses rendered text, the inclusive limits and cloze answers', () => {
    expect(
      resolveAnswerMode(
        { ...card, back: `**${'x'.repeat(PREFERRED_TYPING_MAX_CHARACTERS)}**` },
        undefined,
        'type',
      ),
    ).toBe('type');
    expect(
      resolveAnswerMode(
        {
          ...card,
          back: Array.from({ length: JEV_TYPED_MAX_PARTS }, (_, i) => `part ${i}`).join(', '),
        },
        undefined,
        'type',
      ),
    ).toBe('type');
    expect(
      resolveAnswerMode(
        {
          ...card,
          type: 'cloze',
          front: `${'context '.repeat(100)}{{c1::Paris}}`,
          back: unsuitable[0],
        },
        undefined,
        'type',
      ),
    ).toBe('type');
    expect(
      resolveAnswerMode(
        { ...card, type: 'cloze', front: `{{c1::${unsuitable[5]}}}` },
        undefined,
        'type',
      ),
    ).toBe('reveal');
  });

  it('uses resolved occlusion answer text for eligibility and shape', () => {
    const occlusion = { ...card, occlusionRegionId: 'region', back: unsuitable[5] };
    expect(resolveAnswerMode(occlusion, 'reveal', 'type', 'Paris')).toBe('type');
    expect(resolveAnswerMode(occlusion, 'type', 'course', 'Paris')).toBe('type');
    for (const answer of unsuitable)
      expect(resolveAnswerMode(occlusion, 'reveal', 'type', answer)).toBe('reveal');
    expect(resolveAnswerMode({ ...occlusion, answerMode: 'reveal' }, 'type', 'type', 'Paris')).toBe(
      'reveal',
    );
  });
});

it('omits review input for lines and payload faces', () => {
  expect(reviewAnswerInput(card, false, true)).toBe('typed');
  expect(reviewAnswerInput(card, false, false)).toBe('reveal');
  expect(reviewAnswerInput(card, true, true)).toBeUndefined();
  expect(reviewAnswerInput({ payload: null as never }, false, false)).toBe('reveal');
  expect(reviewAnswerInput({ payload: { v: 1, kind: 'scaffold' } }, false, false)).toBeUndefined();
});
