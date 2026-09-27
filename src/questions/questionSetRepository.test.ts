import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createCourse } from '../db/repository';
import { createLessonCard } from '../db/cardRepository';
import { deleteCourse, restoreCourse, snapshotCourse } from '../db/courseRepository';
import { createCourseAssessment, deleteCourseAssessment } from '../db/assessmentRepository';
import { createLesson, deleteLesson, restoreLesson, snapshotLesson } from '../db/lessonRepository';
import { db } from '../db/schema';
import { assetUrl, collectOrphanedAssets } from '../db/assets';
import { createConcept, deleteConcept } from './repository';
import { parseQuestionSetRecord } from './questionSetCodec';
import {
  createQuestionSet,
  deleteQuestionSet,
  getQuestionSet,
  listQuestionSetsForAssessment,
  listQuestionSetsForCard,
  listQuestionSetsForConcept,
  listQuestionSetsForLesson,
  listQuestionSets,
  removeAuthoredQuestionSet,
  updateQuestionSet,
} from './questionSetRepository';
import { createQuestionSetDraft, createEmptyQuestionSetDraft, loadQuestionSetDraft, saveQuestionSetDraft } from './questionSetDrafts';
import { startQuestionSetAttempt } from './questionSetAttemptRepository';
import type { QuestionSet } from './questionSets';

function content(
  courseId: string,
  lessonId: string,
  assessmentId: string,
  conceptId: string,
): QuestionSet {
  return {
    id: 'set-1',
    courseId,
    title: 'Cell structure',
    lessonIds: [lessonId],
    assessmentIds: [assessmentId],
    questions: [
      {
        id: 'question-1',
        prompt: 'Explain the role of the nucleus.',
        parts: [],
        answer: {
          maxMarks: 1,
          response: { kind: 'written' },
          prerequisiteConceptIds: [],
          allocations: [
            {
              id: 'allocation-1',
              criterion: 'Identifies control of cell activities.',
              maxMarks: 1,
              dimension: 'knowledge',
              targetConceptIds: [conceptId],
            },
          ],
        },
      },
    ],
  };
}

async function fixture() {
  const course = await createCourse('Biology');
  const lesson = await createLesson(course.id, 'Cells');
  const assessment = (await db.courseAssessments.where('courseId').equals(course.id).first())!;
  const concept = await createConcept(course.id, 'Nucleus function');
  return { course, lesson, assessment, concept };
}

describe('Question-set codec', () => {
  it('strictly parses a complete stored aggregate and rejects unknown or malformed data', () => {
    const record = {
      ...content('course-1', 'lesson-1', 'assessment-1', 'concept-1'),
      contentVersion: 1,
      contentRevisionId: 'revision-1',
      createdAt: 100,
      updatedAt: 100,
    };

    expect(parseQuestionSetRecord(record)).toEqual(record);
    expect(() => parseQuestionSetRecord({ ...record, surprise: true })).toThrow('surprise');
    expect(() => parseQuestionSetRecord({ ...record, questions: 'wrong' })).toThrow();
    expect(() => parseQuestionSetRecord({ ...record, updatedAt: Number.NaN })).toThrow();
  });
});

