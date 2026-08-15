import { describe, expect, it } from 'vitest';
import { BlobPreconditionFailedError } from '@vercel/blob';
import {
  BLOB_GET_OPTIONS,
  MemoryStore,
  canonicalEtag,
  createVercelStore,
  type BlobClient,
} from '../src/store.js';

describe('MemoryStore', () => {
  it('refuses a second exclusive create of the same key', async () => {
    const store = new MemoryStore();
    const first = await store.put('c/x/state', new Uint8Array([1]), { exclusive: true });
    const second = await store.put('c/x/state', new Uint8Array([2]), { exclusive: true });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error('expected conflict');
    expect(second.reason).toBe('precondition');
    const stored = await store.get('c/x/state');
    expect(stored?.body).toEqual(new Uint8Array([1]));
  });

  it('overwrites only when ifMatch is the current etag', async () => {
    const store = new MemoryStore();
    const created = await store.put('c/x/state', new Uint8Array([1]), { exclusive: true });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error('expected create');

    const stale = await store.put('c/x/state', new Uint8Array([2]), { ifMatch: 'wrong' });
    expect(stale.ok).toBe(false);

    const fresh = await store.put('c/x/state', new Uint8Array([3]), { ifMatch: `"${created.etag}"` });
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) throw new Error('expected overwrite');
    expect(fresh.etag).not.toBe(created.etag);
    const stored = await store.get('c/x/state');
    expect(stored?.body).toEqual(new Uint8Array([3]));
    expect(stored?.etag).toBe(fresh.etag);
  });
});

describe('canonicalEtag', () => {
  it('strips surrounding quotes and rejects weak tags', () => {
    expect(canonicalEtag('"abc"')).toBe('abc');
    expect(canonicalEtag('abc')).toBe('abc');
    expect(canonicalEtag('W/"abc"')).toBe('');
  });
});

describe('createVercelStore', () => {
  it('reads with useCache: false', async () => {
    const gets: Array<{ access: 'private'; useCache: boolean }> = [];
    const client: BlobClient = {
      async get(_key, options) {
        gets.push(options);
        return null;
      },
      async put() {
        return { etag: 'unused' };
      },
      async del() {},
      async list() {
        return { blobs: [], hasMore: false };
      },
    };

    await createVercelStore(client).get('c/x/state');

    expect(BLOB_GET_OPTIONS.useCache).toBe(false);
    expect(gets).toEqual([BLOB_GET_OPTIONS]);
    expect(gets[0]?.useCache).toBe(false);
  });

  it('maps BlobPreconditionFailedError to a failed put', async () => {
    const client: BlobClient = {
      async get() {
        return null;
      },
      async put() {
        throw new BlobPreconditionFailedError();
      },
      async del() {},
      async list() {
        return { blobs: [], hasMore: false };
      },
    };

    const exclusive = await createVercelStore(client).put('c/x/state', new Uint8Array([1]), {
      exclusive: true,
    });
    expect(exclusive).toEqual({ ok: false, reason: 'precondition' });

    const matched = await createVercelStore(client).put('c/x/state', new Uint8Array([1]), {
      ifMatch: '"abc"',
    });
    expect(matched).toEqual({ ok: false, reason: 'precondition' });
  });

  it('passes ifMatch through on overwrite and omits it on exclusive create', async () => {
    const puts: Array<{ allowOverwrite: boolean; ifMatch?: string }> = [];
    const client: BlobClient = {
      async get() {
        return null;
      },
      async put(_key, _body, options) {
        puts.push({ allowOverwrite: options.allowOverwrite, ifMatch: options.ifMatch });
        return { etag: 'new' };
      },
      async del() {},
      async list() {
        return { blobs: [], hasMore: false };
      },
    };
    const store = createVercelStore(client);

    await store.put('c/x/state', new Uint8Array([1]), { exclusive: true });
    await store.put('c/x/state', new Uint8Array([2]), { ifMatch: '"abc"' });

    expect(puts[0]).toEqual({ allowOverwrite: false, ifMatch: undefined });
    expect(puts[1]).toEqual({ allowOverwrite: true, ifMatch: '"abc"' });
  });

  it('keeps the original blob error as cause on read, write, delete and list', async () => {
    const original = new Error('Vercel Blob: store not found');
    const client: BlobClient = {
      async get() {
        throw original;
      },
      async put() {
        throw original;
      },
      async del() {
        throw original;
      },
      async list() {
        throw original;
      },
    };
    const store = createVercelStore(client);

    await expect(store.get('c/x/state')).rejects.toMatchObject({
      message: 'blob read failed',
      cause: original,
    });
    await expect(store.put('c/x/state', new Uint8Array([1]), { exclusive: true })).rejects.toMatchObject({
      message: 'blob write failed',
      cause: original,
    });
    await expect(store.del(['c/x/state'])).rejects.toMatchObject({
      message: 'blob delete failed',
      cause: original,
    });
    await expect(store.list('c/x/')).rejects.toMatchObject({
      message: 'blob list failed',
      cause: original,
    });
  });
});
