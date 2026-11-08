import { createHash, randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import packageManifest from '../../../package.json' with { type: 'json' };
import { MemoryStore } from '../src/store.js';
import { cleanupExpiredUsage, createUsageHandler } from '../src/usageAnalytics.js';

const ORIGIN = 'https://getlacuna.app';
const RELAY = 'https://relay.getlacuna.app';
const SECRET = 'usage-admin-secret-used-only-in-tests';
const TODAY = '2026-11-08';
const NOW = Date.parse(`${TODAY}T12:00:00Z`);
const auth = `Basic ${Buffer.from(`analytics:${SECRET}`).toString('base64')}`;

function fixture() {
  vi.stubEnv('USAGE_ANALYTICS_ADMIN_SECRET', SECRET);
  vi.stubEnv('USAGE_ANALYTICS_ENABLED', undefined);
  let now = NOW;
  const store = new MemoryStore(() => now);
  return {
    store,
    handle: createUsageHandler(store, () => now),
    setClock: (time: string) => {
      now = Date.parse(time);
    },
  };
}

function collect(body: unknown, headers: Record<string, string> = { Origin: ORIGIN }) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set('Content-Type', 'application/json');
  return new Request(`${RELAY}/usage/collect`, {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify(body),
  });
}

function batch(rows: Array<[string, number, 0 | 1]>, day = TODAY) {
  return { day, id: randomUUID(), rows };
}

function dashboard(authorization = auth, path = '/usage/dashboard') {
  return new Request(`${RELAY}${path}`, { headers: { Authorization: authorization } });
}

afterEach(() => vi.unstubAllEnvs());

