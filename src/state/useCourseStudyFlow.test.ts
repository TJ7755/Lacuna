import 'fake-indexeddb/auto';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { createCourse } from '../db/repository';
import { db } from '../db/schema';
import { useCourseStudyFlow } from './useCourseStudyFlow';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

it('labels a stale read with its own generation until the refreshed read arrives', async () => {
  const course = await createCourse('Biology');
  const { result, rerender } = renderHook(
    ({ refreshKey }) => useCourseStudyFlow(course.id, refreshKey),
    { initialProps: { refreshKey: 0 } },
  );
  await waitFor(() => expect(result.current?.generation).toBe(0));

  rerender({ refreshKey: 1 });
  // The conductor treats generation === refreshKey as the post-step plan; the
  // previous read must not claim that before the live query re-runs (#402).
  expect(result.current?.generation).toBe(0);
  await waitFor(() => expect(result.current?.generation).toBe(1));
});
