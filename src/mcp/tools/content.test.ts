import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import {
  createCourse,
  createCourseCard,
  createLesson,
  createLessonCard,
  createSequence,
} from '../../db/repository';
import { createOcclusion } from '../../db/occlusionRepository';
import type { ToolContext } from '../types';
import { validateAndRun } from '../registry';
import * as tools from './content';

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
    db.occlusions.clear(),
    db.userPerformance.clear(),
  ]);
}

const ctx: ToolContext = { grant: null, agentId: 'test-agent' };

describe('mcp content tools', () => {
  beforeEach(clearAll);

  describe('lacuna.create_course / lacuna.update_course', () => {
    it('creates a course', async () => {
      const res = await tools.createCourse.handler({ name: 'Course A' }, ctx);
      expect(res.data.name).toBe('Course A');
    });

    it('updates a course', async () => {
      const course = await createCourse('Course A');
      const res = await tools.updateCourse.handler({ courseId: course.id, name: 'Course B' }, ctx);
      expect(res.data.id).toBe(course.id);
      expect((await db.courses.get(course.id))?.name).toBe('Course B');
    });

    it('rejects an unknown courseId with not_found', async () => {
      const result = await validateAndRun(tools.updateCourse, { courseId: 'missing' }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });

    it('rejects missing required input with a validation error', async () => {
      const result = await validateAndRun(tools.createCourse, {}, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('validation');
    });
  });

  describe('lacuna.create_lesson / lacuna.update_lesson', () => {
    it('creates a lesson', async () => {
      const course = await createCourse('Course A');
      const res = await tools.createLesson.handler({ courseId: course.id, name: 'Lesson 1' }, ctx);
      expect(res.data.courseId).toBe(course.id);
    });

    it('rejects an unknown courseId with not_found', async () => {
      const result = await validateAndRun(
        tools.createLesson,
        { courseId: 'missing', name: 'x' },
        ctx,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });

    it('updates a lesson', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const res = await tools.updateLesson.handler({ lessonId: lesson.id, name: 'Renamed' }, ctx);
      expect(res.data.id).toBe(lesson.id);
      expect((await db.lessons.get(lesson.id))?.name).toBe('Renamed');
    });

    it('rejects an unknown lessonId with not_found', async () => {
      const result = await validateAndRun(tools.updateLesson, { lessonId: 'missing' }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });
  });

  describe('lacuna.create_note / lacuna.update_note', () => {
    it('creates a note', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const res = await tools.createNote.handler(
        { lessonId: lesson.id, name: 'Note 1', content: 'hi' },
        ctx,
      );
      expect(res.data.content).toBe('hi');
    });

    it('rejects an unknown lessonId with not_found', async () => {
      const result = await validateAndRun(
        tools.createNote,
        { lessonId: 'missing', name: 'x' },
        ctx,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });

    it('updates a note', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const note = await tools.createNote.handler({ lessonId: lesson.id, name: 'Note 1' }, ctx);
      const res = await tools.updateNote.handler({ noteId: note.data.id, content: 'updated' }, ctx);
      expect(res.data.id).toBe(note.data.id);
      expect((await db.notes.get(note.data.id))?.content).toBe('updated');
    });

    it('rejects an unknown noteId with not_found', async () => {
      const result = await validateAndRun(tools.updateNote, { noteId: 'missing' }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });
  });

  describe('lacuna.create_card / lacuna.update_card', () => {
    it('creates an unassigned card in the course question bank when lessonId is omitted', async () => {
      const course = await createCourse('Course A');
      const res = await tools.createCard.handler(
        { courseId: course.id, type: 'front_back', front: 'q', back: 'a' },
        ctx,
      );
      expect(res.data.primaryLessonId ?? null).toBeNull();
    });

    it('creates a lesson card when lessonId is given', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const res = await tools.createCard.handler(
        { courseId: course.id, lessonId: lesson.id, type: 'front_back', front: 'q', back: 'a' },
        ctx,
      );
      expect(res.data.primaryLessonId).toBe(lesson.id);
    });

    it('creates numeric and compiled working item payloads', async () => {
      const course = await createCourse('Course A');
      const numeric = await tools.createCard.handler(
        {
          courseId: course.id,
          type: 'front_back',
          front: 'What is 2 + 2?',
          back: '',
          payload: { kind: 'numeric', answer: { kind: 'exact', value: '4' } },
        },
        ctx,
      );
      const working = await tools.createCard.handler(
        {
          courseId: course.id,
          type: 'front_back',
          front: 'Solve 2x = 8.',
          back: '',
          payload: {
            kind: 'working',
            scheme: '[1] substitution :: 2x = 8\n[1] answer :: equals :: 4',
            fixtures: [{ studentAnswer: ['2x = 8', '4'], expectedMarks: 2 }],
          },
        },
        ctx,
      );

      expect(numeric.data.payload).toEqual({
        v: 1,
        kind: 'numeric',
        answer: { kind: 'exact', value: '4' },
      });
      expect(working.data.payload).toMatchObject({ v: 1, kind: 'working' });
      expect(working.data.payload?.kind === 'working' && working.data.payload.scheme).toHaveLength(
        2,
      );
    });

    it('returns the shared compiler error for an invalid working payload', async () => {
      const course = await createCourse('Course A');
      const result = await validateAndRun(
        tools.createCard,
        {
          courseId: course.id,
          type: 'front_back',
          front: 'Broken',
          back: '',
          payload: { kind: 'working', scheme: '[1] answer :: equals ::', fixtures: [] },
        },
        ctx,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('validation');
        expect(result.error.message).toBe('Scheme line 1: Use the form equals :: value.');
      }
    });

    it('rejects an unknown courseId with not_found', async () => {
      const result = await validateAndRun(
        tools.createCard,
        { courseId: 'missing', type: 'front_back', front: 'q', back: 'a' },
        ctx,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });

    it('updates a card’s content fields', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
      const res = await tools.updateCard.handler(
        { cardId: card.id, front: 'q2', flagged: true },
        ctx,
      );
      expect(res.data.id).toBe(card.id);
      const updated = await db.cards.get(card.id);
      expect(updated?.front).toBe('q2');
      expect(updated?.flagged).toBe(true);
    });

    it('replaces a card payload through the same numeric validator', async () => {
      const course = await createCourse('Course A');
      const card = await createCourseCard(course.id, 'front_back', 'q', '');
      await tools.updateCard.handler(
        {
          cardId: card.id,
          payload: { kind: 'numeric', answer: { kind: 'within', value: '4', tolerance: 0.1 } },
        },
        ctx,
      );

      expect((await db.cards.get(card.id))?.payload).toEqual({
        v: 1,
        kind: 'numeric',
        answer: { kind: 'within', value: '4', tolerance: 0.1 },
      });
    });

    it('rejects an unknown cardId with not_found', async () => {
      const result = await validateAndRun(tools.updateCard, { cardId: 'missing' }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });

    it('refuses to edit a sequence-generated card', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      await createSequence(course.id, lesson.id, 'Sequence 1', [{ id: 'item-1', value: 'q' }]);
      const generated = await db.cards.where('sequenceItemId').equals('item-1').first();
      expect(generated).toBeDefined();

      const result = await validateAndRun(
        tools.updateCard,
        { cardId: generated!.id, front: 'edited' },
        ctx,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('conflict');
    });

    it('refuses to edit an occlusion-generated card', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      await createOcclusion(course.id, lesson.id, 'Occlusion 1', 'hash-1', [
        { id: 'region-1', role: 'label', shape: 'rectangle', x: 0, y: 0, w: 0.1, h: 0.1 },
      ]);
      const generated = await db.cards.where('occlusionRegionId').equals('region-1').first();
      expect(generated).toBeDefined();

      const result = await validateAndRun(
        tools.updateCard,
        { cardId: generated!.id, front: 'edited' },
        ctx,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('conflict');
    });
  });

  describe('lacuna.link_card_to_lesson', () => {
    it('links a card into an additional lesson', async () => {
      const course = await createCourse('Course A');
      const lesson1 = await createLesson(course.id, 'Lesson 1');
      const lesson2 = await createLesson(course.id, 'Lesson 2');
      const card = await createLessonCard(course.id, lesson1.id, 'front_back', 'q', 'a');

      const res = await tools.linkCardToLesson.handler(
        { lessonId: lesson2.id, cardId: card.id },
        ctx,
      );
      expect(res.data.lessonId).toBe(lesson2.id);
      expect(res.data.cardId).toBe(card.id);
    });

    it('is idempotent: repeated calls create no duplicate link rows', async () => {
      const course = await createCourse('Course A');
      const lesson1 = await createLesson(course.id, 'Lesson 1');
      const lesson2 = await createLesson(course.id, 'Lesson 2');
      const card = await createLessonCard(course.id, lesson1.id, 'front_back', 'q', 'a');

      const first = await tools.linkCardToLesson.handler(
        { lessonId: lesson2.id, cardId: card.id },
        ctx,
      );
      const second = await tools.linkCardToLesson.handler(
        { lessonId: lesson2.id, cardId: card.id },
        ctx,
      );
      expect(second.data.id).toBe(first.data.id);

      const links = await db.lessonCards.where('lessonId').equals(lesson2.id).toArray();
      expect(links).toHaveLength(1);
    });

    it('rejects an unknown lessonId or cardId with not_found', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');

      const missingLesson = await validateAndRun(
        tools.linkCardToLesson,
        { lessonId: 'missing', cardId: card.id },
        ctx,
      );
      expect(missingLesson.ok).toBe(false);
      if (!missingLesson.ok) expect(missingLesson.error.kind).toBe('not_found');

      const missingCard = await validateAndRun(
        tools.linkCardToLesson,
        { lessonId: lesson.id, cardId: 'missing' },
        ctx,
      );
      expect(missingCard.ok).toBe(false);
      if (!missingCard.ok) expect(missingCard.error.kind).toBe('not_found');
    });
  });

  describe('lacuna.create_sequence / lacuna.update_sequence', () => {
    it('creates a sequence and its generated cards', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const res = await tools.createSequence.handler(
        {
          courseId: course.id,
          lessonId: lesson.id,
          name: 'Sequence 1',
          items: [{ id: 'a', value: 'one' }],
        },
        ctx,
      );
      expect(res.data.name).toBe('Sequence 1');
      const generated = await db.cards.where('sequenceItemId').equals('a').count();
      expect(generated).toBe(1);
    });

    it('rejects an unknown courseId with not_found', async () => {
      const result = await validateAndRun(
        tools.createSequence,
        { courseId: 'missing', name: 'Sequence 1', items: [{ id: 'a', value: 'one' }] },
        ctx,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });

    it('updates a sequence, regenerating its cards', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const sequence = await createSequence(course.id, lesson.id, 'Sequence 1', [
        { id: 'a', value: 'one' },
      ]);

      const res = await tools.updateSequence.handler(
        {
          sequenceId: sequence.id,
          items: [
            { id: 'a', value: 'one' },
            { id: 'b', value: 'two' },
          ],
        },
        ctx,
      );
      expect(res.data.id).toBe(sequence.id);
      const generated = await db.cards.where('sequenceItemId').equals('b').count();
      expect(generated).toBe(1);
    });

    it('rejects an unknown sequenceId with not_found', async () => {
      const result = await validateAndRun(tools.updateSequence, { sequenceId: 'missing' }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });
  });

  describe('lacuna.create_occlusion / lacuna.update_occlusion', () => {
    const label = {
      id: 'region-1',
      role: 'label' as const,
      shape: 'rectangle' as const,
      x: 0.1,
      y: 0.1,
      w: 0.2,
      h: 0.1,
      answerText: 'Nucleus',
    };

    async function storeDiagram(hash = 'hash-1'): Promise<string> {
      await db.assets.put({
        hash,
        mimeType: 'image/png',
        blob: new Uint8Array([1, 2, 3]),
        kind: 'image',
        width: 800,
        height: 600,
        createdAt: Date.now(),
      });
      return hash;
    }

    it('creates an occlusion and one card per region', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const hash = await storeDiagram();

      const res = await tools.createOcclusion.handler(
        {
          courseId: course.id,
          lessonId: lesson.id,
          name: 'Plant cell',
          assetHash: hash,
          regions: [
            label,
            {
              id: 'region-2',
              role: 'feature',
              shape: 'rectangle',
              x: 0.5,
              y: 0.4,
              w: 0.1,
              h: 0.1,
              pairedRegionId: 'region-1',
            },
          ],
        },
        ctx,
      );

      expect(res.data.name).toBe('Plant cell');
      expect(await db.cards.where('occlusionRegionId').equals('region-1').count()).toBe(1);
      expect(await db.cards.where('occlusionRegionId').equals('region-2').count()).toBe(1);
    });

    it('rejects a diagram this install does not hold with not_found', async () => {
      const course = await createCourse('Course A');
      const result = await validateAndRun(
        tools.createOcclusion,
        { courseId: course.id, name: 'Plant cell', assetHash: 'absent', regions: [label] },
        ctx,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });

    it('rejects a pairing that names no label region in the same occlusion', async () => {
      const course = await createCourse('Course A');
      const hash = await storeDiagram();
      const result = await validateAndRun(
        tools.createOcclusion,
        {
          courseId: course.id,
          name: 'Plant cell',
          assetHash: hash,
          regions: [
            label,
            {
              id: 'region-2',
              role: 'feature',
              shape: 'rectangle',
              x: 0.5,
              y: 0.4,
              w: 0.1,
              h: 0.1,
              pairedRegionId: 'region-absent',
            },
          ],
        },
        ctx,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('validation');
    });

    it('rejects duplicate region ids', async () => {
      const course = await createCourse('Course A');
      const hash = await storeDiagram();
      const result = await validateAndRun(
        tools.createOcclusion,
        { courseId: course.id, name: 'Plant cell', assetHash: hash, regions: [label, label] },
        ctx,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('validation');
    });

    it('moving a region regenerates content without touching memory state', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const hash = await storeDiagram();
      const occlusion = await createOcclusion(course.id, lesson.id, 'Plant cell', hash, [label]);
      const generated = (await db.cards.where('occlusionRegionId').equals('region-1').first())!;
      await db.cards.update(generated.id, { reps: 3, stability: 9 });

      const res = await tools.updateOcclusion.handler(
        { occlusionId: occlusion.id, regions: [{ ...label, y: 0.6 }] },
        ctx,
      );

      expect(res.data.id).toBe(occlusion.id);
      expect((await db.occlusions.get(occlusion.id))!.regions[0].y).toBe(0.6);
      const after = await db.cards.where('occlusionRegionId').equals('region-1').toArray();
      expect(after).toHaveLength(1);
      expect(after[0].id).toBe(generated.id);
      expect(after[0].reps).toBe(3);
      expect(after[0].stability).toBe(9);
    });

    it('rejects an unknown occlusionId with not_found', async () => {
      const result = await validateAndRun(tools.updateOcclusion, { occlusionId: 'missing' }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });
  });

  describe('lacuna.create_course_assessment / lacuna.update_course_assessment', () => {
    it('creates an assessment with explicit placement, coverage and exclusions', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Q', 'A');
      const res = await tools.createCourseAssessment.handler(
        {
          courseId: course.id,
          name: 'Mid-term',
          examDate: Date.now() + 1000,
          afterLessonId: lesson.id,
          coverageMode: 'custom',
          lessonIds: [lesson.id],
          excludedCardIds: [card.id],
        },
        ctx,
      );
      expect(res.data.name).toBe('Mid-term');
      expect(res.data).toEqual(
        expect.objectContaining({
          afterLessonId: lesson.id,
          coverageMode: 'custom',
          lessonIds: [lesson.id],
          excludedCardIds: [card.id],
        }),
      );
    });

    it('rejects an unknown courseId with not_found', async () => {
      const result = await validateAndRun(
        tools.createCourseAssessment,
        {
          courseId: 'missing',
          name: 'x',
          examDate: Date.now(),
          afterLessonId: null,
          coverageMode: 'prefix',
        },
        ctx,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });

    it('updates an assessment', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const assessment = await tools.createCourseAssessment.handler(
        {
          courseId: course.id,
          name: 'Mid-term',
          examDate: Date.now() + 1000,
          afterLessonId: lesson.id,
          coverageMode: 'prefix',
        },
        ctx,
      );
      const res = await tools.updateCourseAssessment.handler(
        { assessmentId: assessment.data.id, name: 'Paper 1' },
        ctx,
      );
      expect(res.data.id).toBe(assessment.data.id);
      expect((await db.courseAssessments.get(assessment.data.id))?.name).toBe('Paper 1');
    });

    it('rejects an unknown assessmentId with not_found', async () => {
      const result = await validateAndRun(
        tools.updateCourseAssessment,
        { assessmentId: 'missing' },
        ctx,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });
  });
});
