import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import type { JsonValue } from '../../../src/ai/protocol';
import type {
  RelayBrowserMailbox,
  RelayEnvelope,
  RelayTerminalMailbox,
} from '../../../src/ai/relayProtocol';
import { TerminalRelayReconnectRequiredError } from './client';
import {
  HttpTerminalRelayTransport,
  type HttpTerminalRelayTransportOptions,
  type RelayCryptoOperations,
} from './relayTransport';

const PUBLIC_KEY = Buffer.from(new Uint8Array(65).fill(1)).toString('base64url');
const PEER_PUBLIC_KEY = Buffer.from(new Uint8Array(65).fill(2)).toString('base64url');
const TOKEN = 'a'.repeat(64);
const ENVELOPE: RelayEnvelope = {
  version: 1,
  nonce: Buffer.from(new Uint8Array(12)).toString('base64url'),
  ciphertext: Buffer.from(new Uint8Array(16)).toString('base64url'),
};
const ENCRYPTED_BODY = JSON.stringify(ENVELOPE);
const KEY = {} as CryptoKey;

function cryptoOperations(opened: JsonValue): RelayCryptoOperations {
  return {
    createKeyPair: vi.fn().mockResolvedValue({ publicKey: PUBLIC_KEY, privateKey: 'private-key' }),
    deriveKey: vi.fn().mockResolvedValue(KEY),
    seal: vi.fn().mockResolvedValue(ENVELOPE),
    open: vi.fn().mockResolvedValue(opened),
  };
}

function createTestTerminalRelayTransport(
  options: HttpTerminalRelayTransportOptions,
): HttpTerminalRelayTransport {
  return new HttpTerminalRelayTransport({
    ...options,
    recovery: {
      ...options.recovery,
      wait: options.recovery?.wait ?? (async () => {}),
    },
  });
}

