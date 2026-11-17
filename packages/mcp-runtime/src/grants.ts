import type { McpGrant } from '@lacuna/protocol/mcp/types';
import type { McpToolError } from '@lacuna/protocol/mcp/bridge';

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
 * Reserved pseudo-course id for tools that take no `courseId`. Never a real course id.
 */
export const GLOBAL_SCOPE_KEY = '__global__';

/** Resolves a tool's target course for grant lookups: the given id, or the global pseudo-course. */
export function courseIdOrGlobal(courseId: string | undefined | null): string {
  return courseId ?? GLOBAL_SCOPE_KEY;
}

/**
 * In-memory grant state owned by a server process or companion connection. Nothing
 * here persists to a database or disk; closing the owner revokes its grants.
 */
export class GrantStore {
  private readonly grants = new Map<string, McpGrant>();
  private closed = false;

  get isClosed(): boolean {
    return this.closed;
  }

  /** Fence retained references, including consent that outlives its companion connection. */
  close(): void {
    this.closed = true;
    this.grants.clear();
  }

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
    return this.setScope(courseId, scope, label);
  }

  /** Replaces a grant with an exact scope. Used by the trusted Settings controls. */
  setScope(courseId: string, scope: McpScope, label?: string): McpGrant {
    if (this.closed) throw new Error('MCP grant store is closed.');
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
): { ok: true; grant: McpGrant } | { ok: false; error: McpToolError } {
  const grant = store.get(courseId);
  if (grant && scopeSatisfies(grant.scope, requiredScope)) {
    return { ok: true, grant };
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
