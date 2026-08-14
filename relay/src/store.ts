import { del, get, list, put } from '@vercel/blob';

export interface StoredObject {
  body: Uint8Array;
  uploadedAt: number;
}

export interface ListedObject {
  key: string;
  uploadedAt: number;
}

/**
 * Thin key/value seam over the backing store.
 *
 * `create` must fail if the key already exists. That exclusive create is the
 * generation guard: two PUTs from generation n both try to create key n+1,
 * and only one can succeed.
 *
 * `put` overwrites. It is only used for the per-slot generation pointer, which
 * is read back with a cache-bypassing `get` so a pull after a push cannot
 * miss the new generation.
 */
export interface BlobStore {
  get(key: string): Promise<StoredObject | null>;
  create(key: string, body: Uint8Array): Promise<boolean>;
  put(key: string, body: Uint8Array): Promise<void>;
  del(keys: string[]): Promise<void>;
  list(prefix: string): Promise<ListedObject[]>;
}

export class MemoryStore implements BlobStore {
  private readonly objects = new Map<string, StoredObject>();

  constructor(private readonly now: () => number = Date.now) {}

  async get(key: string): Promise<StoredObject | null> {
    const found = this.objects.get(key);
    return found ? { body: found.body, uploadedAt: found.uploadedAt } : null;
  }

  async create(key: string, body: Uint8Array): Promise<boolean> {
    if (this.objects.has(key)) return false;
    this.objects.set(key, { body, uploadedAt: this.now() });
    return true;
  }

  async put(key: string, body: Uint8Array): Promise<void> {
    this.objects.set(key, { body, uploadedAt: this.now() });
  }

  async del(keys: string[]): Promise<void> {
    for (const key of keys) this.objects.delete(key);
  }

  async list(prefix: string): Promise<ListedObject[]> {
    const out: ListedObject[] = [];
    for (const [key, value] of this.objects) {
      if (key.startsWith(prefix)) {
        out.push({ key, uploadedAt: value.uploadedAt });
      }
    }
    return out;
  }
}

function exclusiveCreateLost(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = 'name' in err ? String(err.name) : '';
  const message = 'message' in err ? String(err.message).toLowerCase() : '';
  return (
    name === 'BlobAlreadyExistsError' ||
    name === 'BlobPreconditionFailedError' ||
    message.includes('already exists') ||
    message.includes('precondition failed')
  );
}

const privateRead = { access: 'private' as const, useCache: false };

export function createVercelStore(): BlobStore {
  return {
    async get(key) {
      try {
        const result = await get(key, privateRead);
        if (!result || result.statusCode !== 200 || !result.stream) return null;
        return {
          body: new Uint8Array(await new Response(result.stream).arrayBuffer()),
          uploadedAt: result.blob.uploadedAt.getTime(),
        };
      } catch {
        throw new Error('blob read failed');
      }
    },

    async create(key, body) {
      try {
        await put(key, Buffer.from(body), {
          access: 'private',
          addRandomSuffix: false,
          allowOverwrite: false,
          contentType: 'application/octet-stream',
          cacheControlMaxAge: 60,
        });
        return true;
      } catch (err) {
        if (exclusiveCreateLost(err)) return false;
        throw new Error('blob write failed');
      }
    },

    async put(key, body) {
      try {
        await put(key, Buffer.from(body), {
          access: 'private',
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: 'application/octet-stream',
          cacheControlMaxAge: 60,
        });
      } catch {
        throw new Error('blob write failed');
      }
    },

    async del(keys) {
      if (keys.length === 0) return;
      try {
        await del(keys);
      } catch {
        throw new Error('blob delete failed');
      }
    },

    async list(prefix) {
      try {
        const out: ListedObject[] = [];
        let cursor: string | undefined;
        do {
          const page = await list({ prefix, cursor, limit: 1000 });
          for (const blob of page.blobs) {
            out.push({
              key: blob.pathname,
              uploadedAt: blob.uploadedAt.getTime(),
            });
          }
          cursor = page.hasMore ? page.cursor : undefined;
        } while (cursor);
        return out;
      } catch {
        throw new Error('blob list failed');
      }
    },
  };
}
