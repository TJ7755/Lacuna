import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createCourse, createCourseCard } from '../db/repository';
import { hydrateCardsWithHistory } from '../db/reviewHistoryRead';
import { db } from '../db/schema';
import type { Card, Course, ReviewLog } from '../db/types';
import { addDays, reviewHeatmapRange } from '../fsrs/heatmap';
import { defaultFsrsParameters, FSRS_VERSION } from '../fsrs/params';
import { computeStudyStats } from '../fsrs/stats';
import { startOfDay } from '../utils/datetime';
import { projectCourseDashboardData, useCourseDashboardData } from './useCourseData';

function course(): Course {
  return {
    id: 'course',
    name: 'Biology',
    description: '',
    createdAt: 0,
    updatedAt: 0,
    fsrsVersion: FSRS_VERSION,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
    unlockMode: 'open',
    autoPractice: false,
    practiceThresholdMinutesFar: 30,
    practiceThresholdMinutesNear: 15,
    practiceUrgentWindowDays: 7,
    practiceMaxGap: 5,
  };
}

function review(timestamp: number): ReviewLog {
  return {
    timestamp,
    grade: 3,
    responseTimeSec: 5,
    distracted: false,
    stabilityBefore: null,
    stabilityAfter: 1,
    difficultyBefore: null,
    difficultyAfter: 5,
    retrievabilityAtReview: null,
  };
}

function card(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    conceptId: `concept-${id}`,
    courseId: 'course',
    deckId: 'course',
    schedulingUnitId: 'course',
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
    updatedAt: 0,
    suspended: false,
    buriedUntil: null,
    ...overrides,
  };
}

function project(cards: Card[], now: number) {
  return projectCourseDashboardData(
    {
      courses: [course()],
      lessons: [],
      cards,
      assessments: [],
      links: [],
      exposures: [],
      completions: [],
      performance: [],
    },
    now,
  );
}

