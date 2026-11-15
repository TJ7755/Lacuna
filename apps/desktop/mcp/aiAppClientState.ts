import type { Socket } from 'node:net';
import type { AiBridgeRequest, AiBridgeResult } from '@lacuna/protocol/ai/protocol';
import type { AiCompanionOperationError } from '@lacuna/protocol/ai/companionErrors';

interface ActiveRun {
  runId: string;
  messageId: string;
}

interface PendingRequest {
  request: AiBridgeRequest;
  resolve: (result: AiBridgeResult) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export interface AiAppClientState {
  socket: Socket | null;
  connecting: Promise<void> | null;
  pending: Map<string, PendingRequest>;
  connectionId: string | null;
  activeRun: ActiveRun | null;
  leaseRenewTimer: ReturnType<typeof setTimeout> | null;
  leaseRenewalFailure: AiCompanionOperationError | null;
  supportsLeaseRenewal: boolean;
}
