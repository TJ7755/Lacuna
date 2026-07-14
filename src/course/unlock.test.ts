import { describe, expect, it } from 'vitest';
import type { Card, LessonCardExposure } from '../db/types';
import { lessonTaught, nextLessonUnlockCondition } from './unlock';

function makeCard(id: string): Card {
  return {
    id,
    deckId: 'd1',
    type: 'front_back',
    front: '',
    back: '',
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
  };
}

const exposure = (lessonId: string, cardId: string): LessonCardExposure => ({
  lessonId,
  cardId,
  taughtAt: 1,
});

describe('lessonTaught', () => {
  it('requires explicit completion for a cardless lesson', () => {
    expect(lessonTaught('l1', [], [], [])).toBe(false);
    expect(lessonTaught('l1', [], [], [{ lessonId: 'l1', completedAt: 1 }])).toBe(true);
  });

  it('requires an exposure in this lesson for every member card', () => {
    const cards = [makeCard('a'), makeCard('b')];
    expect(lessonTaught('l1', cards, [exposure('l1', 'a')], [])).toBe(false);
    expect(lessonTaught('l1', cards, [exposure('other', 'a'), exposure('l1', 'b')], [])).toBe(
      false,
    );
    expect(lessonTaught('l1', cards, [exposure('l1', 'a'), exposure('l1', 'b')], [])).toBe(true);
  });
});

describe('nextLessonUnlockCondition', () => {
  const cards = [makeCard('a')];
  const taught = [exposure('l1', 'a')];

  it('gates on lesson teaching alone when no practice node is present', () => {
    expect(nextLessonUnlockCondition('l1', cards, [], [], undefined)).toBe(false);
    expect(nextLessonUnlockCondition('l1', cards, taught, [], undefined)).toBe(true);
  });

  it('also requires completion when a practice node gates the slot', () => {
    expect(nextLessonUnlockCondition('l1', cards, taught, [], false)).toBe(false);
    expect(nextLessonUnlockCondition('l1', cards, taught, [], true)).toBe(true);
    expect(nextLessonUnlockCondition('l1', cards, [], [], true)).toBe(false);
  });

  it('supports a completed cardless lesson', () => {
    const completions = [{ lessonId: 'l1', completedAt: 1 }];
    expect(nextLessonUnlockCondition('l1', [], [], completions, undefined)).toBe(true);
    expect(nextLessonUnlockCondition('l1', [], [], completions, false)).toBe(false);
  });
});
