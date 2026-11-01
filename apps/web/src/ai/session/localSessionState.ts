import type { AiBridgeResult, AiInstructionBundle, AiRunState, AiUserMessage } from '../protocol';
import type { AiSessionSnapshot } from './types';

export const DEFAULT_CLAIM_LEASE_MS = 5 * 60_000;

export interface LocalMessage extends AiUserMessage {
  instructions: AiInstructionBundle;
  delivery: 'queued' | 'claimed';
  runId?: string;
}

interface PendingClaim {
  channelId: string;
  connectionId: string;
  leaseMs: number;
  resolve: (result: AiBridgeResult) => void;
  cancelTimeout: () => void;
}

/** The local session remains the sole owner of channels, claims and lease cancellation. */
export interface LocalSessionState {
  snapshot: AiSessionSnapshot;
  active: boolean;
  ownerChannelId: string | null;
  ownerConnectedAt: number | null;
  messages: LocalMessage[];
  pendingClaim: PendingClaim | null;
  cancelLeaseExpiry: (() => void) | null;
  stopListening: (() => void) | null;
}

export function stoppedOrConflict(runId: string, run: AiRunState | null): AiBridgeResult {
  if (run?.runId === runId && run.status !== 'active') {
    return {
      ok: false,
      error: { kind: 'stopped', runId, message: 'Stop was requested for this AI run.' },
    };
  }
  return conflictBridge('That AI run is no longer active.');
}

export function unavailableBridge(message: string): AiBridgeResult {
  return {
    ok: false,
    error: { kind: 'unavailable', reason: 'disconnected', message },
  };
}

export function conflictBridge(message: string): AiBridgeResult {
  return { ok: false, error: { kind: 'conflict', message } };
}
