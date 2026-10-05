import { describe, expect, it } from 'vitest';
import type { Card } from '../../db/types';
import { learntCardCount, plainFront, summariseLessonCard } from './lessonCardRow';

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c',
    conceptId: 'k',
    deckId: 'd',
    schedulingUnitId: 'd',
    type: 'front_back',
    front: 'What is **ATP**?',
    back: 'Energy',
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    history: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('lessonCardRow', () => {
  it('reduces markdown and cloze notation to plain words', () => {
    expect(plainFront(card())).toBe('What is ATP?');
    expect(plainFront(card({ type: 'cloze', front: 'Splits in the {{c1::cytoplasm::where?}}.' }))).toBe(
      'Splits in the cytoplasm.',
    );
    expect(plainFront(card({ front: 'What is the derivative of $e^x$?' }))).toBe(
      'What is the derivative of e^x?',
    );
  });

  it('classifies state and kind in the caption', () => {
    expect(summariseLessonCard(card(), 0)).toMatchObject({ tone: 'new', caption: 'Front / back · New' });
    expect(
      summariseLessonCard(card({ type: 'cloze', state: 2, lastReviewed: 1 }), 0),
    ).toMatchObject({ tone: 'review', caption: 'Cloze · Review' });
    expect(
      summariseLessonCard(card({ state: 3, lastReviewed: 1 }), 0),
    ).toMatchObject({ tone: 'lapsed', caption: 'Front / back · Relearning' });
  });

  it('treats suspended and buried cards as paused', () => {
    expect(summariseLessonCard(card({ suspended: true, state: 2, lastReviewed: 1 }), 0).tone).toBe(
      'paused',
    );
    expect(summariseLessonCard(card({ buriedUntil: 10 }), 5).tone).toBe('paused');
    expect(summariseLessonCard(card({ buriedUntil: 10 }), 20).tone).toBe('new');
  });

  it('counts only cards that have left the New state as learnt', () => {
    expect(
      learntCardCount([card(), card({ state: 2, lastReviewed: 1 }), card({ state: 1, lastReviewed: 2 })]),
    ).toBe(2);
  });
});
