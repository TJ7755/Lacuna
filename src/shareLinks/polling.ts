import { db } from '../db/schema';
import { decodeCourseFile, withCourseFileAssets } from '../db/courseFile';
import { isLineagePayload, mergeLineageUpdate } from '../db/mergeImport';
import { DEFAULT_RELAY_URL, getShareBytes, parseShareManifest } from './client';
import { listShareImports } from './linkStore';

/** Default minimum time between relay checks for one share link. */
export const SHARE_POLL_THROTTLE_MS = 3_600_000;

const THROTTLE_KEY = 'lacuna.sharePollCheckedAt';

export type SharePollStatus =
  | 'updated'
  | 'up-to-date'
  | 'throttled'
  | 'skipped'
  | 'failed';

/** Per-course outcome of a poll, for the caller to toast. Only `updated` needs one:
 *  the merged revision queues through the existing pending-review badge. */
export interface SharePollResult {
  courseId: string;
  shareId: string;
  status: SharePollStatus;
  /** The announced revision for `updated`, or the local one for `up-to-date`. */
  revision?: number;
  /** Human-readable reason for `skipped` and `failed` outcomes. */
  reason?: string;
}

export interface PollShareUpdatesOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  throttleMs?: number;
}

interface PollContext {
  fetchImpl: typeof fetch | undefined;
  nowFn: () => number;
  throttleMs: number;
}

function readThrottleMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(THROTTLE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const map: Record<string, number> = {};
    for (const [shareId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) map[shareId] = value;
    }
    return map;
  } catch {
    return {};
  }
}

function readLastPollAt(shareId: string): number | null {
  const value = readThrottleMap()[shareId];
  return typeof value === 'number' ? value : null;
}

function writeLastPollAt(shareId: string, at: number): void {
  try {
    const map = readThrottleMap();
    map[shareId] = at;
    localStorage.setItem(THROTTLE_KEY, JSON.stringify(map));
  } catch {
    // Throttle state is best-effort; a poll must never fail because it could not
    // be recorded.
  }
}

function failureReason(error: unknown): string {
  return error instanceof Error ? error.message : 'An unknown error occurred.';
}

/**
 * Check each share-linked course for a teacher republish. Never rejects and never
 * deletes anything: per-course failures are collected in the returned summary.
 * Merging a newer revision queues it through `mergeLineageUpdate`, so the existing
 * "Update available" badge appears without any new UI.
 */
export async function pollShareUpdates(
  options: PollShareUpdatesOptions = {},
): Promise<SharePollResult[]> {
  try {
    const context: PollContext = {
      fetchImpl: options.fetchImpl,
      nowFn: options.now ?? Date.now,
      throttleMs: options.throttleMs ?? SHARE_POLL_THROTTLE_MS,
    };
    let imports;
    try {
      imports = listShareImports();
    } catch {
      return [];
    }
    if (imports.length === 0) return [];
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return imports.map(({ shareId, courseId }) => ({
        courseId,
        shareId,
        status: 'skipped' as const,
        reason: 'Device is offline.',
      }));
    }
    const results: SharePollResult[] = [];
    for (const { shareId, courseId } of imports) {
      results.push(await pollOneCourse(courseId, shareId, context));
    }
    return results;
  } catch {
    return [];
  }
}

async function pollOneCourse(
  courseId: string,
  shareId: string,
  context: PollContext,
): Promise<SharePollResult> {
  try {
    const course = await db.courses.get(courseId);
    if (!course) {
      return { courseId, shareId, status: 'skipped', reason: 'Course no longer exists.' };
    }
    if (!course.distributedCopy) {
      return { courseId, shareId, status: 'skipped', reason: 'Course is not a shared copy.' };
    }
    const now = context.nowFn();
    const last = readLastPollAt(shareId);
    if (last !== null && now - last < context.throttleMs) {
      return { courseId, shareId, status: 'throttled' };
    }

    let meta;
    try {
      meta = await getShareBytes({
        relayUrl: DEFAULT_RELAY_URL,
        shareId,
        slot: 'meta',
        fetchImpl: context.fetchImpl,
      });
    } catch (error) {
      return { courseId, shareId, status: 'failed', reason: failureReason(error) };
    }
    if (meta === null) {
      writeLastPollAt(shareId, now);
      return { courseId, shareId, status: 'skipped', reason: 'Share is not published.' };
    }

    let manifest;
    try {
      manifest = parseShareManifest(meta.bytes);
    } catch (error) {
      return { courseId, shareId, status: 'failed', reason: failureReason(error) };
    }
    if (manifest.lineageId !== course.distributedCopy.lineageId) {
      writeLastPollAt(shareId, now);
      return { courseId, shareId, status: 'skipped', reason: 'Share points at another course.' };
    }
    const localRevision = course.distributedCopy.revision ?? 0;
    if (manifest.revision <= localRevision) {
      writeLastPollAt(shareId, now);
      return { courseId, shareId, status: 'up-to-date', revision: localRevision };
    }

    let payloadSlot;
    try {
      payloadSlot = await getShareBytes({
        relayUrl: DEFAULT_RELAY_URL,
        shareId,
        slot: 'payload',
        fetchImpl: context.fetchImpl,
      });
    } catch (error) {
      return { courseId, shareId, status: 'failed', reason: failureReason(error) };
    }
    if (payloadSlot === null) {
      return {
        courseId,
        shareId,
        status: 'failed',
        reason: 'An update was announced but no course file is published.',
      };
    }

    let file;
    try {
      file = await decodeCourseFile(new TextDecoder().decode(payloadSlot.bytes));
    } catch (error) {
      return { courseId, shareId, status: 'failed', reason: failureReason(error) };
    }
    if (!isLineagePayload(file.payload)) {
      writeLastPollAt(shareId, now);
      return { courseId, shareId, status: 'skipped', reason: 'Payload is not a lineage update.' };
    }

    // A slow fetch can return after a newer revision already merged: re-read
    // the local revision and stand down when this manifest is stale, so an
    // older poll can never roll the course (or its pending review) backwards.
    const fresh = await db.courses.get(course.id);
    const freshRevision = fresh?.distributedCopy?.revision ?? 0;
    if (!fresh?.distributedCopy || manifest.revision <= freshRevision) {
      writeLastPollAt(shareId, context.nowFn());
      return { courseId, shareId, status: 'up-to-date', revision: freshRevision };
    }

    try {
      // Media rides inside the course file, so persist its assets alongside
      // the merge exactly as the manual importer does — otherwise an update
      // carrying new images or audio leaves broken references behind.
      await withCourseFileAssets(file, () => mergeLineageUpdate(course.id, file.payload));
    } catch (error) {
      return { courseId, shareId, status: 'failed', reason: failureReason(error) };
    }
    writeLastPollAt(shareId, now);
    return { courseId, shareId, status: 'updated', revision: manifest.revision };
  } catch (error) {
    return { courseId, shareId, status: 'failed', reason: failureReason(error) };
  }
}
