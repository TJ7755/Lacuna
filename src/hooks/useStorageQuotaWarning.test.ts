import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useStorageQuotaWarning } from './useStorageQuotaWarning';

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }));

vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({
    notify,
  }),
}));

describe('useStorageQuotaWarning', () => {
  beforeEach(() => {
    notify.mockClear();
    window.location.hash = '#/';
  });

  it('does not throw when navigator.storage is unavailable', () => {
    const originalStorage = navigator.storage;
    Object.defineProperty(navigator, 'storage', {
      value: undefined,
      configurable: true,
    });
    expect(() => renderHook(() => useStorageQuotaWarning())).not.toThrow();
    Object.defineProperty(navigator, 'storage', {
      value: originalStorage,
      configurable: true,
    });
  });

  it('does not throw when estimate is unavailable', () => {
    const originalStorage = navigator.storage;
    Object.defineProperty(navigator, 'storage', {
      value: { estimate: undefined },
      configurable: true,
    });
    expect(() => renderHook(() => useStorageQuotaWarning())).not.toThrow();
    Object.defineProperty(navigator, 'storage', {
      value: originalStorage,
      configurable: true,
    });
  });

  it('offers the backups settings when storage usage exceeds 85 percent', async () => {
    const originalStorage = navigator.storage;
    const estimate = vi.fn().mockResolvedValue({ usage: 86, quota: 100 });
    Object.defineProperty(navigator, 'storage', {
      value: { estimate },
      configurable: true,
    });

    const { unmount } = renderHook(() => useStorageQuotaWarning());

    await waitFor(() => expect(notify).toHaveBeenCalledOnce());
    expect(notify).toHaveBeenCalledWith(
      'Storage is 86% full. Consider exporting your data to free up space.',
      'negative',
      {
        duration: 8000,
        actionLabel: 'Open backups',
        onAction: expect.any(Function),
      },
    );

    const options = notify.mock.calls[0]?.[2] as { onAction: () => void };
    options.onAction();
    expect(window.location.hash).toBe('#/settings#settings-backups');

    unmount();
    Object.defineProperty(navigator, 'storage', {
      value: originalStorage,
      configurable: true,
    });
  });

  it('ignores a failed quota estimate and does not notify', async () => {
    const originalStorage = navigator.storage;
    const estimate = vi.fn().mockRejectedValue(new Error('quota unavailable'));
    Object.defineProperty(navigator, 'storage', {
      value: { estimate },
      configurable: true,
    });

    const { unmount } = renderHook(() => useStorageQuotaWarning());
    await waitFor(() => expect(estimate).toHaveBeenCalledOnce());
    expect(notify).not.toHaveBeenCalled();

    unmount();
    Object.defineProperty(navigator, 'storage', {
      value: originalStorage,
      configurable: true,
    });
  });

  it('checks again after the interval but keeps the warning to once per session', async () => {
    vi.useFakeTimers();
    const originalStorage = navigator.storage;
    const estimate = vi.fn().mockResolvedValue({ usage: 90, quota: 100 });
    Object.defineProperty(navigator, 'storage', {
      value: { estimate },
      configurable: true,
    });

    const { unmount } = renderHook(() => useStorageQuotaWarning());
    await Promise.resolve();
    expect(notify).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(60_000);
    await Promise.resolve();
    expect(estimate).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledOnce();

    unmount();
    Object.defineProperty(navigator, 'storage', {
      value: originalStorage,
      configurable: true,
    });
    vi.useRealTimers();
  });
});
