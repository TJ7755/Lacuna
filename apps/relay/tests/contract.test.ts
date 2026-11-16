import { describe, expect, it, vi, afterEach } from 'vitest';
import { createRelayClient, relayRoutes, matchRelayRoute } from '@lacuna/protocol/relay/index';
import { createHandler } from '../src/relay.js';
import { MemoryStore } from '../src/store.js';

afterEach(() => vi.unstubAllEnvs());

describe('shared relay contract', () => {
  it('trims trailing slashes without rescanning long internal slash runs', async () => {
    const baseUrl = `https://relay.example/${'/'.repeat(100_000)}x///`;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const started = performance.now();
    const client = createRelayClient(relayRoutes, baseUrl, fetcher);

    await client.request('aiCreate', { json: { browserPublicKey: 'A'.repeat(87) } });

    expect(performance.now() - started).toBeLessThan(1_000);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `https://relay.example/${'/'.repeat(100_000)}x/ai/sessions`,
    );
  });

  for (const [endpoint, definition] of Object.entries(relayRoutes)) {
    const path = definition.path
      .replace(':id', 'a'.repeat(32))
      .replace(':slotId', 'b'.repeat(32))
      .replace(':slot', definition.kind === 'share-slot' ? 'payload' : 'state')
      .replace(':mailbox', 'browser')
      .replace(':day', '2026-11-01')
      .replace(':code', '12345678');
    it(`${endpoint} routes and returns a declared response for both client origins`, async () => {
      vi.stubEnv('RELAY_INSIGHTS_ENABLED', '1');
      const handle = createHandler(new MemoryStore());
      expect(matchRelayRoute(`https://relay.example${path}`, definition.method)?.endpoint).toBe(
        endpoint,
      );
      for (const origin of ['app://.', 'https://getlacuna.app']) {
        const response = await handle(
          new Request(`https://relay.example${path}`, {
            method: definition.method,
            headers: { Origin: origin },
          }),
        );
        expect(Object.keys(definition.responses)).toContain(String(response.status));
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
        const preflight = await handle(
          new Request(`https://relay.example${path}`, {
            method: 'OPTIONS',
            headers: { Origin: origin },
          }),
        );
        expect(preflight.status).toBe(204);
        expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      }
    });
  }
  it('rejects the retired aliases and does not let an unrelated path use a rewrite hint', async () => {
    const handle = createHandler(new MemoryStore());
    for (const path of [
      '/api/channel',
      '/unknown?__path=/channel',
      '/ai/s/ABCDEFGHJKMNPQRSTVWZ/claim',
    ]) {
      expect(
        (await handle(new Request(`https://relay.example${path}`, { method: 'POST' }))).status,
      ).toBe(404);
    }
  });
});
