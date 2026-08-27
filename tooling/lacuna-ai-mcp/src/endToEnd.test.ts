import { describe, expect, it } from 'vitest';
import { createRelayClient } from '../../../src/ai/relayClient.js';
import {
  createRelayAiSession,
  type RelaySessionStorage,
} from '../../../src/ai/session/relay.js';
import { createHandler } from '../../../relay/src/relay.js';
import { MemoryStore } from '../../../relay/src/store.js';
import { TerminalAiClient } from './client.js';
import { HttpTerminalRelayTransport } from './relayTransport.js';

const RELAY_URL = 'http://localhost:8787';

describe('paired AI terminal vertical slice', () => {
  it('pairs, exchanges an encrypted reply and blocks a reply after Stop', async () => {
    const handle = createHandler(new MemoryStore());
    const fetchImpl = relayFetch(handle);
    const relay = createRelayClient({ relayUrl: RELAY_URL, fetchImpl });
    const storage = memoryStorage();
    let pollBrowser: (() => Promise<void>) | null = null;
    let browserSequence = 0;
    let terminalSequence = 0;
    let now = 1_000;
    const browser = createRelayAiSession({
      relay,
      storage,
      timers: {
        repeat(task) {
          pollBrowser = task;
          return () => {
            pollBrowser = null;
          };
        },
      },
      now: () => now,
      createId: (prefix) => `${prefix}-browser-${++browserSequence}`,
    });
    const terminal = new TerminalAiClient({
      transport: new HttpTerminalRelayTransport({ fetchImpl }),
      now: () => now,
      sleep: async () => {},
      createId: (prefix) => `${prefix}-terminal-${++terminalSequence}`,
    });

    const paired = await browser.pair();
    if (!paired.ok) throw new Error(paired.error.message);
    await terminal.connect(paired.data.code, RELAY_URL, { name: 'Test harness' });
    await tick();
    expect(browser.getSnapshot().connection).toEqual(
      expect.objectContaining({ status: 'connected', client: { name: 'Test harness' } }),
    );

    const sent = await browser.send('Explain the testing effect.');
    if (!sent.ok) throw new Error(sent.error.message);
    const first = await terminal.waitForMessage(250);
    if (first.type !== 'message') throw new Error('Expected a claimed browser message.');
    await tick();
    now = 2_000;
    await terminal.reply(
      first.runId,
      first.messageId,
      'Retrieval strengthens later access more than passive rereading.',
    );
    await tick();
    expect(browser.getSnapshot().items).toEqual([
      expect.objectContaining({ kind: 'user', delivery: 'completed' }),
      expect.objectContaining({
        kind: 'assistant',
        content: 'Retrieval strengthens later access more than passive rereading.',
      }),
    ]);

    const secondSend = await browser.send('Now stop before replying.');
    if (!secondSend.ok) throw new Error(secondSend.error.message);
    const second = await terminal.waitForMessage(250);
    if (second.type !== 'message') throw new Error('Expected the second claimed message.');
    await tick();
    const stopped = await browser.stop(second.runId);
    if (!stopped.ok) throw new Error(stopped.error.message);
    await expect(
      terminal.reply(second.runId, second.messageId, 'This reply must not arrive.'),
    ).rejects.toThrow('Stop was requested');
    await tick();

    expect(browser.getSnapshot().run).toEqual(
      expect.objectContaining({ status: 'stopped', runId: second.runId }),
    );
    expect(
      browser
        .getSnapshot()
        .items.some(
          (item) => item.kind === 'assistant' && item.content === 'This reply must not arrive.',
        ),
    ).toBe(false);

    async function tick(): Promise<void> {
      if (!pollBrowser) throw new Error('Browser polling was not installed.');
      await pollBrowser();
    }
  });
});

function memoryStorage(): RelaySessionStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function relayFetch(handle: (request: Request) => Promise<Response>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (!headers.has('Content-Length')) {
      if (typeof init?.body === 'string') {
        headers.set('Content-Length', String(new TextEncoder().encode(init.body).byteLength));
      } else if (init?.body instanceof Blob) {
        headers.set('Content-Length', String(init.body.size));
      }
    }
    return handle(new Request(input, { ...init, headers }));
  }) as typeof fetch;
}
