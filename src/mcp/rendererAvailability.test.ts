import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiRendererAvailability, type AiRendererLike } from '../../electron/mcp/rendererAvailability';

function renderer(): AiRendererLike & { startLoading(): void; destroy(): void } {
  const listeners = new Map<string, Set<() => void>>();
  let destroyed = false;
  const emit = (event: string) => listeners.get(event)?.forEach((listener) => listener());
  return {
    isDestroyed: () => destroyed,
    isLoadingMainFrame: () => false,
    on: vi.fn((event, listener) => {
      const eventListeners = listeners.get(event) ?? new Set();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
    }),
    off: vi.fn((event, listener) => listeners.get(event)?.delete(listener)),
    startLoading: () => emit('did-start-loading'),
    destroy: () => {
      destroyed = true;
      emit('destroyed');
    },
  };
}

describe('local AI renderer availability', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fails closed across reload and rebinds readiness to a replacement renderer', () => {
    const onUnavailable = vi.fn();
    const availability = new AiRendererAvailability(onUnavailable);
    const first = renderer();
    const replacement = renderer();

    availability.markReady(first, 1);
    expect(availability.canHandle(first)).toBe(true);

    first.startLoading();
    expect(availability.canHandle(first)).toBe(false);
    expect(onUnavailable).toHaveBeenCalledOnce();

    availability.markReady(replacement, 1);
    expect(availability.canHandle(first)).toBe(false);
    expect(availability.canHandle(replacement)).toBe(true);
    expect(first.off).toHaveBeenCalledWith('did-start-loading', expect.any(Function));

    availability.markUnavailable(first, 1);
    expect(availability.canHandle(replacement)).toBe(true);
    availability.markUnavailable(replacement, 1);
    expect(availability.canHandle(replacement)).toBe(false);
    vi.runAllTimers();
    expect(onUnavailable).toHaveBeenCalledTimes(2);
  });

  it('ignores unavailable events from a replaced subscription in the same renderer', () => {
    const onUnavailable = vi.fn();
    const availability = new AiRendererAvailability(onUnavailable);
    const active = renderer();

    availability.markReady(active, 1);
    availability.markReady(active, 2);
    availability.markUnavailable(active, 1);

    expect(availability.canHandle(active)).toBe(true);
    expect(onUnavailable).not.toHaveBeenCalled();

    availability.markUnavailable(active, 2);
    expect(availability.canHandle(active)).toBe(false);
    vi.runAllTimers();
    expect(onUnavailable).toHaveBeenCalledOnce();
  });

  it('keeps pending work when a listener remounts inside the grace window', () => {
    const onUnavailable = vi.fn();
    const availability = new AiRendererAvailability(onUnavailable);
    const active = renderer();

    availability.markReady(active, 1);
    availability.markUnavailable(active, 1);
    expect(availability.canHandle(active)).toBe(false);

    availability.markReady(active, 2);
    vi.advanceTimersByTime(250);

    expect(availability.canHandle(active)).toBe(true);
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it('waits for an enabled renderer to finish mounting before rejecting a request', async () => {
    const availability = new AiRendererAvailability();
    const active = renderer();

    const ready = availability.waitUntilReady(active, 1_000);
    availability.markReady(active, 1);

    await expect(ready).resolves.toBe(true);
  });

  it('settles concurrent readiness waits when the renderer mounts', async () => {
    const availability = new AiRendererAvailability();
    const active = renderer();

    const first = availability.waitUntilReady(active, 1_000);
    const second = availability.waitUntilReady(active, 1_000);
    availability.markReady(active, 1);

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });

  it('times out cleanly when the renderer never becomes ready', async () => {
    const availability = new AiRendererAvailability();
    const active = renderer();
    const ready = availability.waitUntilReady(active, 1_000);

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(ready).resolves.toBe(false);
    expect(availability.status(active)).toBe('waiting');
  });

  it('settles readiness waits when disposed and rejects a destroyed renderer', async () => {
    const availability = new AiRendererAvailability();
    const active = renderer();
    const pending = availability.waitUntilReady(active, 1_000);

    availability.dispose();

    await expect(pending).resolves.toBe(false);
    const destroyed = renderer();
    destroyed.destroy();
    await expect(availability.waitUntilReady(destroyed, 1_000)).resolves.toBe(false);
    expect(availability.status(destroyed)).toBe('unavailable');
  });

  it('settles a pending readiness wait immediately when its renderer is destroyed', async () => {
    const availability = new AiRendererAvailability();
    const active = renderer();
    const pending = availability.waitUntilReady(active, 1_000);

    active.destroy();

    await expect(pending).resolves.toBe(false);
  });

  it('fails closed during an explicit runtime restart and accepts its replacement subscription', () => {
    const onUnavailable = vi.fn();
    const availability = new AiRendererAvailability(onUnavailable);
    const active = renderer();
    const unrelated = renderer();
    availability.markReady(active, 1);

    expect(availability.beginRestart(unrelated)).toBe(false);
    expect(availability.beginRestart(active)).toBe(true);
    expect(availability.status(active)).toBe('waiting');
    expect(onUnavailable).toHaveBeenCalledOnce();

    availability.markReady(active, 2);
    expect(availability.status(active)).toBe('ready');
  });

  it('allows the active renderer to request recovery before it has registered', () => {
    const availability = new AiRendererAvailability();
    const active = renderer();

    expect(availability.status(active)).toBe('waiting');
    expect(availability.beginRestart(active)).toBe(true);
    expect(availability.status(active)).toBe('waiting');
  });
});
