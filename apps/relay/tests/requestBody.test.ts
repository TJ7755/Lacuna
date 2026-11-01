import { describe, expect, it } from 'vitest';
import { createHandler, MAX_BODY_BYTES } from '../src/relay.js';
import { MemoryStore } from '../src/store.js';

describe('request body guards', () => {
  it.each(['unauthorised', 'missing-length'])(
    'rejects %s streams without reading them',
    async (scenario) => {
      const store = new MemoryStore();
      const handle = createHandler(store);
      const minted = await handle(new Request('https://relay.test/channel', { method: 'POST' }));
      const { channelId } = (await minted.json()) as { channelId: string };
      let reads = 0;
      const body = new ReadableStream(
        {
          pull() {
            reads += 1;
            return new Promise<void>(() => {});
          },
        },
        { highWaterMark: 0 },
      );
      const headers = new Headers({ 'If-Match': '"0"' });
      if (scenario === 'unauthorised') headers.set('Content-Length', '1');
      const request = new Request(`https://relay.test/c/${channelId}/state`, {
        method: 'PUT',
        headers,
        body,
        duplex: 'half',
      } as RequestInit);
      expect((await handle(request)).status).toBe(scenario === 'unauthorised' ? 401 : 411);
      expect(reads).toBe(0);
      await body.cancel();
    },
  );

  it('cancels the original upload source when a streamed channel exceeds its cap', async () => {
    const handle = createHandler(new MemoryStore());
    const minted = await handle(new Request('https://relay.test/channel', { method: 'POST' }));
    const { channelId, writeToken } = (await minted.json()) as {
      channelId: string;
      writeToken: string;
    };
    let cancelled = false;
    const body = new ReadableStream(
      {
        pull(controller) {
          controller.enqueue(new Uint8Array(MAX_BODY_BYTES + 1));
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const request = new Request(`https://relay.test/c/${channelId}/state`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${writeToken}`,
        'Content-Length': '1',
        'If-Match': '"0"',
      },
      body,
      duplex: 'half',
    } as RequestInit);
    expect((await handle(request)).status).toBe(413);
    expect(cancelled).toBe(true);
  });
});
