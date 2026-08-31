import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiRendererAvailability, type AiRendererLike } from '../../electron/mcp/rendererAvailability';

function renderer(): AiRendererLike & { startLoading(): void } {
  const listeners = new Set<() => void>();
  return {
    isDestroyed: () => false,
    isLoadingMainFrame: () => false,
    on: vi.fn((_event, listener) => listeners.add(listener)),
    off: vi.fn((_event, listener) => listeners.delete(listener)),
    startLoading: () => listeners.forEach((listener) => listener()),
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
});
