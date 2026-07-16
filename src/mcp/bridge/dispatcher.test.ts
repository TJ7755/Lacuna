import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvokeDispatcher, RENDERER_NOT_READY_MESSAGE } from './dispatcher';
import type { McpInvokeRequest } from './protocol';

function makeRequest(id = 'req-1'): McpInvokeRequest {
  return { id, tool: 'lacuna.list_courses', input: {}, agentId: 'agent-1' };
}

describe('InvokeDispatcher', () => {
  it('resolves with the matching reply', async () => {
    const sent: McpInvokeRequest[] = [];
    const dispatcher = new InvokeDispatcher((req) => sent.push(req));

    const pending = dispatcher.dispatch(makeRequest());
    expect(sent).toHaveLength(1);
    expect(dispatcher.pendingCount).toBe(1);

    const resolved = dispatcher.resolvePending({ id: 'req-1', ok: true, result: { data: [] } });
    expect(resolved).toBe(true);

    await expect(pending).resolves.toEqual({ id: 'req-1', ok: true, result: { data: [] } });
    expect(dispatcher.pendingCount).toBe(0);
  });

  it('ignores a reply with no matching pending request', () => {
    const dispatcher = new InvokeDispatcher(() => {});
    const resolved = dispatcher.resolvePending({ id: 'unknown', ok: true, result: {} });
    expect(resolved).toBe(false);
  });

  it('keeps concurrent dispatches independent by correlation id', async () => {
    const dispatcher = new InvokeDispatcher(() => {});

    const first = dispatcher.dispatch(makeRequest('a'));
    const second = dispatcher.dispatch(makeRequest('b'));
    expect(dispatcher.pendingCount).toBe(2);

    dispatcher.resolvePending({ id: 'b', ok: true, result: 'second' });
    dispatcher.resolvePending({ id: 'a', ok: true, result: 'first' });

    await expect(first).resolves.toEqual({ id: 'a', ok: true, result: 'first' });
    await expect(second).resolves.toEqual({ id: 'b', ok: true, result: 'second' });
  });

  describe('timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('resolves with an internal error if nothing replies in time', async () => {
      const dispatcher = new InvokeDispatcher(() => {}, 1_000);
      const pending = dispatcher.dispatch(makeRequest());

      vi.advanceTimersByTime(1_000);
      const response = await pending;

      expect(response).toEqual({
        id: 'req-1',
        ok: false,
        error: { kind: 'internal', message: RENDERER_NOT_READY_MESSAGE },
      });
      expect(dispatcher.pendingCount).toBe(0);
    });

    it('a late reply after the timeout is a no-op', async () => {
      const dispatcher = new InvokeDispatcher(() => {}, 1_000);
      const pending = dispatcher.dispatch(makeRequest());

      vi.advanceTimersByTime(1_000);
      await pending;

      const resolved = dispatcher.resolvePending({ id: 'req-1', ok: true, result: 'late' });
      expect(resolved).toBe(false);
    });
  });
});
