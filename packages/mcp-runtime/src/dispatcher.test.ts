import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvokeDispatcher } from './dispatcher';
import type { McpInvokeRequest } from '@lacuna/protocol/mcp/bridge';

function makeRequest(id = 'req-1'): McpInvokeRequest {
  return {
    id,
    tool: 'lacuna.list_courses',
    input: {},
    agentId: 'agent-1',
    grant: { courseId: '__global__', scope: 'read', grantedAt: 1 },
  };
}

describe('InvokeDispatcher', () => {
  it('delivers requests and matches out-of-order replies without accepting unknown or duplicate ids', async () => {
    const sent: McpInvokeRequest[] = [];
    const dispatcher = new InvokeDispatcher((request) => sent.push(request));
    const firstRequest = makeRequest('a');
    const secondRequest = makeRequest('b');
    const first = dispatcher.dispatch(firstRequest);
    const second = dispatcher.dispatch(secondRequest);
    expect(sent).toEqual([firstRequest, secondRequest]);

    expect(dispatcher.resolvePending({ id: 'unknown', ok: true, result: {} })).toBe(false);
    expect(dispatcher.resolvePending({ id: 'b', ok: true, result: 'second' })).toBe(true);
    expect(dispatcher.resolvePending({ id: 'b', ok: true, result: 'duplicate' })).toBe(false);
    expect(dispatcher.resolvePending({ id: 'a', ok: true, result: 'first' })).toBe(true);

    await expect(first).resolves.toEqual({ id: 'a', ok: true, result: 'first' });
    await expect(second).resolves.toEqual({ id: 'b', ok: true, result: 'second' });
  });

  it('closes pending and future dispatches without sending or waiting for timeout', async () => {
    const send = vi.fn();
    const dispatcher = new InvokeDispatcher(send, 10_000);
    const pending = dispatcher.dispatch(makeRequest('pending'));

    dispatcher.close({ kind: 'internal', message: 'MCP server stopped.' });
    const afterClose = dispatcher.dispatch(makeRequest('after-close'));

    await expect(pending).resolves.toEqual({
      id: 'pending',
      ok: false,
      error: { kind: 'internal', message: 'MCP server stopped.' },
    });
    await expect(afterClose).resolves.toEqual({
      id: 'after-close',
      ok: false,
      error: { kind: 'internal', message: 'MCP server stopped.' },
    });
    expect(send).toHaveBeenCalledOnce();
  });

  describe('timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('times out with a useful error and rejects a late reply', async () => {
      const dispatcher = new InvokeDispatcher(() => {}, 1_000);
      const pending = dispatcher.dispatch(makeRequest());

      vi.advanceTimersByTime(1_000);
      const response = await pending;

      expect(response).toEqual({
        id: 'req-1',
        ok: false,
        error: { kind: 'internal', message: 'Lacuna window is not open or still loading.' },
      });

      const resolved = dispatcher.resolvePending({ id: 'req-1', ok: true, result: 'late' });
      expect(resolved).toBe(false);
    });
  });
});
