// Renderer-side holding pen for destructive-tool undo payloads (Arc 2 Section 2.3/2.4,
// Task 9). A destructive tool's `ToolResult.undo` (src/mcp/types.ts) must never cross the
// IPC boundary to the calling agent — it is an opaque repository snapshot, not something an
// MCP client should see or be able to replay. src/mcp/bridge/renderer.ts records it here,
// keyed by the request id, instead of sending it back over `mcp:invoke:reply`.
//
// This module intentionally does nothing with the recorded payloads yet: Task 11 wires the
// in-app undo toast (reusing the DangerZone pattern) that reads the most recent entry and
// calls the matching `restore*` repository function named by `ToolUndoPayload.kind`. Until
// then, entries just accumulate (bounded by MAX_ENTRIES) so nothing leaks memory.

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

/** All recorded undo entries, oldest first. For Task 11's undo toast. */
export function listRecordedUndos(): readonly RecordedUndo[] {
  return entries;
}

/** Test/dev helper to reset the in-memory registry between cases. */
export function clearRecordedUndos(): void {
  entries.length = 0;
}
