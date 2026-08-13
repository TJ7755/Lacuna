import 'fake-indexeddb/auto';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createCourse, createCourseCard } from '../db/repository';
import { hydrateCardsWithHistory } from '../db/reviewHistoryRead';
import { db } from '../db/schema';
import { computeStudyStats } from '../fsrs/stats';
import { useCourseDashboardData } from './useCourseData';

beforeEach(async () => {
  await Promise.all([
    db.cards.clear(),
    db.decks.clear(),
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
    await db.userPerformance.update(card.deckId, {
      runningMeanResponseTime: 7,
      totalCorrectReviews: 5,
    });

    const persistedCards = await hydrateCardsWithHistory(await db.cards.toArray());
    const expected = computeStudyStats(persistedCards, new Map([[course.id, 30]]));
    const { result } = renderHook(() => useCourseDashboardData());

    await waitFor(() => expect(result.current?.stats).toEqual(expected));
  });
});
