import { describe, it, expect } from 'vitest';
import { examEveAvailable, cramOrder, EXAM_EVE_WINDOW_HOURS } from './cram';
import { makeObjectiveContext } from './objective';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from './params';
import type { Card, Deck, ExamObjective } from '../db/types';

const HOUR = 60 * 60 * 1000;

function makeDeck(objective: ExamObjective, examDate: number, overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'd1',
    name: 'Deck',
    examDate,
    createdAt: 0,
    fsrsVersion: FSRS_VERSION,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: objective,
    ...overrides,
  };
}

function card(
  id: string,
  stability: number,
  lastReviewed: number,
  overrides: Partial<Card> = {},
): Card {
  return {
    id,
    deckId: 'd1',
    type: 'front_back',
    front: '',
    back: '',
    stability,
    difficulty: 5,
    lastReviewed,
    reps: 1,
    lapses: 0,
    state: 2,
    due: lastReviewed,
    scheduledDays: 1,
    learningSteps: 0,
    history: [],
    createdAt: 0,
    ...overrides,
  };
}

describe('examEveAvailable', () => {
  const now = 10 * MS_PER_DAY;
  it('is true within the window and ahead of the exam', () => {
    expect(examEveAvailable(makeDeck('expectedMarks', now + 24 * HOUR), now)).toBe(true);
  });
  it('is false outside the window', () => {
    expect(
      examEveAvailable(makeDeck('expectedMarks', now + (EXAM_EVE_WINDOW_HOURS + 1) * HOUR), now),
    ).toBe(false);
  });
  it('is false once the exam has passed', () => {
    expect(examEveAvailable(makeDeck('expectedMarks', now - HOUR), now)).toBe(false);
  });
  it('is false for an archived deck', () => {
    expect(
      examEveAvailable(makeDeck('expectedMarks', now + HOUR, { archived: true }), now),
    ).toBe(false);
  });
});

describe('cramOrder prioritises the weakest cards', () => {
  const now = 10 * MS_PER_DAY;
  const examDate = now + 24 * HOUR; // within the cram window
  const weak = card('weak', 0.5, now); // below 0.90 on exam day
  const middling = card('mid', 5, now); // above 0.90 (secured)
  const strong = card('strong', 200, now); // ~certain on exam day

  it('orders weakest first under expectedMarks', () => {
    const oc = makeObjectiveContext(makeDeck('expectedMarks', examDate));
    const order = cramOrder([strong, weak, middling], oc, now).map((c) => c.id);
    expect(order).toEqual(['weak', 'mid', 'strong']);
  });

  it('orders the unsecured card ahead of secured ones under securedTopics', () => {
    const oc = makeObjectiveContext(makeDeck('securedTopics', examDate));
    const order = cramOrder([strong, weak, middling], oc, now).map((c) => c.id);
    // The only card still below 0.90 is served first; already-secured cards follow.
    expect(order[0]).toBe('weak');
    expect(order.indexOf('weak')).toBeLessThan(order.indexOf('mid'));
    expect(order.indexOf('weak')).toBeLessThan(order.indexOf('strong'));
  });

  it('orders cards by their resolved per-card exam horizons', () => {
    const sameStability = 10;
    const near = card('near', sameStability, now, { primaryLessonId: 'nearLesson' });
    const far = card('far', sameStability, now, { primaryLessonId: 'farLesson' });
    const deck = makeDeck('expectedMarks', examDate);
    const examDateContext = {
      courseExamDate: deck.examDate,
      lessonsById: new Map([
        [
          'nearLesson',
          {
            id: 'nearLesson',
            courseId: 'course1',
            name: 'Near',
            orderIndex: 0,
            createdAt: now,
            isExtension: false,
            examDate: now + HOUR,
          },
        ],
        [
          'farLesson',
          {
            id: 'farLesson',
            courseId: 'course1',
            name: 'Far',
            orderIndex: 1,
            createdAt: now,
            isExtension: false,
            examDate: now + 30 * MS_PER_DAY,
          },
        ],
      ]),
      courseExamDates: [],
    };
    const oc = makeObjectiveContext(deck, examDateContext);

    expect(cramOrder([near, far], oc, now).map((entry) => entry.id)).toEqual([
      'far',
      'near',
    ]);
  });
});
