import { describe, expect, it, vi } from 'vitest';
import { RelayPushOutcomeUnknownError, RelayStaleGenerationError } from '../relayClient';
import type { JsonValue } from '../protocol';
import { AI_RELAY_EMPTY_GENERATION, type RelayTerminalMailbox } from '../relayProtocol';
import { CREATED, relaySessionHarness } from './relay.testHarness';

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
        version: 1,
        revision: 1,
        terminalRevisionSeen: 0,
        messages: [
          {
            messageId: 'message-1',
            conversationId: 'conversation-2',
            content: 'Explain the testing effect.',
            createdAt: 1_000,
            delivery: 'queued',
          },
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

  it('requires reconnect after a stale browser mailbox generation', async () => {
    const { session, relay, tick, cancelPolling } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    vi.mocked(relay.push).mockRejectedValueOnce(
      new RelayStaleGenerationError(AI_RELAY_EMPTY_GENERATION),
    );

    await expect(session.send('Do not overwrite another browser writer.')).resolves.toEqual({
      ok: false,
      error: {
        kind: 'conflict',
        message: 'Another Lacuna tab or window changed this AI connection. Reconnect the terminal.',
      },
    });

    expect(session.getSnapshot().connection).toEqual({
      status: 'disconnected',
      reason: 'Another Lacuna tab or window changed this AI connection. Reconnect the terminal.',
    });
    expect(cancelPolling).toHaveBeenCalledOnce();
    expect(relay.push).toHaveBeenCalledOnce();
  });

  it('fails closed when a committed mailbox write returns no usable generation', async () => {
    const { session, relay, tick, cancelPolling } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    vi.mocked(relay.push).mockRejectedValueOnce(new RelayPushOutcomeUnknownError(200));

    await expect(session.send('Do not retry this committed write.')).resolves.toEqual({
      ok: false,
      error: {
        kind: 'conflict',
        message:
          'The relay may have accepted this AI update, but Lacuna could not verify it. Reconnect the terminal.',
      },
    });

    expect(session.getSnapshot().connection).toEqual({
      status: 'disconnected',
      reason:
        'The relay may have accepted this AI update, but Lacuna could not verify it. Reconnect the terminal.',
    });
    expect(cancelPolling).toHaveBeenCalledOnce();
    await tick();
    expect(relay.push).toHaveBeenCalledOnce();
  });

  it('stops polling after a stale generation while applying terminal events', async () => {
    const { session, relay, crypto, tick, cancelPolling } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    await session.send('Claim this message.');
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-1"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: 1,
      revision: 1,
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
    vi.mocked(relay.push).mockRejectedValueOnce(new RelayStaleGenerationError('"browser-1"'));

    await tick();
    await tick();

    expect(session.getSnapshot().connection).toEqual({
      status: 'disconnected',
      reason: 'Another Lacuna tab or window changed this AI connection. Reconnect the terminal.',
    });
    expect(cancelPolling).toHaveBeenCalledOnce();
    expect(relay.push).toHaveBeenCalledTimes(2);
  });

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
      version: 1,
      revision: 2,
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

  it('pushes Stop before resolving and applies the terminal acknowledgement', async () => {
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
    await session.send('Stop after claiming this.');
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-1"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: 1,
      revision: 1,
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
    await session.send('Compare it with rereading.');

    let releasePush!: (value: { generation: string }) => void;
    vi.mocked(relay.push).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releasePush = resolve;
        }),
    );
    let settled = false;
    const stopping = session.stop('run-1').then((result) => {
      settled = true;
      return result;
    });
    await vi.waitFor(() => expect(relay.push).toHaveBeenCalledTimes(4));

    expect(settled).toBe(false);
    expect(crypto.seal).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        messages: [expect.objectContaining({ runId: 'run-1', delivery: 'stop_requested' })],
      }),
    );

    releasePush({ generation: '"browser-3"' });
    await expect(stopping).resolves.toEqual({ ok: true, data: undefined });
    expect(session.getSnapshot().run).toEqual(
      expect.objectContaining({ status: 'stop_requested', runId: 'run-1' }),
    );
    expect(session.getSnapshot()).toEqual(
      expect.objectContaining({
        draft: 'Compare it with rereading.',
        queuedFollowUp: null,
      }),
    );

    vi.mocked(relay.push).mockResolvedValueOnce({ generation: '"browser-4"' });
    vi.mocked(crypto.open).mockResolvedValue({
      version: 1,
      revision: 2,
      events: [
        {
          eventId: 'event-stop',
          type: 'stop_acknowledged',
          runId: 'run-1',
          stoppedAt: 1_300,
        },
      ],
    });
    await tick();

    expect(session.getSnapshot().run).toEqual(
      expect.objectContaining({ status: 'stopped', stoppedAt: 1_300 }),
    );
    expect(session.getSnapshot().activity).toEqual(
      expect.objectContaining({ status: 'completed', summary: 'Stopped' }),
    );
  });

  it('retains queued messages that do not belong to the stopped run', async () => {
    const { session, relay, crypto, tick } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    await session.send('Run this first.');
    await session.send('Leave this queued.');
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-1"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: 1,
      revision: 1,
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

    await session.stop('run-1');

    expect(crypto.seal).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        messages: [
          expect.objectContaining({ messageId: 'message-1', delivery: 'stop_requested' }),
          expect.objectContaining({ messageId: 'message-3', delivery: 'queued' }),
        ],
      }),
    );
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
      version: 1,
      revision: 1,
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
      version: 1,
      revision: 3,
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

  it('requeues an expired claim and ignores a late reply from its old run', async () => {
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
      version: 1,
      revision: 1,
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
      version: 1,
      revision: 2,
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
        content: 'Try this message again after the lease.',
        delivery: 'queued',
      }),
    ]);
    const retriedMessageId = expired.items[0]?.id;
    expect(retriedMessageId).toEqual(expect.stringMatching(/^message-(?!1$).+/));
    expect(crypto.seal).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        messages: [expect.objectContaining({ messageId: retriedMessageId, delivery: 'queued' })],
      }),
    );

    vi.mocked(crypto.open).mockResolvedValue({
      version: 1,
      revision: 3,
      events: [
        {
          eventId: 'event-new-claim',
          type: 'claimed',
          messageId: retriedMessageId,
          runId: 'run-new',
          claimedAt: 2_100,
          leaseExpiresAt: 3_000,
        },
      ],
    });
    await tick();
    expect(session.getSnapshot().run).toEqual(
      expect.objectContaining({ status: 'active', runId: 'run-new' }),
    );
  });
});
