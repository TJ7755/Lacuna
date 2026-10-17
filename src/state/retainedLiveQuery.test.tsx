import 'fake-indexeddb/auto';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { db } from '../db/schema';
import { createCourse } from '../db/repository';
import { retainedLiveQuery } from './retainedLiveQuery';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

it('keeps a revisited course current while no page is mounted', async () => {
  const course = await createCourse('Biology');
  const seen = vi.fn();
  const useRecords = retainedLiveQuery(async (id) => {
    const record = await db.courses.get(id);
    seen(record);
    return record ?? null;
  });
  const first = renderHook(() => useRecords(course.id));
  await waitFor(() => expect(first.result.current?.name).toBe('Biology'));
  first.unmount();
  await db.courses.update(course.id, { name: 'Cells', archived: true });
  await waitFor(() =>
    expect(seen).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'Cells', archived: true }),
    ),
  );
  const revisit = renderHook(() => useRecords(course.id));
  expect(revisit.result.current).toMatchObject({ name: 'Cells', archived: true });
  revisit.unmount();
  await db.courses.delete(course.id);
  await waitFor(() => expect(seen).toHaveBeenLastCalledWith(undefined));
  expect(renderHook(() => useRecords(course.id)).result.current).toBeNull();
});

it('never returns another course snapshot when the route ID changes', async () => {
  const a = await createCourse('Biology');
  const b = await createCourse('Chemistry');
  const useRecords = retainedLiveQuery((id) => db.courses.get(id));
  const { result, rerender } = renderHook(({ id }) => useRecords(id), {
    initialProps: { id: a.id },
  });
  await waitFor(() => expect(result.current?.name).toBe('Biology'));
  rerender({ id: b.id });
  expect(result.current).toBeUndefined();
  await waitFor(() => expect(result.current?.name).toBe('Chemistry'));
  rerender({ id: a.id });
  expect(result.current?.name).toBe('Biology');
});