function containsCardRecord(value: unknown, seen = new Set<unknown>()): boolean {
  if (value === null || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (
    'front' in value &&
    'back' in value &&
    'history' in value &&
    Array.isArray((value as { history?: unknown }).history)
  ) {
    return true;
  }
  const children = value instanceof Map ? [...value.entries()].flat() : Object.values(value);
  return children.some((child) => containsCardRecord(child, seen));
}

beforeEach(async () => {
  await Promise.all([
    db.cards.clear(),
    db.schedulingUnits.clear(),
    db.courses.clear(),
    db.lessons.clear(),
    db.courseAssessments.clear(),
    db.lessonCards.clear(),
    db.lessonCardExposures.clear(),
    db.lessonCompletions.clear(),
    db.reviewHistory.clear(),
    db.userPerformance.clear(),
    db.coursePerformance.clear(),
    db.schedulingUnits.clear(),
    db.schedulingPerformance.clear(),
  ]);
});

describe('useCourseDashboardData', () => {
  it('computes the complete StudyStats object from Course calibration', async () => {
    const course = await createCourse('Biology');
    const card = await createCourseCard(course.id, 'front_back', 'Cell', 'Unit of life');
    const now = Date.now();
    await db.cards.update(card.id, { due: now + 24 * 60 * 60 * 1000 });
    await db.coursePerformance.update(course.id, {
      runningMeanResponseTime: 30,
      runningStdDevResponseTime: 2,
      m2: 4,
      totalCorrectReviews: 5,
    });
    await db.schedulingPerformance.update(card.schedulingUnitId!, {
      runningMeanResponseTime: 5,
      totalCorrectReviews: 5,
    });
    await db.userPerformance.update(card.deckId!, {
      runningMeanResponseTime: 7,
      totalCorrectReviews: 5,
    });

    const persistedCards = await hydrateCardsWithHistory(await db.cards.toArray());
    const expected = computeStudyStats(persistedCards, new Map([[course.id, 30]]));
    const { result } = renderHook(() => useCourseDashboardData());

    await waitFor(() => expect(result.current?.stats).toEqual(expected));
  });

  it('returns only the compact dashboard projection while preserving card-derived details', async () => {
    const course = await createCourse('Biology');
    const card = await createCourseCard(course.id, 'front_back', 'Cell', 'Unit of life');
    const now = Date.now();
    const due = now + 60 * 60 * 1000;
    await db.cards.update(card.id, { due });
    await db.reviewHistory.add({
      id: 'review-1',
      cardId: card.id,
      courseId: course.id,
      timestamp: now,
      grade: 3,
      responseTimeSec: 5,
      distracted: false,
      stabilityBefore: null,
      stabilityAfter: 1,
      difficultyBefore: null,
      difficultyAfter: 5,
      retrievabilityAtReview: null,
    });

    const { result } = renderHook(() => useCourseDashboardData());

    await waitFor(() => expect(result.current?.courseDetails[course.id]).toBeDefined());
    expect(result.current).not.toHaveProperty('allCards');
    expect(result.current).not.toHaveProperty('lessons');
    expect(result.current?.courseDetails[course.id]).toEqual({
      nextDue: due,
      activityCounts: [...new Array<number>(13).fill(0), 1],
      activityTotal: 1,
    });
    expect(result.current?.reviewHeatmap.hasReviewHistory).toBe(true);
    expect(result.current?.reviewHeatmap.buckets.get(startOfDay(now))).toBe(1);
    expect(containsCardRecord(result.current)).toBe(false);
  });

  it('updates the compact projection after card and review-history writes', async () => {
    const createdCourse = await createCourse('Biology');
    const createdCard = await createCourseCard(
      createdCourse.id,
      'front_back',
      'Cell',
      'Unit of life',
    );
    const { result } = renderHook(() => useCourseDashboardData());
    await waitFor(() => expect(result.current?.courseDetails[createdCourse.id]).toBeDefined());

    const due = Date.now() + 60_000;
    await act(async () => {
      await db.cards.update(createdCard.id, { due });
      await db.reviewHistory.add({
        ...review(Date.now()),
        id: 'live-review',
        cardId: createdCard.id,
        courseId: createdCourse.id,
      });
    });

    await waitFor(() => {
      expect(result.current?.courseDetails[createdCourse.id]?.nextDue).toBe(due);
      expect(result.current?.courseDetails[createdCourse.id]?.activityTotal).toBe(1);
      expect(result.current?.reviewHeatmap.hasReviewHistory).toBe(true);
    });
    expect(containsCardRecord(result.current)).toBe(false);
  });
});

describe('projectCourseDashboardData', () => {
  it('uses the earliest non-suspended due card', () => {
    const now = new Date(2026, 8, 2, 12).getTime();
    const projection = project(
      [
        card('suspended', { due: now + 1_000, suspended: true }),
        card('later', { due: now + 3_000 }),
        card('earliest', { due: now + 2_000 }),
      ],
      now,
    );

    expect(projection.courseDetails.course?.nextDue).toBe(now + 2_000);
  });

  it('keeps exactly today and the preceding 13 local days in course activity', () => {
    const now = new Date(2026, 8, 20, 12).getTime();
    const today = startOfDay(now);
    const projection = project(
      [
        card('reviews', {
          history: [
            review(today + 1_000),
            review(addDays(today, -13) + 1_000),
            review(addDays(today, -14) + 1_000),
            review(addDays(today, 1) + 1_000),
          ],
        }),
      ],
      now,
    );

    expect(projection.courseDetails.course?.activityCounts).toEqual([
      1,
      ...new Array<number>(12).fill(0),
      1,
    ]);
    expect(projection.courseDetails.course?.activityTotal).toBe(2);
  });

  it('keeps the heatmap visible when every review falls outside its window', () => {
    const now = new Date(2026, 8, 2, 12).getTime();
    const { gridStart } = reviewHeatmapRange(now);
    const projection = project(
      [card('old-review', { history: [review(addDays(gridStart, -1))] })],
      now,
    );

    expect(projection.reviewHeatmap.hasReviewHistory).toBe(true);
    expect(projection.reviewHeatmap.buckets.size).toBe(0);
  });

  it('clips heatmap buckets to the Monday-aligned 26-week grid', () => {
    const now = new Date(2026, 8, 2, 12).getTime();
    const { gridStart, gridEnd } = reviewHeatmapRange(now);
    const projection = project(
      [
        card('clipping', {
          history: [
            review(addDays(gridStart, -1)),
            review(gridStart),
            review(gridEnd),
            review(addDays(gridEnd, 1)),
          ],
        }),
      ],
      now,
    );

    expect(new Date(gridStart).getDay()).toBe(1);
    expect(projection.reviewHeatmap.buckets).toEqual(
      new Map([
        [gridStart, 1],
        [gridEnd, 1],
      ]),
    );
  });
});
