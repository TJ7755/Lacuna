// Pure correlation-id / timeout request-response matching for the main <-> renderer MCP
// bridge (Arc 2 Section 2.1, Task 9). Deliberately free of any Electron or MCP SDK
// dependency so it can run inside the normal Vitest suite (a fake `send` stands in for
// `webContents.send`) rather than only being exercised by a manual smoke test — this is
// the riskiest piece of Task 9's logic per next_plan.md Section 2.10, "Renderer-not-ready
// races".
//
// electron/mcp/server.ts is the sole real caller: it constructs one InvokeDispatcher per
// server lifetime, wiring `send` to `webContents.send('mcp:invoke', req)` and feeding
// `resolvePending` from the `mcp:invoke:reply` ipcMain listener.

import type { McpInvokeRequest, McpInvokeResponse } from './protocol';

export const RENDERER_NOT_READY_MESSAGE = 'Lacuna window is not open or still loading.';

const DEFAULT_TIMEOUT_MS = 10_000;

export class InvokeDispatcher {
  private readonly pending = new Map<string, (response: McpInvokeResponse) => void>();

  constructor(
    private readonly send: (request: McpInvokeRequest) => void,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  /**
   * Sends `request` and resolves once a matching `resolvePending` call arrives. If nothing
   * answers within `timeoutMs`, resolves with an `internal` error rather than hanging the
   * MCP client forever — the renderer window may not be open yet, or may have been closed.
   */
  dispatch(request: McpInvokeRequest): Promise<McpInvokeResponse> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        resolve({
          id: request.id,
          ok: false,
          error: { kind: 'internal', message: RENDERER_NOT_READY_MESSAGE },
        });
      }, this.timeoutMs);

      this.pending.set(request.id, (response) => {
        clearTimeout(timer);
        resolve(response);
      });

      this.send(request);
    });
  }

  /**
   * Fulfils the pending dispatch matching `response.id`. Returns false if none is pending
   * (e.g. a duplicate reply, or one that arrived after its timeout already fired) so the
   * caller can decide whether that is worth logging.
   */
  resolvePending(response: McpInvokeResponse): boolean {
    const resolve = this.pending.get(response.id);
    if (!resolve) return false;
    this.pending.delete(response.id);
    resolve(response);
    return true;
  }

  /** Number of in-flight dispatches. Exposed for tests and status reporting. */
  get pendingCount(): number {
    return this.pending.size;
  }
}
