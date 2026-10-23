import 'fake-indexeddb/auto';
import { Component, StrictMode, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { db } from '../db/schema';
import { createCourse } from '../db/repository';
import { retainedLiveQuery } from './retainedLiveQuery';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

it('retains an idle snapshot without reads, then revalidates on revisit', async () => {
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
  seen.mockClear();
  await db.courses.update(course.id, { name: 'Cells', archived: true });
  await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
  expect(seen).not.toHaveBeenCalled();
  const revisit = renderHook(() => useRecords(course.id));
  expect(revisit.result.current?.name).toBe('Biology');
  await waitFor(() =>
    expect(revisit.result.current).toMatchObject({ name: 'Cells', archived: true }),
  );
  revisit.unmount();
  await db.courses.delete(course.id);
  const deleted = renderHook(() => useRecords(course.id));
  expect(deleted.result.current?.name).toBe('Cells');
  await waitFor(() => expect(deleted.result.current).toBeNull());
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

it('shares live updates until the final subscriber leaves, including in StrictMode', async () => {
  const course = await createCourse('Biology');
  const read = vi.fn((id: string) => db.courses.get(id));
  const useRecords = retainedLiveQuery(read);
  const first = renderHook(() => useRecords(course.id), { wrapper: StrictMode });
  const second = renderHook(() => useRecords(course.id), { wrapper: StrictMode });
  await waitFor(() => expect(first.result.current?.name).toBe('Biology'));
  await waitFor(() => expect(second.result.current?.name).toBe('Biology'));
  expect(read).toHaveBeenCalledTimes(1);

  await db.courses.update(course.id, { name: 'Cells' });
  await waitFor(() => expect(first.result.current?.name).toBe('Cells'));
  await waitFor(() => expect(second.result.current?.name).toBe('Cells'));
  expect(read).toHaveBeenCalledTimes(2);
  first.unmount();

  await db.courses.update(course.id, { name: 'Genetics' });
  await waitFor(() => expect(second.result.current?.name).toBe('Genetics'));
  expect(read).toHaveBeenCalledTimes(3);
  second.unmount();

  await db.courses.update(course.id, { name: 'Ecology' });
  await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
  expect(read).toHaveBeenCalledTimes(3);
  const revisit = renderHook(() => useRecords(course.id), { wrapper: StrictMode });
  expect(revisit.result.current?.name).toBe('Genetics');
  await waitFor(() => expect(revisit.result.current?.name).toBe('Ecology'));
});

class QueryErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

it('reports failed revalidation and retries the cached snapshot on a later visit', async () => {
  const course = await createCourse('Biology');
  const failure = new Error('Read failed');
  const read = vi.fn((id: string) => db.courses.get(id));
  const useRecords = retainedLiveQuery(read);
  const first = renderHook(() => useRecords(course.id));
  await waitFor(() => expect(first.result.current?.name).toBe('Biology'));
  first.unmount();

  read.mockRejectedValueOnce(failure);
  const onCaughtError = vi.fn();
  const failed = renderHook(() => useRecords(course.id), {
    wrapper: QueryErrorBoundary,
    onCaughtError,
  });
  expect(failed.result.current?.name).toBe('Biology');
  await waitFor(() => expect(onCaughtError).toHaveBeenCalledWith(failure, expect.anything()));
  failed.unmount();

  await db.courses.update(course.id, { name: 'Cells' });
  const recovered = renderHook(() => useRecords(course.id));
  expect(recovered.result.current?.name).toBe('Biology');
  await waitFor(() => expect(recovered.result.current?.name).toBe('Cells'));
});

it('ignores an in-flight result from an abandoned visit', async () => {
  const course = await createCourse('Biology');
  const read = vi.fn(async (id: string) => db.courses.get(id));
  const useRecords = retainedLiveQuery(read);
  const first = renderHook(() => useRecords(course.id));
  await waitFor(() => expect(first.result.current?.name).toBe('Biology'));
  first.unmount();

  let finishRead = () => {};
  const pending = new Promise<void>((resolve) => {
    finishRead = resolve;
  });
  const started = vi.fn();
  read.mockImplementationOnce(async (id) => {
    const record = await db.courses.get(id);
    started();
    await pending;
    return record;
  });
  await db.courses.update(course.id, { name: 'Cells' });
  const abandoned = renderHook(() => useRecords(course.id));
  await waitFor(() => expect(started).toHaveBeenCalled());
  abandoned.unmount();

  await db.courses.update(course.id, { name: 'Genetics' });
  const current = renderHook(() => useRecords(course.id));
  expect(current.result.current?.name).toBe('Biology');
  await waitFor(() => expect(current.result.current?.name).toBe('Genetics'));
  await act(async () => {
    finishRead();
    await pending;
  });
  expect(current.result.current?.name).toBe('Genetics');
});

it('bounds cached snapshots without evicting mounted readers', async () => {
  const useRecords = retainedLiveQuery(async (id) => id);
  const active = renderHook(() => useRecords('active'));
  await waitFor(() => expect(active.result.current).toBe('active'));
  for (let index = 0; index < 5; index++) {
    const visit = renderHook(() => useRecords(`course-${index}`));
    await waitFor(() => expect(visit.result.current).toBe(`course-${index}`));
    visit.unmount();
  }

  const shared = renderHook(() => useRecords('active'));
  expect(shared.result.current).toBe('active');
  const recent = renderHook(() => useRecords('course-4'));
  expect(recent.result.current).toBe('course-4');
  const evicted = renderHook(() => useRecords('course-0'));
  expect(evicted.result.current).toBeUndefined();
  await waitFor(() => expect(evicted.result.current).toBe('course-0'));
});

it('expires idle snapshots after five minutes', async () => {
  const useRecords = retainedLiveQuery(async (id) => id);
  const first = renderHook(() => useRecords('course'));
  await waitFor(() => expect(first.result.current).toBe('course'));
  vi.useFakeTimers();
  try {
    first.unmount();
    await act(() => vi.advanceTimersByTime(5 * 60_000));
  } finally {
    vi.useRealTimers();
  }
  const revisit = renderHook(() => useRecords('course'));
  expect(revisit.result.current).toBeUndefined();
  await waitFor(() => expect(revisit.result.current).toBe('course'));
});
