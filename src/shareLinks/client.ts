import { z } from 'zod';
import { normaliseRelayUrl } from '../sync/relay';
import { DEFAULT_RELAY_URL } from '../sync/pairingConfig';

export { DEFAULT_RELAY_URL };

export const SHARE_ID_RE = /^[0-9a-f]{32}$/;
const WRITE_TOKEN_RE = /^[0-9a-f]{64}$/;

export type ShareSlot = 'payload' | 'meta';
export type ShareLinkOperation = 'mint' | 'publish' | 'fetch' | 'remove';

export class ShareLinkError extends Error {
  readonly operation: ShareLinkOperation;
  readonly status?: number;

  constructor(message: string, options: { operation: ShareLinkOperation; status?: number }) {
    super(message);
    this.name = 'ShareLinkError';
    this.operation = options.operation;
    this.status = options.status;
  }
}

export class StaleShareGenerationError extends ShareLinkError {
  constructor() {
    super('The share link changed while publishing. Lacuna will fetch it again before retrying.', {
      operation: 'publish',
      status: 412,
    });
    this.name = 'StaleShareGenerationError';
  }
}

const ShareManifestSchema = z.object({
  v: z.literal(1),
  lineageId: z.string().min(1),
  revision: z.number().int().positive(),
  publishedAt: z.number().finite().nonnegative(),
  byteSize: z.number().int().nonnegative(),
  courseName: z.string().min(1),
});

/** Small polling document the teacher publishes beside the course file. */
export type ShareManifest = z.infer<typeof ShareManifestSchema>;

/** Parse and validate a fetched manifest, rejecting corrupt content readably. */
export function parseShareManifest(bytes: Uint8Array): ShareManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ShareLinkError('The share link manifest could not be read.', { operation: 'fetch' });
  }
  const parsed = ShareManifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ShareLinkError('The share link manifest could not be read.', { operation: 'fetch' });
  }
  return parsed.data;
}

const MintResponseSchema = z.object({
  shareId: z.string().regex(SHARE_ID_RE),
  writeToken: z.string().regex(WRITE_TOKEN_RE),
});

/**
 * Accept a bare share code or a full `/#/s/<code>` link and return the code.
 * Share codes are the relay's 32-hex capability ids, so a pasted LAC1 text
 * code is refused here rather than fetched.
 */
export function parseShareCode(value: string): string {
  const trimmed = value.trim();
  const candidate = trimmed.includes('/') ? (trimmed.split('/').pop() ?? '') : trimmed;
  if (SHARE_ID_RE.test(candidate)) return candidate;
  throw new ShareLinkError('That is not a Lacuna share link code.', { operation: 'fetch' });
}

/**
 * Hash-route path for a share code, e.g. `/#/s/<code>`. Hash routing keeps
 * the link deployable as static files with no server rewrites; the code is
 * the bit after the final `/`, so it doubles as the pasted code.
 */
export function shareLinkHash(shareId: string): string {
  return `/#/s/${requireShareId(shareId, 'fetch')}`;
}

/** Absolute share URL for an app origin; the origin keeps preview deployments working. */
export function formatShareLink(shareId: string, origin: string): string {
  return `${origin.replace(/\/+$/, '')}${shareLinkHash(shareId)}`;
}

function requireFetch(fetchImpl?: typeof fetch): typeof fetch {
  const fetcher = fetchImpl ?? globalThis.fetch;
  if (typeof fetcher !== 'function') {
    throw new ShareLinkError('This device does not provide fetch for share links.', {
      operation: 'fetch',
    });
  }
  return fetcher.bind(globalThis);
}

/**
 * A rejected fetch (offline host, CORS block, DNS failure) surfaces as a bare
 * TypeError. Wrap it so the UI reports the service is unreachable rather than
 * leaking engine text like "Failed to fetch".
 */
async function shareFetch(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  operation: ShareLinkOperation,
): Promise<Response> {
  try {
    return await fetcher(url, init);
  } catch {
    throw new ShareLinkError(
      'Could not reach the share link service. Check your connection and try again.',
      { operation },
    );
  }
}

function relayFor(relayUrl: string, operation: ShareLinkOperation): string {
  try {
    return normaliseRelayUrl(relayUrl);
  } catch {
    throw new ShareLinkError('The share link service URL is invalid.', { operation });
  }
}

function requireShareId(shareId: string, operation: ShareLinkOperation): string {
  if (!SHARE_ID_RE.test(shareId)) {
    throw new ShareLinkError('The share link code is invalid.', { operation });
  }
  return shareId;
}

function requireWriteToken(writeToken: string, operation: ShareLinkOperation): string {
  if (!WRITE_TOKEN_RE.test(writeToken)) {
    throw new ShareLinkError('The share link write token is invalid.', { operation });
  }
  return writeToken;
}

