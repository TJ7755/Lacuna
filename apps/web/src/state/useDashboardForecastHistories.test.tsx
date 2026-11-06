import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db } from '../db/schema';
import { createCourse, createCourseCard } from '../db/repository';
import { reviewHistoryEntryForCard } from '@lacuna/core/db/reviewHistory';
import type { ReviewLog } from '@lacuna/core/db/types';
import { dashboardForecasts } from './dashboardForecasts';
import { BackgroundCalculationsEnabled, useDashboardForecastHistories } from './useData';
import { calculateForecastHistoriesOffThread } from './forecastHistoryWorker';
import type { ForecastHistories } from './forecastHistoryData';

vi.mock('./forecastHistoryWorker', () => ({ calculateForecastHistoriesOffThread: vi.fn() }));
const calculate = vi.mocked(calculateForecastHistoriesOffThread);
let source: NonNullable<Parameters<typeof useDashboardForecastHistories>[0]>;
let replies: ((value: ForecastHistories) => void)[];
const review: ReviewLog = {
  timestamp: 100,
  grade: 3,
  responseTimeSec: 2,
  distracted: false,
  stabilityBefore: null,
  stabilityAfter: 2,
  difficultyBefore: null,
  difficultyAfter: 5,
  retrievabilityAtReview: null,
};

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  const course = await createCourse('Biology');
  const card = await createCourseCard(course.id, 'front_back', 'Cell', 'Answer');
  source = {
    courses: [course],
    lessons: [],
    allCards: [card],
    forecasts: dashboardForecasts([course], [], [card], Date.now()),
  };
  replies = [];
  calculate.mockReset().mockImplementation(() => new Promise((resolve) => replies.push(resolve)));
});
afterEach(() => vi.restoreAllMocks());

it('cancels whilst Quick search is foreground and resumes with fresh evidence', async () => {
  let enabled = true;
  const { rerender, unmount } = renderHook(() => useDashboardForecastHistories(source, 18), {
    wrapper: ({ children }) => (
      <BackgroundCalculationsEnabled.Provider value={enabled}>
        {children}
      </BackgroundCalculationsEnabled.Provider>
    ),
  });
  try {
    await waitFor(() => expect(calculate).toHaveBeenCalledTimes(1));
    enabled = false;
    rerender();
    await waitFor(() => expect(calculate.mock.calls[0][1].aborted).toBe(true));
    await db.reviewHistory.add(reviewHistoryEntryForCard(source.allCards[0], review));
    expect(calculate).toHaveBeenCalledTimes(1);
    enabled = true;
    rerender();
    await waitFor(() => expect(calculate).toHaveBeenCalledTimes(2));
  } finally {
    unmount();
  }
});

it('refreshes after same-count historical edits, insertion, undo and reset without reading rows', async () => {
  const entry = reviewHistoryEntryForCard(source.allCards[0], review);
  await db.reviewHistory.add(entry);
  const rows = vi.spyOn(db.reviewHistory, 'toArray');
  const { unmount } = renderHook(() => useDashboardForecastHistories(source, 18));
  try {
    await waitFor(() => expect(calculate).toHaveBeenCalledTimes(1));
    await db.reviewHistory.update(entry.id, { stabilityAfter: 8 });
    await waitFor(() => expect(calculate).toHaveBeenCalledTimes(2));
    const second = { ...entry, id: 'second' };
    await db.reviewHistory.add(second);
    await waitFor(() => expect(calculate).toHaveBeenCalledTimes(3));
    await db.reviewHistory.delete(second.id);
    await waitFor(() => expect(calculate).toHaveBeenCalledTimes(4));
    await db.reviewHistory.clear();
    await waitFor(() => expect(calculate).toHaveBeenCalledTimes(5));
    expect(rows).not.toHaveBeenCalled();
    expect(calculate.mock.calls.slice(0, 4).every(([, signal]) => signal.aborted)).toBe(true);
  } finally {
    unmount();
  }
  expect(calculate.mock.calls[4][1].aborted).toBe(true);
});

it('keeps a complete trace pending refresh and ignores stale replies after range, snapshot and unmount changes', async () => {
  const { result, rerender, unmount } = renderHook(
    ({ data, past }) => useDashboardForecastHistories(data, past),
    { initialProps: { data: source, past: 18 } },
  );
  await waitFor(() => expect(replies).toHaveLength(1));
  const initial = { biology: [{ at: 1, recall: 0.2 }] };
  await act(async () => replies[0](initial));
  expect(result.current).toEqual(initial);
  rerender({ data: source, past: 54 });
  await waitFor(() => expect(replies).toHaveLength(2));
  expect(result.current).toEqual(initial);
  const input = calculate.mock.calls[1][0];
  expect(input.now - input.from).toBe(54 * 86_400_000);
  rerender({ data: { ...source, lessons: [] }, past: 54 });
  await waitFor(() => expect(replies).toHaveLength(3));
  await act(async () => replies[1]({ stale: [] }));
  expect(result.current).toEqual(initial);
  await act(async () => replies[2]({ current: [] }));
  expect(result.current).toEqual({ current: [] });
  unmount();
  expect(calculate.mock.calls.every(([, signal]) => signal.aborted)).toBe(true);
});
