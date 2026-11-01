import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler, parseRoute } from '../src/relay.js';
import { cleanupExpiredInsights } from '../src/insights.js';
import {
  INSIGHT_MAX_ENVELOPE_BYTES,
  INSIGHT_DAILY_SLOTS,
  insightDayExpiresAt,
} from '../src/insightsProtocol.js';
import { MemoryStore } from '../src/store.js';
import { cleanupExpiredShares, shareLive } from '../src/shares.js';
import { CHANNEL_TTL_MS } from '../src/channelMaintenance.js';

const day = '2026-10-18';
const start = Date.parse('2026-10-19T00:00:00Z');
beforeEach(() => vi.stubEnv('RELAY_INSIGHTS_ENABLED', '1'));
afterEach(() => vi.unstubAllEnvs());

const snapshotToken = 'f'.repeat(64);

function snapshotHeaders(revision = 1, token = snapshotToken): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'X-Insights-Revision': String(revision) };
}

async function fixture(createdAt = start, reportDay = day) {
  let time = createdAt;
  const store = new MemoryStore(() => time);
  const handle = createHandler(store, { now: () => time });
  const minted = await handle(new Request('https://relay.example/shares', { method: 'POST' }));
  const { shareId, writeToken } = (await minted.json()) as { shareId: string; writeToken: string };
  time = start;
  const envelope = {
    v: 2,
    s: shareId,
    d: reportDay,
    k: 'b'.repeat(64),
    x: Buffer.alloc(384).toString('base64'),
    n: Buffer.alloc(12).toString('base64'),
    c: Buffer.alloc(16).toString('base64'),
  };
  const read = (token: string | null = writeToken, suffix = '') =>
    handle(
      new Request(`https://relay.example/insights/${shareId}/${reportDay}${suffix}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          Origin: 'https://gaps.getlacuna.app',
        },
      }),
    );
  const put = (
    slot = 'c'.repeat(32),
    raw: unknown = envelope,
    headers: Record<string, string> = {},
  ) => {
    const body = JSON.stringify(raw);
    return handle(
      new Request(`https://relay.example/insights/${shareId}/${reportDay}/${slot}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(body)),
          ...headers,
        },
        body,
      }),
    );
  };
  return {
    store,
    handle,
    shareId,
    writeToken,
    envelope,
    read,
    put,
    setTime: (value: number) => {
      time = value;
    },
  };
}

