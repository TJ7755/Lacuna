import { aiApprovalStateSchema } from './protocol';
import type { AiApprovalState, AiBridgeError } from './protocol';
import { executeToolCall as defaultExecuteToolCall } from '../mcp/executor';
import { getTool } from '../mcp/registry';
import { CREATE_COURSE_SCOPE_KEY, resolveToolScopes } from '../mcp/bridge/scopeResolver';
import type { McpGrant } from '../mcp/types';
import { canonicalJson, defaultCreateId, defaultDigest } from './toolSession/digest';
import { internalError, stoppedError, toolError, unavailableError } from './toolSession/errors';
import { bindingMatches, ledgerKey, replay, storeLedger } from './toolSession/ledger';
import { makeReceipt, summaryForTool, targetLabel } from './toolSession/receipts';
import {
  MAX_APPROVALS,
  MAX_GRANTS,
  MAX_LEDGER_ENTRIES,
  isJsonValue,
  restoreState,
} from './toolSession/state';
import type {
  AiToolActivityState,
  AiToolApprovalRecord,
  AiToolDecisionResult,
  AiToolEffects,
  AiToolInvokeRequest,
  AiToolInvokeResult,
  AiToolLedgerEntry,
  AiToolSessionDependencies,
  AiToolSessionState,
  AiToolWireResponse,
  AiToolWriteGrant,
} from './toolSession/types';
export type {
  AiToolActivityState,
  AiToolApprovalRecord,
  AiToolDecisionResult,
  AiToolEffects,
  AiToolInvokeRequest,
  AiToolInvokeResult,
  AiToolLedgerEntry,
  AiToolSessionDependencies,
  AiToolSessionState,
  AiToolWireResponse,
  AiToolWriteGrant,
} from './toolSession/types';

const APPROVAL_RETRY_AFTER_MS = 500;

const EMPTY_EFFECTS: AiToolEffects = {};

function grantKey(connectionId: string, courseId: string): string {
  return `${connectionId}\u0000${courseId}`;
}

export class AiToolSession {
  private readonly execute: NonNullable<AiToolSessionDependencies['executeToolCall']>;
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly digest: (canonicalInput: string) => Promise<string>;
  private readonly grants = new Map<string, AiToolWriteGrant>();
  private readonly approvals = new Map<string, AiToolApprovalRecord>();
  private readonly ledger = new Map<string, AiToolLedgerEntry>();

  constructor(dependencies: AiToolSessionDependencies = {}, state?: unknown) {
    this.execute = dependencies.executeToolCall ?? defaultExecuteToolCall;
    this.now = dependencies.now ?? Date.now;
    this.createId = dependencies.createId ?? defaultCreateId;
    const digest = dependencies.digest ?? defaultDigest;
    this.digest = async (canonicalInput) => digest(canonicalInput);
    this.restore(state);
  }

  exportState(): AiToolSessionState {
    return {
      grants: [...this.grants.values()].slice(-MAX_GRANTS),
      approvals: [...this.approvals.values()].slice(-MAX_APPROVALS),
      ledger: [...this.ledger.values()].slice(-MAX_LEDGER_ENTRIES),
    };
  }

  getState(): AiToolSessionState {
    return this.exportState();
  }

  restoreState(state: unknown): void {
    this.restore(state);
  }

  restore(state: unknown): void {
    const bounded = restoreState(state);
    this.grants.clear();
    this.approvals.clear();
    this.ledger.clear();
    for (const grant of bounded.grants)
      this.grants.set(grantKey(grant.connectionId, grant.courseId), grant);
    for (const approval of bounded.approvals)
      this.approvals.set(approval.approval.approvalId, approval);
    for (const entry of bounded.ledger)
      this.ledger.set(ledgerKey(entry.connectionId, entry.callId), entry);
  }

  reset(connectionId: string): void {
    for (const [grantKey, grant] of this.grants) {
      if (grant.connectionId === connectionId) this.grants.delete(grantKey);
    }
    for (const [approvalId, approval] of this.approvals) {
      if (approval.connectionId === connectionId) this.approvals.delete(approvalId);
    }
    for (const [callKey, entry] of this.ledger) {
      if (entry.connectionId === connectionId) this.ledger.delete(callKey);
    }
  }

