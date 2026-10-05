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
    const node = await createQuestionSetPracticeNode(course.id, set.id, lesson.id);
    const payload = buildCourseSharePayload(course.id);
    const shared = parseSharePayload(await payload);
    expect(shared.v).toBe(5);
    if (shared.v !== 5) throw new Error('Expected v5 share.');
    expect(shared.questionSetPracticeNodes).toEqual([node]);
    expect(JSON.stringify(shared)).not.toContain('questionSetAttempts');

    await importSharePayload(shared);
    const imported = (await db.courses.toArray()).find((row) => row.id !== course.id)!;
    const importedSet = (await db.questionSets.where('courseId').equals(imported.id).toArray())[0];
    const importedLesson = (await db.lessons.where('courseId').equals(imported.id).toArray())[0];
    const importedNode = (
      await db.practiceNodes.where('courseId').equals(imported.id).toArray()
    )[0];
    expect(importedNode).toMatchObject({
      type: 'question-set',
      questionSetId: importedSet.id,
      afterLessonId: importedLesson.id,
    });
    expect(importedNode.id).not.toBe(node.id);
    expect(importedSet.id).not.toBe(set.id);
  });
});
