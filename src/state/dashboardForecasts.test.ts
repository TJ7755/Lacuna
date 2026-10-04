import { describe, expect, it } from 'vitest';
import { clearForecastCache, dashboardForecasts, urgencyOrder } from './dashboardForecasts';
import { defaultFsrsParameters } from '../fsrs/params';
import type { Card, Course } from '../db/types';

const NOW = Date.UTC(2026, 4, 21);
const DAY = 86_400_000;

describe('urgencyOrder', () => {
  it('puts the nearest exam first and courses without one last', () => {
    const rows = [
      { id: 'french', due: 9 },
      { id: 'chemistry', examDate: NOW + 28 * DAY, due: 14 },
      { id: 'biology', examDate: NOW + 22 * DAY, due: 24 },
    ];
    expect(urgencyOrder(rows, NOW).map((row) => row.id)).toEqual(['biology', 'chemistry', 'french']);
  });

  it('treats a past exam like no exam and breaks ties by the larger workload', () => {
    const rows = [
      { id: 'old', examDate: NOW - DAY, due: 2 },
      { id: 'steady', due: 5 },
    ];
    expect(urgencyOrder(rows, NOW).map((row) => row.id)).toEqual(['steady', 'old']);
  });
});

describe('dashboardForecasts', () => {
  const course = {
    id: 'bio',
    name: 'Biology',
    examDate: NOW + 20 * DAY,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
  } as unknown as Course;
  const card = (id: string, stability: number) =>
    ({
      id,
      courseId: 'bio',
      primaryLessonId: null,
      stability,
      difficulty: 5,
      lastReviewed: NOW - DAY,
      reps: 2,
      lapses: 0,
      state: 2,
      due: NOW + DAY,
      history: [],
    }) as unknown as Card;

  it('reuses a course forecast until its cards change', () => {
    clearForecastCache();
    const cards = [card('a', 4), card('b', 9)];
    const first = dashboardForecasts([course], [], cards, NOW).bio;
    expect(dashboardForecasts([course], [], cards, NOW + 60_000).bio).toBe(first);
    const reviewed = [card('a', 12), card('b', 9)];
    expect(dashboardForecasts([course], [], reviewed, NOW + 60_000).bio).not.toBe(first);
  });
});

