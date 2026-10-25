import { describe, expect, it, vi } from 'vitest';
import { AI_RELAY_EMPTY_GENERATION } from '../relayProtocol';
import { CREATED, relaySessionHarness } from './relay.testHarness';
import { buildAiInstructionBundle } from '../instructions';

describe('relay AI session messages', () => {
  it('encrypts and persists a queued browser mailbox message', async () => {
    const { session, relay, crypto, tick } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();

    await expect(session.send('Explain the testing effect.')).resolves.toEqual({
      ok: true,
      data: { messageId: 'message-1' },
    });

    expect(crypto.seal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        version: 3,
        revision: 1,
        terminalRevisionSeen: 0,
        toolResponses: [],
        messages: [
          expect.objectContaining({
            messageId: 'message-1',
            conversationId: 'conversation-2',
            content: 'Explain the testing effect.',
            createdAt: 1_000,
            delivery: 'queued',
          }),
        ],
      }),
    );
    expect(relay.push).toHaveBeenCalledWith(
      { sessionId: CREATED.sessionId, browserToken: CREATED.browserToken },
      expect.any(Uint8Array),
      AI_RELAY_EMPTY_GENERATION,
    );
    expect(session.getSnapshot().items).toEqual([
      expect.objectContaining({
        kind: 'user',
        id: 'message-1',
        content: 'Explain the testing effect.',
        delivery: 'queued',
      }),
    ]);
  });

  it('captures the current teaching preference on each queued message', async () => {
    let enabled = true;
    const { session, relay, crypto, tick } = relaySessionHarness(undefined, () =>
      buildAiInstructionBundle({ misconceptionFirstEnabled: enabled }),
    );
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();

    await session.send('First request.');
    enabled = false;
    await session.send('Second request.');

    const lastMailbox = vi.mocked(crypto.seal).mock.calls.at(-1)?.[1];
    expect(lastMailbox).toEqual(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: 'First request.',
            instructions: expect.objectContaining({ misconceptionFirstEnabled: true }),
          }),
          expect.objectContaining({
            content: 'Second request.',
            instructions: expect.objectContaining({ misconceptionFirstEnabled: false }),
          }),
        ],
      }),
    );
  });

  it('does not let a slow terminal mailbox read block queuing a follow-up', async () => {
    const { session, relay, crypto, tick } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    await session.send('Run this first.');
    vi.mocked(relay.pull).mockResolvedValueOnce({
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
          leaseExpiresAt: 20_000,
        },
      ],
    });
    await tick();

    let releasePull!: (value: null) => void;
    vi.mocked(relay.pull).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releasePull = resolve;
        }),
    );
    const polling = tick();
    await vi.waitFor(() => expect(relay.pull).toHaveBeenCalledTimes(2));

    const sending = session.send('Queue this next.');
    const outcome = await Promise.race([
      sending.then(() => 'sent' as const),
      new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 50)),
    ]);
    releasePull(null);
    await polling;
    await sending;

    expect(outcome).toBe('sent');
    expect(session.getSnapshot().queuedFollowUp).toBe('Queue this next.');
  });

  it('moves a claimed follow-up from the queue into the transcript', async () => {
    const { session, relay, crypto, tick } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    await session.send('Explain retrieval practice.');
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
          eventId: 'event-claim-1',
          type: 'claimed',
          messageId: 'message-1',
          runId: 'run-1',
          claimedAt: 1_100,
          leaseExpiresAt: 20_000,
        },
      ],
    });
    await tick();
    await session.send('Now compare it with rereading.');

    vi.mocked(crypto.open).mockResolvedValue({
      version: 3,
      revision: 3,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-reply-1',
          type: 'reply',
          messageId: 'message-1',
          runId: 'run-1',
          content: 'Retrieval practice strengthens later recall.',
          createdAt: 1_200,
        },
        {
          eventId: 'event-claim-2',
          type: 'claimed',
          messageId: 'message-3',
          runId: 'run-2',
          claimedAt: 1_300,
          leaseExpiresAt: 30_000,
        },
      ],
    });
    await tick();

    expect(session.getSnapshot().queuedFollowUp).toBeNull();
    expect(session.getSnapshot().items).toEqual([
      expect.objectContaining({ kind: 'user', id: 'message-1', delivery: 'completed' }),
      expect.objectContaining({ kind: 'assistant' }),
      expect.objectContaining({
        kind: 'user',
        id: 'message-3',
        content: 'Now compare it with rereading.',
        delivery: 'claimed',
      }),
    ]);
    expect(session.getSnapshot().run).toEqual(
      expect.objectContaining({ status: 'active', runId: 'run-2', messageId: 'message-3' }),
    );
  });
});
