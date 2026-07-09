import { describe, it, expect } from 'vitest';
import { lessonTaught, nextLessonUnlockCondition } from './unlock';
import type { Card } from '../db/types';

// ---------------------------------------------------------------------------
// Fixture helpers (mirroring path.test.ts)
// ---------------------------------------------------------------------------

function makeCard(overrides: Partial<Card> & Pick<Card, 'id' | 'deckId'>): Card {
  return {
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// lessonTaught
// ---------------------------------------------------------------------------

describe('lessonTaught', () => {
  it('is taught when there are no cards', () => {
    expect(lessonTaught([])).toBe(true);
  });

  it('is not taught when every card is still New', () => {
    const cards = [
      makeCard({ id: 'c1', deckId: 'd1', state: 0 }),
      makeCard({ id: 'c2', deckId: 'd1', state: 0 }),
    ];
    expect(lessonTaught(cards)).toBe(false);
  });

  it('is not taught when only some cards have been served', () => {
    const cards = [
      makeCard({ id: 'c1', deckId: 'd1', state: 1 }),
      makeCard({ id: 'c2', deckId: 'd1', state: 0 }),
    ];
    expect(lessonTaught(cards)).toBe(false);
  });

  it('is taught when every card has been served, regardless of grade/state value', () => {
    const cards = [
      makeCard({ id: 'c1', deckId: 'd1', state: 1 }),
      makeCard({ id: 'c2', deckId: 'd1', state: 3 }),
    ];
    expect(lessonTaught(cards)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// nextLessonUnlockCondition
// ---------------------------------------------------------------------------

describe('nextLessonUnlockCondition', () => {
  it('gates on lessonTaught alone when no practice node is present', () => {
    const untaught = [makeCard({ id: 'c1', deckId: 'd1', state: 0 })];
    const taught = [makeCard({ id: 'c1', deckId: 'd1', state: 2 })];

    expect(nextLessonUnlockCondition(untaught, undefined)).toBe(false);
    expect(nextLessonUnlockCondition(taught, undefined)).toBe(true);
  });

  it('unlocks when taught and the practice node reached its objective', () => {
    const taught = [makeCard({ id: 'c1', deckId: 'd1', state: 2 })];
    expect(nextLessonUnlockCondition(taught, true)).toBe(true);
  });

  it('stays locked when taught but the practice node has not reached its objective', () => {
    const taught = [makeCard({ id: 'c1', deckId: 'd1', state: 2 })];
    expect(nextLessonUnlockCondition(taught, false)).toBe(false);
  });

  it('stays locked when untaught even if the practice node reached its objective', () => {
    const untaught = [makeCard({ id: 'c1', deckId: 'd1', state: 0 })];
    expect(nextLessonUnlockCondition(untaught, true)).toBe(false);
  });

  it('treats an all-New lesson as locked regardless of practice state', () => {
    const allNew = [
      makeCard({ id: 'c1', deckId: 'd1', state: 0 }),
      makeCard({ id: 'c2', deckId: 'd1', state: 0 }),
    ];
    expect(nextLessonUnlockCondition(allNew, undefined)).toBe(false);
    expect(nextLessonUnlockCondition(allNew, false)).toBe(false);
    expect(nextLessonUnlockCondition(allNew, true)).toBe(false);
  });

  it('unlocks a zero-card lesson when there is no practice node', () => {
    expect(nextLessonUnlockCondition([], undefined)).toBe(true);
  });

  it('gates a zero-card lesson on the practice node when one is present', () => {
    expect(nextLessonUnlockCondition([], true)).toBe(true);
    expect(nextLessonUnlockCondition([], false)).toBe(false);
  });
});
