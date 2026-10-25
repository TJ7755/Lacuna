import { describe, expect, it, vi } from 'vitest';
import { HttpTerminalRelayTransport } from './relayTransport';
import {
  PEER_PUBLIC_KEY,
  TOKEN,
  SYNTHETIC_GENERATION,
  cryptoOperations,
  createTestTerminalRelayTransport,
} from './relayTransport.testHarness';

describe('HttpTerminalRelayTransport', () => {
  it('requires reconnection after a stale terminal generation', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          sessionId: 'ABCDEFGHJKMNPQRSTVW2',
          browserPublicKey: PEER_PUBLIC_KEY,
          terminalToken: TOKEN,
          expiresAt: 90_000,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 412 }));
    const transport = new HttpTerminalRelayTransport({
      fetchImpl,
      crypto: cryptoOperations({}),
    });
    const connection = await transport.connect(
      'ABCD-EFGH-JKMN-PQRS-TVW2',
      'https://relay.example',
      { name: 'Test client' },
    );

    await expect(
      transport.writeTerminalMailbox(connection, '"stale"', {
        version: 3,
        revision: 0,
        browserRevisionSeen: 0,
        events: [],
      }),
    ).rejects.toMatchObject({
      name: 'TerminalRelayReconnectRequiredError',
      reason: 'terminal_writer_changed',
      message:
        'Another terminal writer changed this Lacuna AI session. Reconnect Lacuna AI before continuing.',
    });
  });

  it('derives a synthetic generation instead of trusting a platform ETag on a 200', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          sessionId: 'ABCDEFGHJKMNPQRSTVW2',
          browserPublicKey: PEER_PUBLIC_KEY,
          terminalToken: TOKEN,
          expiresAt: 90_000,
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { ETag: '"platform-rewritten"' },
        }),
      );
    const transport = createTestTerminalRelayTransport({
      fetchImpl,
      crypto: cryptoOperations({}),
    });
    const connection = await transport.connect(
      'ABCD-EFGH-JKMN-PQRS-TVW2',
      'https://relay.example',
      { name: 'Test client' },
    );

    await expect(
      transport.writeTerminalMailbox(connection, '"0"', {
        version: 3,
        revision: 0,
        browserRevisionSeen: 0,
        events: [],
      }),
    ).resolves.toBe(SYNTHETIC_GENERATION);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('accepts the legacy 204 generation header for terminal mailbox writes', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          sessionId: 'ABCDEFGHJKMNPQRSTVW2',
          browserPublicKey: PEER_PUBLIC_KEY,
          terminalToken: TOKEN,
          expiresAt: 90_000,
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 204,
          headers: { 'X-Lacuna-Generation': '"terminal-legacy"' },
        }),
      );
    const transport = new HttpTerminalRelayTransport({
      fetchImpl,
      crypto: cryptoOperations({}),
    });
    const connection = await transport.connect(
      'ABCD-EFGH-JKMN-PQRS-TVW2',
      'https://relay.example',
      { name: 'Test client' },
    );

    await expect(
      transport.writeTerminalMailbox(connection, '"0"', {
        version: 3,
        revision: 0,
        browserRevisionSeen: 0,
        events: [],
      }),
    ).resolves.toBe('"terminal-legacy"');
  });

  it('derives a synthetic generation when a 200 PUT returns an invalid body', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          sessionId: 'ABCDEFGHJKMNPQRSTVW2',
          browserPublicKey: PEER_PUBLIC_KEY,
          terminalToken: TOKEN,
          expiresAt: 90_000,
        }),
      )
      .mockResolvedValueOnce(Response.json({ generation: '"terminal-1"', unexpected: true }));
    const transport = new HttpTerminalRelayTransport({
      fetchImpl,
      crypto: cryptoOperations({}),
    });
    const connection = await transport.connect(
      'ABCD-EFGH-JKMN-PQRS-TVW2',
      'https://relay.example',
      { name: 'Test client' },
    );

    await expect(
      transport.writeTerminalMailbox(connection, '"0"', {
        version: 3,
        revision: 0,
        browserRevisionSeen: 0,
        events: [],
      }),
    ).resolves.toBe(SYNTHETIC_GENERATION);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
