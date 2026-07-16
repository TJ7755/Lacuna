// Process-scoped consent grant store and gating logic (Arc 2 §2.4, Task 7).
//
// Placement note: the plan (§2.4) names this file `electron/mcp/grants.ts`, since grants
// conceptually live in the main process. It is implemented under `src/mcp/` instead,
// because `electron/tsconfig.json` only `include`s `main.ts`/`updater.ts` (not a whole
// `electron/mcp/` directory — that lands in Task 9 alongside `electron/tsconfig.mcp.json`),
// and the Vitest config only covers `src/**/*.test.ts`. Nothing here touches Electron or
// Node-specific APIs — it is pure in-memory logic — so `src/mcp/` (already the established
// home for transport-agnostic pieces, e.g. `registry.ts`, `types.ts`) keeps it inside the
// normal unit-test suite without new tsconfig/Vitest config. `electron/mcp/server.ts`
// (Task 9) imports `GrantStore` from here; nothing about the module's behaviour changes
// by living one directory up from where the plan sketched it.
//
// No-courseId tool gating model: `lacuna.list_courses`, `lacuna.create_course`, the future
// `lacuna.get_server_info`, and `lacuna.diagnostics_summary` called without a `courseId`
// (see src/mcp/tools/read.ts) have no course to scope a grant to. Rather than inventing a
// parallel ungated code path, they are gated against a reserved pseudo-course id,
// `GLOBAL_SCOPE_KEY`, using the exact same `GrantStore` — a "grant to see the course list /
// create courses" is conceptually the same consent decision as a per-course grant, and
// reusing the Map means the Settings UI (Task 11) can list it alongside real courses with
// no special-casing. Callers resolve the key with `courseIdOrGlobal(courseId)` before
// calling into the store.

import type { McpGrant } from './types';
import type { McpToolError } from './bridge/protocol';

export type McpScope = McpGrant['scope'];

/** Ordinal ranking of the three scopes; higher numbers are strictly more permissive. */
const SCOPE_ORDER: Record<McpScope, number> = {
  read: 0,
  write: 1,
  destructive: 2,
};

/** True when `granted` is at least as permissive as `required` on the ordinal scale. */
export function scopeSatisfies(granted: McpScope, required: McpScope): boolean {
  return SCOPE_ORDER[granted] >= SCOPE_ORDER[required];
}

/**
 * Reserved pseudo-course id for tools that take no `courseId` (§2.4's no-courseId model,
 * documented above). Not a real course and never returned by `src/db/read.ts`.
 */
export const GLOBAL_SCOPE_KEY = '__global__';

/** Resolves a tool's target course for grant lookups: the given id, or the global pseudo-course. */
export function courseIdOrGlobal(courseId: string | undefined | null): string {
  return courseId ?? GLOBAL_SCOPE_KEY;
}

/**
 * In-memory, process-scoped grant store (§2.4: "Grants are per Lacuna-launched MCP server
 * process ... and expire when the server process exits"). One instance is created by
 * `electron/mcp/server.ts` (Task 9) and lives for the lifetime of the main process; nothing
 * here persists to Dexie or disk.
 */
export class GrantStore {
  private readonly grants = new Map<string, McpGrant>();

  /**
   * Records a grant for `courseId` at `scope`. If a grant already exists at an equal or
   * higher scope, it is left untouched — granting 'read' must never downgrade an existing
   * 'write'/'destructive' grant. `grantedAt` and `label` are refreshed only when the scope
   * actually advances (or on a first grant), so a re-grant at a lower scope doesn't
   * overwrite the label of the higher grant it declined to replace.
   */
  grant(courseId: string, scope: McpScope, label?: string): McpGrant {
    const existing = this.grants.get(courseId);
    if (existing && SCOPE_ORDER[existing.scope] >= SCOPE_ORDER[scope]) {
      return existing;
    }
    const next: McpGrant = { courseId, scope, grantedAt: Date.now(), label };
    this.grants.set(courseId, next);
    return next;
  }

  /**
   * Records the implicit read grant a first read-tool call earns for a course (§2.4: "read
   * access is granted implicitly on first read-tool call"). Distinct method name from
   * `grant` so call sites — and the Settings UI reading `list()` — can tell an
   * explicitly-consented grant apart from one nobody was ever prompted for, even though
   * both are stored the same way today.
   */
  ensureImplicitRead(courseId: string, label?: string): McpGrant {
    return this.grant(courseId, 'read', label);
  }

  /** Removes any grant held for `courseId`. No-op if none exists. */
  revoke(courseId: string): void {
    this.grants.delete(courseId);
  }

  /** The current grant for `courseId`, or `undefined` if none has been recorded. */
  get(courseId: string): McpGrant | undefined {
    return this.grants.get(courseId);
  }

  /** All current grants, in insertion order. For the Settings UI (Task 11). */
  list(): McpGrant[] {
    return [...this.grants.values()];
  }

  /** True when the recorded grant for `courseId`, if any, satisfies `requiredScope`. */
  hasScope(courseId: string, requiredScope: McpScope): boolean {
    const existing = this.grants.get(courseId);
    return existing !== undefined && scopeSatisfies(existing.scope, requiredScope);
  }
}

/**
 * Gates a tool call against the store: returns `ok: true` when `courseId` already holds a
 * grant satisfying `requiredScope`, otherwise a `forbidden` `McpToolError` naming the
 * missing scope and course, per §2.4's "so a well-behaved agent can tell the user ...
 * and retry rather than looping". Read-scope calls are expected to go through
 * `ensureImplicitRead` first (the bridge's job, Task 9/11) rather than this gate, since
 * read access is never denied — but gating it here too keeps the function total and safe
 * to call unconditionally.
 */
export function resolveGrant(
  store: GrantStore,
  requiredScope: McpScope,
  courseId: string,
): { ok: true } | { ok: false; error: McpToolError } {
  if (store.hasScope(courseId, requiredScope)) {
    return { ok: true };
  }
  const courseLabel = courseId === GLOBAL_SCOPE_KEY ? 'the whole database' : `course "${courseId}"`;
  return {
    ok: false,
    error: {
      kind: 'forbidden',
      message: `This action needs "${requiredScope}" access to ${courseLabel}, which has not been granted yet.`,
    },
  };
}
