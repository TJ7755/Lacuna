import { describe, expect, it, vi } from 'vitest';
import type { RelayBrowserMailbox, RelayTerminalMailbox } from '../../../src/ai/relayProtocol';
import { HttpTerminalRelayTransport } from './relayTransport';
import {
  PUBLIC_KEY,
  PEER_PUBLIC_KEY,
  TOKEN,
  ENVELOPE,
  KEY,
  cryptoOperations,
} from './relayTransport.testHarness';

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
    expect(url).toBe('https://relay.example/ai/claim');
    expect(init).toMatchObject({ method: 'POST' });
    expect(new Headers(init?.headers).get('X-Lacuna-Pairing-Code')).toBe(
      'ABCD-EFGH-JKMN-PQRS-TVW2',
    );
    expect(new Headers(init?.headers).has('Content-Length')).toBe(false);
    expect(JSON.parse(String(init?.body))).toEqual({
      terminalPublicKey: PUBLIC_KEY,
      client: { name: 'OpenCode', version: '1.2.3' },
    });
    expect(crypto.deriveKey).toHaveBeenCalledWith('private-key', PEER_PUBLIC_KEY);
  });

  it('reads the encrypted browser mailbox and writes the encrypted terminal mailbox with ETags', async () => {
    const browserMailbox: RelayBrowserMailbox = {
      version: 3,
      revision: 0,
      terminalRevisionSeen: 0,
      toolResponses: [],
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

    const readAbort = new AbortController();
    await expect(transport.readBrowserMailbox(connection, readAbort.signal)).resolves.toEqual({
      generation: '"browser-1"',
      mailbox: browserMailbox,
    });
    const terminalMailbox: RelayTerminalMailbox = {
      version: 3,
      revision: 0,
      events: [],
      browserRevisionSeen: 0,
    };
    await expect(transport.writeTerminalMailbox(connection, '"0"', terminalMailbox)).resolves.toBe(
      '"terminal-1"',
    );

    expect(fetchImpl.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
    });
    expect(fetchImpl.mock.calls[1]?.[1]?.signal).toBe(readAbort.signal);
    expect(fetchImpl.mock.calls[2]?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
      'If-Match': '"0"',
    });
    expect(new Headers(fetchImpl.mock.calls[2]?.[1]?.headers).has('Content-Length')).toBe(false);
    expect(crypto.open).toHaveBeenCalledWith(KEY, ENVELOPE);
    expect(crypto.seal).toHaveBeenCalledWith(KEY, terminalMailbox);
  });
});
