import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler } from '../../relay/src/relay';
import { MemoryStore } from '../../relay/src/store';
import {
  createInsightsOwner,
  openInsightEnvelope,
  recoverInsightsOwner,
  sealInsightEnvelope,
} from './envelope';
import { getInsightMailboxPage, putInsightEnvelope } from './mailbox';
import { runDailyInsightsSend } from './optIn';

const now = Date.parse('2026-10-19T00:00:00Z');
const day = '2026-10-18';
const relayUrl = 'https://relay.example';
beforeEach(() => vi.stubEnv('RELAY_INSIGHTS_ENABLED', '1'));
afterEach(() => vi.unstubAllEnvs());

async function fixture() {
  const store = new MemoryStore(() => now);
  const handle = createHandler(store, { now: () => now });
  const response = await handle(new Request(`${relayUrl}/shares`, { method: 'POST' }));
  const { shareId, writeToken } = (await response.json()) as {
    shareId: string;
    writeToken: string;
  };
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const request = new Request(url, init);
    // The HTTP edge supplies this forbidden browser header, not the client.
    if (typeof init?.body === 'string')
      request.headers.set('Content-Length', String(new TextEncoder().encode(init.body).length));
    return handle(request);
  }) as unknown as typeof fetch;
  const passphrase = 'teacher offline recovery passphrase';
  const owner = await createInsightsOwner(passphrase, shareId);
  const evidence = new TextEncoder().encode('pupil-17: question-4 criterion-2 marks 3/5');
  const envelope = await sealInsightEnvelope(owner.recipient, evidence, { shareId, isoDay: day });
  const options = { relayUrl, shareId, isoDay: day, slotId: 'c'.repeat(32), envelope, fetchImpl };
  return { store, handle, options, owner, passphrase, evidence, writeToken };
}

