import { describe, expect, it, vi } from 'vitest';
import type { JsonValue } from '../protocol';
import { type RelayTerminalMailbox } from '../relayProtocol';
import { relaySessionHarness } from './relay.testHarness';

describe('relay AI session messages', () => {
  it('applies claimed and reply events exactly once', async () => {
    const { session, relay, crypto, tick } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    vi.mocked(relay.push)
      .mockResolvedValueOnce({ generation: '"browser-1"' })
      .mockResolvedValueOnce({ generation: '"browser-2"' });
    await session.pair();
    await tick();
    await session.send('Explain the testing effect.');

    const mailbox: RelayTerminalMailbox = {
      version: 3,
      revision: 2,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-claim',
          type: 'claimed',
          messageId: 'message-1',
          runId: 'run-1',
          claimedAt: 1_100,
          leaseExpiresAt: 20_000,
        },
        {
          eventId: 'event-reply',
          type: 'reply',
          messageId: 'message-1',
          runId: 'run-1',
          content: 'The testing effect is improved recall caused by retrieval practice.',
          createdAt: 1_200,
        },
      ],
    };
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-2"',
    });
    vi.mocked(crypto.open).mockResolvedValue(mailbox as JsonValue);

    await tick();
    const afterFirstPoll = session.getSnapshot();
    await tick();

    expect(session.getSnapshot()).toBe(afterFirstPoll);
    expect(afterFirstPoll.items).toEqual([
      expect.objectContaining({ kind: 'user', id: 'message-1', delivery: 'completed' }),
      expect.objectContaining({
        kind: 'assistant',
        content: 'The testing effect is improved recall caused by retrieval practice.',
      }),
    ]);
    expect(afterFirstPoll.run).toEqual(
      expect.objectContaining({ status: 'completed', runId: 'run-1', completedAt: 1_200 }),
    );
    expect(relay.push).toHaveBeenCalledTimes(2);
  });

  it('requeues an expired claim under the same identity and completes a later run', async () => {
    const { session, relay, crypto, tick, setNow } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    await session.send('Try this message again after the lease.');
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-1"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: 3,
      revision: 1,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-old-claim',
          type: 'claimed',
          messageId: 'message-1',
          runId: 'run-old',
          claimedAt: 1_100,
          leaseExpiresAt: 2_000,
        },
      ],
    });
    await tick();
    setNow(2_000);
    vi.mocked(crypto.open).mockResolvedValue({
      version: 3,
      revision: 2,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-old-claim',
          type: 'claimed',
          messageId: 'message-1',
          runId: 'run-old',
          claimedAt: 1_100,
          leaseExpiresAt: 2_000,
        },
        {
          eventId: 'event-late-reply',
          type: 'reply',
          messageId: 'message-1',
          runId: 'run-old',
          content: 'This arrived too late.',
          createdAt: 2_000,
        },
      ],
    });

    await tick();

    const expired = session.getSnapshot();
    expect(expired.run).toEqual(
      expect.objectContaining({ status: 'expired', runId: 'run-old', expiredAt: 2_000 }),
    );
    expect(expired.items).toEqual([
      expect.objectContaining({
        kind: 'user',
        id: 'message-1',
        content: 'Try this message again after the lease.',
        delivery: 'queued',
      }),
      expect.objectContaining({
        kind: 'error',
        error: {
          kind: 'internal',
          message:
            'The terminal did not finish before the run lease expired. The message was queued again.',
        },
      }),
    ]);
    expect(crypto.seal).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        messages: [expect.objectContaining({ messageId: 'message-1', delivery: 'queued' })],
      }),
    );

    vi.mocked(crypto.open).mockResolvedValue({
      version: 3,
      revision: 3,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-new-claim',
          type: 'claimed',
          messageId: 'message-1',
          runId: 'run-new',
          claimedAt: 2_100,
          leaseExpiresAt: 3_000,
        },
      ],
    });
    await tick();
    expect(session.getSnapshot().run).toEqual(
      expect.objectContaining({ status: 'active', runId: 'run-new', messageId: 'message-1' }),
    );
    expect(session.getSnapshot().items).toEqual([
      expect.objectContaining({ kind: 'user', id: 'message-1', delivery: 'claimed' }),
      expect.objectContaining({ kind: 'error' }),
    ]);

    vi.mocked(crypto.open).mockResolvedValue({
      version: 3,
      revision: 4,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-new-reply',
          type: 'reply',
          messageId: 'message-1',
          runId: 'run-new',
          content: 'This reply belongs to the retried run.',
          createdAt: 2_200,
        },
      ],
    });
    await tick();

    expect(session.getSnapshot().items).toEqual([
      expect.objectContaining({ kind: 'user', id: 'message-1', delivery: 'completed' }),
      expect.objectContaining({ kind: 'error' }),
      expect.objectContaining({
        kind: 'assistant',
        content: 'This reply belongs to the retried run.',
      }),
    ]);
    expect(session.getSnapshot().run).toEqual(
      expect.objectContaining({ status: 'completed', runId: 'run-new', messageId: 'message-1' }),
    );
  });

  it('accepts a reply authored inside the lease when the browser polls after expiry', async () => {
    const { session, relay, crypto, tick, setNow } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    await session.send('Finish before the lease, even if my browser polls late.');
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-1"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: 3,
      revision: 1,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-claim',
          type: 'claimed',
          messageId: 'message-1',
          runId: 'run-1',
          claimedAt: 1_100,
          leaseExpiresAt: 2_000,
        },
      ],
    });
    await tick();

    setNow(2_100);
    vi.mocked(crypto.open).mockResolvedValue({
      version: 3,
      revision: 2,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-claim',
          type: 'claimed',
          messageId: 'message-1',
          runId: 'run-1',
          claimedAt: 1_100,
          leaseExpiresAt: 2_000,
        },
        {
          eventId: 'event-reply',
          type: 'reply',
          messageId: 'message-1',
          runId: 'run-1',
          content: 'This reply was authored in time.',
          createdAt: 1_999,
        },
      ],
    });

    await tick();

    expect(session.getSnapshot().run).toEqual(
      expect.objectContaining({ status: 'completed', runId: 'run-1', messageId: 'message-1' }),
    );
    expect(session.getSnapshot().items).toEqual([
      expect.objectContaining({ kind: 'user', id: 'message-1', delivery: 'completed' }),
      expect.objectContaining({ kind: 'assistant', content: 'This reply was authored in time.' }),
    ]);
  });
});
