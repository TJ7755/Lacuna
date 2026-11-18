import 'fake-indexeddb/auto';
import type { ReactNode } from 'react';
import { ShellCourseDataProvider } from './ShellCourseData';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createCourse, createCourseCard, createLesson } from '../db/repository';
import { db } from '../db/schema';
import { useCourseDashboardData, useSidebarData } from './useCourseData';

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
  it('uses course calibration for the dashboard and scheduling-unit calibration for the sidebar', async () => {
    const course = await createCourse('Biology');
    const card = await createCourseCard(course.id, 'front_back', 'Cell', 'Unit of life');
    const lesson = await createLesson(course.id, 'Introduction');
    await db.lessonCompletions.put({
      lessonId: lesson.id,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
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

    const { result } = renderHook(
      () => ({ dashboard: useCourseDashboardData(), sidebar: useSidebarData() }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <ShellCourseDataProvider includeDashboard>{children}</ShellCourseDataProvider>
        ),
      },
    );

    await waitFor(() => expect(result.current.dashboard?.stats.forecast[1].minutes).toBe(0.5));
    expect(result.current.dashboard?.stats).toMatchObject({ streak: 0, reviewedToday: 0 });
    expect(result.current.sidebar?.stats.forecast[1].minutes).toBeCloseTo(5 / 60);
    expect(result.current.dashboard?.summaries[course.id].completedLessonCount).toBe(1);
    expect(result.current.sidebar?.summaries[course.id].completedLessonCount).toBe(0);
  });
});