describe('usage analytics relay', () => {
  it('accepts only hosted, enabled collection and drops browser privacy signals', async () => {
    const { handle, store } = fixture();
    const payload = batch([['view/today', 1, 1]]);
    const preflight = await handle(
      new Request(`${RELAY}/api?__path=/usage/collect`, {
        method: 'OPTIONS',
        headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' },
      }),
    );
    expect(preflight?.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(preflight?.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    expect((await handle(collect(payload, { Origin: 'https://gaps.getlacuna.app' })))?.status).toBe(
      403,
    );
    expect((await handle(collect(payload, { Origin: ORIGIN, 'Sec-GPC': '1' })))?.status).toBe(204);
    expect((await handle(collect(payload, { Origin: ORIGIN, DNT: '1' })))?.status).toBe(204);
    expect(await store.list('usage/')).toEqual([]);
    vi.stubEnv('USAGE_ANALYTICS_ADMIN_SECRET', '');
    expect((await handle(collect(payload)))?.status).toBe(204);
    expect((await handle(dashboard()))?.status).toBe(404);
    vi.stubEnv('USAGE_ANALYTICS_ENABLED', 'false');
    expect((await handle(collect(payload)))?.status).toBe(404);
    expect(await store.list('usage/')).toHaveLength(1);
  });

  it('rejects private fields, unknown dimensions and stale or oversized batches', async () => {
    const { handle, store } = fixture();
    const payload = batch([['view/today', 1, 1]]);
    expect((await handle(collect({ ...payload, search: 'raw learning text' })))?.status).toBe(400);
    expect((await handle(collect(batch([['view/course/private-id', 1, 1]]))))?.status).toBe(400);
    expect((await handle(collect({ ...payload, day: '2026-11-06' })))?.status).toBe(400);
    expect((await handle(collect({ ...payload, day: '2026-11-09' })))?.status).toBe(400);
    expect((await handle(collect({ ...payload, search: 'x'.repeat(20_000) })))?.status).toBe(413);
    expect(await store.list('usage/')).toEqual([]);
  });

  it('deduplicates concurrent retries and exposes only authenticated, thresholded totals', async () => {
    const { handle, store, setClock } = fixture();
    const reports = Array.from({ length: 5 }, () => batch([['view/today', 2, 1]]));
    await Promise.all(
      [reports[0], reports[0]].map(async (report) => {
        expect((await handle(collect(report)))?.status).toBe(204);
      }),
    );
    for (const report of reports.slice(1)) {
      expect((await handle(collect(report)))?.status).toBe(204);
    }
    await handle(collect(batch([['action/today/button', 137, 1]])));

    expect((await handle(dashboard('')))?.status).toBe(401);
    setClock('2026-11-10T00:30:59Z');
    const live = await (await handle(dashboard()))?.text();
    expect(live).toContain('<td>Today</td><td>0</td>');
    expect(live).not.toContain('<td>2026-11-08</td>');

    setClock('2026-11-10T00:31:00Z');
    const response = await handle(dashboard(auth, '/api?__path=/usage/dashboard&days=1'));
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response?.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const html = await response?.text();
    expect(html).toContain('<td>Today</td><td>10</td>');
    expect(html).toContain('<td>Today</td><td>Page visit</td><td>5</td>');
    expect(html).toContain('<td>Settings</td><td>0</td>');
    expect(html).toContain('<td>Button</td><td>Today</td><td>Withheld</td>');
    expect(html).not.toContain('137');
    for (const { key } of await store.list('usage/')) {
      const object = await store.get(key);
      const body = new TextDecoder().decode(object?.body);
      expect(body).not.toContain(reports[0].id);
    }
  });

  it('keeps each day private before summing and withholds complementary cells', async () => {
    const { handle, setClock } = fixture();
    for (let browser = 0; browser < 5; browser += 1) {
      await handle(
        collect(
          batch([
            ['view/today', 1, 1],
            ['screen/today/large', 1, 1],
            ['action/today/button', 1, 1],
            ['online/today/button', 1, 1],
          ]),
        ),
      );
    }
    await handle(
      collect(
        batch([
          ['view/today', 1, 1],
          ['screen/today/small', 1, 1],
          ['action/today/button', 1, 1],
          ['offline/today/button', 1, 1],
        ]),
      ),
    );
    await handle(collect(batch([['view/today', 3, 1]], '2026-11-07')));
    setClock('2026-11-10T03:00:00Z');
    const html = await (await handle(dashboard()))?.text();
    expect(html).toContain('<td>Today</td><td>≥ 6</td>');
    expect(html).toContain('<td>Today · Large</td><td>Withheld</td>');
    expect(html).toContain('<td>Today · Small</td><td>Withheld</td>');
    expect(html).toContain('<td>Today · Button · Online</td><td>Withheld</td>');
    expect(html).toContain('<td>Today · Button · Offline</td><td>Withheld</td>');
    expect(html).toContain('<td>Today</td><td>Button</td><td>6</td>');
  });

  it('drops arbitrary release dimensions before they consume the intake budget or shard storage', async () => {
    const { handle, store } = fixture();
    for (let group = 0; group < 43; group += 1) {
      const rows = Array.from({ length: 96 }, (_, index): [string, number, 1] => [
        `release/today/999.${group}.${index}`,
        1,
        1,
      ]);
      expect((await handle(collect(batch(rows))))?.status).toBe(204);
    }
    expect(await store.list('usage/')).toEqual([]);

    expect(
      (
        await handle(
          collect(
            batch([
              ['release/today/999.999.999', 1, 1],
              [`release/today/${packageManifest.version}`, 1, 1],
              ['view/today', 1, 1],
            ]),
          ),
        )
      )?.status,
    ).toBe(204);
    const [written] = await store.list('usage/');
    const saved = new TextDecoder().decode((await store.get(written.key))?.body);
    expect(saved).toContain(`release/today/${packageManifest.version}`);
    expect(saved).toContain('view/today');
    expect(saved).not.toContain('999.999.999');
  });

  it('returns a temporary throttle when the instance intake budget empties', async () => {
    const { handle, setClock } = fixture();
    const input = () => collect(batch([['view/today', 1, 1]]));
    for (let index = 0; index < 32; index += 1) {
      expect((await handle(input()))?.status).toBe(204);
    }
    expect((await handle(input()))?.status).toBe(429);
    setClock('2026-11-08T12:00:01Z');
    expect((await handle(input()))?.status).toBe(204);
  });

  it('returns a permanent rejection when a daily shard has reached its receipt cap', async () => {
    const { handle, store } = fixture();
    const report = batch([['view/today', 1, 1]]);
    const shard = createHash('sha256').update(report.id).digest('hex')[0];
    const key = `usage/aggregate/${TODAY}/${shard}`;
    const receipts = Array.from({ length: 2_048 }, (_, index) => String(index));
    const encode = () =>
      new TextEncoder().encode(JSON.stringify({ version: 1, rows: [], receipts }));
    await store.put(key, encode(), { exclusive: true });
    expect((await handle(collect(report)))?.status).toBe(204);

    for (let index = receipts.length; index < 8_192; index += 1) receipts.push(String(index));
    const full = encode();
    await store.put(key, full, { overwrite: true });

    expect((await handle(collect(report)))?.status).toBe(422);
    expect((await store.get(key))?.body).toEqual(full);
  });

  it('expires retry receipts before aggregates and leaves other store prefixes alone', async () => {
    const { store, handle } = fixture();
    const payload = batch([['view/today', 1, 1]]);
    await handle(collect(payload));
    const [written] = await store.list('usage/');
    await store.put('shares/fixture', new Uint8Array(), { exclusive: true });
    await cleanupExpiredUsage(store, Date.parse('2026-11-10T03:00:00Z'));
    const stored = await store.get(written.key);
    expect(new TextDecoder().decode(stored?.body)).toContain('"receipts":[]');
    expect(new TextDecoder().decode(stored?.body)).toContain('view/today');
    await cleanupExpiredUsage(store, Date.parse('2027-02-06T03:00:00Z'));
    expect(await store.list('usage/')).toEqual([]);
    expect(await store.list('shares/')).toHaveLength(1);
  });
});
