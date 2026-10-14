import { describe, expect, it, vi } from 'vitest';
import {
  HOSTED_SESSION_STORAGE_KEY,
  loadHostedState,
  saveHostedState,
  type HostedSessionStorage,
  type HostedStoredState,
} from './hostedPersistence';

describe('hosted conversation persistence', () => {
  it('keeps recent turns and the tool ledger when old replies exceed the storage limit', () => {
    let saved: string | null = null;
    const storage: HostedSessionStorage = {
      getItem: () => saved,
      setItem: (_key, value) => { saved = value; },
      removeItem: () => { saved = null; },
    };
    const state: HostedStoredState = {
      conversationId: 'conversation-1',
      items: [1, 2, 3, 4, 5, 6, 7].map((index) => ({
        kind: 'assistant' as const,
        id: `reply-${index}`,
        content: 'A'.repeat(49_000),
        createdAt: index,
        sources: [],
        progress: 'completed' as const,
      })),
      draft: 'Latest draft',
      queuedFollowUp: null,
      approval: null,
      toolState: {
        grants: [{ connectionId: 'conversation-1', courseId: 'course-1', scope: 'write', grantedAt: 1 }],
        approvals: [],
        ledger: [{
          connectionId: 'conversation-1', runId: 'run-1', callId: 'call-1',
          toolName: 'lacuna.get_course', courseId: 'course-1', inputDigest: 'digest-1',
          requiredScope: 'read', response: { ok: true, result: { id: 'course-1' } },
        }],
      },
    };

    saveHostedState(storage, state);

    expect(saved).not.toBeNull();
    expect(loadHostedState(storage)).toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ id: 'reply-7' })]),
      draft: 'Latest draft',
      toolState: state.toolState,
    });
    expect((JSON.parse(saved!) as { items: unknown[] }).items.length).toBeLessThan(7);
    expect(storage.getItem(HOSTED_SESSION_STORAGE_KEY)).toBe(saved);
  });
  it('retains the newest short messages when a conversation exceeds the reader item limit', () => {
    let saved: string | null = null;
    const storage: HostedSessionStorage = {
      getItem: () => saved,
      setItem: (_key, value) => { saved = value; },
      removeItem: () => { saved = null; },
    };
    const state: HostedStoredState = {
      conversationId: 'conversation-1',
      items: Array.from({ length: 101 }, (_, index) => ({
        kind: 'assistant' as const,
        id: `reply-${index}`,
        content: 'Short reply',
        createdAt: index,
        sources: [],
        progress: 'completed' as const,
      })),
      draft: 'Keep my draft',
      queuedFollowUp: null,
      approval: null,
      toolState: { grants: [], approvals: [], ledger: [] },
    };

    saveHostedState(storage, state);
    const restored = loadHostedState(storage);

    expect(restored).not.toBeNull();
    expect(restored?.items).toHaveLength(100);
    expect(restored?.items[0]?.id).toBe('reply-1');
    expect(restored?.items.at(-1)?.id).toBe('reply-100');
    expect(restored?.draft).toBe(state.draft);
    expect(restored?.toolState).toEqual(state.toolState);
    expect(state.items).toHaveLength(101);
  });
  it('bounds serialisation work when trimming many oversized replies', () => {
    const items: HostedStoredState['items'] = Array.from({ length: 100 }, (_, index) => ({
      kind: 'assistant', id: `reply-${index}`, content: 'A'.repeat(49_000),
      createdAt: index, sources: [], progress: 'completed',
    }));
    const state: HostedStoredState = {
      conversationId: 'conversation-1', items, draft: '', queuedFollowUp: null,
      approval: null, toolState: { grants: [], approvals: [], ledger: [] },
    };
    let serialisedCharacters = 0;
    let saved: string | null = null;
    const storage: HostedSessionStorage = {
      getItem: () => saved,
      setItem: (_key, value) => { saved = value; },
      removeItem: () => { saved = null; },
    };
    const stringify = JSON.stringify;
    const spy = vi.spyOn(JSON, 'stringify').mockImplementation((value) => {
      const encoded = stringify(value);
      serialisedCharacters += encoded?.length ?? 0;
      return encoded;
    });
    try {
      saveHostedState(storage, state);
    } finally {
      spy.mockRestore();
    }

    expect(loadHostedState(storage)?.items.at(-1)?.id).toBe('reply-99');
    expect(serialisedCharacters).toBeLessThan(stringify(state).length * 4);
  });
});
