import { randomUUID } from 'node:crypto';
import type { AiBridgeRequest, AiBridgeResult } from '../../src/ai/protocol.js';
import { encodeCompanionMessage } from '../../src/mcp/companionEntry.js';
import type { AiAppClientState } from './aiAppClientState.js';
import { cancelledOperation, timedOutOperation } from './aiAppOperationErrors.js';

/** Requests and late write acknowledgements use the client's single correlated ledger. */
export function createAiAppRequests(
  state: Pick<AiAppClientState, 'socket' | 'pending' | 'activeRun'>,
  {
    open,
    close,
    writeDrainTimeoutMs,
  }: { open(): Promise<void>; close(): void; writeDrainTimeoutMs: number },
) {
  async function request(
    request: AiBridgeRequest,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<AiBridgeResult> {
    if (signal?.aborted) throw cancelledOperation('not_started');
    await open();
    if (signal?.aborted) throw cancelledOperation('not_started');
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const drainAfterCancellation =
        request.type === 'invoke_tool' ||
        request.type === 'reply' ||
        request.type === 'renew_lease';
      const abort = () => {
        clearTimeout(timeout);
        if (!drainAfterCancellation) {
          state.pending.delete(id);
          close();
        } else {
          armWriteDrainTimeout(id);
        }
        reject(cancelledOperation(drainAfterCancellation ? 'unknown' : 'not_started'));
      };
      const timeout = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        if (!drainAfterCancellation) {
          state.pending.delete(id);
          close();
        } else {
          armWriteDrainTimeout(id);
        }
        reject(timedOutOperation(drainAfterCancellation ? 'unknown' : 'not_started'));
      }, timeoutMs);
      state.pending.set(id, {
        request,
        timeout,
        resolve: (result) => {
          signal?.removeEventListener('abort', abort);
          if (
            request.type === 'reply' &&
            result.ok &&
            result.data.type === 'reply_recorded' &&
            state.activeRun?.runId === request.runId
          ) {
            state.activeRun = null;
          }
          resolve(result);
        },
        reject: (error) => {
          signal?.removeEventListener('abort', abort);
          reject(error);
        },
      });
      signal?.addEventListener('abort', abort, { once: true });
      state.socket!.write(encodeCompanionMessage({ type: 'ai_request', id, request }));
    });
  }

  function armWriteDrainTimeout(id: string): void {
    const pending = state.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pending.timeout = setTimeout(() => {
      if (!state.pending.delete(id)) return;
      close();
    }, writeDrainTimeoutMs);
  }
  return { request };
}
