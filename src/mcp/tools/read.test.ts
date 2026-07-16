import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { createCourse, createLesson, createLessonCard, createSequence } from '../../db/repository';
import type { ToolContext } from '../types';
import { validateAndRun } from '../registry';
import * as tools from './read';

async function clearAll(): Promise<void> {
  await Promise.all([
    db.decks.clear(),
    db.cards.clear(),
    db.courses.clear(),
    db.lessons.clear(),
    db.notes.clear(),
    db.lessonCards.clear(),
    db.practiceNodes.clear(),
    db.courseAssessments.clear(),
    db.sequences.clear(),
    db.userPerformance.clear(),
  ]);
}

const ctx: ToolContext = { grant: null, agentId: 'test-agent' };

describe('mcp read tools', () => {
  beforeEach(clearAll);

  describe('lacuna.list_courses', () => {
    it('lists every course', async () => {
      const a = await createCourse('Course A');
      const b = await createCourse('Course B');
      const res = await tools.listCourses.handler({}, ctx);
      expect(res.data.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
    });
  });

  describe('lacuna.get_course', () => {
    it('fetches a course by id', async () => {
      const course = await createCourse('Course A');
      const res = await tools.getCourse.handler({ courseId: course.id }, ctx);
      expect(res.data.name).toBe('Course A');
    });

    it('maps a missing course to a not_found error via validateAndRun', async () => {
      const result = await validateAndRun(tools.getCourse, { courseId: 'missing' }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });

    it('maps invalid input to a validation error via validateAndRun', async () => {
      const result = await validateAndRun(tools.getCourse, {}, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('validation');
    });
  });

  describe('lacuna.list_lessons', () => {
    it('lists a course’s lessons', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const res = await tools.listLessons.handler({ courseId: course.id }, ctx);
      expect(res.data.map((l) => l.id)).toEqual([lesson.id]);
    });
  });

  describe('lacuna.list_cards', () => {
    it('lists a course’s cards when no lessonId is given', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
      const res = await tools.listCards.handler({ courseId: course.id }, ctx);
      expect(res.data.map((c) => c.id)).toEqual([card.id]);
    });

    it('scopes to a lesson when lessonId is given', async () => {
      const course = await createCourse('Course A');
      const lesson1 = await createLesson(course.id, 'Lesson 1');
      const lesson2 = await createLesson(course.id, 'Lesson 2');
      const inLesson1 = await createLessonCard(course.id, lesson1.id, 'front_back', 'q1', 'a1');
      await createLessonCard(course.id, lesson2.id, 'front_back', 'q2', 'a2');
      const res = await tools.listCards.handler({ courseId: course.id, lessonId: lesson1.id }, ctx);
      expect(res.data.map((c) => c.id)).toEqual([inLesson1.id]);
    });
  });

  describe('lacuna.get_card', () => {
    it('fetches a card by id', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
      const res = await tools.getCard.handler({ cardId: card.id }, ctx);
      expect(res.data.front).toBe('q');
    });

    it('maps a missing card to a not_found error via validateAndRun', async () => {
      const result = await validateAndRun(tools.getCard, { cardId: 'missing' }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });
  });

  describe('lacuna.list_due_cards', () => {
    it('returns due plus new cards, respecting limit', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const now = Date.now();
      const dueCard = await createLessonCard(course.id, lesson.id, 'front_back', 'due', 'a');
      await db.cards.update(dueCard.id, { due: now - 1000, state: 2 });
      await createLessonCard(course.id, lesson.id, 'front_back', 'new', 'a');

      const res = await tools.listDueCards.handler({ courseId: course.id }, ctx);
      expect(res.data.map((c) => c.id).sort()).toHaveLength(2);

      const limited = await tools.listDueCards.handler({ courseId: course.id, limit: 1 }, ctx);
      expect(limited.data).toHaveLength(1);
    });

    it('rejects a non-positive limit', async () => {
      const course = await createCourse('Course A');
      const result = await validateAndRun(
        tools.listDueCards,
        { courseId: course.id, limit: 0 },
        ctx,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('validation');
    });
  });

  describe('lacuna.get_weak_cards', () => {
    it('ranks leeches first', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const healthy = await createLessonCard(course.id, lesson.id, 'front_back', 'healthy', 'a');
      const leech = await createLessonCard(course.id, lesson.id, 'front_back', 'leech', 'a');
      await db.cards.update(leech.id, { lapses: 10, state: 2, due: Date.now() });

      const res = await tools.getWeakCards.handler({ courseId: course.id }, ctx);
      expect(res.data.map((w) => w.card.id).sort()).toEqual([healthy.id, leech.id].sort());
      expect(res.data[0].card.id).toBe(leech.id);
    });
  });

  describe('lacuna.get_course_stats', () => {
    it('bundles header and study stats for a course', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');

      const res = await tools.getCourseStats.handler({ courseId: course.id }, ctx);
      expect(res.data.cardCount).toBe(1);
      expect(res.data.lessonCount).toBe(1);
    });

    it('maps a missing course to a not_found error via validateAndRun', async () => {
      const result = await validateAndRun(tools.getCourseStats, { courseId: 'missing' }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });
  });

  describe('lacuna.list_sequences / lacuna.get_sequence', () => {
    it('lists and fetches sequences for a course', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
      const sequence = await createSequence(course.id, lesson.id, 'Sequence 1', [
        { id: 'item-1', value: 'q' },
      ]);

      const listed = await tools.listSequences.handler({ courseId: course.id }, ctx);
      expect(listed.data.map((s) => s.id)).toEqual([sequence.id]);

      const fetched = await tools.getSequence.handler({ sequenceId: sequence.id }, ctx);
      expect(fetched.data.name).toBe('Sequence 1');
    });

    it('maps a missing sequence to a not_found error via validateAndRun', async () => {
      const result = await validateAndRun(tools.getSequence, { sequenceId: 'missing' }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });
  });

  describe('lacuna.list_notes', () => {
    it('lists a lesson’s notes', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const res = await tools.listNotes.handler({ lessonId: lesson.id }, ctx);
      expect(res.data).toEqual([]);
    });
  });

  describe('lacuna.diagnostics_summary', () => {
    it('scopes counts to a course when courseId is given', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');

      const res = await tools.diagnosticsSummary.handler({ courseId: course.id }, ctx);
      expect('courseId' in res.data && res.data.courseId).toBe(course.id);
      expect('cards' in res.data && res.data.cards).toBe(1);
    });

    it('returns whole-database counts when courseId is omitted', async () => {
      await createCourse('Course A');
      const res = await tools.diagnosticsSummary.handler({}, ctx);
      expect('courses' in res.data).toBe(true);
    });
  });
});
