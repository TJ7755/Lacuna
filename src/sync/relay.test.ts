import { describe, expect, it, vi } from 'vitest';
import {
  EMPTY_GENERATION,
  HttpRelayProvider,
  ManualRelayProvider,
  RelayConfigurationError,
  RelayHttpError,
  RelayProtocolError,
  StaleGenerationError,
  pullRelaySlot,
} from './relay';

const CHANNEL_ID = '0123456789abcdef0123456789abcdef';
const WRITE_TOKEN = 'ab'.repeat(32);

function provider(fetchImpl: typeof fetch) {
  return new HttpRelayProvider({
    relayUrl: 'https://relay.example///',
    channelId: CHANNEL_ID,
    writeToken: WRITE_TOKEN,
    fetchImpl,
  });
}

describe('ManualRelayProvider', () => {
  it('delegates file-handoff operations without changing their bytes', async () => {
    const adapter = {
      pull: vi.fn().mockResolvedValue({ bytes: new Uint8Array([1]), generation: 'manual-1' }),
      push: vi.fn().mockResolvedValue({ generation: 'manual-2' }),
      purge: vi.fn().mockResolvedValue(undefined),
    };
    const relay = new ManualRelayProvider(adapter);
    const bytes = new Uint8Array([2, 3]);

    await expect(relay.pull('state')).resolves.toEqual({
      bytes: new Uint8Array([1]),
      generation: 'manual-1',
    });
    await expect(relay.push('state', bytes, EMPTY_GENERATION)).resolves.toEqual({
      generation: 'manual-2',
    });
    await relay.purge();

    expect(adapter.pull).toHaveBeenCalledWith('state');
    expect(adapter.push).toHaveBeenCalledWith('state', bytes, EMPTY_GENERATION);
    expect(adapter.purge).toHaveBeenCalledTimes(1);
  });
});

