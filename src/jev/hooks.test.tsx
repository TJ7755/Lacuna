import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useJevController, useJevSettings, useJevStatus, useJevTypedMarker } from './index';
import { HOSTED_ACCESS_STORAGE_KEY } from '../ai/session/hostedTransport';
afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});
it('exposes a null marker off and without a code, and updates consumers on enable and disable', () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const hook = renderHook(() => ({
    controller: useJevController(),
    settings: useJevSettings(),
    status: useJevStatus(),
    marker: useJevTypedMarker(),
  }));
  expect(hook.result.current.marker).toBeNull();
  act(() => hook.result.current.controller.enable(1));
  expect(hook.result.current.marker).toBeNull();
  expect(hook.result.current.status).toMatchObject({ state: 'paused', reason: 'no-access-code' });
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  act(() => hook.result.current.controller.enable(1));
  expect(hook.result.current.marker).toEqual(expect.any(Function));
  act(() => hook.result.current.controller.disable());
  expect(hook.result.current.marker).toBeNull();
  expect(hook.result.current.settings.enabled).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});
