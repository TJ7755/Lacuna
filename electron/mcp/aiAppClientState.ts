import type { Socket } from 'node:net';
import type { AiBridgeRequest, AiBridgeResult } from '../../src/ai/protocol.js';
import type { AiCompanionOperationError } from '../../src/ai/companionErrors.js';

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