describe('encrypted mailbox transport', () => {
  it('moves ciphertext through the real relay and decrypts only with the recovered teacher key', async () => {
    const f = await fixture();
    const writes = vi.spyOn(f.store, 'put');
    await putInsightEnvelope(f.options);
    expect(writes.mock.calls.length).toBeLessThanOrEqual(3);
    const stored = await f.store.list(`insights/${f.options.shareId}/${day}/envelopes/`);
    expect(stored).toHaveLength(1);
    const bytes = (await f.store.get(stored[0].key))!.body;
    expect(new TextDecoder().decode(bytes)).not.toContain('pupil-17');
    const page = await getInsightMailboxPage({ ...f.options, writeToken: f.writeToken });
    expect(page.envelopes).toHaveLength(1);
    const recovered = await recoverInsightsOwner(f.owner.recovery, f.passphrase, f.options.shareId);
    expect(await openInsightEnvelope(recovered, page.envelopes[0].envelope, f.options)).toEqual(
      f.evidence,
    );
    expect((await f.store.get(stored[0].key))!.body).toEqual(bytes);
  }, 30_000);

  it('respects opt-out and retries a lost acknowledgement without duplicating or refreshing a report', async () => {
    const f = await fixture();
    let optedIn = false,
      lastSentDay: string | null = null,
      loseReply = true;
    const send = async () => {
      await putInsightEnvelope(f.options);
      if (loseReply) {
        loseReply = false;
        throw new Error('connection lost after acceptance');
      }
    };
    const deps = {
      readState: () => ({ optedIn, lastSentDay }),
      markSent: (value: string) => {
        lastSentDay = value;
      },
      now: () => now,
      send,
    };
    expect(await runDailyInsightsSend(deps)).toBe('idle');
    expect(await f.store.list(`insights/${f.options.shareId}/`)).toEqual([]);
    optedIn = true;
    expect(await runDailyInsightsSend(deps)).toBe('failed');
    expect(lastSentDay).toBeNull();
    const first = await f.store.list(`insights/${f.options.shareId}/`);
    expect(await runDailyInsightsSend(deps)).toBe('sent');
    expect(lastSentDay).toBe(day);
    expect(await f.store.list(`insights/${f.options.shareId}/`)).toEqual(first);
    expect(await runDailyInsightsSend(deps)).toBe('idle');
  }, 30_000);

  it('rejects unauthorised reads, invalid destinations and plaintext-bearing packets', async () => {
    const f = await fixture();
    await expect(
      getInsightMailboxPage({ ...f.options, writeToken: '0'.repeat(64) }),
    ).rejects.toMatchObject({ status: 401 });
    const fetchImpl = vi.fn();
    await expect(
      putInsightEnvelope({ ...f.options, relayUrl: 'http://untrusted.example', fetchImpl }),
    ).rejects.toThrow();
    await expect(
      putInsightEnvelope({ ...f.options, slotId: '../payload', fetchImpl }),
    ).rejects.toThrow();
    await expect(
      putInsightEnvelope({
        ...f.options,
        envelope: { ...f.options.envelope, name: 'Pupil' },
        fetchImpl,
      } as typeof f.options),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  }, 30_000);

  it('rejects a route mismatch at the relay and a relabelled ciphertext at the teacher', async () => {
    const f = await fixture();
    await expect(putInsightEnvelope({ ...f.options, isoDay: '2026-10-17' })).rejects.toThrow();
    const relabelled = { ...f.options.envelope, d: '2026-10-17' };
    await putInsightEnvelope({ ...f.options, isoDay: '2026-10-17', envelope: relabelled });
    const page = await getInsightMailboxPage({
      ...f.options,
      isoDay: '2026-10-17',
      writeToken: f.writeToken,
    });
    await expect(
      openInsightEnvelope(f.owner, page.envelopes[0].envelope, {
        ...f.options,
        isoDay: '2026-10-17',
      }),
    ).rejects.toThrow();
  }, 30_000);

  it('rejects malformed, oversized and cross-course pages without reflecting their content', async () => {
    const f = await fixture();
    for (const page of [
      { v: 3, envelopes: [], cursor: null },
      { v: 2, envelopes: [], cursor: null, pupilName: 'Secret' },
      {
        v: 2,
        envelopes: Array(17).fill({ slotId: f.options.slotId, envelope: f.options.envelope }),
        cursor: null,
      },
      {
        v: 2,
        envelopes: [
          { slotId: f.options.slotId, envelope: { ...f.options.envelope, s: 'a'.repeat(32) } },
        ],
        cursor: null,
      },
    ]) {
      const fetchImpl = vi.fn(
        async () => new Response(JSON.stringify(page), { status: 200 }),
      ) as typeof fetch;
      await expect(
        getInsightMailboxPage({ ...f.options, writeToken: f.writeToken, fetchImpl }),
      ).rejects.toThrow('unreadable');
    }
    const fetchImpl = vi.fn(
      async () => new Response('Secret'.repeat(300_000), { status: 200 }),
    ) as typeof fetch;
    await expect(
      getInsightMailboxPage({ ...f.options, writeToken: f.writeToken, fetchImpl }),
    ).rejects.toThrow('unreadable');
  }, 30_000);

  it('passes the opaque cursor and keeps the owner token out of URLs', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ v: 2, envelopes: [], cursor: null })),
    );
    const writeToken = 'a'.repeat(64),
      cursor = 'page+/=?next';
    await getInsightMailboxPage({
      relayUrl,
      shareId: 'b'.repeat(32),
      isoDay: day,
      writeToken,
      cursor,
      fetchImpl,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).searchParams.get('cursor')).toBe(cursor);
    expect(url).not.toContain(writeToken);
    expect(init).toMatchObject({
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${writeToken}` },
    });
  });

  it('aborts a stalled fetch after fifteen seconds and forwards cancellation', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true,
            });
          }),
      );
      const options = {
        relayUrl,
        shareId: 'b'.repeat(32),
        isoDay: day,
        writeToken: 'a'.repeat(64),
        fetchImpl,
      };
      const timedOut = expect(getInsightMailboxPage(options)).rejects.toThrow('Could not reach');
      await vi.advanceTimersByTimeAsync(15_000);
      await timedOut;
      const controller = new AbortController();
      const cancelled = expect(
        getInsightMailboxPage({ ...options, signal: controller.signal }),
      ).rejects.toThrow('Could not reach');
      controller.abort();
      await cancelled;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
