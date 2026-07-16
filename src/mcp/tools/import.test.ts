import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { createCourse, createLesson } from '../../db/repository';
import type { ToolContext } from '../types';
import { validateAndRun } from '../registry';
import * as tools from './import';

async function clearAll(): Promise<void> {
  await Promise.all([
    db.decks.clear(),
    db.cards.clear(),
    db.courses.clear(),
    db.lessons.clear(),
    db.notes.clear(),
    db.lessonCards.clear(),
    db.practiceNodes.clear(),
    db.courseExamDates.clear(),
    db.sequences.clear(),
    db.userPerformance.clear(),
  ]);
}

const ctx: ToolContext = { grant: null, agentId: 'test-agent' };

describe('mcp import tools', () => {
  beforeEach(clearAll);

  describe('lacuna.diff_import_preview', () => {
    it('writes nothing and reports everything as toCreate for a fresh course', async () => {
      const course = await createCourse('Course A');
      const res = await tools.diffImportPreview.handler(
        { courseId: course.id, items: [{ front: 'Q1', back: 'A1' }] },
        ctx,
      );
      expect(res.data.toCreate).toHaveLength(1);
      expect(await db.cards.where('courseId').equals(course.id).count()).toBe(0);
    });

    it('rejects an unknown courseId with not_found', async () => {
      const result = await validateAndRun(tools.diffImportPreview, { courseId: 'missing', items: [] }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });

    it('rejects an unknown lessonId with not_found', async () => {
      const course = await createCourse('Course A');
      const result = await validateAndRun(
        tools.diffImportPreview,
        { courseId: course.id, items: [{ front: 'Q1', back: 'A1', lessonId: 'missing' }] },
        ctx,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });
  });

  describe('lacuna.import_cards', () => {
    it('creates new cards into the course question bank', async () => {
      const course = await createCourse('Course A');
      const res = await tools.importCards.handler(
        { courseId: course.id, items: [{ front: 'Q1', back: 'A1' }, { front: 'Q2', back: 'A2' }] },
        ctx,
      );
      expect(res.data.createdCount).toBe(2);
      expect(res.data.skippedCount).toBe(0);
      expect(await db.cards.where('courseId').equals(course.id).count()).toBe(2);
    });

    it('creates cards into a lesson when lessonId is given', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const res = await tools.importCards.handler(
        { courseId: course.id, items: [{ front: 'Q1', back: 'A1', lessonId: lesson.id }] },
        ctx,
      );
      expect(res.data.createdCount).toBe(1);
      const created = await db.cards.get(res.data.createdIds[0]);
      expect(created?.primaryLessonId).toBe(lesson.id);
    });

    it('reports toUpdate candidates without applying them', async () => {
      const course = await createCourse('Course A');
      await tools.importCards.handler({ courseId: course.id, items: [{ front: 'Q1', back: 'A1' }] }, ctx);

      const res = await tools.importCards.handler(
        { courseId: course.id, items: [{ front: 'Q1', back: 'A1 revised' }] },
        ctx,
      );
      expect(res.data.createdCount).toBe(0);
      expect(res.data.toUpdate).toHaveLength(1);
      // The existing card's back is untouched — import never auto-applies an update.
      const cards = await db.cards.where('courseId').equals(course.id).toArray();
      expect(cards).toHaveLength(1);
      expect(cards[0].back).toBe('A1');
    });

    it('is idempotent: re-running the same payload creates nothing new the second time', async () => {
      const course = await createCourse('Course A');
      const items = [{ front: 'Q1', back: 'A1' }, { front: 'Q2', back: 'A2' }];

      const first = await tools.importCards.handler({ courseId: course.id, items }, ctx);
      expect(first.data.createdCount).toBe(2);

      const second = await tools.importCards.handler({ courseId: course.id, items }, ctx);
      expect(second.data.createdCount).toBe(0);
      expect(second.data.skippedCount).toBe(2);
      expect(await db.cards.where('courseId').equals(course.id).count()).toBe(2);
    });

    it('rejects an unknown courseId with not_found', async () => {
      const result = await validateAndRun(tools.importCards, { courseId: 'missing', items: [] }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });
  });
});
