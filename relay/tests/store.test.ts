import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  BlobStoreNotFoundError,
} from '@vercel/blob';
import {
  BLOB_GET_OPTIONS,
  MemoryStore,
  canonicalEtag,
  createVercelStore,
  type BlobClient,
} from '../src/store.js';

afterEach(() => vi.unstubAllEnvs());

describe('MemoryStore', () => {
  it('stats current existence and upload time without returning a body', async () => {
    let now = 10;
    const store = new MemoryStore(() => now);
    expect(await store.stat('shares/x/payload')).toBeNull();
    await store.put('shares/x/payload', new Uint8Array([1]), { exclusive: true });
    expect(await store.stat('shares/x/payload')).toEqual({ uploadedAt: 10 });
    now = 20;
    await store.put('shares/x/payload', new Uint8Array([2]), { overwrite: true });
    expect(await store.stat('shares/x/payload')).toEqual({ uploadedAt: 20 });
    await store.del(['shares/x/payload']);
    expect(await store.stat('shares/x/payload')).toBeNull();
  });

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

    const fresh = await store.put('c/x/state', new Uint8Array([3]), {
      ifMatch: `"${created.etag}"`,
    });
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) throw new Error('expected overwrite');
    expect(fresh.etag).not.toBe(created.etag);
    const stored = await store.get('c/x/state');
    expect(stored?.body).toEqual(new Uint8Array([3]));
    expect(stored?.etag).toBe(fresh.etag);
  });
});

describe('canonicalEtag', () => {
  it('strips surrounding quotes and normalises weak tags', () => {
    expect(canonicalEtag('"abc"')).toBe('abc');
    expect(canonicalEtag('abc')).toBe('abc');
    expect(canonicalEtag('W/"abc"')).toBe('abc');
    expect(canonicalEtag('W/ "abc"')).toBe('abc');
  });
});

describe('createVercelStore', () => {
  it('uses the installed SDK metadata API for fresh stats, including deletion', async () => {
    const requests: Array<{ method?: string; url?: string }> = [];
    const server = createServer((request, response) => {
      requests.push({ method: request.method, url: request.url });
      response.setHeader('Content-Type', 'application/json');
      if (requests.length === 3) {
        response.writeHead(404).end(JSON.stringify({ error: { code: 'not_found' } }));
      } else {
        response.end(
          JSON.stringify({
            pathname: 'shares/x/payload',
            uploadedAt: new Date(requests.length * 1000).toISOString(),
            size: 1_928_490,
            etag: `version-${requests.length}`,
          }),
        );
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('expected local TCP address');
      vi.stubEnv('VERCEL_BLOB_API_URL', `http://127.0.0.1:${address.port}`);
      vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_test_fixture');
      vi.stubEnv('VERCEL_OIDC_TOKEN', '');
      vi.stubEnv('BLOB_STORE_ID', '');
      const store = createVercelStore();
      expect(await store.stat('shares/x/payload')).toEqual({ uploadedAt: 1000 });
      expect(await store.stat('shares/x/payload')).toEqual({ uploadedAt: 2000 });
      expect(await store.stat('shares/x/payload')).toBeNull();
      expect(requests).toEqual(
        Array.from({ length: 3 }, () => ({
          method: 'GET',
          url: '/?url=shares%2Fx%2Fpayload',
        })),
      );
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('stats fresh Blob metadata on every call and treats only a missing blob as absent', async () => {
    const head = vi
      .fn()
      .mockResolvedValueOnce({ uploadedAt: new Date(10) })
      .mockResolvedValueOnce({ uploadedAt: new Date(20) })
      .mockRejectedValueOnce(new BlobNotFoundError());
    const get = vi.fn();
    const list = vi.fn();
    const store = createVercelStore({
      head,
      get,
      list,
      async put() {
        return { etag: 'unused' };
      },
      async del() {},
    });
    expect(await store.stat('shares/x/payload')).toEqual({ uploadedAt: 10 });
    expect(await store.stat('shares/x/payload')).toEqual({ uploadedAt: 20 });
    expect(await store.stat('shares/x/payload')).toBeNull();
    expect(head.mock.calls).toEqual([
      ['shares/x/payload'],
      ['shares/x/payload'],
      ['shares/x/payload'],
    ]);
    expect(get).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it('uses one bounded Blob list page with its supplied cursor', async () => {
    const calls: Array<{ prefix: string; cursor?: string; limit: number }> = [];
    const client: BlobClient = {
      async head() {
        throw new BlobNotFoundError();
      },
      async get() {
        return null;
      },
      async put() {
        return { etag: 'unused' };
      },
      async del() {},
      async list(options) {
        calls.push(options);
        return {
          blobs: [{ pathname: 'c/a/meta', uploadedAt: new Date(0) }],
          hasMore: true,
          cursor: 'next-page',
        };
      },
    };

    expect(await createVercelStore(client).listPage('c/', 'prior-page', 100)).toEqual({
      objects: [{ key: 'c/a/meta', uploadedAt: 0 }],
      cursor: 'next-page',
    });
    expect(calls).toEqual([{ prefix: 'c/', cursor: 'prior-page', limit: 100 }]);
  });

  it('reads with useCache: false', async () => {
    const gets: Array<{ access: 'private'; useCache: boolean }> = [];
    const client: BlobClient = {
      async head() {
        throw new BlobNotFoundError();
      },
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
      async head() {
        throw new BlobNotFoundError();
      },
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
      async head() {
        throw new BlobNotFoundError();
      },
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

  it('keeps the original blob error as cause on stat, read, write, delete and list', async () => {
    const original = new BlobStoreNotFoundError();
    const client: BlobClient = {
      async head() {
        throw original;
      },
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

    await expect(store.stat('c/x/state')).rejects.toMatchObject({
      message: 'blob stat failed',
      cause: original,
    });
    await expect(store.get('c/x/state')).rejects.toMatchObject({
      message: 'blob read failed',
      cause: original,
    });
    await expect(
      store.put('c/x/state', new Uint8Array([1]), { exclusive: true }),
    ).rejects.toMatchObject({
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
