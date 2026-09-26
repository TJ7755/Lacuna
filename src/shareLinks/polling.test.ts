import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/schema';
import { createCourse } from '../db/courseRepository';
import type { ShareLesson, SharePayloadV2 } from '../db/share';
import { importLineageFirstTime } from '../db/mergeImport';
import { recordShareImport } from './linkStore';
import { pollShareUpdates } from './polling';

const SHARE_ID = 'a'.repeat(32);

function coursePayload(overrides: Partial<SharePayloadV2> = {}): SharePayloadV2 {
  return {
    v: 2,
    by: 'Ms Teacher',
    at: 1000,
    course: { n: 'Biology', o: 0, c: 1000, e: 2_000_000, um: 'open' },
    lessons: [],
    li: 'lineage-1',
    rv: 1,
    ...overrides,
  };
}

function lessonOne(overrides: Partial<ShareLesson> = {}): ShareLesson {
  return {
    i: 'lesson-1',
    n: 'Cells',
    notes: [{ oi: 'note-1', n: 'Intro', c: 'Cells are the basic unit of life.' }],
    cards: [{ id: 'card-1', k: 0 as const, f: 'What is a cell?', b: 'The basic unit of life.' }],
    ...overrides,
  };
}

function manifestBytes(revision: number): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      v: 1,
      lineageId: 'lineage-1',
      revision,
      publishedAt: 2000,
      byteSize: 10,
      courseName: 'Biology',
    }),
  );
}

function courseFileText(payload: SharePayloadV2): string {
  return JSON.stringify({ format: 'lacuna-course', version: 1, payload, assets: [] });
}

/** Copy bytes into a plain ArrayBuffer for Response bodies (mirrors client.ts). */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

/** Route share-slot GETs to canned slot bodies, recording which slots were read. */
function shareFetch(meta: Uint8Array | null, payloadText: string | null) {
  const seen: string[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (href.endsWith(`/shares/${SHARE_ID}/meta`)) {
      seen.push('meta');
      if (meta === null) {
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
      }
      return new Response(toArrayBuffer(meta), { status: 200, headers: { ETag: '"m1"' } });
    }
    if (href.endsWith(`/shares/${SHARE_ID}/payload`)) {
      seen.push('payload');
      if (payloadText === null) {
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
      }
      return new Response(toArrayBuffer(new TextEncoder().encode(payloadText)), {
        status: 200,
        headers: { ETag: '"p1"' },
      });
    }
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  });
  return { fetchImpl, seen };
}

beforeEach(async () => {
  localStorage.clear();
  await db.delete();
  await db.open();
});

describe('pollShareUpdates', () => {
  it('merges a newer teacher revision and queues it for review', async () => {
    const { course } = await importLineageFirstTime(coursePayload({ lessons: [lessonOne()] }));
    recordShareImport(SHARE_ID, course.id);
    const revised = coursePayload({
      rv: 2,
      at: 2000,
      lessons: [lessonOne({ n: 'Cells (revised)' })],
    });
    const { fetchImpl, seen } = shareFetch(manifestBytes(2), courseFileText(revised));

    const results = await pollShareUpdates({ fetchImpl, throttleMs: 0 });

    expect(results).toEqual([
      { courseId: course.id, shareId: SHARE_ID, status: 'updated', revision: 2 },
    ]);
    expect(seen).toEqual(['meta', 'payload']);
    expect((await db.courses.get(course.id))?.distributedCopy?.revision).toBe(2);
    const review = await db.pendingMergeReviews.where('courseId').equals(course.id).first();
    expect(review?.revision).toBe(2);
  });

  it('leaves an up-to-date course alone without fetching the payload', async () => {
    const { course } = await importLineageFirstTime(coursePayload({ lessons: [lessonOne()] }));
    recordShareImport(SHARE_ID, course.id);
    const { fetchImpl, seen } = shareFetch(
      manifestBytes(1),
      courseFileText(coursePayload({ rv: 99, lessons: [lessonOne({ n: 'Changed' })] })),
    );

    const results = await pollShareUpdates({ fetchImpl, throttleMs: 0 });

    expect(results).toEqual([
      { courseId: course.id, shareId: SHARE_ID, status: 'up-to-date', revision: 1 },
    ]);
    expect(seen).toEqual(['meta']);
    expect(await db.pendingMergeReviews.where('courseId').equals(course.id).count()).toBe(0);
  });

  it('throttles repeat polls within the window', async () => {
    const { course } = await importLineageFirstTime(coursePayload({ lessons: [lessonOne()] }));
    recordShareImport(SHARE_ID, course.id);
    const { fetchImpl } = shareFetch(manifestBytes(1), null);
    const now = 1_000_000;

    const first = await pollShareUpdates({ fetchImpl, now: () => now });
    expect(first[0]?.status).toBe('up-to-date');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const second = await pollShareUpdates({ fetchImpl, now: () => now + 1000 });
    expect(second).toEqual([{ courseId: course.id, shareId: SHARE_ID, status: 'throttled' }]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fails soft when the relay is unreachable', async () => {
    const { course } = await importLineageFirstTime(coursePayload({ lessons: [lessonOne()] }));
    recordShareImport(SHARE_ID, course.id);
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Load failed');
    });

    const results = await pollShareUpdates({ fetchImpl, throttleMs: 0 });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      courseId: course.id,
      shareId: SHARE_ID,
      status: 'failed',
    });
    expect((await db.courses.get(course.id))?.distributedCopy?.revision).toBe(1);
    expect(await db.pendingMergeReviews.where('courseId').equals(course.id).count()).toBe(0);
  });

  it('skips mappings with no local course or no shared copy', async () => {
    recordShareImport(SHARE_ID, 'missing-course-id');
    const local = await createCourse('Local notes');
    recordShareImport('b'.repeat(32), local.id);
    const fetchImpl = vi.fn();

    const results = await pollShareUpdates({ fetchImpl, throttleMs: 0 });

    expect(results).toEqual([
      {
        courseId: 'missing-course-id',
        shareId: SHARE_ID,
        status: 'skipped',
        reason: 'Course no longer exists.',
      },
      {
        courseId: local.id,
        shareId: 'b'.repeat(32),
        status: 'skipped',
        reason: 'Course is not a shared copy.',
      },
    ]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
