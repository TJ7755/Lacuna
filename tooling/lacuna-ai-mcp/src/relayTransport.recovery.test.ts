import { describe, expect, it, vi } from 'vitest';
import { TerminalRelayReconnectRequiredError, type TerminalRelayTransport } from './client';
import { HttpTerminalRelayTransport } from './relayTransport';
import {
  PEER_PUBLIC_KEY,
  TOKEN,
  ENCRYPTED_BODY_SHA256,
  SYNTHETIC_GENERATION,
  cryptoOperations,
  createTestTerminalRelayTransport,
} from './relayTransport.testHarness';

describe('HttpTerminalRelayTransport', () => {
  it('cancels a hung terminal PUT and reports its outcome as unknown', async () => {
    vi.useFakeTimers();
    try {
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
        .mockImplementationOnce((_input, init) => {
          return new Promise<Response>((_resolve, reject) => {
            if (init?.signal?.aborted) {
              reject(init.signal.reason);
              return;
            }
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
              once: true,
            });
          });
        });
      const transport = new HttpTerminalRelayTransport({
        fetchImpl,
        crypto: cryptoOperations({}),
      });
      const connection = await transport.connect(
        'ABCD-EFGH-JKMN-PQRS-TVW2',
        'https://relay.example',
        { name: 'Test client' },
      );
      const controller = new AbortController();
      const terminalTransport: TerminalRelayTransport = transport;
      const write = terminalTransport.writeTerminalMailbox(
        connection,
        '"0"',
        {
          version: 3,
          revision: 0,
          browserRevisionSeen: 0,
          events: [],
        },
        controller.signal,
      );
      const outcome = Promise.race([
        write.catch((error: unknown) => error),
        new Promise<'overrun'>((resolve) => setTimeout(() => resolve('overrun'), 1)),
      ]);

      controller.abort();
      await vi.advanceTimersByTimeAsync(1);

      await expect(outcome).resolves.toMatchObject({
        name: 'TerminalRelayReconnectRequiredError',
        reason: 'write_outcome_unknown',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('recovers an exact terminal mailbox write after an ambiguous relay 500', async () => {
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
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(Response.json({ generation: '"terminal-recovered"' }));
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
    expect(fetchImpl.mock.calls.map(([, init]) => init?.method ?? 'GET')).toEqual([
      'POST',
      'PUT',
      'GET',
    ]);
  });

  it('recovers an exact terminal mailbox write after a missing digest receipt', async () => {
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
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ generation: '"terminal-recovered"' }));
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
    expect(fetchImpl.mock.calls.map(([, init]) => init?.method ?? 'GET')).toEqual([
      'POST',
      'PUT',
      'GET',
      'GET',
    ]);
    expect(fetchImpl.mock.calls[2]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts a hung terminal reconciliation read before trying the next scheduled read', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
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
        .mockResolvedValueOnce(new Response(null, { status: 500 }))
        .mockImplementationOnce((_input, init) => {
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          });
        })
        .mockResolvedValueOnce(Response.json({ generation: '"terminal-recovered"' }));
      const transport = new HttpTerminalRelayTransport({
        fetchImpl,
        crypto: cryptoOperations({}),
        recovery: { now: () => Date.now() },
      });
      const connection = await transport.connect(
        'ABCD-EFGH-JKMN-PQRS-TVW2',
        'https://relay.example',
        { name: 'Test client' },
      );

      const result = transport.writeTerminalMailbox(connection, '"0"', {
        version: 3,
        revision: 0,
        browserRevisionSeen: 0,
        events: [],
      });
      await vi.advanceTimersByTimeAsync(250);

      await expect(result).resolves.toBe(SYNTHETIC_GENERATION);
      expect(fetchImpl.mock.calls.map(([, init]) => init?.method ?? 'GET')).toEqual([
        'POST',
        'PUT',
        'GET',
        'GET',
      ]);
      expect(fetchImpl.mock.calls[2]?.[1]?.signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('requires reconnection when relay 500 reconciliation finds no matching digest receipt', async () => {
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
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValue(new Response(null, { status: 404 }));
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
    ).rejects.toMatchObject({
      name: 'TerminalRelayReconnectRequiredError',
      reason: 'write_outcome_unknown',
      message:
        'The terminal mailbox write outcome is unknown. Reconnect Lacuna AI before continuing.',
    });
  });

  it('recovers an exact terminal mailbox write after the PUT rejects without retrying it', async () => {
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
      .mockRejectedValueOnce(new TypeError('socket closed'))
      .mockResolvedValueOnce(Response.json({ generation: '"terminal-recovered"' }));
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
    expect(fetchImpl.mock.calls.map(([, init]) => init?.method ?? 'GET')).toEqual([
      'POST',
      'PUT',
      'GET',
    ]);
    expect(fetchImpl.mock.calls[2]?.[0]).toBe(
      `https://relay.example/ai/s/ABCDEFGHJKMNPQRSTVW2/terminal?digest=${ENCRYPTED_BODY_SHA256}`,
    );
    expect(fetchImpl.mock.calls[2]?.[1]).toMatchObject({
      cache: 'no-store',
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
  });

  it('recovers an exact terminal mailbox write when a successful PUT omits its generation', async () => {
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
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ generation: '"terminal-recovered"' }));
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
  });

  it('requires reconnection when reconciliation finds no matching terminal write digest', async () => {
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
      .mockRejectedValueOnce(new TypeError('socket closed'))
      .mockResolvedValue(new Response(null, { status: 404 }));
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
    ).rejects.toBeInstanceOf(TerminalRelayReconnectRequiredError);
  });

  it('does not depend on terminal digest receipt generation metadata', async () => {
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
      .mockRejectedValueOnce(new TypeError('socket closed'))
      .mockResolvedValue(new Response('{}', { status: 200 }));
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
  });
});
