// The ordered MCP tool list plus the versioned tool-surface manifest (Arc 2 §2.5).
// electron/mcp/server.ts (a later task) registers each entry with the MCP SDK's
// `server.registerTool`; src/mcp/bridge/renderer.ts looks tools up here by name to
// execute them. This module has no IPC/SDK/Electron dependency of its own.

import { z } from 'zod';
import type { McpToolError } from './bridge/protocol';
import { McpToolException, type ToolContext, type ToolContract, type ToolDefinition, type ToolResult } from './types';
import {
  listToolsContract,
  MCP_TOOL_SURFACE_VERSION,
  TOOL_CONTRACT_REGISTRY,
} from './contracts/registry';
import { READ_TOOLS } from './tools/read';
import { CONTENT_TOOLS } from './tools/content';
import { DESTRUCTIVE_TOOLS } from './tools/destructive';
import { IMPORT_TOOLS } from './tools/import';
import { LINEAGE_TOOLS } from './tools/lineage';
import { QUESTION_TOOLS } from './tools/questions';
import { MEMORY_TOOLS } from './tools/memories';

export {
  MCP_TOOL_SURFACE_VERSION,
  suggestToolNames,
  unknownToolMessage,
} from './contracts/registry';

/**
 * Versions the *tool contract* (names, input/output shapes), independent of Dexie's
 * CURRENT_SCHEMA_VERSION. Bumped only on a breaking change to an existing tool's shape or
 * a tool's removal; additive new tools do not bump it. Exposed via `lacuna.get_server_info`
 * (a later task) so an agent can detect a stale cached tool list.
 */
async function catalogueScope(query: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${MCP_TOOL_SURFACE_VERSION}\0${query}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function catalogueOffset(cursor: string | undefined, scope: string): number {
  if (cursor === undefined) return 0;
  const match = /^tools-v2\.([0-9]+)\.([a-f0-9]{64})\.([0-9a-z]+)$/.exec(cursor);
  const offset = match && Number(match[1]) === MCP_TOOL_SURFACE_VERSION && match[2] === scope
    ? Number.parseInt(match[3], 36)
    : Number.NaN;
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new McpToolException({ kind: 'validation', message: 'The tool catalogue cursor is invalid.' });
  }
  return offset;
}

function catalogueInputSchema(tool: ToolContract<unknown>): unknown {
  // Zod's schema objects are JSON-serialisable but can retain implementation-specific
  // prototypes. Cross the actual JSON boundary here so the AI wire validator receives plain data.
  return JSON.parse(JSON.stringify(z.toJSONSchema(tool.inputSchema))) as unknown;
}

const listTools: ToolDefinition<z.infer<typeof listToolsContract.inputSchema>, unknown> = {
  ...listToolsContract,
  async handler({ query = '', limit = 20, cursor }) {
    const wanted = query.toLocaleLowerCase();
    const matches = TOOL_CONTRACT_REGISTRY.filter((tool) =>
      wanted === '' || `${tool.name} ${tool.description}`.toLocaleLowerCase().includes(wanted),
    );
    const scope = await catalogueScope(wanted);
    const offset = catalogueOffset(cursor, scope);
    if (offset > matches.length) {
      throw new McpToolException({ kind: 'validation', message: 'The tool catalogue cursor is invalid.' });
    }
    const page = matches.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    return {
      data: {
        tools: page.map((tool) => ({
          name: tool.name,
          description: tool.description,
          requiredScope: tool.requiredScope,
          inputSchema: catalogueInputSchema(tool),
        })),
        ...(nextOffset < matches.length
          ? { nextCursor: `tools-v2.${MCP_TOOL_SURFACE_VERSION}.${scope}.${nextOffset.toString(36)}` }
          : {}),
      },
    };
  },
};

/**
 * Deliberate exclusions from the tool surface (Arc 2 §2.3) — documented here, not just
 * absent, so a future contributor does not "helpfully" add them back:
 *
 * - `noteAnnotations` CRUD — device-local by design, no agent use case yet.
 * - Raw FSRS state writes (`state`, `stability`, `difficulty`, `due`) — `update_card`
 *   accepts only content fields (front/back/tags/flagged); scheduling stays the engine's
 *   exclusive write path. `reschedule_cards` exposes the existing bounded `rescheduleCards`
 *   helper instead of raw field writes.
 * - Card review and Question-attempt recording/undo — an agent grading the user's recall or
 *   application on their behalf would corrupt either independent memory model; answer evidence
 *   stays a human-only, in-app action.
 * - Practice-node/milestone mutation beyond assessments — path/curriculum structure is
 *   judged too consequential for v1; revisit once usage data exists.
 * - Backup/restore/share-code tools — already have a full UI flow; not a natural agent
 *   shape; out of scope for this arc.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see src/mcp/tools/read.ts's READ_TOOLS comment.
export const TOOL_REGISTRY: readonly ToolDefinition<any, any>[] = [
  listTools,
  ...READ_TOOLS,
  ...CONTENT_TOOLS,
  ...QUESTION_TOOLS,
  ...DESTRUCTIVE_TOOLS,
  ...IMPORT_TOOLS,
  ...LINEAGE_TOOLS,
  ...MEMORY_TOOLS,
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
