import { describe, expect, it, vi } from 'vitest';
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
  it('fails closed across reload and rebinds readiness to a replacement renderer', () => {
    const onUnavailable = vi.fn();
    const availability = new AiRendererAvailability(onUnavailable);
    const first = renderer();
    const replacement = renderer();

    availability.markReady(first);
    expect(availability.canHandle(first)).toBe(true);

    first.startLoading();
    expect(availability.canHandle(first)).toBe(false);
    expect(onUnavailable).toHaveBeenCalledOnce();

    availability.markReady(replacement);
    expect(availability.canHandle(first)).toBe(false);
    expect(availability.canHandle(replacement)).toBe(true);
    expect(first.off).toHaveBeenCalledWith('did-start-loading', expect.any(Function));

    availability.markUnavailable(first);
    expect(availability.canHandle(replacement)).toBe(true);
    availability.markUnavailable(replacement);
    expect(availability.canHandle(replacement)).toBe(false);
    expect(onUnavailable).toHaveBeenCalledTimes(2);
  });
});