  clear(): void {
    this.grants.clear();
    this.approvals.clear();
    this.ledger.clear();
  }

  async invoke(request: AiToolInvokeRequest): Promise<AiToolInvokeResult> {
    try {
      if (request.runStatus === 'disconnected') {
        return { response: { ok: false, error: unavailableError() }, effects: EMPTY_EFFECTS };
      }
      if (request.runStatus !== 'active') {
        return {
          response: { ok: false, error: stoppedError(request.runId) },
          effects: EMPTY_EFFECTS,
        };
      }

      const tool = getTool(request.toolName);
      if (!tool) {
        return {
          response: {
            ok: false,
            error: toolError({ kind: 'not_found', message: `Unknown tool "${request.toolName}".` }),
          },
          effects: EMPTY_EFFECTS,
        };
      }
      const parsed = tool.inputSchema.safeParse(request.input);
      if (!parsed.success) {
        return {
          response: {
            ok: false,
            error: toolError({ kind: 'validation', message: parsed.error.message }),
          },
          effects: EMPTY_EFFECTS,
        };
      }
      const scopes = await resolveToolScopes(parsed.data, tool.name);
      if (!scopes.ok)
        return { response: { ok: false, error: toolError(scopes.error) }, effects: EMPTY_EFFECTS };
      if (scopes.targets.length !== 1) {
        return {
          response: {
            ok: false,
            error: toolError({
              kind: 'conflict',
              message: 'A single AI tool call must resolve to exactly one permission scope.',
            }),
          },
          effects: EMPTY_EFFECTS,
        };
      }
      const target = scopes.targets[0];
      const inputDigest = await this.digest(canonicalJson(parsed.data));
      const callKey = ledgerKey(request.connectionId, request.callId);
      const existing = this.ledger.get(callKey);
      if (existing) {
        if (!bindingMatches(existing, request, tool.name, target.courseId, inputDigest)) {
          return this.conflict('This callId is already bound to a different tool invocation.');
        }
        return replay(existing);
      }

      const pending = this.pendingForCall(request, tool.name, target.courseId, inputDigest);
      if (pending === 'conflict')
        return this.conflict('This callId is already bound to a different tool invocation.');

      if (tool.requiredScope === 'destructive') {
        return this.invokeExactApproval(
          request,
          tool,
          parsed.data,
          target,
          inputDigest,
          pending,
          'destructive_call',
        );
      }
      if (tool.requiredScope === 'write' && target.courseId === CREATE_COURSE_SCOPE_KEY) {
        return this.invokeExactApproval(
          request,
          tool,
          parsed.data,
          target,
          inputDigest,
          pending,
          'write_call',
        );
      }

      const grant = this.grants.get(grantKey(request.connectionId, target.courseId));
      if (tool.requiredScope === 'write' && !grant) {
        return this.requestWriteApproval(request, tool.name, target, inputDigest, pending);
      }

      return this.executeAndStore(
        request,
        tool,
        parsed.data,
        target,
        grant ?? {
          courseId: target.courseId,
          scope: 'read',
          grantedAt: this.now(),
          label: target.label,
        },
        inputDigest,
      );
    } catch (error) {
      return { response: { ok: false, error: internalError(error) }, effects: EMPTY_EFFECTS };
    }
  }

  async decide(approvalId: string, approved: boolean): Promise<AiToolDecisionResult> {
    const record = this.approvals.get(approvalId);
    if (!record)
      return {
        ok: false,
        error: this.conflictError('This approval is no longer available.'),
        effects: EMPTY_EFFECTS,
      };
    const current = record.approval;
    if (current.status !== 'pending') {
      return {
        ok: false,
        error: this.conflictError('This approval has already been resolved.'),
        effects: { approval: current },
      };
    }
    const decidedAt = this.now();
    const next: AiApprovalState = approved
      ? { ...current, status: 'approved', decidedAt }
      : { ...current, status: 'rejected', decidedAt };
    record.approval = aiApprovalStateSchema.parse(next);
    if (approved && current.kind === 'write_grant') {
      this.grants.set(grantKey(record.connectionId, record.courseId), {
        connectionId: record.connectionId,
        courseId: record.courseId,
        scope: 'write',
        grantedAt: decidedAt,
        label: current.targetLabel,
      });
    }
    const activity: AiToolActivityState = {
      status: approved ? 'working' : 'failed',
      summary: approved ? 'Approval granted.' : 'Approval rejected.',
      updatedAt: decidedAt,
    };
    return {
      ok: true,
      approval: record.approval,
      effects: { approval: record.approval, activity },
    };
  }

