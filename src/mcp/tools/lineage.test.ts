import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { encodeShareDirect, type SharePayload } from '../../db/share';
import { importLineageFirstTime } from '../../db/mergeImport';
import type { ToolContext } from '../types';
import { validateAndRun } from '../registry';
import * as tools from './lineage';

// Arc 7 §7.7/§7.9 Task 10: MCP tools for the lineage merge path. Fixtures mirror
// src/db/mergeImport.test.ts's own (payload literals bypassing UI-side building, matching
// the real wire shape: `li`/`rv` at the payload level, `i` on ShareLesson, `oi` on
// ShareNote, ShareCard's `id` doubling as the originating card id).

function coursePayload(overrides: Partial<SharePayload & { v: 2 }> = {}): SharePayload {
  return {
    v: 2,
    by: 'Ms Teacher',
    at: 1000,
    course: { n: 'Biology', o: 0, c: 1000, e: 2_000_000, um: 'open' },
    lessons: [],
    li: 'lineage-1',
    rv: 1,
    ...overrides,
  } as SharePayload;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixture literal, mirrors mergeImport.test.ts's own untyped lessonOne helper.
function lessonOne(overrides: Partial<any> = {}) {
  return {
    i: 'lesson-1',
    n: 'Cells',
    notes: [{ oi: 'note-1', n: 'Intro', c: 'Cells are the basic unit of life.' }],
    cards: [{ id: 'card-1', k: 0 as const, f: 'What is a cell?', b: 'The basic unit of life.' }],
    ...overrides,
  };
}

const ctx: ToolContext = { grant: null, agentId: 'test-agent' };

describe('mcp lineage tools', () => {
  let courseId: string;

  beforeEach(async () => {
    await db.delete();
    await db.open();
    const { course } = await importLineageFirstTime(coursePayload({ lessons: [lessonOne()] }));
    courseId = course.id;
  });

  describe('lacuna.diff_lineage_update', () => {
    it('classifies a teacher update without writing anything', async () => {
      const code = await encodeShareDirect(coursePayload({ rv: 2, lessons: [lessonOne({ n: 'Cells (revised)' })] }));
      const res = await tools.diffLineageUpdate.handler({ courseId, shareCode: code }, ctx);

      expect(res.data.counts).toMatchObject({
        createLessons: 0,
        updateLessons: 1,
        conflicts: 0,
      });
      expect(res.data.diff.updates.lessons).toEqual([{ id: 'lesson-1', name: 'Cells (revised)' }]);

      // Read-only: the local lesson is untouched and no review row was queued.
      const lesson = await db.lessons.get('lesson-1');
      expect(lesson?.name).toBe('Cells');
      expect(await db.pendingMergeReviews.where('courseId').equals(courseId).count()).toBe(0);
      expect((await db.courses.get(courseId))?.distributedCopy?.revision).toBe(1);
    });

    it('reports a conflict when the student has edited an entity the teacher also changed', async () => {
      await db.notes.update('note-1', { content: 'My own rewritten notes.' });
      const code = await encodeShareDirect(
        coursePayload({
          rv: 2,
          lessons: [lessonOne({ notes: [{ oi: 'note-1', n: 'Intro', c: 'Teacher rewrote this too.' }] })],
        }),
      );
      const res = await tools.diffLineageUpdate.handler({ courseId, shareCode: code }, ctx);
      expect(res.data.counts.conflicts).toBe(1);
      expect(res.data.diff.conflicts[0]).toMatchObject({ entityId: 'note-1', kind: 'note' });
      // Still untouched — this is only a preview.
      expect((await db.notes.get('note-1'))?.content).toBe('My own rewritten notes.');
    });

    it('rejects an unknown courseId with not_found', async () => {
      const code = await encodeShareDirect(coursePayload({ rv: 2, lessons: [lessonOne()] }));
      const result = await validateAndRun(tools.diffLineageUpdate, { courseId: 'missing', shareCode: code }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });

    it('rejects a share code that does not carry a lineage', async () => {
      const code = await encodeShareDirect({
        v: 2,
        by: 'Someone',
        at: 1000,
        course: { n: 'Plain course', o: 0, c: 1000, e: 2_000_000, um: 'open' },
        lessons: [],
      } as SharePayload);
      const result = await validateAndRun(tools.diffLineageUpdate, { courseId, shareCode: code }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('validation');
    });

    it('is declared read-tier', () => {
      expect(tools.diffLineageUpdate.requiredScope).toBe('read');
    });
  });

  describe('lacuna.apply_lineage_update', () => {
    it('is declared write-tier', () => {
      expect(tools.applyLineageUpdate.requiredScope).toBe('write');
    });

    it('applies creates immediately and matches mergeLineageUpdate\'s own outcome on the same fixture', async () => {
      const payload = coursePayload({
        rv: 2,
        lessons: [lessonOne(), lessonOne({ i: 'lesson-2', n: 'Genetics', notes: [], cards: [] })],
      });
      const code = await encodeShareDirect(payload);
      const res = await tools.applyLineageUpdate.handler({ courseId, shareCode: code }, ctx);

      expect(res.data.merge.createdLessons).toBe(1);
      expect(res.data.merge.queuedForReview).toBe(false);
      expect(res.data.queuedForReview).toBe(false);
      expect(await db.lessons.get('lesson-2')).toBeDefined();
    });

    it('queues a teacher update for review when autoAcceptUpdates is false, matching mergeLineageUpdate\'s own outcome shape', async () => {
      const payload = coursePayload({ rv: 2, lessons: [lessonOne({ n: 'Cells (revised)' })] });
      const code = await encodeShareDirect(payload);
      const res = await tools.applyLineageUpdate.handler({ courseId, shareCode: code }, ctx);

      expect(res.data.merge).toMatchObject({
        appliedUpdates: 0,
        appliedRemovals: 0,
        queuedForReview: true,
        conflictCount: 0,
      });
      expect(res.data.queuedForReview).toBe(true);
      expect((await db.lessons.get('lesson-1'))?.name).toBe('Cells'); // untouched until reviewed

      const review = await db.pendingMergeReviews.where('courseId').equals(courseId).first();
      expect(review?.id).toBe(res.data.reviewId);
    });

    it('pre-resolves a queued update via decisions.accept, matching acceptMergeReviewItems', async () => {
      const payload = coursePayload({ rv: 2, lessons: [lessonOne({ n: 'Cells (revised)' })] });
      const code = await encodeShareDirect(payload);
      const res = await tools.applyLineageUpdate.handler(
        { courseId, shareCode: code, decisions: { accept: [{ kind: 'lesson', entityId: 'lesson-1' }] } },
        ctx,
      );

      expect(res.data.queuedForReview).toBe(false);
      expect((await db.lessons.get('lesson-1'))?.name).toBe('Cells (revised)');
      expect(await db.pendingMergeReviews.where('courseId').equals(courseId).count()).toBe(0);
    });

    it('pre-resolves a queued removal via decisions.reject, keeping the local copy and clearing the queue entry', async () => {
      const payload = coursePayload({ rv: 2, lessons: [lessonOne({ cards: [] })] });
      const code = await encodeShareDirect(payload);
      const res = await tools.applyLineageUpdate.handler(
        { courseId, shareCode: code, decisions: { reject: [{ kind: 'card', entityId: 'card-1' }] } },
        ctx,
      );

      expect(res.data.queuedForReview).toBe(false);
      expect(await db.cards.get('card-1')).toBeDefined();
      expect(await db.pendingMergeReviews.where('courseId').equals(courseId).count()).toBe(0);
    });

    it('rejects an unknown courseId with not_found', async () => {
      const code = await encodeShareDirect(coursePayload({ rv: 2, lessons: [lessonOne()] }));
      const result = await validateAndRun(tools.applyLineageUpdate, { courseId: 'missing', shareCode: code }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });
  });
});
