import type {
  AiActionReceipt,
  AiApprovalState,
  AiBridgeError,
  AiRunStatus,
  JsonValue,
} from '../protocol';
import type { ToolExecutionOutcome, ToolExecutionRequest } from '../../mcp/executor';
import type { McpGrant } from '../../mcp/types';

export interface AiToolSessionDependencies {
  executeToolCall?: (request: ToolExecutionRequest) => Promise<ToolExecutionOutcome>;
  now?: () => number;
  createId?: () => string;
  /** Receives canonical JSON and returns a lowercase SHA-256 digest. */
  digest?: (canonicalInput: string) => Promise<string> | string;
}

export interface AiToolWriteGrant {
  connectionId: string;
  courseId: string;
  scope: 'write';
  grantedAt: number;
  label?: string;
}

export interface ExactApprovalBinding {
  connectionId: string;
  runId: string;
  callId: string;
  toolName: string;
  courseId: string;
  inputDigest: string;
}

export interface AiToolApprovalRecord extends ExactApprovalBinding {
  approval: AiApprovalState;
}

export interface AiToolLedgerEntry {
  connectionId: string;
  runId: string;
  callId: string;
  toolName: string;
  courseId: string;
  inputDigest: string;
  requiredScope: McpGrant['scope'];
  response: { ok: true; result: JsonValue } | { ok: false; error: AiBridgeError };
  receipt?: AiActionReceipt;
}

export interface AiToolSessionState {
  grants: AiToolWriteGrant[];
  approvals: AiToolApprovalRecord[];
  ledger: AiToolLedgerEntry[];
}

export interface AiToolActivityState {
  status: 'awaiting_approval' | 'working' | 'failed' | 'completed';
  summary: string;
  detail?: string;
  updatedAt: number;
}

export interface AiToolEffects {
  approval?: AiApprovalState;
  activity?: AiToolActivityState;
  receipt?: AiActionReceipt;
}

export type AiToolWireResponse =
  | { ok: true; result: JsonValue }
  | { ok: false; error: AiBridgeError };

export interface AiToolInvokeResult {
  response: AiToolWireResponse;
  effects: AiToolEffects;
}

export type AiToolDecisionResult =
  | { ok: true; approval: AiApprovalState; effects: AiToolEffects }
  | { ok: false; error: AiBridgeError; effects: AiToolEffects };

export interface AiToolInvokeRequest {
  connectionId: string;
  runId: string;
  runStatus: AiRunStatus | 'disconnected';
  callId: string;
  toolName: string;
  input: unknown;
}
