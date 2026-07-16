import { describe, it, expect } from 'vitest';
import { cardSchedulingHorizon, schedulingHorizon, MAINTENANCE_HORIZON_DAYS } from './horizon';
import { studyPool } from './eligibility';
import { progressValue } from './objective';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from './params';
import type { Card, Deck } from '../db/types';

function makeDeck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'd1',
    name: 'Deck',
    examDate: Date.now() + 5 * MS_PER_DAY,
    createdAt: Date.now(),
    fsrsVersion: FSRS_VERSION,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
    ...overrides,
  };
}

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    deckId: 'd1',
    type: 'front_back',
    front: 'q',
    back: 'a',
    stability: 2,
    difficulty: 5,
    lastReviewed: Date.now(),
    reps: 1,
    lapses: 0,
    state: 2,
    due: Date.now() + MS_PER_DAY,
    scheduledDays: 1,
    learningSteps: 0,
    history: [],
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('schedulingHorizon', () => {
  it('targets the exam date while it is in the future', () => {
    const now = Date.now();
    const examDate = now + 3 * MS_PER_DAY;
    expect(schedulingHorizon(makeDeck({ examDate }), now)).toBe(examDate);
  });

  it('falls back to a rolling maintenance horizon once the exam has passed', () => {
    const now = Date.now();
    const deck = makeDeck({ examDate: now - 10 * MS_PER_DAY });
    expect(schedulingHorizon(deck, now)).toBe(now + MAINTENANCE_HORIZON_DAYS * MS_PER_DAY);
  });

  it('does not pin progress to 100% after the exam passes (no bogus mastery)', () => {
    const now = Date.now();
    // A card last reviewed at the exam date, with modest stability, must decay over
    // the rolling horizon rather than reading as fully retained.
    const deck = makeDeck({ examDate: now - 2 * MS_PER_DAY });
    const card = makeCard({ stability: 2, lastReviewed: now - 2 * MS_PER_DAY });
    const value = progressValue([card], deck, now);
    expect(Number.isNaN(value)).toBe(false);
    expect(value).toBeLessThan(1);
    expect(value).toBeGreaterThan(0);
  });
});

describe('cardSchedulingHorizon', () => {
  it('uses the card exam date resolved from its primary lesson', () => {
    const now = Date.now();
    const lessonExamDate = now + 2 * MS_PER_DAY;
    const deck = makeDeck({ examDate: now + 30 * MS_PER_DAY });
    const card = makeCard({ primaryLessonId: 'lesson1' });
    const examDateContext = {
      courseExamDate: deck.examDate,
      lessonsById: new Map([
        [
          'lesson1',
          {
            id: 'lesson1',
            courseId: 'course1',
            name: 'Lesson',
            orderIndex: 0,
            createdAt: now,
            isExtension: false,
            examDate: lessonExamDate,
          },
        ],
      ]),
      courseAssessments: [],
    };

    expect(cardSchedulingHorizon(card, deck, examDateContext, now)).toBe(lessonExamDate);
  });

  it('uses the rolling maintenance horizon when the resolved card date has passed', () => {
    const now = Date.now();
    const deck = makeDeck({ examDate: now + 30 * MS_PER_DAY });
    const card = makeCard({ primaryLessonId: 'lesson1' });
    const examDateContext = {
      courseExamDate: deck.examDate,
      lessonsById: new Map([
        [
          'lesson1',
          {
            id: 'lesson1',
            courseId: 'course1',
            name: 'Lesson',
            orderIndex: 0,
            createdAt: now,
            isExtension: false,
            examDate: now - MS_PER_DAY,
          },
        ],
      ]),
      courseAssessments: [],
    };

    expect(cardSchedulingHorizon(card, deck, examDateContext, now)).toBe(
      now + MAINTENANCE_HORIZON_DAYS * MS_PER_DAY,
    );
  });
});

describe('archived decks', () => {
  it('are withdrawn from the study pool entirely', () => {
    const now = Date.now();
    const cards = [makeCard({ id: 'a' }), makeCard({ id: 'b' })];
    expect(studyPool(cards, makeDeck(), now)).toHaveLength(2);
    expect(studyPool(cards, makeDeck({ archived: true }), now)).toHaveLength(0);
  });

  it('still report progress for their retained cards', () => {
    const now = Date.now();
    const card = makeCard({ stability: 50, lastReviewed: now });
    const value = progressValue([card], makeDeck({ archived: true }), now);
    expect(Number.isNaN(value)).toBe(false);
    expect(value).toBeGreaterThan(0);
  });
});
