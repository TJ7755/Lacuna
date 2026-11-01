import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  assignCardsToLesson,
  createCard,
  createCourse,
  createCourseAssessment,
  createCourseCard,
  createLesson,
  createLessonCard,
  createNote,
  createSequence,
  deleteCards,
  deleteCourse,
  deleteCourseAssessment,
  deleteLesson,
  deleteNote,
  deleteSequence,
  linkCardsToLesson,
  markLessonComplete,
  restoreCourse,
  snapshotCourse,
  unlinkCardFromLesson,
  upsertLessonCardExposure,
} from './repository';
import { createOrResumeRevisionPlan } from './revisionPlanRepository';
import { createOcclusion, deleteOcclusion } from './occlusionRepository';
import {
  createPracticeNode,
  deletePracticeNode,
  savePracticeMilestoneProgress,
} from './practiceNodeRepository';
import {
  revisionFallback,
  labelRegion,
  expectedCourseTombstoneKeys,
  actualTombstoneKeys,
  tombstoneKey,
  reset,
} from './repository.mutation.testFixtures';

describe('repository deletion tombstones', () => {
  beforeEach(reset);

  it('tombstones a deleted card in the same transaction', async () => {
    const course = await createCourse('Biology');
    const card = await createCard(course.id, 'front_back', 'Q', 'A');
    await deleteCards([card.id]);
    expect(await db.cards.get(card.id)).toBeUndefined();
    expect(await db.tombstones.get(['cards', card.id])).toMatchObject({
      table: 'cards',
      recordId: card.id,
    });
  });

  it('writes one card tombstone per deleted card', async () => {
    const course = await createCourse('Biology');
    const first = await createCard(course.id, 'front_back', 'Q1', 'A1');
    const second = await createCard(course.id, 'front_back', 'Q2', 'A2');
    await deleteCards([first.id, second.id]);

    const cardTombstones = (await db.tombstones.toArray()).filter((row) => row.table === 'cards');
    expect(cardTombstones).toHaveLength(2);
    expect(cardTombstones.map((row) => row.recordId).sort()).toEqual([first.id, second.id].sort());
    expect(await db.cards.bulkGet([first.id, second.id])).toEqual([undefined, undefined]);
  });

  it('leaves no tombstone when deleteCards rolls back', async () => {
    const course = await createCourse('Biology');
    const card = await createCard(course.id, 'front_back', 'Q', 'A');

    const failCreating = () => {
      throw new Error('rollback');
    };
    db.tombstones.hook('creating', failCreating);
    try {
      await expect(deleteCards([card.id])).rejects.toThrow('rollback');
    } finally {
      db.tombstones.hook('creating').unsubscribe(failCreating);
    }

    expect(await db.cards.get(card.id)).toMatchObject({ id: card.id });
    expect(await db.tombstones.count()).toBe(0);
  });

  it('tombstones every snapshot-carried row in a full course cascade fixture', async () => {
    const now = Date.parse('2026-07-17T08:00:00Z');
    const course = await createCourse('Biology');
    const first = await createLesson(course.id, 'Cells');
    const second = await createLesson(course.id, 'Genetics');
    await createNote(first.id, 'Note 1', 'Body 1');
    await createNote(first.id, 'Note 2', 'Body 2');
    await createNote(second.id, 'Note 3', 'Body 3');
    await createNote(second.id, 'Note 4', 'Body 4');

    const primary = await createLessonCard(course.id, first.id, 'front_back', 'Q1', 'A1');
    await createLessonCard(course.id, first.id, 'front_back', 'Q2', 'A2');
    await createLessonCard(course.id, second.id, 'front_back', 'Q3', 'A3');
    await createLessonCard(course.id, second.id, 'front_back', 'Q4', 'A4');
    await createCourseCard(course.id, 'front_back', 'Q5', 'A5');
    await createCourseCard(course.id, 'front_back', 'Q6', 'A6');

    await linkCardsToLesson(second.id, [primary.id]);
    await upsertLessonCardExposure(first.id, primary.id, now);
    await markLessonComplete(first.id, now);

    const node = await createPracticeNode(course.id, { type: 'manual', name: 'Past paper' });
    await savePracticeMilestoneProgress(node.id, course.id, 'scope-1', 1, 2, false, now);

    const checkpoint = await createCourseAssessment(
      course.id,
      'Mock',
      Date.parse('2026-07-19T12:00:00Z'),
      { timeZone: 'UTC', afterLessonId: first.id },
    );
    await createOrResumeRevisionPlan(checkpoint.id, 20, revisionFallback, now);
    await createSequence(course.id, first.id, 'Organelles', [{ id: 'seq-1', value: 'Nucleus' }]);
    await createOcclusion(course.id, null, 'Diagram', 'hash-cascade', [labelRegion('occ-1')]);

    const snapshot = await snapshotCourse(course.id);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.lessons).toHaveLength(2);
    expect(snapshot!.notes).toHaveLength(4);
    expect(snapshot!.cards.length).toBeGreaterThanOrEqual(6);
    expect(snapshot!.occlusions).toHaveLength(1);
    expect(snapshot!.lessonCards.length).toBeGreaterThan(0);
    expect(snapshot!.practiceNodes).toHaveLength(1);
    expect(snapshot!.practiceMilestones).toHaveLength(1);
    expect(snapshot!.courseAssessments.length).toBeGreaterThanOrEqual(2);
    expect(snapshot!.revisionPlans).toHaveLength(1);
    expect(snapshot!.sequences).toHaveLength(1);
    expect(snapshot!.coursePerformance).toHaveLength(1);
    expect(snapshot!.schedulingPerformance.length).toBeGreaterThan(0);

    const expected = expectedCourseTombstoneKeys(snapshot!);
    expect(expected.has(tombstoneKey('lessonCards', snapshot!.lessonCards[0].id))).toBe(true);
    expect(expected.has(tombstoneKey('practiceNodes', node.id))).toBe(true);
    expect(expected.has(tombstoneKey('courseAssessments', checkpoint.id))).toBe(true);
    expect(expected.has(tombstoneKey('revisionPlans', snapshot!.revisionPlans[0].id))).toBe(true);
    expect(expected.has(tombstoneKey('sequences', snapshot!.sequences[0].id))).toBe(true);
    expect(expected.has(tombstoneKey('coursePerformance', course.id))).toBe(true);
    expect(
      expected.has(
        tombstoneKey('schedulingPerformance', snapshot!.schedulingPerformance[0].schedulingUnitId),
      ),
    ).toBe(true);

    await deleteCourse(course.id);

    expect(await actualTombstoneKeys()).toEqual(expected);
    expect((await db.tombstones.toArray()).some((row) => row.table === 'noteAnnotations')).toBe(
      false,
    );

    await restoreCourse(snapshot!);
    expect((await db.courses.get(course.id))?.updatedAt).toBe(snapshot!.course.updatedAt);
    expect(await db.tombstones.count()).toBe(0);
  });

  it('tombstones every snapshot-carried row when deleting a course, including occlusions', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Intro');
    await createNote(lesson.id, 'Notes', 'Body');
    await createCard(course.id, 'front_back', 'Q', 'A');
    const occlusion = await createOcclusion(course.id, null, 'Diagram', 'hash', []);

    const snapshot = await snapshotCourse(course.id);
    expect(snapshot?.occlusions).toHaveLength(1);

    await deleteCourse(course.id);

    const tombstones = await db.tombstones.toArray();
    const tables = new Set(tombstones.map((row) => row.table));
    expect(tables.has('courses')).toBe(true);
    expect(tables.has('lessons')).toBe(true);
    expect(tables.has('notes')).toBe(true);
    expect(tables.has('cards')).toBe(true);
    expect(tables.has('occlusions')).toBe(true);
    expect(tables.has('schedulingUnits')).toBe(true);
    expect(tombstones.some((row) => row.table === 'noteAnnotations')).toBe(false);
    expect(await db.occlusions.get(occlusion.id)).toBeUndefined();

    await restoreCourse(snapshot!);
    expect(await db.courses.get(course.id)).toMatchObject({
      name: 'Biology',
      updatedAt: snapshot!.course.updatedAt,
    });
    expect(await db.occlusions.get(occlusion.id)).toMatchObject({ id: occlusion.id });
    expect(await db.tombstones.count()).toBe(0);
  });

  it('does not tombstone cards when a lesson is deleted', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Intro');
    const card = await createCard(course.id, 'front_back', 'Q', 'A');
    await db.cards.update(card.id, { primaryLessonId: lesson.id });

    await deleteLesson(lesson.id);

    expect(await db.cards.get(card.id)).toMatchObject({ id: card.id, primaryLessonId: null });
    expect(await db.tombstones.get(['cards', card.id])).toBeUndefined();
    expect(await db.tombstones.get(['lessons', lesson.id])).toMatchObject({ table: 'lessons' });
  });

  it('tombstones a deleted note without tombstoning its annotations', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Intro');
    const note = await createNote(lesson.id, 'Notes', 'Body');
    await db.noteAnnotations.add({
      id: 'annotation-1',
      noteId: note.id,
      startOffset: 0,
      endOffset: 4,
      selectedText: 'Body',
      createdAt: 1,
      updatedAt: 1,
    });

    await deleteNote(note.id);

    expect(await db.notes.get(note.id)).toBeUndefined();
    expect(await db.tombstones.get(['notes', note.id])).toMatchObject({
      table: 'notes',
      recordId: note.id,
    });
    expect(await db.tombstones.get(['noteAnnotations', 'annotation-1'])).toBeUndefined();
    expect((await db.tombstones.toArray()).some((row) => row.table === 'noteAnnotations')).toBe(
      false,
    );
  });

  it('tombstones the link and exposure when unlinking a card from a lesson', async () => {
    const course = await createCourse('Biology');
    const primary = await createLesson(course.id, 'Cells');
    const linked = await createLesson(course.id, 'Review');
    const card = await createLessonCard(course.id, primary.id, 'front_back', 'Q', 'A');
    const [link] = await linkCardsToLesson(linked.id, [card.id]);
    await upsertLessonCardExposure(linked.id, card.id, 100);

    await unlinkCardFromLesson(linked.id, card.id);

    expect(await db.lessonCards.get(link.id)).toBeUndefined();
    expect(await db.lessonCardExposures.get([linked.id, card.id])).toBeUndefined();
    expect(await db.tombstones.get(['lessonCards', link.id])).toMatchObject({
      table: 'lessonCards',
      recordId: link.id,
    });
    expect(
      await db.tombstones.get(['lessonCardExposures', `${linked.id}:${card.id}`]),
    ).toMatchObject({
      table: 'lessonCardExposures',
      recordId: `${linked.id}:${card.id}`,
    });
    expect(await db.tombstones.get(['cards', card.id])).toBeUndefined();
  });

  it('tombstones the old primary exposure when assignCardsToLesson reassigns a card', async () => {
    const course = await createCourse('Biology');
    const first = await createLesson(course.id, 'Cells');
    const second = await createLesson(course.id, 'Respiration');
    const card = await createLessonCard(course.id, first.id, 'front_back', 'Q', 'A');
    await upsertLessonCardExposure(first.id, card.id, 100);

    await assignCardsToLesson([card.id], course.id, second.id);

    expect(await db.lessonCardExposures.get([first.id, card.id])).toBeUndefined();
    expect(
      await db.tombstones.get(['lessonCardExposures', `${first.id}:${card.id}`]),
    ).toMatchObject({
      table: 'lessonCardExposures',
      recordId: `${first.id}:${card.id}`,
    });
    expect(await db.tombstones.get(['cards', card.id])).toBeUndefined();
  });

  it('tombstones a deleted checkpoint and its cascaded revision plan', async () => {
    const now = Date.parse('2026-07-17T08:00:00Z');
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Q', 'A');
    await upsertLessonCardExposure(lesson.id, card.id, now - 1_000);
    const checkpoint = await createCourseAssessment(
      course.id,
      'Mock',
      Date.parse('2026-07-19T12:00:00Z'),
      { timeZone: 'UTC', afterLessonId: lesson.id },
    );
    const plan = await createOrResumeRevisionPlan(checkpoint.id, 20, revisionFallback, now);

    await deleteCourseAssessment(checkpoint.id);

    expect(await db.courseAssessments.get(checkpoint.id)).toBeUndefined();
    expect(await db.revisionPlans.get(plan.id)).toBeUndefined();
    expect(await db.tombstones.get(['courseAssessments', checkpoint.id])).toMatchObject({
      table: 'courseAssessments',
      recordId: checkpoint.id,
    });
    expect(await db.tombstones.get(['revisionPlans', plan.id])).toMatchObject({
      table: 'revisionPlans',
      recordId: plan.id,
    });
  });

  it('tombstones a deleted practice node and its milestone', async () => {
    const node = await createPracticeNode('course-1', { type: 'manual', name: 'Practice' });
    await savePracticeMilestoneProgress(node.id, 'course-1', 'scope-1', 2, 3, true, 100);

    await deletePracticeNode(node.id);

    expect(await db.practiceNodes.get(node.id)).toBeUndefined();
    expect(await db.practiceMilestones.get(node.id)).toBeUndefined();
    expect(await db.tombstones.get(['practiceNodes', node.id])).toMatchObject({
      table: 'practiceNodes',
      recordId: node.id,
    });
    expect(await db.tombstones.get(['practiceMilestones', node.id])).toMatchObject({
      table: 'practiceMilestones',
      recordId: node.id,
    });
  });

  it('tombstones a deleted sequence and the cards it generated', async () => {
    const course = await createCourse('Chemistry');
    const sequence = await createSequence(course.id, null, 'Halogens', [
      { id: 'del-seq-0', value: 'F' },
      { id: 'del-seq-1', value: 'Cl' },
    ]);
    const generated = await db.cards
      .where('sequenceItemId')
      .anyOf(['del-seq-0', 'del-seq-1'])
      .toArray();
    expect(generated).toHaveLength(2);

    await deleteSequence(sequence.id);

    expect(await db.sequences.get(sequence.id)).toBeUndefined();
    expect(await db.tombstones.get(['sequences', sequence.id])).toMatchObject({
      table: 'sequences',
      recordId: sequence.id,
    });
    for (const card of generated) {
      expect(await db.cards.get(card.id)).toBeUndefined();
      expect(await db.tombstones.get(['cards', card.id])).toMatchObject({
        table: 'cards',
        recordId: card.id,
      });
    }
  });

  it('tombstones a deleted occlusion and the cards it generated', async () => {
    const course = await createCourse('Biology');
    const occlusion = await createOcclusion(course.id, null, 'Cell', 'hash-del', [
      labelRegion('del-occ-0'),
      labelRegion('del-occ-1'),
    ]);
    const generated = await db.cards
      .where('occlusionRegionId')
      .anyOf(['del-occ-0', 'del-occ-1'])
      .toArray();
    expect(generated).toHaveLength(2);

    await deleteOcclusion(occlusion.id);

    expect(await db.occlusions.get(occlusion.id)).toBeUndefined();
    expect(await db.tombstones.get(['occlusions', occlusion.id])).toMatchObject({
      table: 'occlusions',
      recordId: occlusion.id,
    });
    for (const card of generated) {
      expect(await db.cards.get(card.id)).toBeUndefined();
      expect(await db.tombstones.get(['cards', card.id])).toMatchObject({
        table: 'cards',
        recordId: card.id,
      });
    }
  });
});
