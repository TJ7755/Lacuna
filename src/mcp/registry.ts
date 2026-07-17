// The ordered MCP tool list plus the versioned tool-surface manifest (Arc 2 §2.5).
// electron/mcp/server.ts (a later task) registers each entry with the MCP SDK's
// `server.registerTool`; src/mcp/bridge/renderer.ts looks tools up here by name to
// execute them. This module has no IPC/SDK/Electron dependency of its own.

import type { McpToolError } from './bridge/protocol';
import { McpToolException, type ToolContext, type ToolDefinition, type ToolResult } from './types';
import { READ_TOOLS } from './tools/read';
import { CONTENT_TOOLS } from './tools/content';
import { DESTRUCTIVE_TOOLS } from './tools/destructive';
import { IMPORT_TOOLS } from './tools/import';

/**
 * Versions the *tool contract* (names, input/output shapes), independent of Dexie's
 * CURRENT_SCHEMA_VERSION. Bumped only on a breaking change to an existing tool's shape or
 * a tool's removal; additive new tools do not bump it. Exposed via `lacuna.get_server_info`
 * (a later task) so an agent can detect a stale cached tool list.
 */
export const MCP_TOOL_SURFACE_VERSION = 2;

/**
 * Deliberate exclusions from the tool surface (Arc 2 §2.3) — documented here, not just
 * absent, so a future contributor does not "helpfully" add them back:
 *
 * - `noteAnnotations` CRUD — device-local by design, no agent use case yet.
 * - Raw FSRS state writes (`state`, `stability`, `difficulty`, `due`) — `update_card`
 *   accepts only content fields (front/back/tags/flagged); scheduling stays the engine's
 *   exclusive write path. `reschedule_cards` exposes the existing bounded `rescheduleCards`
 *   helper instead of raw field writes.
 * - `recordReview`/`undoReview` — an agent grading the user's recall on their behalf
 *   would corrupt the memory model; review recording stays a human-only, in-app action.
 * - Practice-node/milestone mutation beyond assessments — path/curriculum structure is
 *   judged too consequential for v1; revisit once usage data exists.
 * - Backup/restore/share-code tools — already have a full UI flow; not a natural agent
 *   shape; out of scope for this arc.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see src/mcp/tools/read.ts's READ_TOOLS comment.
export const TOOL_REGISTRY: readonly ToolDefinition<any, any>[] = [
  ...READ_TOOLS,
  ...CONTENT_TOOLS,
  ...DESTRUCTIVE_TOOLS,
  ...IMPORT_TOOLS,
];

/** Looks up a tool definition by its `lacuna.<verb>_<noun>` name, or undefined if unknown. */
export function getTool(name: string): ToolDefinition<unknown, unknown> | undefined {
  return TOOL_REGISTRY.find((tool) => tool.name === name);
}

/**
 * Validates raw input against a tool's zod schema and runs its handler, translating
 * validation failures and thrown `McpToolException`s into a proper `McpToolError` so
 * callers (the renderer bridge, or a test) never see a raw exception. Unknown thrown
 * errors are mapped to `internal` rather than leaking a stack trace to the agent.
 */
export async function validateAndRun(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts any concrete ToolDefinition looked up by name.
  tool: ToolDefinition<any, any>,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<{ ok: true; result: ToolResult } | { ok: false; error: McpToolError }> {
  const parsed = tool.inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: { kind: 'validation', message: parsed.error.message } };
  }
  try {
    const result = await tool.handler(parsed.data, ctx);
    return { ok: true, result };
  } catch (err) {
    if (err instanceof McpToolException) {
      return { ok: false, error: err.toolError };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: 'internal', message } };
  }
}
