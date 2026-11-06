import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopUpdateState } from './updateTypes';
import { useDesktopUpdater } from './useDesktopUpdater';

afterEach(() => vi.unstubAllGlobals());

describe('desktop updater subscription', () => {
  it('keeps a downloaded notification when the earlier initial snapshot arrives afterwards', async () => {
    let resolve!: (state: DesktopUpdateState) => void;
    let publish!: (state: DesktopUpdateState) => void;
    const initial = new Promise<DesktopUpdateState>((done) => {
      resolve = done;
    });
    const unsubscribe = vi.fn();
    vi.stubGlobal('electronAPI', {
      updater: {
        getState: () => initial,
        onStateChange: (listener: typeof publish) => {
          publish = listener;
          return unsubscribe;
        },
      },
    });
    const { result, unmount } = renderHook(() => useDesktopUpdater());
    const downloaded: DesktopUpdateState = {
      phase: 'downloaded',
      mode: 'automatic',
      currentVersion: '0.2.21',
      availableVersion: '0.2.22',
    };
    act(() => publish(downloaded));
    await act(async () => resolve({ ...downloaded, phase: 'checking' }));

    expect(result.current.state).toEqual(downloaded);
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
