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
  if (credentials) {
    try {
      await deleteShare({
        relayUrl: credentials.relayUrl,
        shareId,
        writeToken: credentials.writeToken,
        fetchImpl: options.fetchImpl,
      });
    } catch (err) {
      const gone =
        err instanceof ShareLinkError && (err.status === 404 || err.status === 401);
      if (!gone) throw err;
    }
    await forgetShareCredentials(shareId);
  }
  await clearCourseShareId(courseId);
}

/**
 * Publish (or republish) a course to its stable share link. The revision
 * counter bumps first so the packed payload carries the new revision, then
 * the course file and its polling manifest are uploaded. The first publish
 * mints the share id and remembers the write token on this device;
 * republishes reuse both, so the link never changes.
 */
export async function publishShareLink(
  courseId: string,
  options: PublishShareLinkOptions = {},
): Promise<PublishShareLinkResult> {
  const relayUrl = options.relayUrl ?? DEFAULT_RELAY_URL;
  const distribution = await publishCourse(courseId);
  const course = await db.courses.get(courseId);
  if (!course) throw new Error('The course could not be found.');

  const text = await buildCourseFile(courseId);
  const bytes = new TextEncoder().encode(text);
  assertSharePayloadSize(bytes.byteLength);

  let shareId = course.distribution?.shareId;
  let credentials = shareId ? await readShareCredentials(shareId) : null;
  if (!shareId || !credentials) {
    const minted = await mintShare(relayUrl, options.fetchImpl);
    shareId = minted.shareId;
    await setCourseShareId(courseId, shareId);
    credentials = { relayUrl, writeToken: minted.writeToken };
    await writeShareCredentials(shareId, credentials);
  }

  const putOptions = {
    relayUrl: credentials.relayUrl,
    shareId,
    writeToken: credentials.writeToken,
    fetchImpl: options.fetchImpl,
  };
  try {
    const put = await putShareBytes({
      ...putOptions,
      slot: 'payload',
      bytes,
      ifMatch: credentials.payloadGeneration ?? '"0"',
    });
    credentials = { ...credentials, payloadGeneration: put.generation };
  } catch (err) {
    if (!(err instanceof StaleShareGenerationError)) throw err;
    const current = await getShareBytes({ ...putOptions, slot: 'payload' });
    const put = await putShareBytes({
      ...putOptions,
      slot: 'payload',
      bytes,
      ifMatch: current?.generation ?? '"0"',
    });
    credentials = { ...credentials, payloadGeneration: put.generation };
  }

  const manifest: ShareManifest = {
    v: 1,
    lineageId: distribution.lineageId,
    revision: distribution.revision,
    publishedAt: distribution.publishedAt,
    byteSize: bytes.byteLength,
    courseName: course.name,
  };
  const metaPut = await putShareBytes({
    ...putOptions,
    slot: 'meta',
    bytes: new TextEncoder().encode(JSON.stringify(manifest)),
    ifMatch: credentials.metaGeneration ?? '"0"',
  });
  await writeShareCredentials(shareId, { ...credentials, metaGeneration: metaPut.generation });

  return { shareId, revision: distribution.revision, byteSize: bytes.byteLength };
}
