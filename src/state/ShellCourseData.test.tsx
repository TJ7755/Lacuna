import 'fake-indexeddb/auto';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { createCourse, createCourseCard } from '../db/repository';
import { db } from '../db/schema';
import { ShellCourseDataProvider, useCourseDashboardData, useSidebarData } from './ShellCourseData';
import { reviewHistoryEntriesForCard } from '../db/reviewHistory';
import type { ReviewLog } from '../db/types';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

it('keeps activity and new-card caps correct without reading full review records', async () => {
  const now = new Date(2026, 8, 6, 12).getTime();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  try {
    const course = await createCourse('Activity');
    await db.courses.update(course.id, { newCardsPerDay: 1 });
    const introduced = await createCourseCard(course.id, 'front_back', 'Introduced', 'Answer');
    const due = await createCourseCard(course.id, 'front_back', 'Due', 'Answer');
    await createCourseCard(course.id, 'front_back', 'New', 'Answer');
    const review = (timestamp: number): ReviewLog => ({
      timestamp,
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      stabilityBefore: null,
      stabilityAfter: 2,
      difficultyBefore: null,
      difficultyAfter: 5,
      retrievabilityAtReview: null,
    });
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    await db.reviewHistory.bulkAdd([
      ...reviewHistoryEntriesForCard({ ...introduced, history: [review(now)] }),
      ...reviewHistoryEntriesForCard({
        ...due,
        history: [review(yesterday.getTime()), review(now)],
      }),
    ]);
    await db.cards.update(introduced.id, { state: 2, lastReviewed: now, due: now + 86_400_000 });
    await db.cards.update(due.id, { state: 2, lastReviewed: now, due: now - 1 });
    const reading = vi.fn((value) => value);
    db.reviewHistory.hook('reading', reading);
    try {
      const { result, unmount } = renderHook(
        () => ({
          sidebar: useSidebarData(),
          dashboard: useCourseDashboardData(),
        }),
        {
          wrapper: ({ children }: { children: ReactNode }) => (
            <ShellCourseDataProvider includeDashboard>{children}</ShellCourseDataProvider>
          ),
        },
      );
      await waitFor(() => expect(result.current.dashboard?.stats.reviewedToday).toBe(2));
      expect(result.current.dashboard?.stats.streak).toBe(2);
      expect(result.current.sidebar?.summaries[course.id].eligible).toBe(1);
      expect(result.current.dashboard?.summaries[course.id].reviewedTodayCount).toBe(2);
      expect(reading).not.toHaveBeenCalled();
      unmount();
    } finally {
      db.reviewHistory.hook('reading').unsubscribe(reading);
    }
  } finally {
    clock.mockRestore();
  }
});

it('batches scheduling performance across courses and retains only derived navigation data', async () => {
  const first = await createCourse('Biology');
  const second = await createCourse('Chemistry');
  const a = await createCourseCard(first.id, 'front_back', 'Cell', 'Unit of life');
  const b = await createCourseCard(second.id, 'front_back', 'Atom', 'Element unit');
  const performance = vi.spyOn(db.schedulingPerformance, 'bulkGet');
  const supplements = [
    db.lessonCards,
    db.lessonCardExposures,
    db.lessonCompletions,
    db.coursePerformance,
  ].map((table) => vi.spyOn(table, 'toArray'));
  const { result } = renderHook(
    () => ({ sidebar: useSidebarData(), dashboard: useCourseDashboardData() }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ShellCourseDataProvider>{children}</ShellCourseDataProvider>
      ),
    },
  );
  await waitFor(() => expect(result.current.sidebar?.courses).toHaveLength(2));
  expect(performance).toHaveBeenCalledTimes(1);
  expect(performance.mock.calls[0][0]).toEqual(
    expect.arrayContaining([a.schedulingUnitId, b.schedulingUnitId]),
  );
  expect(result.current.dashboard).toBeUndefined();
  expect(Object.keys(result.current.sidebar!).sort()).toEqual([
    'courses',
    'lessons',
    'stats',
    'summaries',
  ]);
  for (const query of supplements) expect(query).not.toHaveBeenCalled();
});