/** Mint a fresh share id and write token on the relay. */
export async function mintShare(
  relayUrl: string,
  fetchImpl?: typeof fetch,
): Promise<{ shareId: string; writeToken: string }> {
  const fetcher = requireFetch(fetchImpl);
  const response = await shareFetch(fetcher, `${relayFor(relayUrl, 'mint')}/shares`, { method: 'POST' }, 'mint');
  if (!response.ok) throw await shareHttpError('mint', response);
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new ShareLinkError('The share link service gave an unreadable response.', {
      operation: 'mint',
      status: response.status,
    });
  }
  const parsed = MintResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ShareLinkError('The share link service gave an unreadable response.', {
      operation: 'mint',
      status: response.status,
    });
  }
  return parsed.data;
}

export interface PutShareBytesOptions {
  relayUrl: string;
  shareId: string;
  writeToken: string;
  slot: ShareSlot;
  bytes: Uint8Array;
  /** Quoted ETag generation; `"0"` for the first write into an empty slot. */
  ifMatch: string;
  fetchImpl?: typeof fetch;
}

/** Publish one slot of a share, returning the relay's new generation. */
export async function putShareBytes(options: PutShareBytesOptions): Promise<{ generation: string }> {
  const { slot, bytes, ifMatch } = options;
  const fetcher = requireFetch(options.fetchImpl);
  const relay = relayFor(options.relayUrl, 'publish');
  const shareId = requireShareId(options.shareId, 'publish');
  const writeToken = requireWriteToken(options.writeToken, 'publish');
  const response = await shareFetch(
    fetcher,
    `${relay}/shares/${shareId}/${slot}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${writeToken}`,
        'Content-Type': 'application/octet-stream',
        'If-Match': ifMatch,
      },
      body: new Blob([toArrayBuffer(bytes)], { type: 'application/octet-stream' }),
    },
    'publish',
  );
  if (response.status === 412) throw new StaleShareGenerationError();
  if (!response.ok) throw await shareHttpError('publish', response);
  const generation = response.headers.get('ETag');
  if (!generation || generation.trim() === '' || generation.trim() === '""') {
    throw new ShareLinkError('The share link service gave an unreadable response.', {
      operation: 'publish',
      status: response.status,
    });
  }
  return { generation };
}

export interface GetShareBytesOptions {
  relayUrl: string;
  shareId: string;
  slot: ShareSlot;
  fetchImpl?: typeof fetch;
}

/** Fetch one slot of a share; null when the slot has never been published. */
export async function getShareBytes(
  options: GetShareBytesOptions,
): Promise<{ bytes: Uint8Array; generation: string } | null> {
  const fetcher = requireFetch(options.fetchImpl);
  const relay = relayFor(options.relayUrl, 'fetch');
  const shareId = requireShareId(options.shareId, 'fetch');
  const response = await shareFetch(
    fetcher,
    `${relay}/shares/${shareId}/${options.slot}`,
    {
      method: 'GET',
      cache: 'no-store',
    },
    'fetch',
  );
  if (response.status === 404) return null;
  if (!response.ok) throw await shareHttpError('fetch', response);
  const generation = response.headers.get('ETag');
  if (!generation || generation.trim() === '' || generation.trim() === '""') {
    throw new ShareLinkError('The share link service gave an unreadable response.', {
      operation: 'fetch',
      status: response.status,
    });
  }
  return { bytes: new Uint8Array(await response.arrayBuffer()), generation };
}

export interface DeleteShareOptions {
  relayUrl: string;
  shareId: string;
  writeToken: string;
  fetchImpl?: typeof fetch;
}

/** Unpublish a share. A missing share is already in the desired state. */
export async function deleteShare(options: DeleteShareOptions): Promise<void> {
  const fetcher = requireFetch(options.fetchImpl);
  const relay = relayFor(options.relayUrl, 'remove');
  const shareId = requireShareId(options.shareId, 'remove');
  const writeToken = requireWriteToken(options.writeToken, 'remove');
  const response = await shareFetch(
    fetcher,
    `${relay}/shares/${shareId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${writeToken}` },
    },
    'remove',
  );
  if (response.status === 404) return;
  if (!response.ok) throw await shareHttpError('remove', response);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function shareHttpError(
  operation: ShareLinkOperation,
  response: Response,
): Promise<ShareLinkError> {
  const detail =
    response.status === 413
      ? ' The course is too large for a share link. Send the course file instead.'
      : '';
  let reason = '';
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body?.error === 'string' && body.error !== '') reason = ` ${body.error}`;
  } catch {
    // The platform may have answered without a readable body.
  }
  const verb = operation === 'mint' ? 'create' : operation === 'fetch' ? 'fetch' : operation === 'remove' ? 'remove' : 'publish';
  return new ShareLinkError(
    `Could not ${verb} the share link (HTTP ${response.status}).${detail}${reason}`,
    { operation, status: response.status },
  );
}
