import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createCourse } from './courseRepository';
import { createLesson } from './lessonRepository';
import { createQuestionSetPracticeNode } from './practiceNodeRepository';
import { db } from './schema';
import { buildCourseSharePayload, importSharePayload, parseSharePayload } from './share';
import { createQuestionSet } from '../questions/questionSetRepository';

describe('shared Question Set path activities', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  it('shares only authored placement and remaps its set and lesson on fresh import', async () => {
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
    const second = await createQuestionSet({ ...set, id: 'set-2', title: 'Tissues' });
    const third = await createQuestionSet({ ...set, id: 'set-3', title: 'Organs' });
    const node = await createQuestionSetPracticeNode(
      course.id,
      [third.id, set.id, second.id],
      lesson.id,
    );
    const payload = buildCourseSharePayload(course.id);
    const shared = parseSharePayload(await payload);
    expect(shared.v).toBe(6);
    if (shared.v !== 6) throw new Error('Expected v6 share.');
    expect(shared.questionSetPracticeNodes).toEqual([node]);
    expect(JSON.stringify(shared)).not.toContain('questionSetAttempts');

    await importSharePayload(shared);
    const imported = (await db.courses.toArray()).find((row) => row.id !== course.id)!;
    const importedSets = await db.questionSets.where('courseId').equals(imported.id).toArray();
    const byTitle = new Map(importedSets.map((set) => [set.title, set.id]));
    const importedLesson = (await db.lessons.where('courseId').equals(imported.id).toArray())[0];
    const importedNode = (
      await db.practiceNodes.where('courseId').equals(imported.id).toArray()
    )[0];
    expect(importedNode).toMatchObject({
      type: 'question-set',
      questionSetIds: [
        byTitle.get('Organs'),
        byTitle.get('Cells questions'),
        byTitle.get('Tissues'),
      ],
      afterLessonId: importedLesson.id,
    });
    expect(importedNode.id).not.toBe(node.id);
    expect(importedSets.every((row) => !node.questionSetIds.includes(row.id))).toBe(true);
    const before = await db.courses.count();
    await expect(
      importSharePayload({
        ...shared,
        questionSetPracticeNodes: [{ ...node, questionSetIds: [third.id, 'missing', second.id] }],
      }),
    ).rejects.toThrow('unmapped Set');
    expect(await db.courses.count()).toBe(before);
    const { questionSetIds: _ids, ...legacy } = node;
    const oldShare = parseSharePayload({
      ...shared,
      v: 5,
      questionSetPracticeNodes: [{ ...legacy, questionSetId: set.id }],
    });
    if (oldShare.v !== 5) throw new Error('Expected legacy share.');
    expect(oldShare.questionSetPracticeNodes[0].questionSetIds).toEqual([set.id]);
  });
});
