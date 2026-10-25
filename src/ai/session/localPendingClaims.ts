import { MAX_AI_WAIT_MS, type AiBridgeRequest, type AiBridgeResult } from '../protocol';
import type { LocalAiSessionTimers } from './local';
import type { LocalSessionState } from './localSessionState';

const DEFAULT_CLAIM_LEASE_MS = 5 * 60_000;

/** Resolves or cancels the one pending claim stored by the current local session. */
export function createLocalPendingClaims(
  state: Pick<LocalSessionState, 'pendingClaim'>,
  {
    timers,
    claimNext,
  }: {
    timers: LocalAiSessionTimers;
    claimNext(connectionId: string, leaseMs: number): AiBridgeResult | null;
  },
) {
  function resolvePendingClaim(result: AiBridgeResult): void {
    const pending = state.pendingClaim;
    if (!pending) return;
    state.pendingClaim = null;
    pending.cancelTimeout();
    pending.resolve(result);
  }

  function offerPendingMessage(): void {
    const pending = state.pendingClaim;
    if (!pending) return;
    const claimed = claimNext(pending.connectionId, pending.leaseMs);
    if (claimed) resolvePendingClaim(claimed);
  }
  function waitForClaim(
    channelId: string,
    request: Extract<AiBridgeRequest, { type: 'claim_message' }>,
  ): Promise<AiBridgeResult> {
    return new Promise<AiBridgeResult>((resolve) => {
      const timeoutMs = request.timeoutMs ?? MAX_AI_WAIT_MS;
      const cancelTimeout = timers.schedule(() => {
        if (state.pendingClaim?.resolve !== resolve) return;
        state.pendingClaim = null;
        resolve({ ok: true, data: { type: 'message_claim', message: null } });
      }, timeoutMs);
      state.pendingClaim = {
        channelId,
        connectionId: request.connectionId,
        leaseMs: request.leaseMs ?? DEFAULT_CLAIM_LEASE_MS,
        resolve,
        cancelTimeout,
      };
    });
  }
  return { waitForClaim, resolvePendingClaim, offerPendingMessage };
}
