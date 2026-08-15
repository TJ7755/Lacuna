import { BlobPreconditionFailedError, del, get, list, put } from '@vercel/blob';

export interface StoredObject {
  body: Uint8Array;
  uploadedAt: number;
  etag: string;
}

export interface ListedObject {
  key: string;
  uploadedAt: number;
}

export type PutOptions = { exclusive: true } | { ifMatch: string };

export type PutResult = { ok: true; etag: string } | { ok: false; reason: 'precondition' };

/**
 * Thin key/value seam over the backing store.
 *
 * Overwrite of an existing key is compare-and-swap on `ifMatch`. Exclusive
 * create (`exclusive: true`) is used for channel mint and for the first write
 * into an empty slot. Whether that create is atomic on live Blob is not
 * documented; the in-memory store is atomic only because the check and set
 * share a turn.
 */
export interface BlobStore {
  get(key: string): Promise<StoredObject | null>;
  put(key: string, body: Uint8Array, opts: PutOptions): Promise<PutResult>;
  del(keys: string[]): Promise<void>;
  list(prefix: string): Promise<ListedObject[]>;
}

export function canonicalEtag(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('W/')) return '';
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export class MemoryStore implements BlobStore {
  private readonly objects = new Map<string, StoredObject>();
  private seq = 0;

  constructor(private readonly now: () => number = Date.now) {}

  async get(key: string): Promise<StoredObject | null> {
    const found = this.objects.get(key);
    return found ? { body: found.body, uploadedAt: found.uploadedAt, etag: found.etag } : null;
  }

  async put(key: string, body: Uint8Array, opts: PutOptions): Promise<PutResult> {
    if ('exclusive' in opts) {
      if (this.objects.has(key)) return { ok: false, reason: 'precondition' };
    } else {
      const current = this.objects.get(key);
      if (!current || canonicalEtag(current.etag) !== canonicalEtag(opts.ifMatch)) {
        return { ok: false, reason: 'precondition' };
      }
    }
    this.seq += 1;
    const etag = `t${this.seq}`;
    this.objects.set(key, { body, uploadedAt: this.now(), etag });
    return { ok: true, etag };
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

/** A cached pull is a wrong merge base. Required on every read. */
export const BLOB_GET_OPTIONS = {
  access: 'private' as const,
  useCache: false,
};

export interface BlobClient {
  get: (
    pathname: string,
    options: { access: 'private'; useCache: boolean },
  ) => Promise<{
    statusCode: number;
    stream: ReadableStream<Uint8Array> | null;
    blob: { uploadedAt: Date; etag: string };
  } | null>;
  put: (
    pathname: string,
    body: Buffer,
    options: {
      access: 'private';
      addRandomSuffix: boolean;
      allowOverwrite: boolean;
      ifMatch?: string;
      contentType: string;
      cacheControlMaxAge: number;
    },
  ) => Promise<{ etag: string }>;
  del: (pathnames: string[]) => Promise<void>;
  list: (options: { prefix: string; cursor?: string; limit: number }) => Promise<{
    blobs: { pathname: string; uploadedAt: Date }[];
    hasMore: boolean;
    cursor?: string;
  }>;
}

function isCreateConflict(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  if (err instanceof BlobPreconditionFailedError) return true;
  const name = 'name' in err ? String(err.name) : '';
  const message = 'message' in err ? String(err.message).toLowerCase() : '';
  return (
    name === 'BlobAlreadyExistsError' ||
    name === 'BlobPreconditionFailedError' ||
    message.includes('already exists') ||
    message.includes('precondition failed')
  );
}

const putBase = {
  access: 'private' as const,
  addRandomSuffix: false,
  contentType: 'application/octet-stream',
  cacheControlMaxAge: 60,
};

export function createVercelStore(client: BlobClient = { get, put, del, list }): BlobStore {
  return {
    async get(key) {
      try {
        const result = await client.get(key, BLOB_GET_OPTIONS);
        if (!result || result.statusCode !== 200 || !result.stream) return null;
        return {
          body: new Uint8Array(await new Response(result.stream).arrayBuffer()),
          uploadedAt: result.blob.uploadedAt.getTime(),
          etag: result.blob.etag,
        };
      } catch (err) {
        throw new Error('blob read failed', { cause: err });
      }
    },

    async put(key, body, opts) {
      try {
        if ('exclusive' in opts) {
          const result = await client.put(key, Buffer.from(body), {
            ...putBase,
            allowOverwrite: false,
          });
          return { ok: true, etag: result.etag };
        }
        const result = await client.put(key, Buffer.from(body), {
          ...putBase,
          allowOverwrite: true,
          ifMatch: opts.ifMatch,
        });
        return { ok: true, etag: result.etag };
      } catch (err) {
        if (isCreateConflict(err)) return { ok: false, reason: 'precondition' };
        throw new Error('blob write failed', { cause: err });
      }
    },

    async del(keys) {
      if (keys.length === 0) return;
      try {
        await client.del(keys);
      } catch (err) {
        throw new Error('blob delete failed', { cause: err });
      }
    },

    async list(prefix) {
      try {
        const out: ListedObject[] = [];
        let cursor: string | undefined;
        do {
          const page = await client.list({ prefix, cursor, limit: 1000 });
          for (const blob of page.blobs) {
            out.push({
              key: blob.pathname,
              uploadedAt: blob.uploadedAt.getTime(),
            });
          }
          cursor = page.hasMore ? page.cursor : undefined;
        } while (cursor);
        return out;
      } catch (err) {
        throw new Error('blob list failed', { cause: err });
      }
    },
  };
}
