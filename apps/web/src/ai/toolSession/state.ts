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

const OMIT = Symbol('omit');
const INVALID = Symbol('invalid');

/**
 * Convert repository results into their JSON wire representation without weakening the wire
 * validator. Optional object fields are commonly represented as own `undefined` properties in
 * database records; JSON omits those fields, so do the same before the result reaches the ledger.
 */
export function normaliseJsonValue(value: unknown): JsonValue | undefined {
  const normalised = normalise(value, new Set());
  return normalised === OMIT || normalised === INVALID ? undefined : normalised;
}

function normalise(
  value: unknown,
  ancestors: Set<object>,
): JsonValue | typeof OMIT | typeof INVALID {
  if (value === undefined) return OMIT;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : INVALID;
  if (typeof value !== 'object' || ancestors.has(value)) return INVALID;

  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    const result: JsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !('value' in descriptor)) return INVALID;
      const item = normalise(descriptor.value, nextAncestors);
      if (item === OMIT || item === INVALID) return INVALID;
      result.push(item);
    }
    const ownKeys = Reflect.ownKeys(value).filter((key) => key !== 'length');
    if (ownKeys.length !== value.length) return INVALID;
    return result;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return INVALID;
  const keys = Reflect.ownKeys(value);
  const result: Record<string, JsonValue> = {};
  for (const key of keys) {
    if (typeof key !== 'string') return INVALID;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !('value' in descriptor)) return INVALID;
    const property = normalise(descriptor.value, nextAncestors);
    if (property === INVALID) return INVALID;
    if (property !== OMIT) result[key] = property;
  }
  return result;
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