describe('HttpTerminalRelayTransport', () => {
  it('allows plain HTTP for IPv6 loopback relay development', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        sessionId: 'ABCDEFGHJKMNPQRSTVW2',
        browserPublicKey: PEER_PUBLIC_KEY,
        terminalToken: TOKEN,
        expiresAt: 90_000,
      }),
    );
    const transport = new HttpTerminalRelayTransport({
      fetchImpl,
      crypto: cryptoOperations({}),
    });

    await expect(
      transport.connect('ABCD-EFGH-JKMN-PQRS-TVW2', 'http://[::1]:8787', {
        name: 'Test client',
      }),
    ).resolves.toMatchObject({ relayUrl: 'http://[::1]:8787' });
  });

  it('claims with an ephemeral P-256 public key and derives the shared mailbox key', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        sessionId: 'ABCDEFGHJKMNPQRSTVW2',
        browserPublicKey: PEER_PUBLIC_KEY,
        terminalToken: TOKEN,
        expiresAt: 90_000,
      }),
    );
    const crypto = cryptoOperations({});
    const transport = new HttpTerminalRelayTransport({ fetchImpl, crypto });

    await expect(
      transport.connect('ABCD-EFGH-JKMN-PQRS-TVW2', 'https://relay.example/', {
        name: 'OpenCode',
        version: '1.2.3',
      }),
    ).resolves.toMatchObject({
      relayUrl: 'https://relay.example',
      sessionId: 'ABCDEFGHJKMNPQRSTVW2',
      expiresAt: 90_000,
    });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://relay.example/ai/s/ABCD-EFGH-JKMN-PQRS-TVW2/claim');
    expect(init).toMatchObject({ method: 'POST' });
    expect(new Headers(init?.headers).has('Content-Length')).toBe(false);
    expect(JSON.parse(String(init?.body))).toEqual({
      terminalPublicKey: PUBLIC_KEY,
      client: { name: 'OpenCode', version: '1.2.3' },
    });
    expect(crypto.deriveKey).toHaveBeenCalledWith('private-key', PEER_PUBLIC_KEY);
  });

  it('reads the encrypted browser mailbox and writes the encrypted terminal mailbox with ETags', async () => {
    const browserMailbox: RelayBrowserMailbox = {
      version: 1,
      revision: 0,
      terminalRevisionSeen: 0,
      messages: [],
    };
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
        new Response(JSON.stringify(ENVELOPE), {
          status: 200,
          headers: { ETag: '"platform"', 'X-Lacuna-Generation': '"browser-1"' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ generation: '"terminal-1"' }), {
          status: 200,
          headers: { ETag: '"platform"', 'Content-Type': 'application/json' },
        }),
      );
    const crypto = cryptoOperations(browserMailbox);
    const transport = new HttpTerminalRelayTransport({ fetchImpl, crypto });
    const connection = await transport.connect(
      'ABCD-EFGH-JKMN-PQRS-TVW2',
      'https://relay.example',
      { name: 'Test client' },
    );

    await expect(transport.readBrowserMailbox(connection)).resolves.toEqual({
      generation: '"browser-1"',
      mailbox: browserMailbox,
    });
    const terminalMailbox: RelayTerminalMailbox = { version: 1, revision: 0, events: [] };
    await expect(transport.writeTerminalMailbox(connection, '"0"', terminalMailbox)).resolves.toBe(
      '"terminal-1"',
    );

    expect(fetchImpl.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
    });
    expect(fetchImpl.mock.calls[2]?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
      'If-Match': '"0"',
    });
    expect(new Headers(fetchImpl.mock.calls[2]?.[1]?.headers).has('Content-Length')).toBe(false);
    expect(crypto.open).toHaveBeenCalledWith(KEY, ENVELOPE);
    expect(crypto.seal).toHaveBeenCalledWith(KEY, terminalMailbox);
  });

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
        version: 1,
        revision: 0,
        events: [],
      }),
    ).rejects.toMatchObject({
      name: 'TerminalRelayReconnectRequiredError',
      reason: 'terminal_writer_changed',
      message:
        'Another terminal writer changed this Lacuna AI session. Reconnect Lacuna AI before continuing.',
    });
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
      .mockResolvedValueOnce(
        new Response(ENCRYPTED_BODY, {
          status: 200,
          headers: { 'X-Lacuna-Generation': '"terminal-recovered"' },
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
        version: 1,
        revision: 0,
        events: [],
      }),
    ).resolves.toBe('"terminal-recovered"');
    expect(fetchImpl.mock.calls.map(([, init]) => init?.method ?? 'GET')).toEqual([
      'POST',
      'PUT',
      'GET',
    ]);
  });

  it('recovers an exact terminal mailbox write after a stale reconciliation read', async () => {
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
      .mockResolvedValueOnce(
        new Response('stale ciphertext', {
          status: 200,
          headers: { 'X-Lacuna-Generation': '"terminal-stale"' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(ENCRYPTED_BODY, {
          status: 200,
          headers: { 'X-Lacuna-Generation': '"terminal-recovered"' },
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
        version: 1,
        revision: 0,
        events: [],
      }),
    ).resolves.toBe('"terminal-recovered"');
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
        .mockResolvedValueOnce(
          new Response(ENCRYPTED_BODY, {
            status: 200,
            headers: { 'X-Lacuna-Generation': '"terminal-recovered"' },
          }),
        );
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
        version: 1,
        revision: 0,
        events: [],
      });
      await vi.advanceTimersByTimeAsync(250);

      await expect(result).resolves.toBe('"terminal-recovered"');
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

  it('requires reconnection when relay 500 reconciliation finds different bytes', async () => {
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
      .mockResolvedValueOnce(
        new Response('different ciphertext', {
          status: 200,
          headers: { 'X-Lacuna-Generation': '"terminal-other"' },
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
        version: 1,
        revision: 0,
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
      .mockResolvedValueOnce(
        new Response(ENCRYPTED_BODY, {
          status: 200,
          headers: { 'X-Lacuna-Generation': '"terminal-recovered"' },
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
        version: 1,
        revision: 0,
        events: [],
      }),
    ).resolves.toBe('"terminal-recovered"');
    expect(fetchImpl.mock.calls.map(([, init]) => init?.method ?? 'GET')).toEqual([
      'POST',
      'PUT',
      'GET',
    ]);
    expect(fetchImpl.mock.calls[2]?.[0]).toBe(
      'https://relay.example/ai/s/ABCDEFGHJKMNPQRSTVW2/terminal',
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
      .mockResolvedValueOnce(
        new Response(ENCRYPTED_BODY, {
          status: 200,
          headers: { 'X-Lacuna-Generation': '"terminal-recovered"' },
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
        version: 1,
        revision: 0,
        events: [],
      }),
    ).resolves.toBe('"terminal-recovered"');
  });

  it('does not trust a platform ETag while reconciling an ambiguous terminal write', async () => {
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
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(ENCRYPTED_BODY, {
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
        version: 1,
        revision: 0,
        events: [],
      }),
    ).rejects.toBeInstanceOf(TerminalRelayReconnectRequiredError);
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
        version: 1,
        revision: 0,
        events: [],
      }),
    ).resolves.toBe('"terminal-legacy"');
  });

  it('recovers an exact terminal mailbox write when a 200 PUT returns an invalid body', async () => {
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
      .mockResolvedValueOnce(Response.json({ generation: '"terminal-1"', unexpected: true }))
      .mockResolvedValueOnce(
        new Response(ENCRYPTED_BODY, {
          status: 200,
          headers: { 'X-Lacuna-Generation': '"terminal-recovered"' },
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
        version: 1,
        revision: 0,
        events: [],
      }),
    ).resolves.toBe('"terminal-recovered"');
  });

  it('requires reconnection when reconciliation finds different terminal mailbox bytes', async () => {
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
      .mockResolvedValueOnce(
        new Response(`${ENCRYPTED_BODY}\n`, {
          status: 200,
          headers: { 'X-Lacuna-Generation': '"terminal-other"' },
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
        version: 1,
        revision: 0,
        events: [],
      }),
    ).rejects.toBeInstanceOf(TerminalRelayReconnectRequiredError);
  });

  it('requires reconnection when the reconciled terminal mailbox has no generation', async () => {
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
      .mockResolvedValueOnce(new Response(ENCRYPTED_BODY, { status: 200 }));
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
        version: 1,
        revision: 0,
        events: [],
      }),
    ).rejects.toBeInstanceOf(TerminalRelayReconnectRequiredError);
  });
});
