import type {
  AiActionReceipt,
  AiApprovalState,
  AiBridgeError,
  AiClientIdentity,
  AiEntityReference,
  AiRunState,
} from '../protocol';

export type AiSessionConnection =
  | { status: 'disconnected'; reason?: string }
  | { status: 'pairing'; code: string; expiresAt: number }
  | {
      status: 'connected' | 'quiet';
      connectionId: string;
      client: AiClientIdentity;
      lastActivityAt: number;
    };

export type AiConversationItem =
  | {
      kind: 'user';
      id: string;
      content: string;
      createdAt: number;
      delivery: 'queued' | 'claimed' | 'completed' | 'stopped';
    }
  | {
      kind: 'assistant';
      id: string;
      content: string;
      createdAt: number;
      sources: readonly AiEntityReference[];
    }
  | { kind: 'receipt'; id: string; receipt: AiActionReceipt }
  | { kind: 'error'; id: string; error: AiBridgeError; createdAt: number };

export interface AiActivityView {
  runId: string;
  status: 'working' | 'awaiting_approval' | 'stop_requested' | 'failed' | 'completed';
  summary: string;
  detail?: string;
  updatedAt: number;
}

/** UI read model. Persistence rows, grants, leases and approval input digests stay private. */
export interface AiSessionSnapshot {
  revision: number;
  connection: AiSessionConnection;
  conversationId: string | null;
  items: readonly AiConversationItem[];
  run: AiRunState | null;
  activity: AiActivityView | null;
  approval: AiApprovalState | null;
  draft: string;
  queuedFollowUp: string | null;
}

export type AiSessionCommandError =
  | { kind: 'unavailable'; message: string }
  | { kind: 'conflict'; message: string }
  | { kind: 'internal'; message: string };

export type AiSessionCommandResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: AiSessionCommandError };

/**
 * The UI's sole session seam. `getSnapshot` is referentially stable between notifications so a
 * React adapter can consume it with `useSyncExternalStore`; tests use the same interface.
 */
export interface AiSession {
  subscribe(listener: () => void): () => void;
  getSnapshot(): AiSessionSnapshot;
  /** Start device-local background work after the owning UI has committed. */
  activate(): void;
  /** Stop device-local background work without mutating persisted conversation state. */
  dispose(): void;
  pair(): Promise<AiSessionCommandResult<{ code: string; expiresAt: number }>>;
  send(content: string): Promise<AiSessionCommandResult<{ messageId: string }>>;
  stop(runId: string): Promise<AiSessionCommandResult>;
  decide(approvalId: string, approved: boolean): Promise<AiSessionCommandResult>;
  resetConnection(): Promise<AiSessionCommandResult>;
}
