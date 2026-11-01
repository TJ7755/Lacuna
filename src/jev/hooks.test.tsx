import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useJevController, useJevSettings, useJevStatus, useJevTypedMarker } from './index';
import { JEV_CONSENT_VERSION } from './types';
afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});
it('exposes a null marker off and updates consumers after public consent and opt-out', () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const hook = renderHook(() => ({
    controller: useJevController(),
    settings: useJevSettings(),
    status: useJevStatus(),
    marker: useJevTypedMarker(),
  }));
  expect(hook.result.current.marker).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
  act(() => hook.result.current.controller.enable(JEV_CONSENT_VERSION));
  expect(hook.result.current.marker).toEqual(expect.any(Function));
  act(() => hook.result.current.controller.disable());
  expect(hook.result.current.marker).toBeNull();
  expect(hook.result.current.settings.enabled).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe('/api/ai/session');
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
});

it('makes the subscribed marker available when backoff expires without a render or refresh', async () => {
  vi.useFakeTimers();
  let failing = true;
  const fetcher = vi.fn<typeof fetch>(async (url) =>
    String(url).endsWith('/session')
      ? Response.json({ token: 's', expiresAt: Date.now() + 3_600_000 })
      : failing
        ? new Response('', { status: 502 })
        : Response.json({ model: 'jev-1.14.0', value: 1, confidence: 0.97, inputTokens: 12 }),
  );
  vi.stubGlobal('fetch', fetcher);
  const { jevEngine } = await import('./engine');
  const hook = renderHook(() => ({ status: useJevStatus(), marker: useJevTypedMarker() }));
  const answer = {
    cardId: 'recovery',
    prompt: 'Recovery fixture',
    expected: 'Water',
    answer: 'Water molecules',
  };
  try {
    act(() => jevEngine.enable(JEV_CONSENT_VERSION));
    for (let count = 0; count < 3; count++) {
      await act(async () => {
        await jevEngine.markTyped(answer);
      });
      if (count < 2) expect(hook.result.current.status.state).toBe('ready');
    }
    expect(hook.result.current.marker).toBeNull();
    const calls = fetcher.mock.calls.length;
    failing = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(calls);
    expect(hook.result.current.status.state).toBe('ready');
    expect(hook.result.current.marker).toEqual(expect.any(Function));
    await act(async () => {
      expect(await hook.result.current.marker!(answer)).toMatchObject({ outcome: 'correct' });
    });
  } finally {
    act(() => jevEngine.disable());
    hook.unmount();
    vi.useRealTimers();
  }
});
