import type { ToolExecutionOutcome } from '../../mcp/executor';
import type { McpGrant } from '../../mcp/types';
import { internalError, toolError } from './errors';
import { storeLedger } from './ledger';
import { makeReceipt, summaryForTool } from './receipts';
import { MAX_LEDGER_ENTRIES, normaliseJsonValue } from './state';
import type {
  AiToolInvokeRequest,
  AiToolInvokeResult,
  AiToolLedgerEntry,
  AiToolWireResponse,
} from './types';

interface ExecutionRecord {
  request: AiToolInvokeRequest;
  tool: { name: string; requiredScope: McpGrant['scope'] };
  input: unknown;
  target: { courseId: string; label?: string };
  inputDigest: string;
  outcome: ToolExecutionOutcome;
}

interface RecordingContext {
  ledger: Map<string, AiToolLedgerEntry>;
  now: () => number;
  createId: () => string;
}

/** Record a completed execution before publishing its response and activity. */
export function recordExecution(
  { request, tool, input, target, inputDigest, outcome }: ExecutionRecord,
  { ledger, now, createId }: RecordingContext,
): AiToolInvokeResult {
  if (!outcome.ok) {
    const safeError =
      outcome.error.kind === 'internal'
        ? { ...outcome.error, message: 'The Lacuna domain tool failed.' }
        : outcome.error;
    const error = toolError(safeError);
    const response: AiToolWireResponse = { ok: false, error };
    storeLedger(
      ledger,
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
          updatedAt: now(),
        },
      },
    };
  }
  const result = normaliseJsonValue(outcome.result);
  if (result === undefined) {
    const response: AiToolWireResponse = {
      ok: false,
      error: internalError(new Error('Tool result is not JSON-safe.')),
    };
    storeLedger(
      ledger,
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
          updatedAt: now(),
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
          result,
          target,
          completedAt: outcome.receipt.completedAt,
          createId,
        })
      : undefined;
  const response: AiToolWireResponse = { ok: true, result };
  storeLedger(ledger, request, tool, target, inputDigest, response, receipt, MAX_LEDGER_ENTRIES);
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