describe('Question-set repository', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  it('creates and lists an atomically validated same-Course aggregate', async () => {
    const { course, lesson, assessment, concept } = await fixture();
    const set = content(course.id, lesson.id, assessment.id, concept.id);

    const created = await createQuestionSet(set, 1_000);

    expect(created).toMatchObject({ contentVersion: 1, createdAt: 1_000, updatedAt: 1_000 });
    expect(created.contentRevisionId).not.toBe('');
    expect(await getQuestionSet(set.id)).toEqual(created);
    expect(await listQuestionSets(course.id)).toEqual([created]);
  });

  it('rejects cross-Course references without persisting a partial aggregate', async () => {
    const { course, lesson, assessment } = await fixture();
    const other = await createCourse('Chemistry');
    const foreignConcept = await createConcept(other.id, 'Ionic bond');
    const set = content(course.id, lesson.id, assessment.id, foreignConcept.id);

    await expect(createQuestionSet(set, 1_000)).rejects.toThrow('Concept');
    expect(await db.questionSets.get(set.id)).toBeUndefined();
  });

  it('revisions changed content, preserves identical content, and rejects stale editors', async () => {
    const { course, lesson, assessment, concept } = await fixture();
    const set = content(course.id, lesson.id, assessment.id, concept.id);
    const created = await createQuestionSet(set, 1_000);

    const unchanged = await updateQuestionSet(set.id, structuredClone(set), {
      expectedContentRevisionId: created.contentRevisionId,
      now: 2_000,
    });
    expect(unchanged).toEqual(created);

    const changedContent = { ...set, title: 'Cell organelles' };
    const changed = await updateQuestionSet(set.id, changedContent, {
      expectedContentRevisionId: created.contentRevisionId,
      now: 3_000,
    });
    expect(changed).toMatchObject({
      title: 'Cell organelles',
      contentVersion: 2,
      updatedAt: 3_000,
    });
    expect(changed.contentRevisionId).not.toBe(created.contentRevisionId);

    const backwardsClock = await updateQuestionSet(
      set.id,
      { ...changedContent, title: 'Cell organelles and transport' },
      { expectedContentRevisionId: changed.contentRevisionId, now: 3_000 },
    );
    expect(backwardsClock).toMatchObject({ contentVersion: 3, updatedAt: 3_001 });

    await expect(
      updateQuestionSet(
        set.id,
        { ...set, title: 'Stale title' },
        {
          expectedContentRevisionId: created.contentRevisionId,
          now: 4_000,
        },
      ),
    ).rejects.toThrow('changed since it was opened');
  });

  it('deletes current content and records a questionSets tombstone', async () => {
    const { course, lesson, assessment, concept } = await fixture();
    const created = await createQuestionSet(
      content(course.id, lesson.id, assessment.id, concept.id),
      1_000,
    );

    await deleteQuestionSet(created.id, 2_000);

    expect(await getQuestionSet(created.id)).toBeNull();
    expect(await db.tombstones.get(['questionSets', created.id])).toEqual({
      table: 'questionSets',
      recordId: created.id,
      deletedAt: 2_000,
    });

    const restored = await createQuestionSet(
      content(course.id, lesson.id, assessment.id, concept.id),
      1_500,
    );
    expect(restored.updatedAt).toBe(2_001);
    expect(await db.tombstones.get(['questionSets', created.id])).toBeUndefined();
  });

  it('atomically removes authored content and draft while retaining attempts and receipt media', async () => {
    const { course, lesson, assessment, concept } = await fixture();
    const receiptHash = 'a'.repeat(64);
    const draftHash = 'b'.repeat(64);
    await db.assets.bulkPut([receiptHash, draftHash].map((hash) => ({
      hash, blob: new Uint8Array([1]), mimeType: 'image/png', kind: 'image' as const,
      width: 1, height: 1, createdAt: 1,
    })));
    const original = content(course.id, lesson.id, assessment.id, concept.id);
    original.questions[0].prompt = `Name this: ![figure](${assetUrl(receiptHash)})`;
    const created = await createQuestionSet(original, 1_000);
    const attempt = await startQuestionSetAttempt(created.id, 'practice', 1_100);
    const draft = createQuestionSetDraft(original, created.contentRevisionId);
    draft.content.questions[0].prompt = `Changed: ![figure](${assetUrl(draftHash)})`;
    const savedDraft = await saveQuestionSetDraft(draft, { expectedDraftRevisionId: null });

    await removeAuthoredQuestionSet(course.id, created.id, {
      expectedContentRevisionId: created.contentRevisionId,
      expectedDraftRevisionId: savedDraft.draftRevisionId,
      now: 2_000,
    });

    expect(await db.questionSets.get(created.id)).toBeUndefined();
    expect(await loadQuestionSetDraft(course.id, created.id)).toBeNull();
    expect(await db.tombstones.get(['questionSets', created.id])).toMatchObject({ deletedAt: 2_000 });
    expect((await db.questionSetAttempts.get(attempt.id))?.receipt.questions[0].prompt).toContain(receiptHash);
    await collectOrphanedAssets();
    expect(await db.assets.get(receiptHash)).toBeDefined();
    expect(await db.assets.get(draftHash)).toBeUndefined();
  });

  it('refuses stale or read-only removal without deleting draft or content', async () => {
    const { course, lesson, assessment, concept } = await fixture();
    const created = await createQuestionSet(content(course.id, lesson.id, assessment.id, concept.id));
    const draft = await saveQuestionSetDraft(createQuestionSetDraft(created, created.contentRevisionId), {
      expectedDraftRevisionId: null,
    });
    const options = { expectedContentRevisionId: created.contentRevisionId, expectedDraftRevisionId: draft.draftRevisionId };
    await expect(removeAuthoredQuestionSet(course.id, created.id, {
      ...options, expectedDraftRevisionId: 'stale',
    })).rejects.toThrow('changed in another window');
    await expect(removeAuthoredQuestionSet(course.id, created.id, {
      ...options, expectedContentRevisionId: 'stale',
    })).rejects.toThrow('changed since it was opened');
    await db.courses.update(course.id, { archived: true });
    await expect(removeAuthoredQuestionSet(course.id, created.id, options)).rejects.toThrow('read-only');
    await db.courses.update(course.id, { archived: false, distributedCopy: { locked: true, lineageId: 'lineage', revision: 1, autoAcceptUpdates: false } });
    await expect(removeAuthoredQuestionSet(course.id, created.id, options)).rejects.toThrow('read-only');
    expect(await db.questionSets.get(created.id)).toBeDefined();
    expect(await loadQuestionSetDraft(course.id, created.id)).toEqual(draft);

    const draftOnly = await saveQuestionSetDraft(createEmptyQuestionSetDraft(course.id, 'new-set'), {
      expectedDraftRevisionId: null,
    });
    await db.courses.update(course.id, { distributedCopy: undefined });
    await removeAuthoredQuestionSet(course.id, 'new-set', {
      expectedContentRevisionId: null,
      expectedDraftRevisionId: draftOnly.draftRevisionId,
    });
    expect(await loadQuestionSetDraft(course.id, 'new-set')).toBeNull();
    expect(await db.tombstones.get(['questionSets', 'new-set'])).toBeUndefined();
  });

  it('preserves reference integrity across Concept, Lesson, Assessment, and Course deletion', async () => {
    const { course, lesson, concept } = await fixture();
    const checkpoint = await createCourseAssessment(
      course.id,
      'Checkpoint',
      Date.now() + 86_400_000,
      {
        kind: 'checkpoint',
        afterLessonId: lesson.id,
      },
    );
    const created = await createQuestionSet(
      content(course.id, lesson.id, checkpoint.id, concept.id),
      1_000,
    );

    await expect(deleteConcept(concept.id, 2_000)).rejects.toThrow('Question Set');
    const lessonSnapshot = await snapshotLesson(lesson.id);
    await deleteLesson(lesson.id);
    const afterLesson = (await getQuestionSet(created.id))!;
    expect(afterLesson.lessonIds).toEqual([]);
    expect(afterLesson.contentVersion).toBe(2);
    await restoreLesson(lessonSnapshot!);
    const afterLessonUndo = (await getQuestionSet(created.id))!;
    expect(afterLessonUndo.lessonIds).toEqual([lesson.id]);
    expect(afterLessonUndo.contentVersion).toBe(3);

    await deleteCourseAssessment(checkpoint.id);
    const afterAssessment = (await getQuestionSet(created.id))!;
    expect(afterAssessment.assessmentIds).toEqual([]);
    expect(afterAssessment.contentVersion).toBe(4);

    const courseSnapshot = await snapshotCourse(course.id);
    await deleteCourse(course.id);
    expect(await getQuestionSet(created.id)).toBeNull();
    expect(await db.tombstones.get(['questionSets', created.id])).toMatchObject({
      table: 'questionSets',
      recordId: created.id,
    });
    await restoreCourse(courseSnapshot!);
    const afterCourseUndo = (await getQuestionSet(created.id))!;
    expect(afterCourseUndo.contentVersion).toBe(5);
    expect(await db.tombstones.get(['questionSets', created.id])).toBeUndefined();
  });

  it('discovers current sets through Lesson, Assessment, Concept role, and Card links', async () => {
    const { course, lesson, assessment, concept } = await fixture();
    const prerequisite = await createConcept(course.id, 'Cell membrane');
    const linked = content(course.id, lesson.id, assessment.id, concept.id);
    linked.questions[0].answer!.prerequisiteConceptIds = [prerequisite.id];
    const created = await createQuestionSet(linked, 1_000);
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Nucleus', 'Control');
    await db.cards.update(card.id, { conceptId: concept.id });

    expect(await listQuestionSetsForLesson(course.id, lesson.id)).toEqual([created]);
    expect(await listQuestionSetsForAssessment(course.id, assessment.id)).toEqual([created]);
    expect(await listQuestionSetsForConcept(course.id, concept.id, 'target')).toEqual([created]);
    expect(await listQuestionSetsForConcept(course.id, concept.id, 'prerequisite')).toEqual([]);
    expect(await listQuestionSetsForConcept(course.id, prerequisite.id, 'prerequisite')).toEqual([
      created,
    ]);
    expect(await listQuestionSetsForCard(course.id, card.id, 'target')).toEqual([created]);

    const other = await createCourse('Chemistry');
    expect(await listQuestionSetsForLesson(other.id, lesson.id)).toEqual([]);
    expect(await listQuestionSetsForAssessment(other.id, assessment.id)).toEqual([]);
    expect(await listQuestionSetsForCard(other.id, card.id)).toEqual([]);
  });
});
