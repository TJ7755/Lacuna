// The transport-neutral MCP tool execution seam. Consent is deliberately not handled here:
// the owning adapter issues a grant first, then supplies it with the call.

import { scopeSatisfies } from './grants';
import { replacementLifecycle } from '../db/replacementLifecycle';
import { getTool, validateAndRun } from './registry';
import type { McpScopeTarget, McpToolError } from './bridge/protocol';
import type { RecordedUndo } from './bridge/undoRegistry';
import { resolveToolScopes } from './bridge/scopeResolver';
import { recordUndo } from './bridge/undoRegistry';
import type { McpGrant, ToolResult } from './types';

export interface ToolExecutionRequest {
  callId: string;
  toolName: string;
  input: unknown;
  agentId: string;
  grant: McpGrant;
}

export interface ToolReceiptSeed {
  callId: string;
  toolName: string;
  requiredScope: McpGrant['scope'];
  target: McpScopeTarget;
  completedAt: number;
}

export interface ToolExecutionHooks {
  onUndoAvailable?: (undo: RecordedUndo) => void;
  now?: () => number;
}

export type ToolExecutionOutcome =
  | { ok: true; result: ToolResult['data']; receipt: ToolReceiptSeed }
  | { ok: false; error: McpToolError };

const GRANT_MISMATCH_ERROR = {
  kind: 'forbidden' as const,
  message: 'The MCP invocation grant does not match the requested tool scope.',
};

function internalError(error: unknown): ToolExecutionOutcome {
  return {
    ok: false,
    error: {
      kind: 'internal',
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

/**
 * Executes one tool after its owning adapter has obtained the required grant. This function
 * owns the complete shared sequence: lookup, validation, live scope resolution, grant checks,
 * handler execution, renderer-side undo capture and receipt creation.
 */
export async function executeToolCall(
  request: ToolExecutionRequest,
  hooks: ToolExecutionHooks = {},
): Promise<ToolExecutionOutcome> {
  try {
    const tool = getTool(request.toolName);
    if (!tool) {
      return {
        ok: false,
        error: { kind: 'not_found', message: `Unknown tool "${request.toolName}".` },
      };
    }

    const parsed = tool.inputSchema.safeParse(request.input);
    if (!parsed.success) {
      return { ok: false, error: { kind: 'validation', message: parsed.error.message } };
    }

    const execute = async (): Promise<ToolExecutionOutcome> => {
      const scopes = await resolveToolScopes(parsed.data, tool.name);
      if (!scopes.ok) return { ok: false, error: scopes.error };
      if (scopes.targets.length !== 1) {
        return {
          ok: false,
          error: {
            kind: 'conflict',
            message: 'A single MCP tool call must resolve to exactly one permission scope.',
          },
        };
      }
      const target = scopes.targets[0];
      if (
        target.courseId !== request.grant.courseId ||
        !scopeSatisfies(request.grant.scope, tool.requiredScope)
      ) {
        return { ok: false, error: GRANT_MISMATCH_ERROR };
      }

      const outcome = await validateAndRun(tool, parsed.data, {
        grant: request.grant,
        agentId: request.agentId,
      });
      if (!outcome.ok) return outcome;

      if (outcome.result.undo) {
        const recordedAt = (hooks.now ?? Date.now)();
        const recorded: RecordedUndo = {
          requestId: request.callId,
          toolName: tool.name,
          payload: outcome.result.undo,
          recordedAt,
        };
        recordUndo(request.callId, tool.name, outcome.result.undo);
        hooks.onUndoAvailable?.(recorded);
      }

      const completedAt = (hooks.now ?? Date.now)();
      return {
        ok: true,
        result: outcome.result.data,
        receipt: {
          callId: request.callId,
          toolName: tool.name,
          requiredScope: tool.requiredScope,
          target,
          completedAt,
        },
      };
    };

    return tool.requiredScope === 'read'
      ? await execute()
      : await replacementLifecycle.admitWrite(execute);
  } catch (error) {
    return internalError(error);
  }
}
