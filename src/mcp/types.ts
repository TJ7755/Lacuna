// Transport-agnostic types shared by every tool definition under src/mcp/tools/. These
// run inside the renderer (the only process with IndexedDB) and are ignorant of IPC or
// the MCP SDK — see next_plan.md's Arc 2 §2.1 "Core module split".

import type { z } from 'zod';
import type { McpToolError } from './bridge/protocol';

/**
 * A per-course, per-process consent grant (Arc 2 §2.4). 'destructive' implies 'write'
 * implies 'read' — an ordinal tier, not a set of independent booleans. Grants live in an
 * in-memory main-process Map (electron/mcp/grants.ts, a later task) and never survive a
 * relaunch; this type is defined here rather than there because tool handlers need to
 * reference the shape without importing anything Electron-only.
 */
export interface McpGrant {
  courseId: string;
  scope: 'read' | 'write' | 'destructive';
  grantedAt: number;
  label?: string;
}

/**
 * Per-invocation context passed to every tool handler. `grant` is resolved by the caller
 * (the renderer bridge, once the real grant store lands) from the tool's target course;
 * it is `null` when no grant exists yet for that course. Read tools do not currently
 * check it (§2.4: read access is implicit), but the field is threaded through now so
 * later tool groups do not need every handler signature touched twice.
 */
export interface ToolContext {
  grant: McpGrant | null;
  agentId: string;
}

/** A tool handler's successful return value, wrapped so future metadata can be added
 * without changing every handler's return type. */
export interface ToolResult<T = unknown> {
  data: T;
}

/**
 * A single MCP tool's definition: name, agent-facing description, zod input schema, the
 * minimum grant scope required to invoke it, and the handler itself. src/mcp/registry.ts
 * assembles these into the ordered tool list; electron/mcp/server.ts (a later task)
 * registers each with the MCP SDK's `server.registerTool`.
 */
export interface ToolDefinition<Input = unknown, Output = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<Input>;
  requiredScope: 'read' | 'write' | 'destructive';
  handler: (input: Input, ctx: ToolContext) => Promise<ToolResult<Output>>;
}

/**
 * Thrown by a handler to signal a specific McpToolError kind (e.g. `not_found` when a
 * courseId/cardId does not resolve). src/mcp/registry.ts's `validateAndRun` catches this
 * and any other thrown error, mapping the latter to `internal` so a handler bug never
 * leaks a raw stack trace to the calling agent. Input validation itself never reaches the
 * handler — `validateAndRun` rejects with a `validation` error at the registry boundary.
 */
export class McpToolException extends Error {
  readonly toolError: McpToolError;

  constructor(toolError: McpToolError) {
    super(toolError.message);
    this.name = 'McpToolException';
    this.toolError = toolError;
  }
}
