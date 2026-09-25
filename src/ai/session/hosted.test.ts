import { describe, expect, it, vi } from 'vitest';
import { createHostedAiSession } from './hosted';
import { HOSTED_SESSION_STORAGE_KEY, type HostedSessionStorage } from './hostedPersistence';
import type { HostedTransport } from './hostedTransport';
import type { HostedEvent } from '../hostedProtocol';

function memoryStorage(): HostedSessionStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

function fixture(events: HostedEvent[], storage = memoryStorage()) {
  let index = 0;
  const transport: HostedTransport = {
    exchange: vi.fn(async () => ({ token: 'session-token', expiresAt: Date.now() + 3_600_000 })),
    infer: vi.fn(async function* () { for (const event of events) yield event; }),
  };
  const session = createHostedAiSession({
    storage, transport,
    createId: (prefix) => `${prefix}-${++index}`,
    acquireOwnership: async () => () => undefined,
  });
  return { session, transport, storage };
}

async function connected(events: HostedEvent[], storage?: HostedSessionStorage) {
  const test = fixture(events, storage);
  test.session.activate();
  await vi.waitFor(() => expect(test.session.getSnapshot().revision).toBeGreaterThanOrEqual(0));
  await Promise.resolve();
  expect(await test.session.connectHosted!('issued-credential-with-at-least-thirty-two-characters'))
    .toMatchObject({ ok: true });
  return test;
}

describe('hosted AI session', () => {
  it('streams into one assistant item and restores completed text after reload', async () => {
    const storage = memoryStorage();
    const { session } = await connected([
      { type: 'text_delta', text: 'Biology ' },
      { type: 'text_delta', text: 'is ready.' },
      { type: 'completed', finishReason: 'stop' },
    ], storage);
    expect(await session.send('Find Biology')).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(session.getSnapshot().run?.status).toBe('completed'));
    const replies = session.getSnapshot().items.filter((item) => item.kind === 'assistant');
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ content: 'Biology is ready.', progress: 'completed' });
    expect(storage.getItem(HOSTED_SESSION_STORAGE_KEY)).toContain('Biology is ready.');
    session.dispose();
    const restored = fixture([], storage).session;
    expect(restored.getSnapshot().items).toContainEqual(expect.objectContaining({
      kind: 'assistant', content: 'Biology is ready.', progress: 'completed',
    }));
  });

  it('aborts Stop and ignores a late chunk', async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const transport: HostedTransport = {
      exchange: async () => ({ token: 'session-token', expiresAt: Date.now() + 3_600_000 }),
      async *infer() {
        yield { type: 'text_delta', text: 'First part' };
        await waiting;
        yield { type: 'text_delta', text: ' should be ignored' };
        yield { type: 'completed', finishReason: 'stop' };
      },
    };
    const session = createHostedAiSession({ transport, storage: memoryStorage(),
      acquireOwnership: async () => () => undefined });
    session.activate();
    await Promise.resolve();
    await session.connectHosted!('issued-credential-with-at-least-thirty-two-characters');
    await session.send('Start');
    await vi.waitFor(() => expect(session.getSnapshot().items.some((item) => item.kind === 'assistant')).toBe(true));
    const runId = session.getSnapshot().run!.runId;
    await session.stop(runId);
    release();
    await Promise.resolve();
    expect(session.getSnapshot().items.find((item) => item.kind === 'assistant')).toMatchObject({
      content: 'First part', progress: 'interrupted',
    });
  });

  it('fails closed when another tab owns the hosted conversation', async () => {
    const session = createHostedAiSession({
      storage: memoryStorage(), acquireOwnership: async () => null,
    });
    session.activate();
    await vi.waitFor(() => expect(session.getSnapshot().connection).toMatchObject({
      status: 'disconnected', reason: 'Built-in AI is open in another tab.',
    }));
    expect(await session.send('Can I send?')).toMatchObject({ ok: false });
  });
});
