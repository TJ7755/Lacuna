import { describe, expect, it } from 'vitest';
import {
  clearForecastCache,
  dashboardForecasts,
  dashboardForecastHistories,
  dashboardKeepUpProjections,
  urgencyOrder,
} from './dashboardForecasts';
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
    expect(urgencyOrder(rows, NOW).map((row) => row.id)).toEqual([
      'biology',
      'chemistry',
      'french',
    ]);
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

  it('reuses keep-up estimates per course and recomputes after a review or changed history', () => {
    clearForecastCache();
    const cards = [card('a', 4)];
    const project = (
      values = cards,
      history: Parameters<typeof dashboardKeepUpProjections>[3] = [],
    ) => dashboardKeepUpProjections([course], [], values, history, NOW).bio;
    const first = project();
    expect(project()).toBe(first);
    const reviewed = [
      { ...cards[0], lastReviewed: NOW, stability: 12, due: NOW + 10 * DAY, reps: 3 },
    ];
    const next = project(reviewed);
    expect(next).not.toBe(first);
    expect(next[0].recall).toBeGreaterThan(first[0].recall);
    expect(
      project(reviewed, [
        {
          cardId: 'a',
          id: 'new-review',
          timestamp: NOW,
          grade: 3,
          responseTimeSec: 4,
          distracted: false,
          stabilityBefore: 4,
          stabilityAfter: 12,
          difficultyBefore: 5,
          difficultyAfter: 5,
          retrievabilityAtReview: 0.9,
        },
      ]),
    ).not.toBe(next);
    const steady = { ...course, examDate: undefined };
    expect(dashboardKeepUpProjections([steady], [], cards, [], NOW).bio).toBeUndefined();
  });

  it('distinguishes absent study data from a historical forecast', () => {
    const unstudied = { ...card('a', 4), stability: null, lastReviewed: null };
    const forecasts = dashboardForecasts([course], [], [unstudied], NOW);
    expect(
      dashboardForecastHistories([course], [], [unstudied], [], forecasts, NOW - DAY, NOW).bio,
    ).toEqual([]);
    const studied = card('a', 4);
    expect(
      dashboardForecastHistories([course], [], [studied], [], forecasts, NOW - DAY, NOW).bio.length,
    ).toBeGreaterThan(0);
  });
});
