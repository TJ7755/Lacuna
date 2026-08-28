import {
  aiActionReceiptSchema,
  aiApprovalStateSchema,
  aiBridgeErrorSchema,
  jsonValueSchema,
} from '../protocol';
import type { JsonValue } from '../protocol';
import type {
  AiToolApprovalRecord,
  AiToolLedgerEntry,
  AiToolSessionState,
  AiToolWriteGrant,
} from './types';

export const MAX_GRANTS = 100;
export const MAX_APPROVALS = 100;
export const MAX_LEDGER_ENTRIES = 500;

export function isJsonValue(value: unknown): value is JsonValue {
  return jsonValueSchema.safeParse(value).success;
}

function cleanGrant(value: unknown): AiToolWriteGrant | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const grant = value as Partial<AiToolWriteGrant>;
  if (
    typeof grant.connectionId !== 'string' ||
    typeof grant.courseId !== 'string' ||
    grant.scope !== 'write' ||
    typeof grant.grantedAt !== 'number' ||
    !Number.isFinite(grant.grantedAt) ||
    (grant.label !== undefined && typeof grant.label !== 'string')
  )
    return undefined;
  return {
    connectionId: grant.connectionId,
    courseId: grant.courseId,
    scope: 'write',
    grantedAt: grant.grantedAt,
    ...(grant.label === undefined ? {} : { label: grant.label }),
  };
}

function cleanApproval(value: unknown): AiToolApprovalRecord | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Partial<AiToolApprovalRecord>;
  if (
    typeof record.connectionId !== 'string' ||
    typeof record.runId !== 'string' ||
    typeof record.callId !== 'string' ||
    typeof record.toolName !== 'string' ||
    typeof record.courseId !== 'string' ||
    typeof record.inputDigest !== 'string'
  )
    return undefined;
  const approval = aiApprovalStateSchema.safeParse(record.approval);
  if (!approval.success) return undefined;
  return {
    connectionId: record.connectionId,
    runId: record.runId,
    callId: record.callId,
    toolName: record.toolName,
    courseId: record.courseId,
    inputDigest: record.inputDigest,
    approval: approval.data,
  };
}

function cleanLedger(value: unknown): AiToolLedgerEntry | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const entry = value as Partial<AiToolLedgerEntry>;
  if (
    typeof entry.connectionId !== 'string' ||
    typeof entry.runId !== 'string' ||
    typeof entry.callId !== 'string' ||
    typeof entry.toolName !== 'string' ||
    typeof entry.courseId !== 'string' ||
    typeof entry.inputDigest !== 'string' ||
    !['read', 'write', 'destructive'].includes(entry.requiredScope as string)
  )
    return undefined;
  if (!entry.response || typeof entry.response !== 'object') return undefined;
  const response = entry.response as AiToolLedgerEntry['response'];
  if (response.ok) {
    if (!isJsonValue(response.result)) return undefined;
  } else if (!aiBridgeErrorSchema.safeParse(response.error).success) {
    return undefined;
  }
  const receipt =
    entry.receipt === undefined ? undefined : aiActionReceiptSchema.safeParse(entry.receipt);
  if (receipt && !receipt.success) return undefined;
  return {
    connectionId: entry.connectionId,
    runId: entry.runId,
    callId: entry.callId,
    toolName: entry.toolName,
    courseId: entry.courseId,
    inputDigest: entry.inputDigest,
    requiredScope: entry.requiredScope as AiToolLedgerEntry['requiredScope'],
    response: response.ok
      ? { ok: true, result: response.result }
      : { ok: false, error: response.error },
    ...(receipt && receipt.success ? { receipt: receipt.data } : {}),
  };
}

export function restoreState(value: unknown): AiToolSessionState {
  if (!value || typeof value !== 'object') return { grants: [], approvals: [], ledger: [] };
  const state = value as Partial<AiToolSessionState>;
  const grants = Array.isArray(state.grants) ? state.grants : [];
  const approvals = Array.isArray(state.approvals) ? state.approvals : [];
  const ledger = Array.isArray(state.ledger) ? state.ledger : [];
  return {
    grants: grants
      .map(cleanGrant)
      .filter((grant): grant is AiToolWriteGrant => !!grant)
      .slice(-MAX_GRANTS),
    approvals: approvals
      .map(cleanApproval)
      .filter((approval): approval is AiToolApprovalRecord => !!approval)
      .slice(-MAX_APPROVALS),
    ledger: ledger
      .map(cleanLedger)
      .filter((entry): entry is AiToolLedgerEntry => !!entry)
      .slice(-MAX_LEDGER_ENTRIES),
  };
}
