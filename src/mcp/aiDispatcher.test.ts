import { describe, expect, it, vi } from 'vitest';
import {
  AI_RENDERER_TIMEOUT_MS,
  AiRendererDispatcher,
} from '../../electron/mcp/aiDispatcher';

const connectRequest = {
  type: 'connect',
  protocolVersion: 1,
  client: { name: 'Codex' },
} as const;

describe('local AI renderer dispatcher', () => {
  it('allows a full 25-second wait before its outer deadline', async () => {
    vi.useFakeTimers();
    try {
      expect(AI_RENDERER_TIMEOUT_MS).toBeGreaterThan(25_000);
      const dispatcher = new AiRendererDispatcher();
      const outcome = dispatcher.dispatch('channel-1', 'request-1', connectRequest, () => {});
      let settled = false;
      void outcome.then(() => { settled = true; });

      await vi.advanceTimersByTimeAsync(25_001);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(AI_RENDERER_TIMEOUT_MS - 25_001);
      await expect(outcome).resolves.toMatchObject({
        ok: false,
        error: { kind: 'unavailable', reason: 'disconnected' },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels pending waits when their companion channel closes', async () => {
    const dispatcher = new AiRendererDispatcher();
    const outcome = dispatcher.dispatch('channel-1', 'request-1', connectRequest, () => {});
    dispatcher.cancelChannel('channel-1');

    await expect(outcome).resolves.toMatchObject({
      ok: false,
      error: { kind: 'unavailable', message: 'The local AI companion disconnected.' },
    });
  });

  it('fails closed immediately when the renderer send seam is unavailable', async () => {
    const dispatcher = new AiRendererDispatcher();
    await expect(dispatcher.dispatch('channel-1', 'request-1', connectRequest, () => {
      throw new Error('renderer destroyed');
    })).resolves.toMatchObject({
      ok: false,
      error: { kind: 'unavailable', message: 'The Lacuna renderer is unavailable.' },
    });
  });
});
