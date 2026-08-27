import { describe, expect, it, vi } from 'vitest';
import { createInMemoryAiSession } from './inMemory';

describe('in-memory AI session', () => {
  it('publishes a queued user message through the AiSession seam', async () => {
    const session = createInMemoryAiSession({
      connection: {
        status: 'connected',
        connectionId: 'connection-1',
        client: { name: 'Test agent' },
        lastActivityAt: 1,
      },
      conversationId: 'conversation-1',
    });
    const listener = vi.fn();
    session.subscribe(listener);

    const result = await session.send('Explain the testing effect.');

    expect(result.ok).toBe(true);
    expect(session.getSnapshot().items).toEqual([
      expect.objectContaining({
        kind: 'user',
        content: 'Explain the testing effect.',
        delivery: 'queued',
      }),
    ]);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('rejects messages while disconnected without publishing state', async () => {
    const session = createInMemoryAiSession();
    const before = session.getSnapshot();

    expect(await session.send('This cannot be delivered.')).toEqual({
      ok: false,
      error: { kind: 'unavailable', message: 'AI is not connected.' },
    });
    expect(session.getSnapshot()).toBe(before);
  });

  it('marks the selected active run as stop requested', async () => {
    const session = createInMemoryAiSession({
      run: {
        status: 'active',
        runId: 'run-1',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        claimedAt: 1,
        leaseExpiresAt: 10,
      },
      activity: {
        runId: 'run-1',
        status: 'working',
        summary: 'Reading the course',
        updatedAt: 2,
      },
    });

    expect((await session.stop('run-1')).ok).toBe(true);
    expect(session.getSnapshot().run).toEqual(
      expect.objectContaining({ status: 'stop_requested', runId: 'run-1' }),
    );
    expect(session.getSnapshot().activity).toEqual(
      expect.objectContaining({ status: 'stop_requested', summary: 'Stop requested' }),
    );
  });

  it('returns a queued follow-up to the draft when stopping its active run', async () => {
    const session = createInMemoryAiSession({
      run: {
        status: 'active',
        runId: 'run-1',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        claimedAt: 1,
        leaseExpiresAt: 10,
      },
      queuedFollowUp: 'Change direction and compare both theories.',
    });

    await session.stop('run-1');

    expect(session.getSnapshot()).toEqual(
      expect.objectContaining({
        draft: 'Change direction and compare both theories.',
        queuedFollowUp: null,
      }),
    );
  });
});
