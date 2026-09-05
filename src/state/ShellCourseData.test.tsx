import 'fake-indexeddb/auto';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { createCourse, createCourseCard } from '../db/repository';
import { db } from '../db/schema';
import { ShellCourseDataProvider, useCourseDashboardData, useSidebarData } from './ShellCourseData';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
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
