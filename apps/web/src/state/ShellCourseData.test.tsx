import 'fake-indexeddb/auto';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { createCourse, createCourseCard } from '../db/repository';
import { db } from '../db/schema';
import {
  ShellCourseDataProvider,
  useCourseColours,
  useCourseDashboardData,
  useSidebarData,
} from './ShellCourseData';
import { reviewHistoryEntriesForCard } from '@lacuna/core/db/reviewHistory';
import type { ReviewLog } from '@lacuna/core/db/types';
import { createCourseAssessment, updateCourseAssessment } from '../db/assessmentRepository';
import {
  paperSpecification,
  paperSpecificationReference,
} from '../specifications/paperFixture.testFixtures';

it('uses per-Card recall instead of a final-only forecast before and after its paper', async () => {
  const day = 86_400_000;
  const now = Date.parse('2027-06-01T09:00:00Z');
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  try {
    const course = await createCourse('Science', {
      examDate: now + 20 * day,
      specificationRef: paperSpecificationReference,
      specificationData: {
        ...paperSpecification,
        papers: paperSpecification.papers.map((paper) =>
          paper.id === 'paper-2' ? { ...paper, pointIds: ['enzymes'] } : paper,
        ),
      },
    });
    const legacy = await createCourse('Legacy', { examDate: now + 20 * day });
    const card = await createCourseCard(course.id, 'front_back', 'Cells', 'A unit of life');
    await db.cards.update(card.id, {
      stability: 10,
      difficulty: 5,
      lastReviewed: now,
      state: 2,
      reps: 1,
    });
    await db.concepts.update(card.conceptId, { specificationPointIds: ['example-science:cells'] });
    const final = (await db.courseAssessments.where('courseId').equals(course.id).first())!;
    await updateCourseAssessment(final.id, {
      coverageMode: 'specification',
      specificationPaperId: 'paper-2',
    });
    await createCourseAssessment(course.id, 'First paper', now + 10 * day, {
      coverageMode: 'specification',
      specificationPaperId: 'paper-1',
      afterLessonId: null,
    });
    const { result, unmount } = renderHook(
      () => ({ sidebar: useSidebarData(), dashboard: useCourseDashboardData() }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <ShellCourseDataProvider includeDashboard>{children}</ShellCourseDataProvider>
        ),
      },
    );
    try {
      await waitFor(() =>
        expect(result.current.sidebar?.summaries[course.id].mastery).toBeCloseTo(0.9, 5),
      );
      expect(result.current.sidebar?.forecasts[course.id]).toBeUndefined();
      expect(result.current.dashboard?.forecasts[course.id]).toBeUndefined();
      expect(result.current.sidebar?.forecasts[legacy.id]).toBeDefined();
      clock.mockReturnValue(now + 11 * day);
      await db.courses.update(course.id, { name: 'Science after the first paper' });
      await waitFor(() =>
        expect(result.current.sidebar?.summaries[course.id].mastery).toBeLessThan(0.9),
      );
      expect(result.current.sidebar?.forecasts[course.id]).toBeUndefined();
    } finally {
      unmount();
    }
  } finally {
    clock.mockRestore();
  }
});

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

it('keeps activity and new-card caps correct without reading full review records', async () => {
  const now = new Date(2026, 8, 6, 12).getTime();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  try {
    const course = await createCourse('Activity');
    await db.courses.update(course.id, { newCardsPerDay: 1, maxReviewsPerDay: 1 });
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
      expect(result.current.dashboard?.stats.forecast[0]).toMatchObject({
        dueCount: 1,
        newCount: 0,
      });
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
    'forecasts',
    'lessons',
    'stats',
    'summaries',
  ]);
  for (const query of supplements) expect(query).not.toHaveBeenCalled();
});

it('assigns colours from all active courses and updates membership without using names or creation order', async () => {
  const original = await createCourse('Original');
  const final = (await db.courseAssessments.where('courseId').equals(original.id).toArray())[0];
  await db.courses.clear();
  await db.courseAssessments.clear();
  await db.courseAssessments.bulkPut(
    ['a', 'b', 'c'].map((courseId) => ({
      ...final,
      id: `${courseId}-final`,
      courseId,
    })),
  );
  await db.courses.bulkPut([
    { ...original, id: 'c', name: 'First', createdAt: 1 },
    { ...original, id: 'a', name: 'Last', createdAt: 3 },
    { ...original, id: 'b', archived: true, createdAt: 2 },
  ]);
  const { result } = renderHook(useCourseColours, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <ShellCourseDataProvider>{children}</ShellCourseDataProvider>
    ),
  });
  await waitFor(() =>
    expect([...result.current]).toEqual([
      ['a', 'hsl(var(--accent-ink))'],
      ['c', 'hsl(var(--series-1))'],
    ]),
  );
  const previous = result.current;
  const colours = new Map(previous);
  await db.courses.update('a', { name: 'Renamed', createdAt: 0 });
  await waitFor(() => expect(result.current).not.toBe(previous));
  expect(result.current).toEqual(colours);
  await db.courses.update('b', { archived: false });
  await waitFor(() =>
    expect([...result.current]).toEqual([
      ['a', 'hsl(var(--accent-ink))'],
      ['b', 'hsl(var(--series-1))'],
      ['c', 'hsl(var(--series-2))'],
    ]),
  );
});