  private pendingForCall(
    request: AiToolInvokeRequest,
    toolName: string,
    courseId: string,
    inputDigest: string,
  ): AiToolApprovalRecord | 'conflict' | undefined {
    for (const record of this.approvals.values()) {
      if (record.connectionId !== request.connectionId || record.callId !== request.callId)
        continue;
      if (
        record.runId !== request.runId ||
        record.toolName !== toolName ||
        record.courseId !== courseId ||
        record.inputDigest !== inputDigest
      )
        return 'conflict';
      return record;
    }
    return undefined;
  }

  private async invokeExactApproval(
    request: AiToolInvokeRequest,
    tool: { name: string; requiredScope: McpGrant['scope']; description: string },
    input: unknown,
    target: { courseId: string; label?: string },
    inputDigest: string,
    pending: AiToolApprovalRecord | undefined,
    approvalKind: 'write_call' | 'destructive_call',
  ): Promise<AiToolInvokeResult> {
    let approval = pending;
    if (!approval) {
      approval = this.findExactApproval(
        request,
        tool.name,
        target.courseId,
        inputDigest,
        approvalKind,
      );
    }
    if (!approval) {
      approval = this.createApproval(request, tool.name, target, inputDigest, approvalKind);
      return this.approvalRequired(approval);
    }
    if (approval.approval.status === 'pending') return this.approvalPending(approval);
    if (approval.approval.status !== 'approved') {
      return this.conflict('This destructive approval cannot be reused.');
    }

    const consumedAt = this.now();
    approval.approval = aiApprovalStateSchema.parse({
      ...approval.approval,
      status: 'consumed',
      consumedAt,
      decidedAt: approval.approval.decidedAt,
    });
    return this.executeAndStore(
      request,
      tool,
      input,
      target,
      {
        courseId: target.courseId,
        scope: tool.requiredScope,
        grantedAt: consumedAt,
        label: target.label,
      },
      inputDigest,
    );
  }

  private findExactApproval(
    request: AiToolInvokeRequest,
    toolName: string,
    courseId: string,
    inputDigest: string,
    approvalKind: 'write_call' | 'destructive_call',
  ): AiToolApprovalRecord | undefined {
    for (const record of this.approvals.values()) {
      if (
        record.connectionId === request.connectionId &&
        record.runId === request.runId &&
        record.callId === request.callId &&
        record.toolName === toolName &&
        record.courseId === courseId &&
        record.inputDigest === inputDigest &&
        record.approval.kind === approvalKind
      )
        return record;
    }
    return undefined;
  }

  private requestWriteApproval(
    request: AiToolInvokeRequest,
    toolName: string,
    target: { courseId: string; label?: string },
    inputDigest: string,
    pending: AiToolApprovalRecord | undefined,
  ): AiToolInvokeResult {
    if (pending) {
      if (pending.approval.status === 'pending') return this.approvalPending(pending);
      if (pending.approval.status === 'rejected' || pending.approval.status === 'expired') {
        return this.conflict('This write approval cannot be reused.');
      }
    }
    const sharedPending = [...this.approvals.values()].find(
      (record) =>
        record.connectionId === request.connectionId &&
        record.courseId === target.courseId &&
        record.approval.kind === 'write_grant' &&
        record.approval.status === 'pending',
    );
    if (sharedPending) return this.approvalPending(sharedPending);
    const approval = this.createApproval(request, toolName, target, inputDigest, 'write_grant');
    return this.approvalRequired(approval);
  }

