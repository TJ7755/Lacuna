import { describe, expect, it } from 'vitest';
import { McpConnectionStore } from './connections';

describe('McpConnectionStore', () => {
  it('keeps grants isolated by connection and drops them on disconnect', () => {
    const store = new McpConnectionStore();
    store.connect({ connectionId: 'one', name: 'Codex', version: '1.0' }, 10);
    store.connect({ connectionId: 'two', name: 'Claude' }, 20);

    store.setGrant('one', 'course-1', 'write', 'Course One');
    expect(store.grants('one').hasScope('course-1', 'write')).toBe(true);
    expect(store.grants('two').hasScope('course-1', 'read')).toBe(false);

    store.disconnect('one');
    expect(() => store.grants('one')).toThrow('Unknown MCP connection');
    expect(store.list()).toEqual([
      {
        connectionId: 'two',
        name: 'Claude',
        connectedAt: 20,
        lastActivityAt: 20,
        grants: [],
      },
    ]);
  });

  it('tracks last activity without changing the connection time', () => {
    const store = new McpConnectionStore();
    store.connect({ connectionId: 'one', name: 'Codex' }, 10);
    store.touch('one', 30);
    expect(store.list()[0]).toMatchObject({ connectedAt: 10, lastActivityAt: 30 });
  });
});
