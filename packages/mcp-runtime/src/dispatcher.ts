// Transport-neutral request matching; the host supplies delivery and feeds replies back.

import type {
  McpInvokeRequest,
  McpInvokeResponse,
  McpToolError,
} from '@lacuna/protocol/mcp/bridge';

const RENDERER_NOT_READY_MESSAGE = 'Lacuna window is not open or still loading.';

const DEFAULT_TIMEOUT_MS = 10_000;

export class InvokeDispatcher {
  private readonly pending = new Map<string, (response: McpInvokeResponse) => void>();
  private closedError: McpToolError | null = null;

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
    if (this.closedError) {
      return Promise.resolve({ id: request.id, ok: false, error: this.closedError });
    }
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

  /** Fences new work and settles every pending dispatch immediately. */
  close(error: McpToolError): void {
    this.closedError = error;
    for (const id of [...this.pending.keys()]) {
      this.resolvePending({ id, ok: false, error });
    }
  }
}
