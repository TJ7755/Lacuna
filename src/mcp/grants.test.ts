import { describe, expect, it } from 'vitest';
import { GLOBAL_SCOPE_KEY, GrantStore, courseIdOrGlobal, resolveGrant, scopeSatisfies } from './grants';

describe('scopeSatisfies', () => {
  it('ranks read < write < destructive', () => {
    expect(scopeSatisfies('read', 'read')).toBe(true);
    expect(scopeSatisfies('write', 'read')).toBe(true);
    expect(scopeSatisfies('destructive', 'read')).toBe(true);
    expect(scopeSatisfies('destructive', 'write')).toBe(true);
    expect(scopeSatisfies('read', 'write')).toBe(false);
    expect(scopeSatisfies('write', 'destructive')).toBe(false);
  });

  it('is reflexive at every tier', () => {
    expect(scopeSatisfies('write', 'write')).toBe(true);
    expect(scopeSatisfies('destructive', 'destructive')).toBe(true);
  });
});

describe('courseIdOrGlobal', () => {
  it('passes a real courseId through unchanged', () => {
    expect(courseIdOrGlobal('course-1')).toBe('course-1');
  });

  it('maps undefined/null to the global pseudo-course key', () => {
    expect(courseIdOrGlobal(undefined)).toBe(GLOBAL_SCOPE_KEY);
    expect(courseIdOrGlobal(null)).toBe(GLOBAL_SCOPE_KEY);
  });
});

describe('GrantStore', () => {
  it('has no grant for an unknown course', () => {
    const store = new GrantStore();
    expect(store.get('course-1')).toBeUndefined();
    expect(store.hasScope('course-1', 'read')).toBe(false);
    expect(store.list()).toEqual([]);
  });

  it('records a grant and reports it via get/list/hasScope', () => {
    const store = new GrantStore();
    const granted = store.grant('course-1', 'write', 'Course One');
    expect(granted).toEqual({ courseId: 'course-1', scope: 'write', grantedAt: expect.any(Number), label: 'Course One' });
    expect(store.get('course-1')).toEqual(granted);
    expect(store.list()).toEqual([granted]);
    expect(store.hasScope('course-1', 'read')).toBe(true);
    expect(store.hasScope('course-1', 'write')).toBe(true);
    expect(store.hasScope('course-1', 'destructive')).toBe(false);
  });

  it('keeps the max scope: granting a lower scope does not downgrade an existing higher grant', () => {
    const store = new GrantStore();
    const higher = store.grant('course-1', 'destructive');
    const result = store.grant('course-1', 'read');
    expect(result).toBe(higher);
    expect(store.get('course-1')?.scope).toBe('destructive');
  });

  it('advances an existing grant when a higher scope is granted', () => {
    const store = new GrantStore();
    store.grant('course-1', 'read');
    const upgraded = store.grant('course-1', 'destructive', 'now destructive');
    expect(upgraded.scope).toBe('destructive');
    expect(upgraded.label).toBe('now destructive');
    expect(store.get('course-1')).toBe(upgraded);
  });

  it('revoke removes the grant; revoking an unknown course is a no-op', () => {
    const store = new GrantStore();
    store.grant('course-1', 'write');
    store.revoke('course-1');
    expect(store.get('course-1')).toBeUndefined();
    expect(() => store.revoke('course-2')).not.toThrow();
  });

  it('ensureImplicitRead records a read grant distinct from an explicit grant call', () => {
    const store = new GrantStore();
    const implicit = store.ensureImplicitRead('course-1');
    expect(implicit.scope).toBe('read');
    expect(store.hasScope('course-1', 'read')).toBe(true);
    // A second implicit read call does not downgrade a subsequent explicit write grant.
    const upgraded = store.grant('course-1', 'write');
    expect(store.ensureImplicitRead('course-1')).toBe(upgraded);
  });

  it('gates the reserved global pseudo-course like any other course', () => {
    const store = new GrantStore();
    expect(store.hasScope(GLOBAL_SCOPE_KEY, 'write')).toBe(false);
    store.grant(GLOBAL_SCOPE_KEY, 'write', 'Global');
    expect(store.hasScope(GLOBAL_SCOPE_KEY, 'write')).toBe(true);
    expect(store.list()).toEqual([{ courseId: GLOBAL_SCOPE_KEY, scope: 'write', grantedAt: expect.any(Number), label: 'Global' }]);
  });
});

describe('resolveGrant', () => {
  it('returns ok when the store already satisfies the required scope', () => {
    const store = new GrantStore();
    store.grant('course-1', 'destructive');
    expect(resolveGrant(store, 'write', 'course-1')).toEqual({ ok: true });
  });

  it('returns a forbidden McpToolError naming the missing scope and course', () => {
    const store = new GrantStore();
    const result = resolveGrant(store, 'write', 'course-1');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected forbidden');
    expect(result.error.kind).toBe('forbidden');
    expect(result.error.message).toContain('write');
    expect(result.error.message).toContain('course-1');
  });

  it('names the whole database, not the raw key, when gating the global pseudo-course', () => {
    const store = new GrantStore();
    const result = resolveGrant(store, 'write', GLOBAL_SCOPE_KEY);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected forbidden');
    expect(result.error.message).toContain('whole database');
    expect(result.error.message).not.toContain(GLOBAL_SCOPE_KEY);
  });

  it('is satisfied once a lower-tier requirement is granted at a higher tier', () => {
    const store = new GrantStore();
    store.grant('course-1', 'destructive');
    expect(resolveGrant(store, 'read', 'course-1')).toEqual({ ok: true });
    expect(resolveGrant(store, 'destructive', 'course-1')).toEqual({ ok: true });
  });
});
