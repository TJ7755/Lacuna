import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import type { JsonValue } from '../../../src/ai/protocol';
import type {
  RelayBrowserMailbox,
  RelayEnvelope,
  RelayTerminalMailbox,
} from '../../../src/ai/relayProtocol';
import { TerminalRelayReconnectRequiredError } from './client';
import { HttpTerminalRelayTransport, type RelayCryptoOperations } from './relayTransport';

const PUBLIC_KEY = Buffer.from(new Uint8Array(65).fill(1)).toString('base64url');
const PEER_PUBLIC_KEY = Buffer.from(new Uint8Array(65).fill(2)).toString('base64url');
const TOKEN = 'a'.repeat(64);
const ENVELOPE: RelayEnvelope = {
  version: 1,
  nonce: Buffer.from(new Uint8Array(12)).toString('base64url'),
  ciphertext: Buffer.from(new Uint8Array(16)).toString('base64url'),
};
const KEY = {} as CryptoKey;

function cryptoOperations(opened: JsonValue): RelayCryptoOperations {
  return {
    createKeyPair: vi.fn().mockResolvedValue({ publicKey: PUBLIC_KEY, privateKey: 'private-key' }),
    deriveKey: vi.fn().mockResolvedValue(KEY),
    seal: vi.fn().mockResolvedValue(ENVELOPE),
    open: vi.fn().mockResolvedValue(opened),
  };
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
          headers: { ETag: '"browser-1"' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 204, headers: { ETag: '"terminal-1"' } }),
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

  it('reports a stale terminal generation as a competing writer conflict', async () => {
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
    ).rejects.toThrow('Another terminal writer changed this Lacuna AI session.');
  });

  it('requires reconnection when a terminal mailbox PUT has an unknown network outcome', async () => {
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
      .mockRejectedValueOnce(new TypeError('socket closed'));
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
    ).rejects.toBeInstanceOf(TerminalRelayReconnectRequiredError);
  });

  it('requires reconnection when a successful terminal PUT omits its generation', async () => {
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
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
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
    ).rejects.toBeInstanceOf(TerminalRelayReconnectRequiredError);
  });
});
