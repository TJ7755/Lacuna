import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_RELAY_URL } from '../sync/pairing';
import { AI_RELAY_EMPTY_GENERATION } from './relayProtocol';
import {
  RelayClientHttpError,
  RelayClientProtocolError,
  RelayPushOutcomeUnknownError,
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

    await expect(createTestRelayClient({ fetchImpl }).create(PUBLIC_KEY)).resolves.toEqual({
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
    const client = createTestRelayClient({ relayUrl: 'https://relay.example/', fetchImpl });

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

    await expect(createTestRelayClient({ fetchImpl }).pull(CREDENTIALS)).resolves.toEqual({
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
      createTestRelayClient({ fetchImpl }).push(CREDENTIALS, bytes, AI_RELAY_EMPTY_GENERATION),
    ).resolves.toEqual({
      generation: '"sha256:787c798e39a5bc1910355bae6d0cd87a36b2e10fd0202a83e3bb6b005da83472"',
    });

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
      createTestRelayClient({ fetchImpl }).push(
        CREDENTIALS,
        new Uint8Array([1]),
        AI_RELAY_EMPTY_GENERATION,
      ),
    ).resolves.toEqual({ generation: '"browser-legacy"' });
  });

  it('accepts ETag only for a legacy 204 mailbox write response', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 204,
        headers: { ETag: '"browser-legacy-etag"' },
      }),
    );

    await expect(
      createTestRelayClient({ fetchImpl }).push(
        CREDENTIALS,
        new Uint8Array([1]),
        AI_RELAY_EMPTY_GENERATION,
      ),
    ).resolves.toEqual({ generation: '"browser-legacy-etag"' });
  });

  it.each([
    ['malformed', 'not-json', 'X-Lacuna-Generation'],
    ['empty', '', 'X-Lacuna-Generation'],
  ])(
    'derives the generation locally for a 200 with a %s JSON body',
    async (_case, body, header) => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(body, {
          status: 200,
          headers: { [header]: '"browser-fallback"' },
        }),
      );

      await expect(
        createTestRelayClient({ fetchImpl }).push(
          CREDENTIALS,
          new Uint8Array([1]),
          AI_RELAY_EMPTY_GENERATION,
        ),
      ).resolves.toEqual({
        generation: '"sha256:4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a"',
      });
    },
  );

  it('recovers a committed push through its ciphertext digest', async () => {
    const bytes = new Uint8Array([7, 8, 9]);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('PUT response was unreadable'))
      .mockResolvedValueOnce(jsonResponse(200, { generation: '"browser-recovered"' }));

    await expect(
      createTestRelayClient({ fetchImpl }).push(CREDENTIALS, bytes, AI_RELAY_EMPTY_GENERATION),
    ).resolves.toEqual({
      generation: '"sha256:66a6757151f8ee55db127716c7e3dce0be8074b64e20eda542e5c1e46ca9c41e"',
    });

    expect(fetchImpl.mock.calls[1]).toEqual([
      `${DEFAULT_RELAY_URL}/ai/s/${SESSION_ID}/browser?digest=66a6757151f8ee55db127716c7e3dce0be8074b64e20eda542e5c1e46ca9c41e`,
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${BROWSER_TOKEN}` },
        signal: expect.any(AbortSignal),
      }),
    ]);
  });

  it('retries reconciliation while the relay has not indexed the committed digest', async () => {
    const bytes = new Uint8Array([7, 8, 9]);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('PUT response was unreadable'))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(jsonResponse(200, { generation: '"browser-recovered"' }));

    await expect(
      createTestRelayClient({ fetchImpl }).push(CREDENTIALS, bytes, AI_RELAY_EMPTY_GENERATION),
    ).resolves.toEqual({
      generation: '"sha256:66a6757151f8ee55db127716c7e3dce0be8074b64e20eda542e5c1e46ca9c41e"',
    });

    expect(fetchImpl.mock.calls.map(([, init]) => init?.method)).toEqual(['PUT', 'GET', 'GET']);
  });

  it('schedules reconciliation reads at absolute offsets', async () => {
    let now = 0;
    const waits: number[] = [];
    const bytes = new Uint8Array([7, 8, 9]);
    const staleResponse = () => new Response(null, { status: 404 });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('PUT response was unreadable'))
      .mockResolvedValueOnce(staleResponse())
      .mockResolvedValueOnce(staleResponse())
      .mockResolvedValueOnce(jsonResponse(200, { generation: '"browser-recovered"' }));

    await expect(
      createRelayClient({
        fetchImpl,
        recovery: {
          now: () => now,
          wait: async (milliseconds) => {
            waits.push(milliseconds);
            now += milliseconds;
          },
        },
      }).push(CREDENTIALS, bytes, AI_RELAY_EMPTY_GENERATION),
    ).resolves.toEqual({
      generation: '"sha256:66a6757151f8ee55db127716c7e3dce0be8074b64e20eda542e5c1e46ca9c41e"',
    });

    expect(waits).toEqual([650, 750]);
  });

  it('aborts a hung reconciliation read before trying the next scheduled read', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const digestSpy = vi
      .spyOn(globalThis.crypto.subtle, 'digest')
      .mockResolvedValue(new Uint8Array(32).buffer);
    try {
      const bytes = new Uint8Array([7, 8, 9]);
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new TypeError('PUT response was unreadable'))
        .mockImplementationOnce((_input, init) => {
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          });
        })
        .mockResolvedValueOnce(jsonResponse(200, { generation: '"browser-recovered"' }));

      const result = createRelayClient({
        fetchImpl,
        recovery: { now: () => Date.now() },
      }).push(CREDENTIALS, bytes, AI_RELAY_EMPTY_GENERATION);
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(650);

      await expect(result).resolves.toEqual({
        generation: `"sha256:${'0'.repeat(64)}"`,
      });
      expect(fetchImpl.mock.calls.map(([, init]) => init?.method)).toEqual(['PUT', 'GET', 'GET']);
      expect(fetchImpl.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
    } finally {
      digestSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('accepts a recovery GET that completes after 250 ms but within its 600 ms timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const digestSpy = vi
      .spyOn(globalThis.crypto.subtle, 'digest')
      .mockResolvedValue(new Uint8Array(32).buffer);
    try {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new TypeError('PUT response was unreadable'))
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              setTimeout(() => resolve(new Response(null, { status: 200 })), 400);
            }),
        );

      const result = createRelayClient({
        fetchImpl,
        recovery: { now: () => Date.now() },
      }).push(CREDENTIALS, new Uint8Array([7, 8, 9]), AI_RELAY_EMPTY_GENERATION);
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchImpl).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(399);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);

      await expect(result).resolves.toEqual({ generation: `"sha256:${'0'.repeat(64)}"` });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      digestSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('recovers a committed push after the mailbox PUT rejects', async () => {
    const bytes = new Uint8Array([10, 11, 12]);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, { generation: '"browser-after-rejection"' }));

    await expect(
      createTestRelayClient({ fetchImpl }).push(CREDENTIALS, bytes, AI_RELAY_EMPTY_GENERATION),
    ).resolves.toEqual({
      generation: '"sha256:9909ec831e2cf6d0c73fb5480f31945a80987a13faee005704166cb53a26ceca"',
    });
  });

  it('recovers a committed push after the mailbox PUT returns a server error', async () => {
    const bytes = new Uint8Array([13, 14, 15]);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(jsonResponse(200, { generation: '"browser-after-server-error"' }));

    await expect(
      createTestRelayClient({ fetchImpl }).push(CREDENTIALS, bytes, AI_RELAY_EMPTY_GENERATION),
    ).resolves.toEqual({
      generation: '"sha256:d41470f8fe2547d6c4d4802d484fe7ff5a5bbecd5612eeeb1360df0c4781d95e"',
    });

    expect(fetchImpl.mock.calls.map(([, init]) => init?.method)).toEqual(['PUT', 'GET']);
  });

  it('reports an unknown push outcome when server-error recovery cannot find the digest', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    await expect(
      createTestRelayClient({ fetchImpl }).push(
        CREDENTIALS,
        new Uint8Array([21, 22, 23]),
        AI_RELAY_EMPTY_GENERATION,
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'RelayPushOutcomeUnknownError',
        operation: 'push',
        status: 503,
      }),
    );

    expect(fetchImpl.mock.calls.map(([, init]) => init?.method)).toEqual([
      'PUT',
      'GET',
      'GET',
      'GET',
    ]);
  });

  it('reports an unknown push outcome when server-error recovery cannot read the mailbox', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));

    await expect(
      createTestRelayClient({ fetchImpl }).push(
        CREDENTIALS,
        new Uint8Array([31]),
        AI_RELAY_EMPTY_GENERATION,
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'RelayPushOutcomeUnknownError',
        operation: 'push',
        status: 502,
      }),
    );
  });

  it('keeps definite client errors as HTTP errors without reconciling the mailbox', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(400, {
        error: 'Invalid mailbox payload',
      }),
    );

    await expect(
      createTestRelayClient({ fetchImpl }).push(
        CREDENTIALS,
        new Uint8Array([41]),
        AI_RELAY_EMPTY_GENERATION,
      ),
    ).rejects.toBeInstanceOf(RelayClientHttpError);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('derives the recovery generation without reading the receipt body or platform ETag', async () => {
    const bytes = new Uint8Array([10, 11, 12]);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('PUT response was unreadable'))
      .mockResolvedValueOnce(
        new Response('not-json', {
          status: 200,
          headers: { ETag: '"platform-rewritten"' },
        }),
      );

    await expect(
      createTestRelayClient({ fetchImpl }).push(CREDENTIALS, bytes, AI_RELAY_EMPTY_GENERATION),
    ).resolves.toEqual({
      generation: '"sha256:9909ec831e2cf6d0c73fb5480f31945a80987a13faee005704166cb53a26ceca"',
    });
  });

  it('reports an unknown push outcome when the recovery fetch rejects', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('PUT failed'))
      .mockRejectedValueOnce(new TypeError('GET failed'));

    await expect(
      createTestRelayClient({ fetchImpl }).push(
        CREDENTIALS,
        new Uint8Array([1]),
        AI_RELAY_EMPTY_GENERATION,
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'RelayPushOutcomeUnknownError',
        operation: 'push',
        status: undefined,
      }),
    );
  });

  it('rejects recovery when the relay cannot find the attempted ciphertext digest', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('PUT response was unreadable'))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    await expect(
      createTestRelayClient({ fetchImpl }).push(
        CREDENTIALS,
        new Uint8Array([1, 2, 3]),
        AI_RELAY_EMPTY_GENERATION,
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'RelayPushOutcomeUnknownError',
        operation: 'push',
        status: undefined,
      }),
    );
  });

  it.each([
    ['missing', undefined],
    ['invalid', '""'],
  ])(
    'ignores a %s platform generation on a successful digest receipt',
    async (_case, generation) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new TypeError('PUT response was unreadable'))
        .mockResolvedValueOnce(jsonResponse(200, generation ? { generation } : {}));

      await expect(
        createTestRelayClient({ fetchImpl }).push(
          CREDENTIALS,
          new Uint8Array([1]),
          AI_RELAY_EMPTY_GENERATION,
        ),
      ).resolves.toEqual({
        generation: '"sha256:4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a"',
      });
    },
  );

  it('retries only read-back after an ambiguous mailbox PUT', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    await expect(
      createTestRelayClient({ fetchImpl }).push(CREDENTIALS, new Uint8Array([1]), '"stale"'),
    ).rejects.toBeInstanceOf(RelayPushOutcomeUnknownError);

    expect(fetchImpl.mock.calls.map(([, init]) => init?.method)).toEqual([
      'PUT',
      'GET',
      'GET',
      'GET',
    ]);
  });

  it('derives a trustworthy generation when a 200 has no usable response metadata', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));

    await expect(
      createTestRelayClient({ fetchImpl }).push(
        CREDENTIALS,
        new Uint8Array([1]),
        AI_RELAY_EMPTY_GENERATION,
      ),
    ).resolves.toEqual({
      generation: '"sha256:4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a"',
    });
  });

  it('does not trust a platform ETag on a modern mailbox write response', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('', {
        status: 200,
        headers: { ETag: '"platform-rewritten"' },
      }),
    );

    await expect(
      createTestRelayClient({ fetchImpl }).push(
        CREDENTIALS,
        new Uint8Array([1]),
        AI_RELAY_EMPTY_GENERATION,
      ),
    ).resolves.toEqual({
      generation: '"sha256:4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a"',
    });
  });

  it('reports an unknown push outcome when the mailbox PUT rejects', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      createTestRelayClient({ fetchImpl }).push(
        CREDENTIALS,
        new Uint8Array([1]),
        AI_RELAY_EMPTY_GENERATION,
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'RelayPushOutcomeUnknownError',
        operation: 'push',
        status: undefined,
      }),
    );
  });

  it('reports stale generations, rejects malformed creates and derives 200 push generations', async () => {
    const staleFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 412 }));
    await expect(
      createTestRelayClient({ fetchImpl: staleFetch }).push(
        CREDENTIALS,
        new Uint8Array([1]),
        '"old"',
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'RelayStaleGenerationError',
        attemptedGeneration: '"old"',
        status: 412,
      }),
    );
    await expect(
      createTestRelayClient({ fetchImpl: staleFetch }).push(
        CREDENTIALS,
        new Uint8Array([1]),
        '"old"',
      ),
    ).rejects.toBeInstanceOf(RelayStaleGenerationError);

    const malformedFetch = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(201, { ok: true }));
    await expect(
      createTestRelayClient({ fetchImpl: malformedFetch }).create(PUBLIC_KEY),
    ).rejects.toBeInstanceOf(RelayClientProtocolError);

    const malformedPush = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { generation: '""' }));
    await expect(
      createTestRelayClient({ fetchImpl: malformedPush }).push(
        CREDENTIALS,
        new Uint8Array([1]),
        AI_RELAY_EMPTY_GENERATION,
      ),
    ).resolves.toEqual({
      generation: '"sha256:4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a"',
    });
  });

  it('revokes with the browser token and treats an absent session as revoked', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const client = createTestRelayClient({ fetchImpl });

    await client.revoke(CREDENTIALS);
    await client.revoke(CREDENTIALS);

    expect(fetchImpl.mock.calls[0]).toEqual([
      `${DEFAULT_RELAY_URL}/ai/s/${SESSION_ID}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${BROWSER_TOKEN}` } },
    ]);
  });
});

function createTestRelayClient(
  options: Parameters<typeof createRelayClient>[0] = {},
): ReturnType<typeof createRelayClient> {
  return createRelayClient({
    ...options,
    recovery: {
      ...options.recovery,
      wait: options.recovery?.wait ?? (async () => {}),
    },
  });
}

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
