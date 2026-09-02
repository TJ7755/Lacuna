import 'fake-indexeddb/auto';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createCourse, createCourseCard } from '../db/repository';
import { hydrateCardsWithHistory } from '../db/reviewHistoryRead';
import { db } from '../db/schema';
import { computeStudyStats } from '../fsrs/stats';
import { startOfDay } from '../utils/datetime';
import { useCourseDashboardData } from './useCourseData';

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
});