  private createApproval(
    request: AiToolInvokeRequest,
    toolName: string,
    target: { courseId: string; label?: string },
    inputDigest: string,
    kind: 'write_grant' | 'write_call' | 'destructive_call',
  ): AiToolApprovalRecord {
    const label = targetLabel(target);
    const approval: AiApprovalState = {
      approvalId: this.createId(),
      kind,
      toolName,
      targetLabel: label,
      summary:
        kind === 'write_grant' ? `Allow writes to ${label}.` : `Approve ${toolName} on ${label}.`,
      status: 'pending',
      requestedAt: this.now(),
    };
    const record: AiToolApprovalRecord = {
      connectionId: request.connectionId,
      runId: request.runId,
      callId: request.callId,
      toolName,
      courseId: target.courseId,
      inputDigest,
      approval,
    };
    this.approvals.set(approval.approvalId, record);
    while (this.approvals.size > MAX_APPROVALS) {
      const first = this.approvals.keys().next().value;
      if (first === undefined) break;
      this.approvals.delete(first);
    }
    return record;
  }

  private approvalRequired(record: AiToolApprovalRecord): AiToolInvokeResult {
    return {
      response: {
        ok: false,
        error: {
          kind: 'approval_required',
          approvalId: record.approval.approvalId,
          approvalKind: record.approval.kind,
          message: record.approval.summary,
        },
      },
      effects: {
        approval: record.approval,
        activity: {
          status: 'awaiting_approval',
          summary: record.approval.summary,
          updatedAt: record.approval.requestedAt,
        },
      },
    };
  }

  private approvalPending(record: AiToolApprovalRecord): AiToolInvokeResult {
    return {
      response: {
        ok: false,
        error: {
          kind: 'approval_pending',
          approvalId: record.approval.approvalId,
          approvalKind: record.approval.kind,
          message: record.approval.summary,
          retryAfterMs: APPROVAL_RETRY_AFTER_MS,
        },
      },
      effects: { approval: record.approval },
    };
  }

  private async executeAndStore(
    request: AiToolInvokeRequest,
    tool: { name: string; requiredScope: McpGrant['scope']; description: string },
    input: unknown,
    target: { courseId: string; label?: string },
    grant: McpGrant,
    inputDigest: string,
  ): Promise<AiToolInvokeResult> {
    const outcome = await this.execute({
      callId: request.callId,
      toolName: tool.name,
      input,
      agentId: request.connectionId,
      grant,
    });
    if (!outcome.ok) {
      const error = toolError(outcome.error);
      const response: AiToolWireResponse = { ok: false, error };
      storeLedger(
        this.ledger,
        request,
        tool,
        target,
        inputDigest,
        response,
        undefined,
        MAX_LEDGER_ENTRIES,
      );
      return {
        response,
        effects: {
          activity: {
            status: 'failed',
            summary: error.kind === 'tool' ? error.error.message : error.message,
            updatedAt: this.now(),
          },
        },
      };
    }
    if (!isJsonValue(outcome.result)) {
      const response: AiToolWireResponse = {
        ok: false,
        error: internalError(new Error('Tool result is not JSON-safe.')),
      };
      storeLedger(
        this.ledger,
        request,
        tool,
        target,
        inputDigest,
        response,
        undefined,
        MAX_LEDGER_ENTRIES,
      );
      return {
        response,
        effects: {
          activity: {
            status: 'failed',
            summary: 'Tool result was not JSON-safe.',
            updatedAt: this.now(),
          },
        },
      };
    }
    const receipt =
      tool.requiredScope !== 'read'
        ? makeReceipt({
            callId: request.callId,
            toolName: tool.name,
            input,
            result: outcome.result,
            target,
            completedAt: outcome.receipt.completedAt,
            createId: this.createId,
          })
        : undefined;
    const response: AiToolWireResponse = { ok: true, result: outcome.result };
    storeLedger(
      this.ledger,
      request,
      tool,
      target,
      inputDigest,
      response,
      receipt,
      MAX_LEDGER_ENTRIES,
    );
    return {
      response,
      effects: {
        ...(receipt ? { receipt } : {}),
        activity: {
          status: 'completed',
          summary: receipt?.summary ?? summaryForTool(tool.name),
          updatedAt: outcome.receipt.completedAt,
        },
      },
    };
  }

  private conflict(message: string): AiToolInvokeResult {
    return { response: { ok: false, error: this.conflictError(message) }, effects: EMPTY_EFFECTS };
  }

  private conflictError(message: string): AiBridgeError {
    return { kind: 'conflict', message };
  }
}

export function createAiToolSession(
  dependencies: AiToolSessionDependencies = {},
  state?: unknown,
): AiToolSession {
  return new AiToolSession(dependencies, state);
}
