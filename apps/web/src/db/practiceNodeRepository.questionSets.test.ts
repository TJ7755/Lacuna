import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCourse } from './courseRepository';
import { createLesson, deleteLesson, restoreLesson, snapshotLesson } from './lessonRepository';
import { db } from './schema';
import {
  createPracticeNode,
  deletePracticeNode,
  createQuestionSetPracticeNode,
  deleteQuestionSetPracticeNode,
  savePracticeMilestoneProgress,
  updateQuestionSetPracticeNode,
  updatePracticeNode,
} from './practiceNodeRepository';
import { createQuestionSet } from '../questions/questionSetRepository';
import { importQuestionBank, declarativeFamilyCapacity } from '../questions/bank';
import familyExample from '../../../../docs/question-bank/examples/numeric-family.json';
import { startQuestionSetAttempt } from '../questions/questionSetAttemptRepository';
import { createEmptyQuestionSetDraft, saveQuestionSetDraft } from '../questions/questionSetDrafts';

async function replacementFixture() {
  const course = await createCourse('Physics');
  const lesson = await createLesson(course.id, 'Density');
  const [set] = await importQuestionBank(familyExample, course.id);
  const replacement = await createQuestionSet({ ...set, id: 'replacement' });
  const node = await createQuestionSetPracticeNode(course.id, set.id, lesson.id);
  return { course, lesson, set, replacement, node };
}

