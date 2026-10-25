import { describe, expect, it, vi } from 'vitest';
import { relaySessionHarness } from './relay.testHarness';

describe('relay AI session messages', () => {
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
      version: 3,
      revision: 2,
      browserRevisionSeen: 0,
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

  it('rejects a new follow-up while Stop is awaiting acknowledgement', async () => {
    const { session, relay, crypto, tick } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: 'terminal-public',
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();
    await session.send('Stop after claiming this.');
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
          leaseExpiresAt: 20_000,
        },
      ],
    });
    await tick();
    await session.stop('run-1');

    await expect(session.send('Do not queue this after Stop.')).resolves.toEqual({
      ok: false,
      error: {
        kind: 'conflict',
        message: 'Wait for AI to stop before sending another message.',
      },
    });
    expect(session.getSnapshot().queuedFollowUp).toBeNull();
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
});
