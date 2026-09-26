import { db } from '../db/schema';
import { buildCourseFile } from '../db/courseFile';
import { clearCourseShareId, publishCourse, setCourseShareId } from '../db/courseRepository';
import {
  DEFAULT_RELAY_URL,
  deleteShare,
  getShareBytes,
  mintShare,
  putShareBytes,
  ShareLinkError,
  StaleShareGenerationError,
  type ShareManifest,
} from './client';
import { forgetShareCredentials, readShareCredentials, writeShareCredentials } from './credentials';

/**
 * Mirror of the relay's `SHARE_PAYLOAD_MAX_BYTES`: payloads transit the relay
 * function body, which rejects inbound bodies above ~4.5 MB. Checked locally
 * so an oversized course fails fast without burning a revision bump or a
 * network round trip; those courses keep the manual `.lacuna` file path.
 */
export const SHARE_PAYLOAD_MAX_BYTES = 4 * 1024 * 1024;

export interface PublishShareLinkOptions {
  relayUrl?: string;
  fetchImpl?: typeof fetch;
  /**
   * Mint a fresh share id even when the course already has one. Only set
   * after the teacher explicitly accepts replacing a link managed elsewhere
   * (see ShareLinkNeedsReplacementError) — otherwise republishes reuse the
   * stable id so existing links keep working.
   */
  replaceLink?: boolean;
}

/** The course already has a share link whose write credentials live elsewhere. */
export class ShareLinkNeedsReplacementError extends Error {
  constructor(
    message = 'This course already has a share link managed on another device. ' +
      'Replacing it here creates a new link; the old link stays live until it expires.',
  ) {
    super(message);
    this.name = 'ShareLinkNeedsReplacementError';
  }
}

export interface PublishShareLinkResult {
  shareId: string;
  revision: number;
  byteSize: number;
}

/** Fail fast for courses the relay cannot carry; those keep the manual file path. */
export function assertSharePayloadSize(byteLength: number): void {
  if (byteLength > SHARE_PAYLOAD_MAX_BYTES) {
    throw new Error(
      'This course is too large for a share link (over 4 MB with media). Send the course file instead.',
    );
  }
}

export interface UnpublishShareLinkOptions {
  fetchImpl?: typeof fetch;
}

/**
 * Stop sharing a course's link. The relay copy is deleted so the link stops
 * resolving, the write credentials are forgotten on this device, and the
 * course drops its share id while keeping its lineage counter. Student copies
 * already imported are untouched — they simply receive no further updates. A
 * link that is already gone on the relay still clears local state.
 */
export async function unpublishShareLink(
  courseId: string,
  options: UnpublishShareLinkOptions = {},
): Promise<void> {
  const course = await db.courses.get(courseId);
  if (!course) throw new Error('The course could not be found.');
  const shareId = course.distribution?.shareId;
  if (!shareId) return;
  const credentials = await readShareCredentials(shareId);
  if (!credentials) {
    throw new Error(
      'This device cannot manage this share link (its write credentials are missing). ' +
        'The link stays live; stop sharing from the device that created it.',
    );
  }
  try {
    await deleteShare({
      relayUrl: credentials.relayUrl,
      shareId,
      writeToken: credentials.writeToken,
      fetchImpl: options.fetchImpl,
    });
  } catch (err) {
    // 404 means the relay copy is already gone, so local state can be
    // cleared. Anything else — a 401 rejection included — leaves the link
    // potentially live, so local state is kept and the failure is reported
    // rather than confirmed.
    if (!(err instanceof ShareLinkError && err.status === 404)) throw err;
  }
  await forgetShareCredentials(shareId);
  await clearCourseShareId(courseId);
}

/**
 * Publish (or republish) a course to its stable share link. The course file
 * is built once for a size check before the revision counter moves, so an
 * oversized course fails without consuming a revision; it is built again
 * after the bump so the uploaded payload carries the new revision. The share
 * id and write credentials are only recorded after both uploads succeed, so
 * a failed first publish leaves no dead link behind. A republish reuses both,
 * so the link never changes — unless the id belongs to another device, which
 * requires explicit replacement rather than a silent fork.
 */
export async function publishShareLink(
  courseId: string,
  options: PublishShareLinkOptions = {},
): Promise<PublishShareLinkResult> {
  const relayUrl = options.relayUrl ?? DEFAULT_RELAY_URL;
  const preflight = await db.courses.get(courseId);
  if (!preflight) throw new Error('The course could not be found.');
  assertSharePayloadSize(new TextEncoder().encode(await buildCourseFile(courseId)).byteLength);

  const distribution = await publishCourse(courseId);
  const course = await db.courses.get(courseId);
  if (!course) throw new Error('The course could not be found.');

  let shareId = course.distribution?.shareId;
  let credentials = shareId ? await readShareCredentials(shareId) : null;
  if (shareId && !credentials && !options.replaceLink) {
    throw new ShareLinkNeedsReplacementError();
  }
  if (!shareId || !credentials) {
    const minted = await mintShare(relayUrl, options.fetchImpl);
    shareId = minted.shareId;
    credentials = { relayUrl, writeToken: minted.writeToken };
  }

  const text = await buildCourseFile(courseId);
  const bytes = new TextEncoder().encode(text);
  const putOptions = {
    relayUrl: credentials.relayUrl,
    shareId,
    writeToken: credentials.writeToken,
    fetchImpl: options.fetchImpl,
  };
  const payloadGeneration = await putSlot(putOptions, 'payload', bytes, credentials.payloadGeneration);

  const manifest: ShareManifest = {
    v: 1,
    lineageId: distribution.lineageId,
    revision: distribution.revision,
    publishedAt: distribution.publishedAt,
    byteSize: bytes.byteLength,
    courseName: course.name,
  };
  const metaGeneration = await putSlot(
    putOptions,
    'meta',
    new TextEncoder().encode(JSON.stringify(manifest)),
    credentials.metaGeneration,
  );

  // Credentials first, link id second: a crash between the two leaves an
  // invisible orphan (swept by relay expiry, never shown to anyone) rather
  // than a visible link this device can no longer manage.
  await writeShareCredentials(shareId, { ...credentials, payloadGeneration, metaGeneration });
  await setCourseShareId(courseId, shareId, distribution.revision);

  return { shareId, revision: distribution.revision, byteSize: bytes.byteLength };
}

interface PutSlotOptions {
  relayUrl: string;
  shareId: string;
  writeToken: string;
  fetchImpl?: typeof fetch;
}

/**
 * Upload one share slot with compare-and-swap, recovering once from a stale
 * generation by re-reading the current one. Both payload and manifest share
 * this path: without the retry, one conflicting write would wedge all future
 * publishes behind a 412.
 */
async function putSlot(
  putOptions: PutSlotOptions,
  slot: 'payload' | 'meta',
  bytes: Uint8Array,
  generation: string | undefined,
): Promise<string> {
  try {
    const put = await putShareBytes({ ...putOptions, slot, bytes, ifMatch: generation ?? '"0"' });
    return put.generation;
  } catch (err) {
    if (!(err instanceof StaleShareGenerationError)) throw err;
    const current = await getShareBytes({ ...putOptions, slot });
    const retry = await putShareBytes({
      ...putOptions,
      slot,
      bytes,
      ifMatch: current?.generation ?? '"0"',
    });
    return retry.generation;
  }
}
