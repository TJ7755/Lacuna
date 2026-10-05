import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
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
      questionSetId: set.id,
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
        questionSetId: set.id,
        afterLessonId: lesson.id,
      }),
    ).rejects.toThrow('Question Set');
    await db.courses.update(course.id, { archived: true });
    await expect(createQuestionSetPracticeNode(course.id, set.id, lesson.id)).rejects.toThrow(
      'read-only',
    );
    expect(await db.practiceNodes.count()).toBe(0);
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
