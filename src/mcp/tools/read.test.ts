import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/schema';
import {
  createCourse,
  createCourseAssessment,
  createLesson,
  createLessonCard,
  createSequence,
} from '../../db/repository';
import { createOcclusion } from '../../db/occlusionRepository';
import type { ToolContext } from '../types';
import { validateAndRun } from '../registry';
import * as tools from './read';

async function clearAll(): Promise<void> {
  await Promise.all([
    db.schedulingUnits.clear(),
    db.cards.clear(),
    db.courses.clear(),
    db.lessons.clear(),
    db.notes.clear(),
    db.lessonCards.clear(),
    db.practiceNodes.clear(),
    db.courseAssessments.clear(),
    db.sequences.clear(),
    db.occlusions.clear(),
    db.userPerformance.clear(),
  ]);
}

const ctx: ToolContext = { grant: null, agentId: 'test-agent' };

describe('mcp read tools', () => {
  beforeEach(clearAll);
  afterEach(() => vi.restoreAllMocks());

  describe('lacuna.list_courses', () => {
    it('lists every course', async () => {
      const a = await createCourse('Course A');
      const b = await createCourse('Course B');
      const res = await tools.listCourses.handler({}, ctx);
      expect(res.data.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
    });
  });

  describe('lacuna.find_course', () => {
    it('resolves names without returning full scheduling records', async () => {
      const biology = await createCourse('Biology Core');
      await createCourse('Chemistry');
      await createLesson(biology.id, 'Cells');
      await createLessonCard(biology.id, (await createLesson(biology.id, 'Genetics')).id, 'front_back', 'DNA', 'A polymer');

      const res = await tools.findCourse.handler({ query: 'biology', limit: 10 }, ctx);

      expect(res.data).toEqual({
        matches: [{
          courseId: biology.id,
          name: 'Biology Core',
          archived: false,
          lessonCount: 2,
          cardCount: 1,
        }],
      });
      expect(res.data.matches[0]).not.toHaveProperty('fsrsParameters');
    });

    it('counts records without hydrating Card review history', async () => {
      const course = await createCourse('Biology Core');
      const lesson = await createLesson(course.id, 'Cells');
      await createLessonCard(course.id, lesson.id, 'front_back', 'DNA', 'A polymer');
      const historyQuery = vi.spyOn(db.reviewHistory, 'where');

      const res = await tools.findCourse.handler({ query: course.id, limit: 10 }, ctx);

      expect(res.data.matches[0]).toMatchObject({ lessonCount: 1, cardCount: 1 });
      expect(historyQuery).not.toHaveBeenCalled();
    });
  });

  describe('lacuna.search_cards', () => {
    it('accepts a course name and returns compact cursor-paginated cards', async () => {
      const course = await createCourse('Religious Studies');
      const lesson = await createLesson(course.id, 'Ethics');
      await createLessonCard(course.id, lesson.id, 'front_back', 'Abortion', 'A moral issue');
      await createLessonCard(course.id, lesson.id, 'front_back', 'Euthanasia', 'Another issue');

      const first = await tools.searchCards.handler(
        { course: 'religious studies', query: 'issue', limit: 1, includePayload: false },
        ctx,
      );
      expect(first.data).toMatchObject({
        course: { courseId: course.id, name: 'Religious Studies' },
        total: 2,
        cards: [{ front: 'Abortion', back: 'A moral issue', lesson: 'Ethics' }],
        nextCursor: expect.any(String),
      });
      expect(first.data.cards[0]).not.toHaveProperty('history');
      expect(first.data.cards[0]).not.toHaveProperty('stability');

      const second = await tools.searchCards.handler(
        {
          course: course.id,
          query: 'issue',
          limit: 1,
          cursor: first.data.nextCursor,
          includePayload: false,
        },
        ctx,
      );
      expect(second.data.cards).toEqual([
        expect.objectContaining({ front: 'Euthanasia', lesson: 'Ethics' }),
      ]);
      expect(second.data.nextCursor).toBeUndefined();
    });

    it('returns concise choices instead of guessing an ambiguous course', async () => {
      const core = await createCourse('Biology Core');
      const full = await createCourse('Biology Full');

      const result = await validateAndRun(
        tools.searchCards,
        { course: 'biology', query: 'cell' },
        ctx,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { kind: 'conflict', message: expect.stringContaining('Biology Core') },
      });
      if (result.ok) throw new Error('Expected an ambiguous Course error.');
      expect(result.error.message).toContain(core.id);
      expect(result.error.message).toContain(full.id);
    });

    it('does not hydrate review history for compact search results', async () => {
      const course = await createCourse('Biology');
      const lesson = await createLesson(course.id, 'Cells');
      await createLessonCard(course.id, lesson.id, 'front_back', 'DNA', 'A polymer');
      const historyQuery = vi.spyOn(db.reviewHistory, 'where');

      const result = await tools.searchCards.handler({ course: course.id, query: 'DNA' }, ctx);

      expect(result.data.cards).toHaveLength(1);
      expect(historyQuery).not.toHaveBeenCalled();
    });

    it('rejects a cursor reused with another query or Course', async () => {
      const firstCourse = await createCourse('Biology');
      const firstLesson = await createLesson(firstCourse.id, 'Cells');
      await createLessonCard(firstCourse.id, firstLesson.id, 'front_back', 'DNA issue', 'A polymer');
      await createLessonCard(firstCourse.id, firstLesson.id, 'front_back', 'RNA issue', 'Another polymer');
      const secondCourse = await createCourse('Chemistry');
      const secondLesson = await createLesson(secondCourse.id, 'Atoms');
      await createLessonCard(secondCourse.id, secondLesson.id, 'front_back', 'Bond issue', 'One');
      await createLessonCard(secondCourse.id, secondLesson.id, 'front_back', 'Ion issue', 'Two');
      const first = await tools.searchCards.handler(
        { course: firstCourse.id, query: 'issue', limit: 1 },
        ctx,
      );

      for (const input of [
        { course: firstCourse.id, query: 'polymer', limit: 1, cursor: first.data.nextCursor },
        { course: secondCourse.id, query: 'issue', limit: 1, cursor: first.data.nextCursor },
      ]) {
        const result = await validateAndRun(tools.searchCards, input, ctx);
        expect(result).toMatchObject({
          ok: false,
          error: { kind: 'validation', message: 'The Card cursor is invalid or expired.' },
        });
      }
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

  describe('lacuna.list_course_assessments / lacuna.get_course_assessment', () => {
    it('returns full assessment semantics and authoritative resolved scope', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
      const assessment = await createCourseAssessment(course.id, 'Mid-term', Date.now() + 1000, {
        afterLessonId: lesson.id,
        coverageMode: 'custom',
        lessonIds: [lesson.id],
        excludedCardIds: [card.id],
      });

      const listed = await tools.listCourseAssessments.handler({ courseId: course.id }, ctx);
      expect(listed.data).toHaveLength(2);
      const fetched = await tools.getCourseAssessment.handler(
        { assessmentId: assessment.id },
        ctx,
      );
      expect(fetched.data.assessment).toEqual(assessment);
      expect(fetched.data.coveredLessonIds).toEqual([lesson.id]);
      expect(fetched.data.cardIds).toEqual([]);
      expect(fetched.data.validation.valid).toBe(true);
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

    it('lists and fetches occlusions, including their fractional region coordinates', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const occlusion = await createOcclusion(course.id, lesson.id, 'Plant cell', 'hash-1', [
        { id: 'region-1', role: 'label', shape: 'rectangle', x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
      ]);

      const listed = await tools.listOcclusions.handler({ courseId: course.id }, ctx);
      expect(listed.data.map((o) => o.id)).toEqual([occlusion.id]);

      const fetched = await tools.getOcclusion.handler({ occlusionId: occlusion.id }, ctx);
      expect(fetched.data.name).toBe('Plant cell');
      expect(fetched.data.regions[0]).toMatchObject({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
    });

    it('maps a missing occlusion to a not_found error via validateAndRun', async () => {
      const result = await validateAndRun(tools.getOcclusion, { occlusionId: 'missing' }, ctx);
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