describe('HttpRelayProvider', () => {
  it('pulls opaque bytes and returns the relay ETag as the generation', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { ETag: '"generation-1"' },
      }),
    );
    const relay = provider(fetchImpl);

    await expect(relay.pull('state')).resolves.toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      generation: '"generation-1"',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://relay.example/c/0123456789abcdef0123456789abcdef/state',
      {
        method: 'GET',
        cache: 'no-store',
      },
    );
  });

  it('treats an empty slot as absent', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));

    await expect(provider(fetchImpl).pull('keybag')).resolves.toBeNull();
  });

  it('reads a keybag before a write token is available', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([7, 8]), {
        status: 200,
        headers: { ETag: '"keybag-1"' },
      }),
    );

    await expect(
      pullRelaySlot('https://relay.example///', CHANNEL_ID, 'keybag', fetchImpl),
    ).resolves.toEqual({
      bytes: new Uint8Array([7, 8]),
      generation: '"keybag-1"',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://relay.example/c/0123456789abcdef0123456789abcdef/keybag',
      { method: 'GET', cache: 'no-store' },
    );
  });

  it('pushes bytes with bearer authorisation and the pulled generation', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 204,
        headers: { ETag: '"generation-2"' },
      }),
    );
    const relay = provider(fetchImpl);
    const bytes = new Uint8Array([4, 5]);

    await expect(relay.push('state', bytes, '"generation-1"')).resolves.toEqual({
      generation: '"generation-2"',
    });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://relay.example/c/0123456789abcdef0123456789abcdef/state');
    expect(init?.method).toBe('PUT');
    expect(init?.headers).toEqual({
      Authorization: `Bearer ${WRITE_TOKEN}`,
      'Content-Type': 'application/octet-stream',
      'If-Match': '"generation-1"',
    });
    expect(await new Response(init?.body).arrayBuffer()).toEqual(bytes.buffer);
  });

  it('maps a compare-and-swap conflict to StaleGenerationError', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 412 }));

    await expect(
      provider(fetchImpl).push('state', new Uint8Array([1]), '"old"'),
    ).rejects.toMatchObject({
      name: 'StaleGenerationError',
      status: 412,
      attemptedGeneration: '"old"',
    });
    await expect(
      provider(fetchImpl).push('state', new Uint8Array([1]), '"old"'),
    ).rejects.toBeInstanceOf(StaleGenerationError);
  });

  it('reports an oversized relay response without reading a misleading body', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 413 }));

    await expect(
      provider(fetchImpl).push('state', new Uint8Array([1]), EMPTY_GENERATION),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'RelayHttpError',
        status: 413,
        operation: 'push',
        message: 'Relay push failed with HTTP 413. The sync payload is too large for the relay.',
      }),
    );
    await expect(provider(fetchImpl).pull('state')).rejects.toBeInstanceOf(RelayHttpError);
  });

  it('requires a generation response from successful relay operations', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }));

    await expect(provider(fetchImpl).pull('state')).rejects.toBeInstanceOf(RelayProtocolError);
  });

  it('purges a channel with the write token and treats a missing channel as already purged', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const relay = provider(fetchImpl);

    await relay.purge();
    await relay.purge();

    expect(fetchImpl.mock.calls[0]).toEqual([
      'https://relay.example/c/0123456789abcdef0123456789abcdef',
      { method: 'DELETE', headers: { Authorization: `Bearer ${WRITE_TOKEN}` } },
    ]);
  });

  it('rejects invalid relay configuration before making a request', () => {
    const fetchImpl = vi.fn<typeof fetch>();

    expect(
      () =>
        new HttpRelayProvider({
          relayUrl: 'file:///tmp/relay',
          channelId: CHANNEL_ID,
          writeToken: WRITE_TOKEN,
          fetchImpl,
        }),
    ).toThrow(RelayConfigurationError);
    expect(
      () =>
        new HttpRelayProvider({
          relayUrl: 'http://relay.example',
          channelId: CHANNEL_ID,
          writeToken: WRITE_TOKEN,
          fetchImpl,
        }),
    ).toThrow(RelayConfigurationError);
    expect(
      () =>
        new HttpRelayProvider({
          relayUrl: 'https://relay.example',
          channelId: 'not-a-channel',
          writeToken: WRITE_TOKEN,
          fetchImpl,
        }),
    ).toThrow(RelayConfigurationError);
    expect(
      () =>
        new HttpRelayProvider({
          relayUrl: 'https://relay.example',
          channelId: CHANNEL_ID,
          writeToken: 'zz',
          fetchImpl,
        }),
    ).toThrow(RelayConfigurationError);
    expect(
      () =>
        new HttpRelayProvider({
          relayUrl: 'https://relay.example?debug=1',
          channelId: CHANNEL_ID,
          writeToken: WRITE_TOKEN,
          fetchImpl,
        }),
    ).toThrow(RelayConfigurationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('accepts plain HTTP only for loopback relay hosts', async () => {
    for (const relayUrl of ['http://localhost:8787', 'http://127.0.0.1:8787', 'http://[::1]:8787']) {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 404 }));
      const relay = new HttpRelayProvider({
        relayUrl,
        channelId: CHANNEL_ID,
        writeToken: WRITE_TOKEN,
        fetchImpl,
      });

      await relay.pull('state');

      expect(fetchImpl).toHaveBeenCalledWith(`${relayUrl}/c/${CHANNEL_ID}/state`, {
        method: 'GET',
        cache: 'no-store',
      });
    }
  });

  it('never invokes fetch with the provider as `this` (browser WebIDL brand check)', async () => {
    const thisValues: unknown[] = [];
    const fetchImpl = vi.fn(function (this: unknown, _input: unknown, init?: RequestInit) {
      thisValues.push(this);
      if (init?.method === 'GET') {
        return Promise.resolve(new Response(null, { status: 404 }));
      }
      return Promise.resolve(new Response(null, { status: 204, headers: { ETag: '"g"' } }));
    }) as unknown as typeof fetch;
    const relay = provider(fetchImpl);

    await relay.push('state', new Uint8Array([1]), EMPTY_GENERATION);
    await relay.purge();
    await expect(relay.pull('state')).resolves.toBeNull();
    await expect(
      pullRelaySlot('https://relay.example', CHANNEL_ID, 'keybag', fetchImpl),
    ).resolves.toBeNull();

    expect(thisValues).toHaveLength(4);
    for (const value of thisValues) {
      expect(value).toBe(globalThis);
    }
  });
});
