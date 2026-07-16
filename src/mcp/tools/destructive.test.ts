import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import {
  createCourse,
  createLesson,
  createLessonCard,
  createSequence,
} from '../../db/repository';
import type { ToolContext } from '../types';
import { validateAndRun } from '../registry';
import * as tools from './destructive';

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

describe('mcp destructive tools', () => {
  beforeEach(clearAll);

  describe('lacuna.delete_card', () => {
    it('deletes cards and returns an undo snapshot in the internal envelope', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');

      const res = await tools.deleteCard.handler({ ids: [card.id] }, ctx);
      expect(res.data.deletedCount).toBe(1);
      expect(res.undo).toBeDefined();
      expect(res.undo?.kind).toBe('restoreCards');
      expect(await db.cards.get(card.id)).toBeUndefined();
    });

    it('rejects an unknown card id with not_found', async () => {
      const result = await validateAndRun(tools.deleteCard, { ids: ['missing'] }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });

    it('refuses to delete a sequence-generated card, surfacing a conflict error', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      await createSequence(course.id, lesson.id, 'Sequence 1', [{ id: 'item-1', value: 'first thing' }]);
      const generatedCard = await db.cards.where('courseId').equals(course.id).first();
      expect(generatedCard).toBeDefined();

      const result = await validateAndRun(tools.deleteCard, { ids: [generatedCard!.id] }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('conflict');
      expect(await db.cards.get(generatedCard!.id)).toBeDefined();
    });
  });

  describe('lacuna.suspend_cards', () => {
    it('suspends and un-suspends cards', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');

      await tools.suspendCards.handler({ ids: [card.id], suspended: true }, ctx);
      expect((await db.cards.get(card.id))?.suspended).toBe(true);

      await tools.suspendCards.handler({ ids: [card.id], suspended: false }, ctx);
      expect((await db.cards.get(card.id))?.suspended).toBe(false);
    });

    it('rejects an unknown card id with not_found', async () => {
      const result = await validateAndRun(tools.suspendCards, { ids: ['missing'], suspended: true }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });
  });

  describe('lacuna.set_cards_flag', () => {
    it('sets and clears the flag', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');

      await tools.setCardsFlag.handler({ ids: [card.id], flagged: true }, ctx);
      expect((await db.cards.get(card.id))?.flagged).toBe(true);

      await tools.setCardsFlag.handler({ ids: [card.id], flagged: false }, ctx);
      expect((await db.cards.get(card.id))?.flagged).toBe(false);
    });
  });

  describe('lacuna.reschedule_cards', () => {
    it('resets a card to New', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
      await db.cards.update(card.id, { state: 2, stability: 5 });

      await tools.rescheduleCards.handler({ ids: [card.id], reset: true }, ctx);
      const updated = await db.cards.get(card.id);
      expect(updated?.state).toBe(0);
      expect(updated?.stability).toBeNull();
    });

    it('sets a specific due date', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
      const due = Date.now() + 86_400_000;

      await tools.rescheduleCards.handler({ ids: [card.id], due }, ctx);
      expect((await db.cards.get(card.id))?.due).toBe(due);
    });

    it('rejects a call with neither reset nor due at the validation boundary', async () => {
      const result = await validateAndRun(tools.rescheduleCards, { ids: ['x'] }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('validation');
    });
  });

  describe('lacuna.delete_lesson', () => {
    it('deletes a lesson', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');

      const res = await tools.deleteLesson.handler({ lessonId: lesson.id }, ctx);
      expect(res.data.id).toBe(lesson.id);
      expect(await db.lessons.get(lesson.id)).toBeUndefined();
    });

    it('rejects an unknown lessonId with not_found', async () => {
      const result = await validateAndRun(tools.deleteLesson, { lessonId: 'missing' }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });
  });

  describe('lacuna.delete_course', () => {
    it('deletes a course and returns an undo snapshot', async () => {
      const course = await createCourse('Course A');

      const res = await tools.deleteCourse.handler({ courseId: course.id }, ctx);
      expect(res.data.id).toBe(course.id);
      expect(res.undo?.kind).toBe('restoreCourse');
      expect(await db.courses.get(course.id)).toBeUndefined();
    });

    it('rejects an unknown courseId with not_found', async () => {
      const result = await validateAndRun(tools.deleteCourse, { courseId: 'missing' }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });
  });

  describe('lacuna.delete_sequence', () => {
    it('deletes a sequence and returns an undo snapshot', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const sequence = await createSequence(course.id, lesson.id, 'Sequence 1', [{ id: 'a', value: 'one' }]);

      const res = await tools.deleteSequence.handler({ sequenceId: sequence.id }, ctx);
      expect(res.data.id).toBe(sequence.id);
      expect(res.undo?.kind).toBe('restoreSequence');
      expect(await db.sequences.get(sequence.id)).toBeUndefined();
    });

    it('rejects an unknown sequenceId with not_found', async () => {
      const result = await validateAndRun(tools.deleteSequence, { sequenceId: 'missing' }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });
  });
});
