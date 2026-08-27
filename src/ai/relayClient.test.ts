import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_RELAY_URL } from '../sync/pairing';
import { AI_RELAY_EMPTY_GENERATION } from './relayProtocol';
import {
  RelayClientProtocolError,
  RelayStaleGenerationError,
  createRelayClient,
} from './relayClient';

const SESSION_ID = 'A'.repeat(20);
const PAIRING_CODE = 'AAAA-AAAA-AAAA-AAAA-AAAA';
const BROWSER_TOKEN = 'ab'.repeat(32);
const PUBLIC_KEY = base64Url(new Uint8Array(65).fill(4));
const CREDENTIALS = { sessionId: SESSION_ID, browserToken: BROWSER_TOKEN };

describe('browser AI relay client', () => {
  it('creates a session at the default relay with the browser public key', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(201, {
        sessionId: SESSION_ID,
        pairingCode: PAIRING_CODE,
        browserToken: BROWSER_TOKEN,
        expiresAt: 100,
      }),
    );

    await expect(createRelayClient({ fetchImpl }).create(PUBLIC_KEY)).resolves.toEqual({
      sessionId: SESSION_ID,
      pairingCode: PAIRING_CODE,
      browserToken: BROWSER_TOKEN,
      expiresAt: 100,
    });
    expect(fetchImpl).toHaveBeenCalledWith(`${DEFAULT_RELAY_URL}/ai/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ browserPublicKey: PUBLIC_KEY }),
    });
  });

  it('polls the authenticated peer endpoint and treats 404 as still waiting', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          terminalPublicKey: PUBLIC_KEY,
          client: { name: 'OpenCode' },
          expiresAt: 200,
        }),
      );
    const client = createRelayClient({ relayUrl: 'https://relay.example/', fetchImpl });

    await expect(client.peer(CREDENTIALS)).resolves.toBeNull();
    await expect(client.peer(CREDENTIALS)).resolves.toEqual({
      terminalPublicKey: PUBLIC_KEY,
      client: { name: 'OpenCode' },
      expiresAt: 200,
    });
    expect(fetchImpl.mock.calls[1]).toEqual([
      `https://relay.example/ai/s/${SESSION_ID}/peer`,
      {
        method: 'GET',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${BROWSER_TOKEN}` },
      },
    ]);
  });

  it('reads only the terminal mailbox and preserves its opaque ETag', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { ETag: '"platform"', 'X-Lacuna-Generation': '"terminal-2"' },
      }),
    );

    await expect(createRelayClient({ fetchImpl }).pull(CREDENTIALS)).resolves.toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      generation: '"terminal-2"',
    });
    expect(fetchImpl).toHaveBeenCalledWith(`${DEFAULT_RELAY_URL}/ai/s/${SESSION_ID}/terminal`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${BROWSER_TOKEN}` },
    });
  });

  it('writes only the browser mailbox with bearer auth and compare-and-swap', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ generation: '"browser-1"' }), {
        status: 200,
        headers: { ETag: '"platform"', 'Content-Type': 'application/json' },
      }),
    );
    const bytes = new Uint8Array([4, 5, 6]);

    await expect(
      createRelayClient({ fetchImpl }).push(CREDENTIALS, bytes, AI_RELAY_EMPTY_GENERATION),
    ).resolves.toEqual({ generation: '"browser-1"' });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${DEFAULT_RELAY_URL}/ai/s/${SESSION_ID}/browser`);
    expect(init?.method).toBe('PUT');
    expect(init?.headers).toEqual({
      Authorization: `Bearer ${BROWSER_TOKEN}`,
      'Content-Type': 'application/octet-stream',
      'If-Match': AI_RELAY_EMPTY_GENERATION,
    });
    expect(new Uint8Array(await new Response(init?.body).arrayBuffer())).toEqual(bytes);
  });

  it('accepts a legacy header-only mailbox write response', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 204,
        headers: { 'X-Lacuna-Generation': '"browser-legacy"' },
      }),
    );

    await expect(
      createRelayClient({ fetchImpl }).push(
        CREDENTIALS,
        new Uint8Array([1]),
        AI_RELAY_EMPTY_GENERATION,
      ),
    ).resolves.toEqual({ generation: '"browser-legacy"' });
  });

  it('reports stale mailbox generations and malformed successful responses', async () => {
    const staleFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 412 }));
    await expect(
      createRelayClient({ fetchImpl: staleFetch }).push(CREDENTIALS, new Uint8Array([1]), '"old"'),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'RelayStaleGenerationError',
        attemptedGeneration: '"old"',
        status: 412,
      }),
    );
    await expect(
      createRelayClient({ fetchImpl: staleFetch }).push(CREDENTIALS, new Uint8Array([1]), '"old"'),
    ).rejects.toBeInstanceOf(RelayStaleGenerationError);

    const malformedFetch = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(201, { ok: true }));
    await expect(
      createRelayClient({ fetchImpl: malformedFetch }).create(PUBLIC_KEY),
    ).rejects.toBeInstanceOf(RelayClientProtocolError);

    const malformedPush = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { generation: '""' }));
    await expect(
      createRelayClient({ fetchImpl: malformedPush }).push(
        CREDENTIALS,
        new Uint8Array([1]),
        AI_RELAY_EMPTY_GENERATION,
      ),
    ).rejects.toBeInstanceOf(RelayClientProtocolError);
  });

  it('revokes with the browser token and treats an absent session as revoked', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const client = createRelayClient({ fetchImpl });

    await client.revoke(CREDENTIALS);
    await client.revoke(CREDENTIALS);

    expect(fetchImpl.mock.calls[0]).toEqual([
      `${DEFAULT_RELAY_URL}/ai/s/${SESSION_ID}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${BROWSER_TOKEN}` } },
    ]);
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
