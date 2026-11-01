import { describe, expect, it, vi } from 'vitest';
import { AI_RELAY_PROTOCOL_VERSION } from '../relayProtocol';
import { AI_CONNECTION_QUIET_AFTER_MS } from './relay';
import { CREATED, TERMINAL_PUBLIC_KEY, relaySessionHarness } from './relay.testHarness';

describe('relay AI session connection lifecycle', () => {
  it('marks an inactive terminal quiet and restores connected on its next mailbox revision', async () => {
    const { session, relay, crypto, tick, setNow } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    await session.pair();
    await tick();

    setNow(1_000 + AI_CONNECTION_QUIET_AFTER_MS);
    await tick();
    expect(session.getSnapshot().connection).toEqual({
      status: 'quiet',
      connectionId: CREATED.sessionId,
      client: { name: 'Terminal agent' },
      lastActivityAt: 1_000,
    });

    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-1"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: AI_RELAY_PROTOCOL_VERSION,
      revision: 1,
      browserRevisionSeen: 0,
      events: [],
    });
    setNow(1_000 + AI_CONNECTION_QUIET_AFTER_MS + 1_000);
    await tick();

    expect(session.getSnapshot().connection).toEqual({
      status: 'connected',
      connectionId: CREATED.sessionId,
      client: { name: 'Terminal agent' },
      lastActivityAt: 1_000 + AI_CONNECTION_QUIET_AFTER_MS + 1_000,
    });
  });

  it('contains polling transport failures without rejecting the timer task', async () => {
    const { session, relay, tick } = relaySessionHarness();
    await session.pair();
    vi.mocked(relay.peer).mockRejectedValue(new Error('relay unavailable'));

    await expect(tick()).resolves.toBeUndefined();
    expect(session.getSnapshot().connection).toEqual(
      expect.objectContaining({ status: 'pairing', code: CREATED.pairingCode }),
    );
  });

  it('does not overlap slow polling turns', async () => {
    const { session, relay, tick } = relaySessionHarness();
    await session.pair();
    let releasePeer!: (value: null) => void;
    vi.mocked(relay.peer).mockImplementation(
      () =>
        new Promise((resolve) => {
          releasePeer = resolve;
        }),
    );

    const firstPoll = tick();
    const overlappingPoll = tick();
    await vi.waitFor(() => expect(relay.peer).toHaveBeenCalledOnce());

    releasePeer(null);
    await Promise.all([firstPoll, overlappingPoll]);
    expect(relay.peer).toHaveBeenCalledOnce();
  });

  it('serialises Stop behind in-flight terminal event processing', async () => {
    const { session, relay, crypto, tick } = relaySessionHarness();
    vi.mocked(relay.peer).mockResolvedValue({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'Terminal agent' },
      expiresAt: 60_000,
    });
    vi.mocked(relay.push)
      .mockResolvedValueOnce({ generation: '"browser-1"' })
      .mockResolvedValueOnce({ generation: '"browser-2"' });
    await session.pair();
    await tick();
    await session.send('Stop after this is claimed.');
    vi.mocked(relay.pull).mockResolvedValue({
      bytes: new TextEncoder().encode('{}'),
      generation: '"terminal-1"',
    });
    vi.mocked(crypto.open).mockResolvedValue({
      version: AI_RELAY_PROTOCOL_VERSION,
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

    vi.mocked(crypto.open).mockResolvedValue({
      version: AI_RELAY_PROTOCOL_VERSION,
      revision: 2,
      browserRevisionSeen: 0,
      events: [
        {
          eventId: 'event-unknown-claim',
          type: 'claimed',
          messageId: 'missing-message',
          runId: 'missing-run',
          claimedAt: 1_200,
          leaseExpiresAt: 20_000,
        },
      ],
    });
    let releasePollPush!: (value: { generation: string }) => void;
    vi.mocked(relay.push).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releasePollPush = resolve;
        }),
    );
    const polling = tick();
    await vi.waitFor(() => expect(relay.push).toHaveBeenCalledTimes(3));

    const stopping = session.stop('run-1');
    await Promise.resolve();
    expect(relay.push).toHaveBeenCalledTimes(3);

    vi.mocked(relay.push).mockResolvedValueOnce({ generation: '"browser-4"' });
    releasePollPush({ generation: '"browser-3"' });
    await polling;
    await expect(stopping).resolves.toEqual({ ok: true, data: undefined });
    expect(relay.push).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.any(Uint8Array),
      '"browser-3"',
    );
  });
});
