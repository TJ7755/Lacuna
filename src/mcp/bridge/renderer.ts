// Renderer side of the main <-> renderer MCP bridge (Arc 2 Section 2.1, Task 9). The
// renderer is the only process with IndexedDB, so it is where every tool handler actually
// runs. electron/mcp/server.ts forwards each MCP tool call here as an `mcp:invoke` IPC
// message (via the narrow `window.electronAPI.mcp` surface from electron/preload.ts);
// attachMcpBridge() looks the tool up in src/mcp/registry.ts, runs it through
// `validateAndRun`, and replies with `mcp:invoke:reply`.
//
// Bridge-deadlock risk (next_plan.md Section 2.10): if a failure here never replies, the
// main process's request hangs until its own timeout fires (src/mcp/bridge/dispatcher.ts).
// Every path below — unknown tool, validation/handler failure, or a genuinely unexpected
// thrown error — is therefore wrapped so a reply is always sent.

import { getTool, validateAndRun } from '../registry';
import { scopeSatisfies } from '../grants';
import type { ToolContext } from '../types';
import type { McpInvokeRequest, McpInvokeResponse } from './protocol';
import { resolveToolScopes } from './scopeResolver';
import { recordUndo } from './undoRegistry';
import type { RecordedUndo } from './undoRegistry';

export interface McpBridgeOptions {
  onUndoAvailable?: (undo: RecordedUndo) => void;
}

/**
 * Subscribes to `mcp:invoke` and starts answering tool calls. Call once at app startup,
 * guarded by `window.electronAPI?.isElectron` — see src/App.tsx. Returns an unsubscribe
 * function (matching the other `electronAPI.on*` listeners), or undefined if the Electron
 * bridge is not present (e.g. running the web build).
 */
export function attachMcpBridge(options: McpBridgeOptions = {}): (() => void) | undefined {
  const mcp = typeof window !== 'undefined' ? window.electronAPI?.mcp : undefined;
  if (!mcp) return undefined;

  return mcp.onInvoke((request: McpInvokeRequest) => {
    void handleInvoke(request, mcp.reply, options);
  });
}

export async function handleInvoke(
  request: McpInvokeRequest,
  reply: (response: McpInvokeResponse) => void,
  options: McpBridgeOptions,
): Promise<void> {
  try {
    const tool = getTool(request.tool);
    if (!tool) {
      reply({
        id: request.id,
        ok: false,
        error: { kind: 'not_found', message: `Unknown tool "${request.tool}".` },
      });
      return;
    }

    // The main process resolved this scope against the live database before consent.
    // A course move before this second check may be rejected spuriously; that race
    // deliberately fails closed.
    const scopes = await resolveToolScopes(request.input);
    if (!scopes.ok) {
      reply({ id: request.id, ok: false, error: scopes.error });
      return;
    }
    if (scopes.targets.length !== 1 || scopes.targets[0].courseId !== request.grant.courseId ||
      !scopeSatisfies(request.grant.scope, tool.requiredScope)) {
      reply({
        id: request.id,
        ok: false,
        error: { kind: 'forbidden', message: 'The MCP invocation grant does not match the requested tool scope.' },
      });
      return;
    }

    // The exact validated grant is passed through to the handler rather than replaced by
    // a synthetic permission context after main-process consent.
    const ctx: ToolContext = { grant: request.grant, agentId: request.agentId };

    const outcome = await validateAndRun(tool, request.input, ctx);
    if (!outcome.ok) {
      reply({ id: request.id, ok: false, error: outcome.error });
      return;
    }

    // `undo` is stripped here — it must never cross the IPC boundary to the calling agent
    // (src/mcp/types.ts's ToolResult doc comment). It is kept renderer-side for Task 11's
    // undo toast instead.
    if (outcome.result.undo) {
      recordUndo(request.id, tool.name, outcome.result.undo);
      options.onUndoAvailable?.({
        requestId: request.id,
        toolName: tool.name,
        payload: outcome.result.undo,
        recordedAt: Date.now(),
      });
    }

    reply({ id: request.id, ok: true, result: outcome.result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reply({ id: request.id, ok: false, error: { kind: 'internal', message } });
  }
}
