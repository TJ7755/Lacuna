import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/schema';
import { readSyncState } from '../db/mutationStamp';
import { createCourse, createLesson, createNote } from '../db/repository';
import {
  assertSharePayloadSize,
  publishShareLink,
  SHARE_PAYLOAD_MAX_BYTES,
  ShareLinkNeedsReplacementError,
  unpublishShareLink,
} from './publish';
import { forgetShareCredentials, readShareCredentials } from './credentials';

const RELAY_URL = 'https://relay.example';
const SHARE_ID = 'a'.repeat(32);
const WRITE_TOKEN = 'b'.repeat(64);

function relayFetch() {
  let mints = 0;
  const puts: Array<{ slot: string; ifMatch: string | null }> = [];
  const fetchImpl = vi.fn(async (url: unknown, init?: RequestInit) => {
    const target = String(url);
    if (target === `${RELAY_URL}/shares` && init?.method === 'POST') {
      mints += 1;
      return new Response(JSON.stringify({ shareId: SHARE_ID, writeToken: WRITE_TOKEN }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const match = /\/shares\/([0-9a-f]{32})\/(payload|meta)$/.exec(target);
    if (match && init?.method === 'PUT') {
      puts.push({
        slot: match[2]!,
        ifMatch: (init.headers as Record<string, string>)['If-Match'] ?? null,
      });
      return new Response(null, { status: 204, headers: { ETag: `"t${puts.length}"` } });
    }
    throw new Error(`unexpected request ${init?.method} ${target}`);
  });
  return { fetchImpl, puts, mintCount: () => mints };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('publishShareLink', () => {
  it('mints a share on first publish and reuses it on republish', async () => {
    const course = await createCourse('Biology');
    const relay = relayFetch();

    const first = await publishShareLink(course.id, { relayUrl: RELAY_URL, fetchImpl: relay.fetchImpl as typeof fetch });
    expect(first.shareId).toBe(SHARE_ID);
    expect(first.revision).toBe(1);
    expect(first.byteSize).toBeGreaterThan(0);
    expect(relay.mintCount()).toBe(1);
    expect(relay.puts).toEqual([
      { slot: 'payload', ifMatch: '"0"' },
      { slot: 'meta', ifMatch: '"0"' },
    ]);
    expect((await db.courses.get(course.id))?.distribution?.shareId).toBe(SHARE_ID);
    expect((await db.courses.get(course.id))?.distribution?.shareRevision).toBe(1);
    expect(await readShareCredentials(SHARE_ID)).toMatchObject({ writeToken: WRITE_TOKEN });

    const manifestBody = (relay.fetchImpl.mock.calls.find(([url]) =>
      String(url).endsWith('/meta'),
    )?.[1] as RequestInit)?.body as Blob;
    const manifest = JSON.parse(await manifestBody.text()) as { revision: number; lineageId: string };
    expect(manifest.revision).toBe(1);
    expect(typeof manifest.lineageId).toBe('string');

    const second = await publishShareLink(course.id, {
      relayUrl: RELAY_URL,
      fetchImpl: relay.fetchImpl as typeof fetch,
    });
    expect(second.shareId).toBe(SHARE_ID);
    expect(second.revision).toBe(2);
    expect(relay.mintCount()).toBe(1);
    expect(relay.puts.slice(2)).toEqual([
      { slot: 'payload', ifMatch: '"t1"' },
      { slot: 'meta', ifMatch: '"t2"' },
    ]);
    expect((await db.courses.get(course.id))?.distribution?.shareRevision).toBe(2);
  });

  it('refuses an oversized course without consuming a revision', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Heavy');
    await createNote(lesson.id, 'Big note', `x${'y'.repeat(4_300_000)}`);
    const relay = relayFetch();

    await expect(
      publishShareLink(course.id, { relayUrl: RELAY_URL, fetchImpl: relay.fetchImpl as typeof fetch }),
    ).rejects.toThrow(/course file instead/);
    expect(await db.courses.get(course.id)).not.toHaveProperty('distribution');
    expect(relay.mintCount()).toBe(0);
  });

  it('leaves no link behind when the first upload fails', async () => {
    const course = await createCourse('Biology');
    const failing = vi.fn(async (url: unknown, init?: RequestInit) => {
      const target = String(url);
      if (target === `${RELAY_URL}/shares` && init?.method === 'POST') {
        return new Response(JSON.stringify({ shareId: SHARE_ID, writeToken: WRITE_TOKEN }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'unavailable' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await expect(
      publishShareLink(course.id, { relayUrl: RELAY_URL, fetchImpl: failing as typeof fetch }),
    ).rejects.toThrow();
    expect((await db.courses.get(course.id))?.distribution).not.toHaveProperty('shareId');
    expect((await readSyncState())?.shareLinks).toBeUndefined();
  });

  it('requires explicit replacement when the link belongs to another device', async () => {
    const course = await createCourse('Biology');
    const relay = relayFetch();
    const fetchImpl = relay.fetchImpl as typeof fetch;
    await publishShareLink(course.id, { relayUrl: RELAY_URL, fetchImpl });
    await forgetShareCredentials(SHARE_ID);

    await expect(publishShareLink(course.id, { relayUrl: RELAY_URL, fetchImpl })).rejects.toThrow(
      ShareLinkNeedsReplacementError,
    );
    expect(relay.mintCount()).toBe(1);
    expect((await db.courses.get(course.id))?.distribution?.shareId).toBe(SHARE_ID);
  });

  it('mints a fresh link when replacement is accepted', async () => {
    const course = await createCourse('Biology');
    const replacementId = 'c'.repeat(32);
    let mints = 0;
    const fetchImpl = vi.fn(async (url: unknown, init?: RequestInit) => {
      const target = String(url);
      if (target === `${RELAY_URL}/shares` && init?.method === 'POST') {
        mints += 1;
        const shareId = mints === 1 ? SHARE_ID : replacementId;
        return new Response(JSON.stringify({ shareId, writeToken: WRITE_TOKEN }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 204, headers: { ETag: '"t1"' } });
    });
    const fetchWithReplacement = fetchImpl as typeof fetch;
    await publishShareLink(course.id, { relayUrl: RELAY_URL, fetchImpl: fetchWithReplacement });
    await forgetShareCredentials(SHARE_ID);

    const replaced = await publishShareLink(course.id, {
      relayUrl: RELAY_URL,
      fetchImpl: fetchWithReplacement,
      replaceLink: true,
    });

    expect(replaced.shareId).toBe(replacementId);
    expect((await db.courses.get(course.id))?.distribution?.shareId).toBe(replacementId);
    expect(await readShareCredentials(replacementId)).toMatchObject({ writeToken: WRITE_TOKEN });
  });

  it('retries a stale manifest generation against the current one', async () => {
    const course = await createCourse('Biology');
    let metaPuts = 0;
    const fetchImpl = vi.fn(async (url: unknown, init?: RequestInit) => {
      const target = String(url);
      if (target === `${RELAY_URL}/shares` && init?.method === 'POST') {
        return new Response(JSON.stringify({ shareId: SHARE_ID, writeToken: WRITE_TOKEN }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (target.endsWith('/payload') && init?.method === 'PUT') {
        return new Response(null, { status: 204, headers: { ETag: '"t1"' } });
      }
      if (target.endsWith('/meta') && init?.method === 'GET') {
        return new Response(new Uint8Array([1]), { status: 200, headers: { ETag: '"tm-live"' } });
      }
      if (target.endsWith('/meta') && init?.method === 'PUT') {
        metaPuts += 1;
        if (metaPuts === 1) {
          return new Response(JSON.stringify({ error: 'precondition failed' }), {
            status: 412,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(null, { status: 204, headers: { ETag: '"tm2"' } });
      }
      throw new Error(`unexpected request ${init?.method} ${target}`);
    });

    const result = await publishShareLink(course.id, {
      relayUrl: RELAY_URL,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result.revision).toBe(1);
    const metaIfMatches = fetchImpl.mock.calls
      .filter(([url, init]) => String(url).endsWith('/meta') && (init as RequestInit)?.method === 'PUT')
      .map(([, init]) => ((init as RequestInit).headers as Record<string, string>)['If-Match']);
    expect(metaIfMatches).toEqual(['"0"', '"tm-live"']);
    expect((await readShareCredentials(SHARE_ID))?.metaGeneration).toBe('"tm2"');
  });

  it('retries a stale payload generation against the current one', async () => {
    const course = await createCourse('Biology');
    let payloadPuts = 0;
    const fetchImpl = vi.fn(async (url: unknown, init?: RequestInit) => {
      const target = String(url);
      if (target === `${RELAY_URL}/shares` && init?.method === 'POST') {
        return new Response(JSON.stringify({ shareId: SHARE_ID, writeToken: WRITE_TOKEN }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (target.endsWith('/payload') && init?.method === 'PUT') {
        payloadPuts += 1;
        if (payloadPuts === 2) {
          return new Response(JSON.stringify({ error: 'precondition failed' }), {
            status: 412,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(null, { status: 204, headers: { ETag: `"t${payloadPuts}"` } });
      }
      if (target.endsWith('/payload') && init?.method === 'GET') {
        return new Response(new Uint8Array([1]), { status: 200, headers: { ETag: '"t-live"' } });
      }
      if (target.endsWith('/meta') && init?.method === 'PUT') {
        return new Response(null, { status: 204, headers: { ETag: '"tm"' } });
      }
      throw new Error(`unexpected request ${init?.method} ${target}`);
    });

    await publishShareLink(course.id, { relayUrl: RELAY_URL, fetchImpl: fetchImpl as typeof fetch });
    const second = await publishShareLink(course.id, {
      relayUrl: RELAY_URL,
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(second.revision).toBe(2);
    const payloadIfMatches = fetchImpl.mock.calls
      .filter(([url, init]) => String(url).endsWith('/payload') && (init as RequestInit)?.method === 'PUT')
      .map(([, init]) => ((init as RequestInit).headers as Record<string, string>)['If-Match']);
    expect(payloadIfMatches.at(-1)).toBe('"t-live"');
  });
});

describe('unpublishShareLink', () => {
  it('deletes the relay copy and clears local link state, keeping the lineage', async () => {
    const course = await createCourse('Biology');
    const relay = relayFetch();
    const fetchImpl = relay.fetchImpl as typeof fetch;
    await publishShareLink(course.id, { relayUrl: RELAY_URL, fetchImpl });

    const seen: string[] = [];
    const deleting = async (url: unknown, init?: RequestInit) => {
      seen.push(`${init?.method} ${String(url)}`);
      return new Response(null, { status: 204 });
    };
    await unpublishShareLink(course.id, { fetchImpl: deleting as typeof fetch });

    expect(seen).toEqual([`DELETE ${RELAY_URL}/shares/${SHARE_ID}`]);
    expect((await db.courses.get(course.id))?.distribution).not.toHaveProperty('shareId');
    expect((await db.courses.get(course.id))?.distribution?.revision).toBe(1);
    expect(await readShareCredentials(SHARE_ID)).toBeNull();
  });

  it('still clears local state when the relay copy is already gone', async () => {
    const course = await createCourse('Biology');
    const relay = relayFetch();
    const fetchImpl = relay.fetchImpl as typeof fetch;
    await publishShareLink(course.id, { relayUrl: RELAY_URL, fetchImpl });

    const gone = async () =>
      new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    await unpublishShareLink(course.id, { fetchImpl: gone as typeof fetch });

    expect((await db.courses.get(course.id))?.distribution).not.toHaveProperty('shareId');
    expect(await readShareCredentials(SHARE_ID)).toBeNull();
  });

  it('is a no-op for a course without a link and rejects a missing course', async () => {
    const course = await createCourse('Biology');
    await expect(unpublishShareLink(course.id)).resolves.toBeUndefined();
    await expect(unpublishShareLink('missing')).rejects.toThrow('could not be found');
  });

  it('keeps local state when the relay rejects deletion', async () => {
    const course = await createCourse('Biology');
    const relay = relayFetch();
    const fetchImpl = relay.fetchImpl as typeof fetch;
    await publishShareLink(course.id, { relayUrl: RELAY_URL, fetchImpl });

    const rejected = async () =>
      new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    await expect(
      unpublishShareLink(course.id, { fetchImpl: rejected as typeof fetch }),
    ).rejects.toThrow('unauthorized');

    expect((await db.courses.get(course.id))?.distribution?.shareId).toBe(SHARE_ID);
    expect(await readShareCredentials(SHARE_ID)).toMatchObject({ writeToken: WRITE_TOKEN });
  });

  it('refuses to unpublish when this device cannot manage the link', async () => {
    const course = await createCourse('Biology');
    const relay = relayFetch();
    await publishShareLink(course.id, { relayUrl: RELAY_URL, fetchImpl: relay.fetchImpl as typeof fetch });
    await forgetShareCredentials(SHARE_ID);

    await expect(
      unpublishShareLink(course.id, { fetchImpl: relay.fetchImpl as typeof fetch }),
    ).rejects.toThrow(/cannot manage/);
    expect((await db.courses.get(course.id))?.distribution?.shareId).toBe(SHARE_ID);
  });
});

describe('assertSharePayloadSize', () => {
  it('accepts payloads within the relay cap and refuses larger ones', () => {
    expect(() => assertSharePayloadSize(SHARE_PAYLOAD_MAX_BYTES)).not.toThrow();
    expect(() => assertSharePayloadSize(SHARE_PAYLOAD_MAX_BYTES + 1)).toThrow(/course file instead/);
  });
});
