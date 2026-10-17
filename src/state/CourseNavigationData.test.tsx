import 'fake-indexeddb/auto';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { db } from '../db/schema';
import { createCourse } from '../db/repository';
import { CourseNavigationDataProvider } from './CourseNavigationData';
import { useCourse } from './useCourseData';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

it('shares current course identity and permissions across route changes without per-mount reads', async () => {
  const biology = await createCourse('Biology');
  const chemistry = await createCourse('Chemistry');
  const reads = vi.spyOn(db.courses, 'get');
  const { result, rerender } = renderHook(({ id }) => useCourse(id), {
    wrapper: CourseNavigationDataProvider,
    initialProps: { id: biology.id },
  });
  await waitFor(() => expect(result.current?.name).toBe('Biology'));
  rerender({ id: chemistry.id });
  expect(result.current?.name).toBe('Chemistry');
  rerender({ id: biology.id });
  expect(result.current?.name).toBe('Biology');
  await db.courses.update(biology.id, { archived: true });
  await waitFor(() => expect(result.current?.archived).toBe(true));
  expect(reads).not.toHaveBeenCalled();
  reads.mockRestore();
});
