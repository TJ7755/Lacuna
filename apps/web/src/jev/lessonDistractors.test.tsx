import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { JEV_CONSENT_VERSION } from '@lacuna/core/jev/types';
import { jevEngine } from './engine';
import { lessonDistractorBatches, useLessonDistractors } from './lessonDistractors';
import { jevLessonDistractorRequestSchema, lessonDistractorTargets } from './protocol';

const cards = Array.from({ length: 4 }, (_, index) => ({
  id: String(index),
  prompt: 'Prompt ' + index,
  answer: 'Answer ' + index,
}));

afterEach(() => {
  jevEngine.disable();
  vi.unstubAllGlobals();
});

it('batches ordinary lessons once and gives large batches candidates outside their targets', () => {
  const ordinary = lessonDistractorBatches(cards);
  expect(ordinary).toHaveLength(1);
  expect(ordinary[0].request.targets).toBeUndefined();
  const large = Array.from({ length: 73 }, (_, index) => ({
    id: String(index),
    prompt: '字'.repeat(400) + index,
    answer: 'Answer ' + index,
  }));
  const batches = lessonDistractorBatches(large);
  expect(batches.length).toBeGreaterThan(1);
  const targets: string[] = [];
  for (const { request, ids } of batches) {
    expect(jevLessonDistractorRequestSchema.safeParse(request).success).toBe(true);
    const selected = lessonDistractorTargets(request);
    expect(ids.length).toBeGreaterThan(selected.length);
    targets.push(...selected.map((index) => ids[index]));
  }
  expect(targets.sort()).toEqual(large.map(({ id }) => id).sort());
});

it('shares a pending lesson shortlist, reuses its cache, and hides stale or disabled results', async () => {
  const rank = vi.fn(async (body: unknown) => {
    const request = jevLessonDistractorRequestSchema.parse(body);
    return Response.json({
      model: 'jev-1.14.0',
      inputTokens: 12,
      rankings: request.cards.map((_card, target) =>
        request.cards.flatMap((_candidate, index) => (index === target ? [] : [index])),
      ),
    });
  });
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (url, options) =>
      String(url).endsWith('/session')
        ? Response.json({ token: 'test', expiresAt: Date.now() + 30_000 })
        : rank(JSON.parse(String(options?.body))),
    ),
  );

  const first = renderHook(({ source }) => useLessonDistractors('lesson', source), {
    initialProps: { source: cards },
  });
  const second = renderHook(() => useLessonDistractors('lesson', cards));
  expect(first.result.current.size).toBe(0);
  expect(rank).not.toHaveBeenCalled();
  act(() => jevEngine.enable(JEV_CONSENT_VERSION));
  await waitFor(() => expect(first.result.current.get('0')).toEqual(['1', '2', '3']));
  await waitFor(() => expect(second.result.current.get('0')).toEqual(['1', '2', '3']));
  expect(rank).toHaveBeenCalledTimes(1);
  first.unmount();
  second.unmount();

  const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const again = renderHook(({ source }) => useLessonDistractors('lesson', source), {
    initialProps: { source: cards.toReversed() },
  });
  try {
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await waitFor(() => expect(again.result.current.get('0')).toEqual(['1', '2', '3']));
    expect(rank).toHaveBeenCalledTimes(1);
  } finally {
    onLine.mockRestore();
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
  }
  again.rerender({ source: [{ ...cards[0], answer: 'Changed' }, ...cards.slice(1)] });
  expect(again.result.current.size).toBe(0);
  await waitFor(() => expect(again.result.current.get('0')).toEqual(['1', '2', '3']));
  expect(rank).toHaveBeenCalledTimes(2);
  act(() => jevEngine.disable());
  expect(again.result.current.size).toBe(0);
});

it('resumes a fifth batch when the open lesson reaches its next allowance window', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(Date.now() + 60_001);
  const large = Array.from({ length: 65 }, (_, index) => ({
    id: String(index),
    prompt: 'Prompt ' + index,
    answer: 'Answer ' + index,
  }));
  const rank = vi.fn((body: unknown) => {
    const request = jevLessonDistractorRequestSchema.parse(body);
    return Response.json({
      model: 'jev-1.14.0',
      inputTokens: 12,
      rankings: lessonDistractorTargets(request).map((target) =>
        request.cards.flatMap((_candidate, index) => (index === target ? [] : [index])).slice(0, 3),
      ),
    });
  });
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (url, options) =>
      String(url).endsWith('/session')
        ? Response.json({ token: 'test', expiresAt: Date.now() + 3_600_000 })
        : rank(JSON.parse(String(options?.body))),
    ),
  );

  const lesson = renderHook(() => useLessonDistractors('large', large));
  try {
    act(() => jevEngine.enable(JEV_CONSENT_VERSION));
    await vi.waitFor(() => expect(lesson.result.current.size).toBe(64));
    expect(rank).toHaveBeenCalledTimes(4);
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    await vi.waitFor(() => expect(lesson.result.current.size).toBe(65));
    expect(rank).toHaveBeenCalledTimes(5);
  } finally {
    lesson.unmount();
    vi.useRealTimers();
  }
});
