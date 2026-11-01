// Renderer-side holding pen for destructive-tool undo payloads (Arc 2 Section 2.3/2.4,
// Task 9). A destructive tool's `ToolResult.undo` (src/mcp/types.ts) must never cross the
// IPC boundary to the calling agent — it is an opaque repository snapshot, not something an
// MCP client should see or be able to replay. src/mcp/bridge/renderer.ts records it here,
// keyed by the request id, instead of sending it back over `mcp:invoke:reply`.
//
// renderer.ts records the payload here and also hands a copy to onUndoAvailable for the
// in-app undo toast. Entries are bounded by MAX_ENTRIES.

import type { ToolUndoPayload } from '../types';

export interface RecordedUndo {
  requestId: string;
  toolName: string;
  payload: ToolUndoPayload;
  recordedAt: number;
}

const MAX_ENTRIES = 20;

const entries: RecordedUndo[] = [];

/** Records an undo payload for a completed destructive tool call. */
export function recordUndo(requestId: string, toolName: string, payload: ToolUndoPayload): void {
  entries.push({ requestId, toolName, payload, recordedAt: Date.now() });
  if (entries.length > MAX_ENTRIES) {
    entries.shift();
  }
}
