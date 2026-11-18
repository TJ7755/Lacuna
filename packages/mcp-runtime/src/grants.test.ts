import { describe, expect, it } from 'vitest';
import {
  GLOBAL_SCOPE_KEY,
  GrantStore,
  courseIdOrGlobal,
  resolveGrant,
  scopeSatisfies,
} from './grants';

describe('scopeSatisfies', () => {
  it('ranks read < write < destructive', () => {
    expect(scopeSatisfies('read', 'read')).toBe(true);
    expect(scopeSatisfies('write', 'read')).toBe(true);
    expect(scopeSatisfies('destructive', 'read')).toBe(true);
    expect(scopeSatisfies('destructive', 'write')).toBe(true);
    expect(scopeSatisfies('read', 'write')).toBe(false);
    expect(scopeSatisfies('write', 'destructive')).toBe(false);
    expect(scopeSatisfies('write', 'write')).toBe(true);
    expect(scopeSatisfies('destructive', 'destructive')).toBe(true);
    expect(scopeSatisfies('read', 'destructive')).toBe(false);
  });
});

describe('courseIdOrGlobal', () => {
  it('preserves course ids and maps absent ids to the reserved global key', () => {
    expect(courseIdOrGlobal('course-1')).toBe('course-1');
    expect(courseIdOrGlobal(undefined)).toBe('__global__');
    expect(courseIdOrGlobal(null)).toBe('__global__');
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
    const expected = {
      courseId: 'course-1',
      scope: 'write',
      grantedAt: expect.any(Number),
      label: 'Course One',
    };
    expect(store.grant('course-1', 'write', 'Course One')).toEqual(expected);
    expect(store.get('course-1')).toEqual(expected);
    expect(store.list()).toEqual([expected]);
    expect(store.hasScope('course-1', 'read')).toBe(true);
    expect(store.hasScope('course-1', 'write')).toBe(true);
    expect(store.hasScope('course-1', 'destructive')).toBe(false);
  });

  it('keeps the max scope: granting a lower scope does not downgrade an existing higher grant', () => {
    const store = new GrantStore();
    store.grant('course-1', 'destructive', 'Original label');
    store.grant('course-1', 'read', 'Replacement label');
    expect(store.get('course-1')).toMatchObject({ scope: 'destructive', label: 'Original label' });
  });

  it('advances an existing grant when a higher scope is granted', () => {
    const store = new GrantStore();
    store.grant('course-1', 'read');
    const upgraded = store.grant('course-1', 'destructive', 'now destructive');
    expect(upgraded.scope).toBe('destructive');
    expect(upgraded.label).toBe('now destructive');
    expect(store.get('course-1')).toMatchObject({ scope: 'destructive', label: 'now destructive' });
  });

  it('sets an exact lower scope when changed from Settings', () => {
    const store = new GrantStore();
    store.grant('course-1', 'destructive');
    const downgraded = store.setScope('course-1', 'write', 'Course One');
    expect(downgraded).toEqual({
      courseId: 'course-1',
      scope: 'write',
      grantedAt: expect.any(Number),
      label: 'Course One',
    });
    expect(store.hasScope('course-1', 'write')).toBe(true);
    expect(store.hasScope('course-1', 'destructive')).toBe(false);
  });

  it('revoke removes the grant; revoking an unknown course is a no-op', () => {
    const store = new GrantStore();
    store.grant('course-1', 'write');
    store.revoke('course-1');
    expect(store.get('course-1')).toBeUndefined();
    expect(() => store.revoke('course-2')).not.toThrow();
  });

  it('grants implicit read access without downgrading existing write access', () => {
    const store = new GrantStore();
    const implicit = store.ensureImplicitRead('course-1');
    expect(implicit.scope).toBe('read');
    expect(store.hasScope('course-1', 'read')).toBe(true);
    store.grant('course-1', 'write');
    store.ensureImplicitRead('course-1');
    expect(store.hasScope('course-1', 'write')).toBe(true);
  });

  it('gates the reserved global pseudo-course like any other course', () => {
    const store = new GrantStore();
    expect(store.hasScope(GLOBAL_SCOPE_KEY, 'write')).toBe(false);
    store.grant(GLOBAL_SCOPE_KEY, 'write', 'Global');
    expect(store.hasScope(GLOBAL_SCOPE_KEY, 'write')).toBe(true);
    expect(store.hasScope('course-1', 'write')).toBe(false);
    expect(store.list()).toEqual([
      {
        courseId: GLOBAL_SCOPE_KEY,
        scope: 'write',
        grantedAt: expect.any(Number),
        label: 'Global',
      },
    ]);
  });
});

describe('resolveGrant', () => {
  it('returns ok when the store already satisfies the required scope', () => {
    const store = new GrantStore();
    store.grant('course-1', 'destructive');
    for (const scope of ['read', 'write', 'destructive'] as const) {
      expect(resolveGrant(store, scope, 'course-1')).toMatchObject({
        ok: true,
        grant: { courseId: 'course-1', scope: 'destructive' },
      });
    }
  });

  it('returns a forbidden McpToolError naming the missing scope and course', () => {
    for (const grantedScope of [undefined, 'read'] as const) {
      const store = new GrantStore();
      if (grantedScope) store.grant('course-1', grantedScope);
      const result = resolveGrant(store, 'write', 'course-1');
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected forbidden');
      expect(result.error.kind).toBe('forbidden');
      expect(result.error.message).toContain('write');
      expect(result.error.message).toContain('course-1');
    }
  });

  it('names the whole database, not the raw key, when gating the global pseudo-course', () => {
    const store = new GrantStore();
    const result = resolveGrant(store, 'write', GLOBAL_SCOPE_KEY);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected forbidden');
    expect(result.error.message).toContain('whole database');
    expect(result.error.message).not.toContain(GLOBAL_SCOPE_KEY);
  });
});
