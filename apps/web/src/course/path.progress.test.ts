import { describe, it, expect } from 'vitest';
import {
  lessonStatus,
  buildPath,
  pathPosition,
  nearestExamDate,
  examIsUrgent,
  EXAM_URGENT_DAYS,
} from './path';
import { MS_PER_DAY } from '@lacuna/core/fsrs/params';
import { type Card } from '@lacuna/core/db/types';
import { makeCourse, makeLesson, makeCard, makeExamDate } from './path.testFixtures';

describe('lessonStatus', () => {
  it('returns locked when not unlocked', () => {
    expect(lessonStatus(false, 'l1', [], [], [])).toBe('locked');
    expect(lessonStatus(false, 'l1', [makeCard({ id: 'a', deckId: 'd', state: 2 })], [], [])).toBe(
      'locked',
    );
  });

  it('requires explicit completion for an unlocked lesson with zero cards', () => {
    expect(lessonStatus(true, 'l1', [], [], [])).toBe('available');
    expect(
      lessonStatus(true, 'l1', [], [], [{ lessonId: 'l1', completedAt: 1, updatedAt: 1 }]),
    ).toBe('completed');
  });

  it('returns completed when every member card has a lesson-scoped exposure', () => {
    const cards = [
      makeCard({ id: 'a', deckId: 'd', state: 0 }),
      makeCard({ id: 'b', deckId: 'd', state: 0 }),
    ];
    expect(
      lessonStatus(
        true,
        'l1',
        cards,
        [
          { lessonId: 'l1', cardId: 'a', taughtAt: 1, updatedAt: 1 },
          { lessonId: 'l1', cardId: 'b', taughtAt: 1, updatedAt: 1 },
        ],
        [],
      ),
    ).toBe('completed');
  });

  it('returns available when at least one member lacks an exposure in this lesson', () => {
    const cards = [
      makeCard({ id: 'a', deckId: 'd', state: 2 }),
      makeCard({ id: 'b', deckId: 'd', state: 2 }),
    ];
    expect(
      lessonStatus(
        true,
        'l1',
        cards,
        [
          { lessonId: 'other', cardId: 'a', taughtAt: 1, updatedAt: 1 },
          { lessonId: 'l1', cardId: 'b', taughtAt: 1, updatedAt: 1 },
        ],
        [],
      ),
    ).toBe('available');
  });

  it('uses real scheduling state for a course that skips introductions', () => {
    const newCard = makeCard({ id: 'new', deckId: 'd', state: 0 });
    const scheduledCard = makeCard({ id: 'scheduled', deckId: 'd', state: 1 });
    expect(lessonStatus(true, 'l1', [newCard, scheduledCard], [], [], false)).toBe('available');
    expect(lessonStatus(true, 'l1', [scheduledCard], [], [], false)).toBe('completed');
  });
});

describe('pathPosition', () => {
  it('counts non-extension lessons in the total', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'open' });
    const lessons = [
      makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 }),
      makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 1 }),
      makeLesson({ id: 'ext', courseId: 'c1', orderIndex: 2, isExtension: true }),
    ];
    const nodes = buildPath(course, lessons, [], new Map());
    const pos = pathPosition(nodes);
    expect(pos.total).toBe(2); // extension excluded
  });

  it('counts completed and available lessons as reached, not locked ones', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'semi-linear' });
    const l1 = makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 }); // first core -> available/completed
    const l2 = makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 1, unlockedAt: 5 }); // available
    const l3 = makeLesson({ id: 'l3', courseId: 'c1', orderIndex: 2 }); // locked
    const lessons = [l1, l2, l3];
    const cardsById = new Map<string, Card[]>([
      ['l1', [makeCard({ id: 'a', deckId: 'd', state: 2 })]], // completed
    ]);
    const nodes = buildPath(course, lessons, [], cardsById, [], 0, 0, Date.now(), {
      exposures: [{ lessonId: 'l1', cardId: 'a', taughtAt: 1, updatedAt: 1 }],
      lessonCompletions: [],
      practiceMilestones: [],
    });
    const pos = pathPosition(nodes);
    expect(pos.total).toBe(3);
    expect(pos.reached).toBe(2); // l1 completed + l2 available; l3 locked
  });

  it('excludes checkpoint nodes from position counts', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'open' });
    const lessons = [makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 })];
    const checkpoint = makeExamDate({ id: 'cp1', courseId: 'c1' });
    const nodes = buildPath(course, lessons, [checkpoint], new Map());
    const pos = pathPosition(nodes);
    expect(pos.total).toBe(1);
    expect(pos.reached).toBe(1);
  });
});

describe('nearestExamDate', () => {
  it('returns course.examDate when there are no checkpoints', () => {
    const course = makeCourse({ id: 'c1', examDate: 10 * MS_PER_DAY });
    expect(nearestExamDate(course, [], 0)).toBe(10 * MS_PER_DAY);
  });

  it('returns the soonest future date across course.examDate and checkpoints', () => {
    const course = makeCourse({ id: 'c1', examDate: 20 * MS_PER_DAY });
    const checkpoints = [
      makeExamDate({ id: 'cp1', courseId: 'c1', examDate: 5 * MS_PER_DAY }),
      makeExamDate({ id: 'cp2', courseId: 'c1', examDate: 12 * MS_PER_DAY }),
    ];
    expect(nearestExamDate(course, checkpoints, 0)).toBe(5 * MS_PER_DAY);
  });

  it('ignores dates that have already passed', () => {
    const course = makeCourse({ id: 'c1', examDate: 20 * MS_PER_DAY });
    const checkpoints = [makeExamDate({ id: 'cp1', courseId: 'c1', examDate: 5 * MS_PER_DAY })];
    expect(nearestExamDate(course, checkpoints, 8 * MS_PER_DAY)).toBe(20 * MS_PER_DAY);
  });

  it('falls back to course.examDate even if it has already passed', () => {
    const course = makeCourse({ id: 'c1', examDate: 5 * MS_PER_DAY });
    expect(nearestExamDate(course, [], 8 * MS_PER_DAY)).toBe(5 * MS_PER_DAY);
  });
});

describe('examIsUrgent', () => {
  it('is false when the exam is in the past', () => {
    expect(examIsUrgent(5 * MS_PER_DAY, 8 * MS_PER_DAY)).toBe(false);
  });

  it('is false when the exam is further away than EXAM_URGENT_DAYS', () => {
    const now = 0;
    const nearestExam = now + (EXAM_URGENT_DAYS + 1) * MS_PER_DAY;
    expect(examIsUrgent(nearestExam, now)).toBe(false);
  });

  it('is true when the exam is within EXAM_URGENT_DAYS and still upcoming', () => {
    const now = 0;
    const nearestExam = now + (EXAM_URGENT_DAYS - 1) * MS_PER_DAY;
    expect(examIsUrgent(nearestExam, now)).toBe(true);
  });
});
