// Renderer side of the main <-> renderer MCP bridge (Arc 2 Section 2.1, Task 9). The
// renderer is the only process with IndexedDB, so it is where every tool handler actually
// runs. electron/mcp/server.ts forwards each MCP tool call here as an `mcp:invoke` IPC
// message (via the narrow `window.electronAPI.mcp` surface from electron/preload.ts);
// attachMcpBridge() delegates execution to the shared executor and replies with
// `mcp:invoke:reply`.
//
// Bridge-deadlock risk (docs/archive/roadmap-2026-08-11.md Section 2.10): if a failure here never replies, the
// main process's request hangs until its own timeout fires (src/mcp/bridge/dispatcher.ts).
// Every path below — unknown tool, validation/handler failure, or a genuinely unexpected
// thrown error — is therefore wrapped so a reply is always sent.

import { executeToolCall } from '../executor';
import type { McpInvokeRequest, McpInvokeResponse } from './protocol';
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
  const outcome = await executeToolCall(
    {
      callId: request.id,
      toolName: request.tool,
      input: request.input,
      agentId: request.agentId,
      grant: request.grant,
    },
    { onUndoAvailable: options.onUndoAvailable },
  );
  if (!outcome.ok) {
    reply({ id: request.id, ok: false, error: outcome.error });
    return;
  }

  // The receipt is consumed by transport adapters that need activity history. Electron's
  // existing IPC envelope deliberately remains result-only, and the undo payload never
  // crosses it.
  reply({ id: request.id, ok: true, result: outcome.result });
}
