import { describe, expect, it } from 'vitest';
import type { Card, Course, Lesson } from '@lacuna/core/db/types';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from '@lacuna/core/fsrs/params';
import { makeExamDateContext } from '../fsrs/examDate';
import { card, NOW } from '../fsrs/session.testFixtures';
import { catchUpPracticePacing, catchUpPracticePool } from './catchUpPractice';

const course: Course = {
  id: 'course',
  name: 'Course',
  description: '',
  createdAt: 0,
  updatedAt: 0,
  fsrsVersion: FSRS_VERSION,
  fsrsParameters: defaultFsrsParameters(),
  examObjective: 'securedTopics',
  unlockMode: 'open',
  autoPractice: true,
  practiceThresholdMinutesFar: 8,
  practiceThresholdMinutesNear: 4,
  practiceUrgentWindowDays: 7,
  practiceMaxGap: 2,
  studyStartLessonId: 'current',
};
const lessons: Lesson[] = ['earlier', 'current', 'later'].map((id, orderIndex) => ({
  id,
  courseId: course.id,
  name: id,
  orderIndex,
  createdAt: 0,
  updatedAt: 0,
  isExtension: false,
}));
const fresh = (id: string, lessonId = 'earlier') =>
  card(id, course.id, { courseId: course.id, primaryLessonId: lessonId });
const unseen = (count: number) => Array.from({ length: count }, (_, i) => fresh(`card-${i}`));
function reviewed(id: string, at: number, lessonId = 'earlier'): Card {
  return {
    ...fresh(id, lessonId),
    state: 2,
    reps: 2,
    stability: 2,
    difficulty: 5,
    lastReviewed: at,
    due: NOW + MS_PER_DAY,
    history: [at, at + 1].map((timestamp) => ({
      timestamp,
      grade: 3,
      responseTimeSec: 1,
      distracted: false,
      stabilityBefore: null,
      stabilityAfter: 2,
      difficultyBefore: null,
      difficultyAfter: 5,
      retrievabilityAtReview: null,
    })),
  };
}
const context = (config = course, items = lessons) => makeExamDateContext(config, items, []);
const pacing = (scope: Card[], allCards = scope, config = course) =>
  catchUpPracticePacing(scope, allCards, config, context(config), NOW);
const pool = (cards: Card[], config = course, allowExtra = false) =>
  catchUpPracticePool(
    cards,
    config,
    lessons,
    [],
    context(config),
    new Set(['earlier', 'current']),
    NOW,
    new Set(['earlier']),
    allowExtra,
  );

describe('adaptive catch-up introductions', () => {
  it('defaults to twenty unique earlier cards without a course cap or exam', () => {
    expect(pacing(unseen(30))).toMatchObject({
      dailyTarget: 20,
      introducedToday: 0,
      remainingNewCount: 30,
      remainingNewAllowance: 20,
    });
    expect(pool(unseen(30))).toHaveLength(20);
    expect(pool(unseen(30)).map((c) => c.id)).toEqual(unseen(20).map((c) => c.id));
  });

  it('raises the daily target near an exam and reserves days for spaced reviews', () => {
    const near = { ...course, examDate: NOW + 6 * MS_PER_DAY };
    expect(pacing(unseen(90), undefined, near)).toMatchObject({
      dailyTarget: 30,
      remainingNewAllowance: 30,
    });
    expect(pool(unseen(90), { ...near, newCardsPerDay: 1 })).toHaveLength(30);
    expect(
      pacing(unseen(90), undefined, { ...near, examDate: NOW + MS_PER_DAY / 2 }),
    ).toMatchObject({ dailyTarget: 90 });
  });

  it("uses each card's applicable deadline rather than accelerating later topics unnecessarily", () => {
    const items = lessons.map((lesson) =>
      lesson.id === 'earlier' ? { ...lesson, examDate: NOW + 2 * MS_PER_DAY } : lesson,
    );
    const early = unseen(30);
    const later = Array.from({ length: 30 }, (_, i) => fresh(`later-${i}`, 'current'));
    const config = { ...course, examDate: NOW + 60 * MS_PER_DAY };
    expect(
      catchUpPracticePacing(
        [...early, ...later],
        [...early, ...later],
        config,
        context(config, items),
        NOW,
      ).dailyTarget,
    ).toBe(30);
  });

  it('counts distinct first reviews in a rolling day and keeps the target stable as cards are introduced', () => {
    const config = { ...course, examDate: NOW + 6 * MS_PER_DAY };
    const introduced = Array.from({ length: 10 }, (_, i) => reviewed(`seen-${i}`, NOW - 100));
    expect(pacing([...unseen(80), ...introduced], undefined, config)).toMatchObject({
      dailyTarget: 30,
      introducedToday: 10,
      remainingNewAllowance: 20,
    });
    const old = reviewed('old', NOW - MS_PER_DAY);
    old.history.push({ ...old.history[0], timestamp: NOW - 1 });
    expect(pacing([old, ...unseen(30)])).toMatchObject({
      introducedToday: 0,
      remainingNewAllowance: 20,
    });
  });

  it('accounts for current-lesson introductions without stealing the catch-up target', () => {
    const scope = unseen(30);
    const current = Array.from({ length: 12 }, (_, i) =>
      reviewed(`current-${i}`, NOW - 10, 'current'),
    );
    expect(pacing(scope, [...scope, ...current], { ...course, newCardsPerDay: 10 })).toMatchObject({
      introducedToday: 0,
      remainingNewAllowance: 20,
      effectiveNewCardsPerDay: 32,
    });
    expect(pacing(scope, [...scope, ...current], { ...course, newCardsPerDay: 40 })).toMatchObject({
      remainingNewAllowance: 28,
      effectiveNewCardsPerDay: 40,
    });
  });

  it('does not charge existing reviews or reset cards against unseen introductions', () => {
    const introduced = Array.from({ length: 20 }, (_, i) => reviewed(`seen-${i}`, NOW - 100));
    const due = { ...reviewed('due', NOW - 2 * MS_PER_DAY), due: NOW - 1 };
    const reset = {
      ...reviewed('reset', NOW - 2 * MS_PER_DAY),
      state: 0 as const,
      lastReviewed: null,
      stability: null,
      due: null,
    };
    expect(pool([...introduced, due, reset, ...unseen(5)]).map((c) => c.id)).toEqual([
      'due',
      'reset',
    ]);
  });

  it('allows continued extra practice while retaining access and FSRS utility rules', () => {
    const cards = [
      ...unseen(25),
      { ...fresh('suspended'), suspended: true },
      { ...fresh('buried'), buriedUntil: NOW + MS_PER_DAY },
      fresh('current', 'current'),
    ];
    expect(pool(cards)).toHaveLength(20);
    expect(pool(cards, course, true)).toHaveLength(25);
    expect(pool(cards, { ...course, archived: true }, true)).toEqual([]);
  });
});
