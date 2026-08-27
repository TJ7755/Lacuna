import { describe, expect, it, vi } from 'vitest';
import { installStaleChunkRecovery } from './staleChunkRecovery';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('stale chunk recovery', () => {
  it('clears stale PWA state and reloads once for a failed Vite dynamic import', async () => {
    const events = new EventTarget();
    const clearPwaState = vi.fn().mockResolvedValue(undefined);
    const reload = vi.fn();
    const remove = installStaleChunkRecovery({
      events,
      storage: memoryStorage(),
      clearPwaState,
      reload,
      now: () => 1_000,
    });

    const first = new Event('vite:preloadError', { cancelable: true });
    events.dispatchEvent(first);
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());

    expect(first.defaultPrevented).toBe(true);
    expect(clearPwaState).toHaveBeenCalledOnce();

    const second = new Event('vite:preloadError', { cancelable: true });
    events.dispatchEvent(second);
    await Promise.resolve();

    expect(second.defaultPrevented).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
    remove();
  });

  it('does not risk a reload loop when session storage is unavailable', async () => {
    const events = new EventTarget();
    const reload = vi.fn();
    installStaleChunkRecovery({
      events,
      storage: {
        ...memoryStorage(),
        getItem: () => {
          throw new Error('blocked');
        },
      },
      clearPwaState: vi.fn().mockResolvedValue(undefined),
      reload,
      now: () => 1_000,
    });

    const event = new Event('vite:preloadError', { cancelable: true });
    events.dispatchEvent(event);
    await Promise.resolve();

    expect(event.defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