describe('encrypted insight mailbox', () => {
  it('accepts current-day snapshots and returns only the envelope to the teacher', async () => {
    const f = await fixture(start, '2026-10-19');
    expect((await f.put(undefined, undefined, snapshotHeaders())).status).toBe(204);
    expect(await (await f.read()).json()).toEqual({
      v: 2,
      envelopes: [{ slotId: 'c'.repeat(32), envelope: f.envelope }],
      cursor: null,
    });
    const stored = await f.store.get(
      `insights/${f.shareId}/2026-10-19/envelopes/${'c'.repeat(32)}`,
    );
    const text = new TextDecoder().decode(stored!.body);
    expect(JSON.parse(text)).toEqual({
      v: 1,
      envelope: f.envelope,
      writeTokenHash: createHash('sha256').update(snapshotToken).digest('hex'),
      revision: 1,
    });
    expect(text).not.toContain(snapshotToken);
    f.setTime(insightDayExpiresAt('2026-10-19') - 1);
    expect((await f.put(undefined, undefined, snapshotHeaders(2))).status).toBe(204);
    expect((await f.read()).status).toBe(200);
    f.setTime(insightDayExpiresAt('2026-10-19'));
    expect((await f.put(undefined, undefined, snapshotHeaders())).status).toBe(410);
    expect((await f.read()).status).toBe(410);
  });

  it('acknowledges lost responses, replaces only the next revision, and rejects stale packets', async () => {
    const f = await fixture();
    const next = { ...f.envelope, c: Buffer.alloc(20, 1).toString('base64') };
    const key = `insights/${f.shareId}/${day}/envelopes/${'c'.repeat(32)}`;
    expect((await f.put(undefined, undefined, snapshotHeaders(2))).status).toBe(409);
    expect(await f.store.list(`insights/${f.shareId}/`)).toEqual([]);
    expect((await f.put(undefined, undefined, snapshotHeaders())).status).toBe(204);
    const original = await f.store.get(key);
    expect((await f.put(undefined, undefined, snapshotHeaders())).status).toBe(204);
    expect(await f.store.get(key)).toEqual(original);
    expect((await f.put(undefined, next, snapshotHeaders())).status).toBe(409);
    expect((await f.put(undefined, next, snapshotHeaders(3))).status).toBe(409);
    expect((await f.put(undefined, next, snapshotHeaders(2))).status).toBe(204);
    const replaced = await f.store.get(key);
    expect((await f.put(undefined, next, snapshotHeaders(2))).status).toBe(204);
    expect(await f.store.get(key)).toEqual(replaced);
    expect((await f.put(undefined, undefined, snapshotHeaders())).status).toBe(409);
    expect((await f.put(undefined, undefined, snapshotHeaders(2))).status).toBe(409);
    expect(await (await f.read()).json()).toMatchObject({ envelopes: [{ envelope: next }] });
  });

  it('requires the slot token even for an exact snapshot replay', async () => {
    const f = await fixture();
    expect((await f.put(undefined, undefined, snapshotHeaders())).status).toBe(204);
    const key = `insights/${f.shareId}/${day}/envelopes/${'c'.repeat(32)}`;
    const original = await f.store.get(key);
    for (const revision of [1, 2]) {
      for (const headers of [
        {},
        snapshotHeaders(revision, 'a'.repeat(64)),
        snapshotHeaders(revision, f.writeToken),
      ])
        expect((await f.put(undefined, undefined, headers)).status).toBe(401);
    }
    expect(await f.store.get(key)).toEqual(original);
  });

  it.each(['0', '-1', '1.5', '01', '1e1', '9007199254740992', '', '1, 2'])(
    'rejects invalid revision %s before reserving capacity',
    async (revision) => {
      const f = await fixture();
      expect(
        (
          await f.put(undefined, undefined, {
            ...snapshotHeaders(),
            'X-Insights-Revision': revision,
          })
        ).status,
      ).toBe(400);
      expect(await f.store.list(`insights/${f.shareId}/`)).toEqual([]);
    },
  );

  it('rejects partial credentials and malformed tokens without reserving capacity', async () => {
    const f = await fixture();
    for (const token of ['A'.repeat(64), 'a'.repeat(63), 'invalid'])
      expect((await f.put(undefined, undefined, snapshotHeaders(1, token))).status).toBe(401);
    expect((await f.put(undefined, undefined, { 'X-Insights-Revision': '1' })).status).toBe(401);
    expect(
      (await f.put(undefined, undefined, { Authorization: `Bearer ${snapshotToken}` })).status,
    ).toBe(400);
    expect(await f.store.list(`insights/${f.shareId}/`)).toEqual([]);
  });

  it('keeps legacy envelopes readable and retryable without allowing a snapshot claim', async () => {
    const f = await fixture();
    expect((await f.put()).status).toBe(204);
    const key = `insights/${f.shareId}/${day}/envelopes/${'c'.repeat(32)}`;
    const legacy = await f.store.get(key);
    expect((await f.put(undefined, undefined, snapshotHeaders())).status).toBe(204);
    expect(
      (await f.put(undefined, { ...f.envelope, k: 'a'.repeat(64) }, snapshotHeaders(2))).status,
    ).toBe(409);
    expect(await f.store.get(key)).toEqual(legacy);
    expect(await (await f.read()).json()).toMatchObject({ envelopes: [{ envelope: f.envelope }] });
  });

  it('replaces snapshots at daily capacity without reserving another slot', async () => {
    const f = await fixture();
    expect((await f.put(undefined, undefined, snapshotHeaders())).status).toBe(204);
    for (let i = 0; i < INSIGHT_DAILY_SLOTS - 1; i++)
      expect((await f.put(i.toString(16).padStart(32, '0'))).status).toBe(204);
    const quotaKey = `insights/${f.shareId}/${day}/quota`;
    const quota = await f.store.get(quotaKey);
    expect((await f.put('d'.repeat(32))).status).toBe(429);
    expect(
      (await f.put(undefined, { ...f.envelope, k: 'a'.repeat(64) }, snapshotHeaders(2))).status,
    ).toBe(204);
    expect(
      (await f.put(undefined, { ...f.envelope, k: 'a'.repeat(64) }, snapshotHeaders(2))).status,
    ).toBe(204);
    expect(await f.store.get(quotaKey)).toEqual(quota);
  });

  it.each([false, true])(
    'handles competing first snapshot claims (same token: %s)',
    async (sameToken) => {
      const f = await fixture();
      const put = f.store.put.bind(f.store);
      let release!: () => void;
      let arrived!: () => void;
      const paused = new Promise<void>((resolve) => {
        arrived = resolve;
      });
      const resume = new Promise<void>((resolve) => {
        release = resolve;
      });
      let first = true;
      vi.spyOn(f.store, 'put').mockImplementation(async (key, body, opts) => {
        if (key.includes('/envelopes/') && first) {
          first = false;
          arrived();
          await resume;
        }
        return put(key, body, opts);
      });
      const pending = f.put(undefined, undefined, snapshotHeaders());
      await paused;
      expect(
        (
          await f.put(
            undefined,
            undefined,
            snapshotHeaders(1, sameToken ? snapshotToken : 'a'.repeat(64)),
          )
        ).status,
      ).toBe(204);
      release();
      expect((await pending).status).toBe(sameToken ? 204 : 409);
      expect(await f.store.list(`insights/${f.shareId}/${day}/envelopes/`)).toHaveLength(1);
    },
  );

  it.each(['same', 'conflict', 'newer', 'deleted'])(
    'safely resolves a paused replacement against a %s snapshot',
    async (race) => {
      const f = await fixture();
      expect((await f.put(undefined, undefined, snapshotHeaders())).status).toBe(204);
      const put = f.store.put.bind(f.store);
      let release!: () => void;
      let arrived!: () => void;
      const paused = new Promise<void>((resolve) => {
        arrived = resolve;
      });
      const resume = new Promise<void>((resolve) => {
        release = resolve;
      });
      let first = true;
      vi.spyOn(f.store, 'put').mockImplementation(async (key, body, opts) => {
        if (key.includes('/envelopes/') && first) {
          first = false;
          expect(opts).toHaveProperty('ifMatch');
          arrived();
          await resume;
        }
        return put(key, body, opts);
      });
      const delayedEnvelope = { ...f.envelope, k: '1'.repeat(64) };
      const delayed = f.put(undefined, delayedEnvelope, snapshotHeaders(2));
      await paused;
      const winner = race === 'same' ? delayedEnvelope : { ...f.envelope, k: '2'.repeat(64) };
      const key = `insights/${f.shareId}/${day}/envelopes/${'c'.repeat(32)}`;
      if (race === 'deleted') await f.store.del([key]);
      else {
        expect((await f.put(undefined, winner, snapshotHeaders(2))).status).toBe(204);
        if (race === 'newer')
          expect((await f.put(undefined, winner, snapshotHeaders(3))).status).toBe(204);
      }
      release();
      expect((await delayed).status).toBe(race === 'same' ? 204 : 409);
      if (race === 'deleted') {
        expect(await f.store.get(key)).toBeNull();
        return;
      }
      expect(await (await f.read()).json()).toMatchObject({ envelopes: [{ envelope: winner }] });
      const stored = await f.store.get(key);
      expect(JSON.parse(new TextDecoder().decode(stored!.body))).toMatchObject({
        revision: race === 'newer' ? 3 : 2,
      });
    },
  );

  it('does not acknowledge a replay when revocation races the existing-slot read', async () => {
    const f = await fixture();
    expect((await f.put(undefined, undefined, snapshotHeaders())).status).toBe(204);
    const get = f.store.get.bind(f.store);
    vi.spyOn(f.store, 'get').mockImplementation(async (key) => {
      const result = await get(key);
      if (key.includes('/envelopes/')) await f.store.del([`shares/${f.shareId}/auth`]);
      return result;
    });
    expect((await f.put(undefined, undefined, snapshotHeaders())).status).toBe(404);
    expect(await f.store.list(`insights/${f.shareId}/${day}/envelopes/`)).toEqual([]);
  });

  it('cleans up a snapshot replacement when revocation races CAS', async () => {
    const f = await fixture();
    expect((await f.put(undefined, undefined, snapshotHeaders())).status).toBe(204);
    const put = f.store.put.bind(f.store);
    vi.spyOn(f.store, 'put').mockImplementation(async (key, ...args) => {
      const result = await put(key, ...args);
      if (key.includes('/envelopes/')) await f.store.del([`shares/${f.shareId}/auth`]);
      return result;
    });
    expect(
      (await f.put(undefined, { ...f.envelope, k: 'a'.repeat(64) }, snapshotHeaders(2))).status,
    ).toBe(404);
    expect(await f.store.list(`insights/${f.shareId}/${day}/envelopes/`)).toEqual([]);
  });

  it('allows snapshot authentication headers in browser preflight', async () => {
    const f = await fixture();
    const response = await f.handle(
      new Request(`https://relay.example/insights/${f.shareId}/${day}/${'c'.repeat(32)}`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://getlacuna.app',
          'Access-Control-Request-Headers': 'authorization,x-insights-revision',
        },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain(
      'x-insights-revision',
    );
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://getlacuna.app');
  });

  it('preserves owner access until report expiry when an unchanged public share expires', async () => {
    const f = await fixture(start - 89 * 24 * 60 * 60 * 1000);
    expect((await f.put()).status).toBe(204);
    const later = start + 2 * 24 * 60 * 60 * 1000;
    f.setTime(later);
    expect(await shareLive(f.store, f.shareId, () => later)).toBe(false);
    expect((await cleanupExpiredShares(f.store, later)).sharesDeleted).toBe(0);
    expect((await f.read()).status).toBe(200);
    expect((await f.put('d'.repeat(32))).status).toBe(404);

    f.setTime(insightDayExpiresAt(day));
    expect((await f.read()).status).toBe(410);
    expect((await cleanupExpiredShares(f.store, insightDayExpiresAt(day))).sharesDeleted).toBe(1);
    expect(await f.store.list(`insights/${f.shareId}/`)).toEqual([]);
  });

  it('keeps retained reports on an expired share until an authorised owner deletes them', async () => {
    const f = await fixture(start - 89 * 24 * 60 * 60 * 1000);
    expect((await f.put()).status).toBe(204);
    f.setTime(start + 2 * 24 * 60 * 60 * 1000);
    const url = `https://relay.example/shares/${f.shareId}`;
    const expiredWrite = await f.handle(
      new Request(`${url}/payload`, {
        method: 'PUT',
        body: 'x',
        headers: { 'Content-Length': '1', 'If-Match': '"0"' },
      }),
    );
    expect(expiredWrite.status).toBe(404);
    expect((await f.handle(new Request(url, { method: 'DELETE' }))).status).toBe(401);
    expect((await f.read()).status).toBe(200);
    expect(
      (
        await f.handle(
          new Request(url, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${f.writeToken}` },
          }),
        )
      ).status,
    ).toBe(204);
    expect(await f.store.list(`insights/${f.shareId}/`)).toEqual([]);
    expect((await f.read()).status).toBe(404);
  });

  it('does not acknowledge an in-flight report when the public share expires during its write', async () => {
    const createdAt = start - CHANNEL_TTL_MS + 1;
    const f = await fixture(createdAt);
    const put = f.store.put.bind(f.store);
    vi.spyOn(f.store, 'put').mockImplementation(async (key, ...args) => {
      const result = await put(key, ...args);
      if (key.includes('/envelopes/')) f.setTime(start + 2);
      return result;
    });
    expect((await f.put()).status).toBe(404);
    // Retaining an ambiguous packet is safer than deleting a slot another retry saw.
    expect(await f.store.list(`insights/${f.shareId}/${day}/envelopes/`)).toHaveLength(1);
    await cleanupExpiredInsights(f.store, insightDayExpiresAt(day));
    expect(await f.store.list(`insights/${f.shareId}/${day}/envelopes/`)).toEqual([]);
  });

  it.each(['before', 'after'] as const)(
    'preserves an acknowledged report when a retry pauses %s writing across public expiry',
    async (pause) => {
      const f = await fixture(start - CHANNEL_TTL_MS + 1);
      const put = f.store.put.bind(f.store);
      let release!: () => void;
      let arrived!: () => void;
      const paused = new Promise<void>((resolve) => {
        arrived = resolve;
      });
      const resume = new Promise<void>((resolve) => {
        release = resolve;
      });
      let first = true;
      vi.spyOn(f.store, 'put').mockImplementation(async (key, ...args) => {
        if (key.includes('/envelopes/') && first) {
          first = false;
          const result = pause === 'after' ? await put(key, ...args) : undefined;
          arrived();
          await resume;
          return result ?? put(key, ...args);
        }
        return put(key, ...args);
      });
      const pending = f.put();
      await paused;
      expect((await f.put()).status).toBe(204);
      f.setTime(start + 2);
      release();
      expect((await pending).status).toBe(404);
      const page = await f.read();
      expect(page.status).toBe(200);
      expect(await page.json()).toMatchObject({
        envelopes: [{ slotId: 'c'.repeat(32), envelope: f.envelope }],
      });
    },
  );

  it('is disabled without touching storage until explicitly enabled', async () => {
    vi.unstubAllEnvs();
    const store = new MemoryStore();
    const get = vi.spyOn(store, 'get');
    const response = await createHandler(store)(
      new Request(`https://relay.example/insights/${'a'.repeat(32)}/${day}`),
    );
    expect(response.status).toBe(503);
    expect(get).not.toHaveBeenCalled();
  });

  it('keeps immutable envelopes private to the owner without deleting on fetch', async () => {
    const f = await fixture();
    expect((await f.put()).status).toBe(204);
    expect((await f.read(null)).status).toBe(401);
    expect((await f.read('wrong')).status).toBe(401);
    const first = await f.read();
    expect(first.headers.get('Cache-Control')).toBe('no-store');
    expect(first.headers.get('Access-Control-Allow-Origin')).toBe('https://gaps.getlacuna.app');
    const page = await first.json();
    expect(page).toEqual({
      v: 2,
      envelopes: [{ slotId: 'c'.repeat(32), envelope: f.envelope }],
      cursor: null,
    });
    expect(await (await f.read()).json()).toEqual(page);
    expect((await f.put()).status).toBe(204);
    expect((await f.put('c'.repeat(32), { ...f.envelope, k: 'd'.repeat(64) })).status).toBe(409);
  });

  it('rejects unknown versions, plaintext fields, routing changes and oversized bodies', async () => {
    const f = await fixture();
    for (const raw of [
      { ...f.envelope, v: 3 },
      { ...f.envelope, name: 'Pupil' },
      { ...f.envelope, s: 'a'.repeat(32) },
      { ...f.envelope, d: '2026-10-17' },
    ]) {
      expect((await f.put(undefined, raw)).status).toBe(400);
    }
    expect(
      (
        await f.put(undefined, f.envelope, {
          'Content-Length': String(INSIGHT_MAX_ENVELOPE_BYTES + 1),
        })
      ).status,
    ).toBe(413);
    expect((await f.put(undefined, f.envelope, { 'Content-Length': '1' })).status).toBe(400);
    expect(await f.store.list(`insights/${f.shareId}/`)).toEqual([]);
  });

  it('paginates within a single authorised course and day, without counts', async () => {
    const f = await fixture();
    for (let i = 0; i < 17; i++)
      expect((await f.put(i.toString(16).padStart(32, '0'))).status).toBe(204);
    const first = (await (await f.read()).json()) as { envelopes: unknown[]; cursor: string };
    expect(first.envelopes).toHaveLength(16);
    expect(typeof first.cursor).toBe('string');
    const second = (await (
      await f.read(undefined, `?cursor=${encodeURIComponent(first.cursor)}`)
    ).json()) as { envelopes: unknown[]; cursor: null };
    expect(second.envelopes).toHaveLength(1);
    expect(second.cursor).toBeNull();
    expect(Object.keys(first).sort()).toEqual(['cursor', 'envelopes', 'v']);
  });

  it('enforces the daily cap under concurrent writes and permits exact retries at capacity', async () => {
    const f = await fixture();
    for (let i = 0; i < INSIGHT_DAILY_SLOTS - 1; i++)
      expect((await f.put(i.toString(16).padStart(32, '0'))).status).toBe(204);
    const results = await Promise.all([f.put('d'.repeat(32)), f.put('e'.repeat(32))]);
    expect(results.map((r) => r.status).sort()).toEqual([204, 429]);
    expect(await f.store.list(`insights/${f.shareId}/${day}/envelopes/`)).toHaveLength(
      INSIGHT_DAILY_SLOTS,
    );
    expect((await f.put('0'.repeat(32))).status).toBe(204);
  });

  it('expires by reporting day, rejects future days, and sweeps retained bytes through maintenance', async () => {
    const f = await fixture();
    expect((await f.put()).status).toBe(204);
    const objects = await f.store.list(`insights/${f.shareId}/`);
    f.setTime(start + 86_400_000);
    expect((await f.put()).status).toBe(204);
    expect(await f.store.list(`insights/${f.shareId}/`)).toEqual(objects);
    f.setTime(insightDayExpiresAt(day));
    expect((await f.read()).status).toBe(410);
    expect((await f.put()).status).toBe(410);
    expect(await cleanupExpiredInsights(f.store, insightDayExpiresAt(day))).toEqual({
      insightObjectsDeleted: 2,
    });
    expect(await f.store.list(`insights/${f.shareId}/`)).toEqual([]);
    const response = await f.handle(
      new Request(`https://relay.example/insights/${f.shareId}/2027-01-18`),
    );
    expect(response.status).toBe(400);
  });

  it('removes insight objects when the owner unpublishes the course', async () => {
    const f = await fixture();
    await f.put();
    expect(
      (
        await f.handle(
          new Request(`https://relay.example/shares/${f.shareId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${f.writeToken}` },
          }),
        )
      ).status,
    ).toBe(204);
    expect(await f.store.list(`insights/${f.shareId}/`)).toEqual([]);
    expect((await f.put()).status).toBe(404);
    expect((await f.read()).status).toBe(404);
  });

  it('matches public, API-alias and rewritten paths', () => {
    const id = 'a'.repeat(32),
      slotId = 'b'.repeat(32);
    for (const path of [
      `/insights/${id}/${day}/${slotId}`,
      `/api/insights/${id}/${day}/${slotId}`,
      `/api?__path=/insights/${id}/${day}/${slotId}`,
    ]) {
      expect(parseRoute(`https://relay.example${path}`)).toEqual({
        kind: 'insight',
        id,
        day,
        slotId,
      });
    }
  });

  it('bounds requests from a shared classroom address without growing the limiter forever', async () => {
    const f = await fixture();
    for (let i = 0; i < 100; i++) expect((await f.read()).status).toBe(200);
    expect((await f.read()).status).toBe(429);
    f.setTime(start + 3_600_000);
    expect((await f.read()).status).toBe(200);
    expect(await f.store.list('ai-rate/insights/')).toHaveLength(1);
  });

  it('fails closed when capacity metadata is corrupt', async () => {
    const f = await fixture();
    await f.store.put(`insights/${f.shareId}/${day}/quota`, new TextEncoder().encode('broken'), {
      exclusive: true,
    });
    expect((await f.put()).status).toBe(503);
    expect(await f.store.list(`insights/${f.shareId}/${day}/envelopes/`)).toEqual([]);
  });

  it('does not return a page when the owner revokes access during the read', async () => {
    const f = await fixture();
    await f.put();
    const listPage = f.store.listPage.bind(f.store);
    vi.spyOn(f.store, 'listPage').mockImplementation(async (...args) => {
      const page = await listPage(...args);
      await f.store.del([`shares/${f.shareId}/auth`]);
      return page;
    });
    expect((await f.read()).status).toBe(404);
  });

  it('cleans up a write that races course deletion', async () => {
    const f = await fixture();
    const put = f.store.put.bind(f.store);
    vi.spyOn(f.store, 'put').mockImplementation(async (...args) => {
      const written = await put(...args);
      if (args[0].includes('/envelopes/')) await f.store.del([`shares/${f.shareId}/auth`]);
      return written;
    });
    expect((await f.put()).status).toBe(404);
    expect(await f.store.list(`insights/${f.shareId}/${day}/envelopes/`)).toEqual([]);
  });

  it('advances bounded maintenance scans and preserves unexpired objects', async () => {
    const f = await fixture();
    const oldDay = '2026-07-26';
    for (let i = 0; i < 501; i++) {
      await f.store.put(
        `insights/${f.shareId}/${oldDay}/envelopes/${i.toString(16).padStart(32, '0')}`,
        new Uint8Array(),
        { exclusive: true },
      );
    }
    await f.put();
    expect(await cleanupExpiredInsights(f.store, start)).toEqual({ insightObjectsDeleted: 500 });
    expect(await f.store.get('maintenance/insights-cursor')).not.toBeNull();
    expect(await cleanupExpiredInsights(f.store, start)).toEqual({ insightObjectsDeleted: 1 });
    expect(await f.store.get('maintenance/insights-cursor')).toBeNull();
    expect(await f.store.list(`insights/${f.shareId}/${day}/`)).toHaveLength(2);
  });
});