describe('Question Set path activities', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  it('creates, moves and deletes a same-Course activity with a receipt', async () => {
    const course = await createCourse('Biology');
    const first = await createLesson(course.id, 'Cells');
    const second = await createLesson(course.id, 'Tissues');
    const set = await createQuestionSet({
      id: 'set-1',
      courseId: course.id,
      title: 'Cells questions',
      lessonIds: [],
      assessmentIds: [],
      questions: [
        {
          id: 'q1',
          prompt: 'Name a cell.',
          parts: [],
          answer: {
            maxMarks: 1,
            response: { kind: 'written' },
            prerequisiteConceptIds: [],
            allocations: [
              {
                id: 'a1',
                criterion: 'Names a cell',
                maxMarks: 1,
                dimension: 'knowledge',
                targetConceptIds: [],
              },
            ],
          },
        },
      ],
    });

    const node = await createQuestionSetPracticeNode(course.id, set.id, first.id);
    expect(node).toMatchObject({
      courseId: course.id,
      type: 'question-set',
      questionSetIds: [set.id],
      afterLessonId: first.id,
    });
    await expect(updatePracticeNode(node.id, { name: 'Bypass' })).rejects.toThrow('Question Set');
    await expect(deletePracticeNode(node.id)).rejects.toThrow('Question Set');
    await updateQuestionSetPracticeNode(node.id, second.id);
    expect(await db.practiceNodes.get(node.id)).toMatchObject({ afterLessonId: second.id });
    await expect(savePracticeMilestoneProgress(node.id, course.id, 'scope', 1, 1)).rejects.toThrow(
      'Card',
    );
    const futureUpdatedAt = Date.now() + 10_000;
    await db.practiceNodes.update(node.id, { updatedAt: futureUpdatedAt });
    await deleteQuestionSetPracticeNode(node.id);
    expect(await db.practiceNodes.get(node.id)).toBeUndefined();
    expect((await db.tombstones.get(['practiceNodes', node.id]))?.deletedAt).toBeGreaterThan(
      futureUpdatedAt,
    );
    expect(await db.practiceMilestones.get(node.id)).toBeUndefined();
  });

  it('rejects cross-Course links, read-only Courses and Card API misuse', async () => {
    const course = await createCourse('Biology');
    const other = await createCourse('Chemistry');
    const lesson = await createLesson(course.id, 'Cells');
    const set = await createQuestionSet({
      id: 'set-1',
      courseId: course.id,
      title: 'Cells questions',
      lessonIds: [],
      assessmentIds: [],
      questions: [
        {
          id: 'q1',
          prompt: 'Name a cell.',
          parts: [],
          answer: {
            maxMarks: 1,
            response: { kind: 'written' },
            prerequisiteConceptIds: [],
            allocations: [
              {
                id: 'a1',
                criterion: 'Names a cell',
                maxMarks: 1,
                dimension: 'knowledge',
                targetConceptIds: [],
              },
            ],
          },
        },
      ],
    });
    const foreignLesson = await createLesson(other.id, 'Atoms');
    await expect(
      createQuestionSetPracticeNode(course.id, set.id, foreignLesson.id),
    ).rejects.toThrow('Lesson');
    await expect(createQuestionSetPracticeNode(other.id, set.id, foreignLesson.id)).rejects.toThrow(
      'Question Set',
    );
    await expect(
      createPracticeNode(course.id, {
        type: 'question-set',
        name: 'Bypass',
        questionSetIds: [set.id],
        afterLessonId: lesson.id,
      }),
    ).rejects.toThrow('Question Set');
    await db.courses.update(course.id, { archived: true });
    await expect(createQuestionSetPracticeNode(course.id, set.id, lesson.id)).rejects.toThrow(
      'read-only',
    );
    expect(await db.practiceNodes.count()).toBe(0);
  });

  it('replaces the reference without changing bank families, attempts or activity identity', async () => {
    const { course, lesson, set, replacement, node } = await replacementFixture();
    await db.practiceNodes.update(node.id, {
      name: 'Teacher activity',
      updatedAt: Date.now() + 10_000,
    });
    const before = (await db.practiceNodes.get(node.id))!;
    const open = await startQuestionSetAttempt(set.id, 'practice');
    const updated = await updateQuestionSetPracticeNode(
      node.id,
      lesson.id,
      replacement.id,
      before.updatedAt,
    );
    expect(updated).toEqual({
      ...before,
      questionSetIds: [replacement.id],
      updatedAt: before.updatedAt + 1,
    });
    expect(await db.questionSetAttempts.toArray()).toEqual([open]);
    expect(await db.questionSets.get(set.id)).toEqual(set);
    expect(await db.questionSets.get(replacement.id)).toEqual(replacement);
    expect(declarativeFamilyCapacity(replacement.bank!.family!)).toBe(6);
    expect(await db.practiceMilestones.count()).toBe(0);
    const next = await startQuestionSetAttempt(updated.questionSetIds[0], 'practice');
    expect(next).toMatchObject({
      courseId: course.id,
      questionSetId: replacement.id,
      receipt: replacement,
    });
  });

  it.each([
    'foreign set',
    'missing set',
    'draft only',
    'foreign lesson',
    'missing lesson',
    'archived',
    'locked',
    'missing course',
    'missing activity',
    'Card activity',
  ])('rejects replacement with %s without a partial write', async (reason) => {
    const { course, lesson, set, replacement, node } = await replacementFixture();
    const other = await createCourse('Other');
    let setId = replacement.id;
    let lessonId = lesson.id;
    if (reason === 'foreign set') await db.questionSets.update(setId, { courseId: other.id });
    if (reason === 'missing set') await db.questionSets.delete(setId);
    if (reason === 'draft only') {
      setId = 'unsaved-draft';
      await saveQuestionSetDraft(createEmptyQuestionSetDraft(course.id, setId), {
        expectedDraftRevisionId: null,
      });
    }
    if (reason === 'foreign lesson') lessonId = (await createLesson(other.id, 'Other')).id;
    if (reason === 'missing lesson') lessonId = 'removed';
    if (reason === 'archived') await db.courses.update(course.id, { archived: true });
    if (reason === 'locked') {
      await db.courses.update(course.id, {
        distributedCopy: {
          lineageId: 'publisher',
          revision: 1,
          locked: true,
          autoAcceptUpdates: true,
        },
      });
    }
    if (reason === 'missing course') await db.courses.delete(course.id);
    if (reason === 'missing activity') await db.practiceNodes.delete(node.id);
    if (reason === 'Card activity') await db.practiceNodes.update(node.id, { type: 'manual' });
    const before = await db.practiceNodes.get(node.id);
    await expect(
      updateQuestionSetPracticeNode(node.id, lessonId, setId, node.updatedAt),
    ).rejects.toThrow();
    expect(await db.practiceNodes.get(node.id)).toEqual(before);
    expect(await db.questionSets.get(set.id)).toEqual(set);
  });

  it('serialises replacement and an anchor-only move using the current stored fields', async () => {
    const { course, lesson, replacement, node } = await replacementFixture();
    const nextLesson = await createLesson(course.id, 'Pressure');
    await Promise.all([
      updateQuestionSetPracticeNode(node.id, lesson.id, replacement.id, node.updatedAt),
      updateQuestionSetPracticeNode(node.id, nextLesson.id),
    ]);
    expect(await db.practiceNodes.get(node.id)).toMatchObject({
      questionSetIds: [replacement.id],
      afterLessonId: nextLesson.id,
    });
  });

  it('fails atomically if the selected set is removed before the save or the write fails', async () => {
    const { lesson, replacement, node } = await replacementFixture();
    const write = vi.spyOn(db.practiceNodes, 'put').mockRejectedValueOnce(new Error('Disk full'));
    try {
      await expect(
        updateQuestionSetPracticeNode(node.id, lesson.id, replacement.id, node.updatedAt),
      ).rejects.toThrow('Disk full');
    } finally {
      write.mockRestore();
    }
    expect(await db.practiceNodes.get(node.id)).toEqual(node);
    await Promise.all([
      db.questionSets.delete(replacement.id),
      expect(
        updateQuestionSetPracticeNode(node.id, lesson.id, replacement.id, node.updatedAt),
      ).rejects.toThrow('Question Set'),
    ]);
    expect(await db.practiceNodes.get(node.id)).toEqual(node);
  });

  it('stores three members in order and rejects invalid or stale edits atomically', async () => {
    const { course, lesson, set, replacement, node } = await replacementFixture();
    const third = await createQuestionSet({ ...set, id: 'third' });
    const other = await createCourse('Other');
    const [foreign] = await importQuestionBank(familyExample, other.id);
    for (const ids of [[], [set.id, set.id], [set.id, foreign.id], [set.id, 'missing']]) {
      await expect(createQuestionSetPracticeNode(course.id, ids, lesson.id)).rejects.toThrow();
      await expect(
        updateQuestionSetPracticeNode(node.id, lesson.id, ids, node.updatedAt),
      ).rejects.toThrow();
      expect(await db.practiceNodes.get(node.id)).toEqual(node);
    }
    const updated = await updateQuestionSetPracticeNode(
      node.id,
      lesson.id,
      [third.id, set.id, replacement.id],
      node.updatedAt,
    );
    expect(updated.questionSetIds).toEqual([third.id, set.id, replacement.id]);
    expect(updated).not.toHaveProperty('questionSetId');
    await expect(
      updateQuestionSetPracticeNode(node.id, lesson.id, [set.id], node.updatedAt),
    ).rejects.toThrow('Reopen');
    await expect(updateQuestionSetPracticeNode(node.id, lesson.id, [set.id])).rejects.toThrow(
      'Reopen',
    );
    const nextLesson = await createLesson(course.id, 'Pressure');
    const moved = await updateQuestionSetPracticeNode(node.id, nextLesson.id);
    expect(moved.questionSetIds).toEqual(updated.questionSetIds);
    expect(moved.updatedAt).toBeGreaterThan(updated.updatedAt);
  });

  it('removes an activity with its anchor lesson and restores it on undo', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const set = await createQuestionSet({
      id: 'set-1',
      courseId: course.id,
      title: 'Cells questions',
      lessonIds: [],
      assessmentIds: [],
      questions: [
        {
          id: 'q1',
          prompt: 'Name a cell.',
          parts: [],
          answer: {
            maxMarks: 1,
            response: { kind: 'written' },
            prerequisiteConceptIds: [],
            allocations: [
              {
                id: 'a1',
                criterion: 'Names a cell',
                maxMarks: 1,
                dimension: 'knowledge',
                targetConceptIds: [],
              },
            ],
          },
        },
      ],
    });
    const node = await createQuestionSetPracticeNode(course.id, set.id, lesson.id);
    const snapshot = await snapshotLesson(lesson.id);
    await deleteLesson(lesson.id);
    expect(await db.practiceNodes.get(node.id)).toBeUndefined();
    expect(await db.tombstones.get(['practiceNodes', node.id])).toBeDefined();
    await restoreLesson(snapshot!);
    expect(await db.practiceNodes.get(node.id)).toEqual(node);
    expect(await db.tombstones.get(['practiceNodes', node.id])).toBeUndefined();
  });
});
