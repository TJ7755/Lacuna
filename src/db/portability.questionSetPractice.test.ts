import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createCourse } from './courseRepository';
import { createLesson } from './lessonRepository';
import { createQuestionSetPracticeNode } from './practiceNodeRepository';
import { exportDatabase, importBackup, validateBackup } from './portability';
import { db } from './schema';
import { createQuestionSet, deleteQuestionSet } from '../questions/questionSetRepository';
import { mergeSnapshots } from '../sync/mergeSnapshots';

describe('Question Set path activity portability', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  it('round-trips the activity in backup and peer merge with a new marker', async () => {
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
    const backup = await exportDatabase();
    expect(backup).toMatchObject({ app: 'lacuna-v14', version: 14 });
    expect(validateBackup(backup)).toBe(true);
    expect(validateBackup({ ...backup, practiceNodes: [null] })).toBe(false);
    expect(mergeSnapshots(backup, backup).practiceNodes).toEqual([node]);
    const mapping = {
      id: 'lineage-1',
      courseId: course.id,
      lessonIds: [],
      noteIds: [],
      cardIds: [],
      sequenceIds: [],
      lessonSnapshots: {},
      noteSnapshots: {},
      cardSnapshots: {},
    };
    const mergedMapping = mergeSnapshots(
      { ...backup, lineageIdMappings: [{ ...mapping, questionSetPracticeNodeIds: [] }] },
      {
        ...backup,
        lineageIdMappings: [
          {
            ...mapping,
            questionSetPracticeNodeIds: [node.id],
            questionSetPracticeNodeSnapshots: {
              [node.id]: { questionSetId: set.id, afterLessonId: lesson.id, name: node.name },
            },
          },
        ],
      },
    ).lineageIdMappings?.[0];
    expect(mergedMapping?.questionSetPracticeNodeIds).toEqual([node.id]);
    expect(mergedMapping?.questionSetPracticeNodeSnapshots?.[node.id]).toMatchObject({
      questionSetId: set.id,
      afterLessonId: lesson.id,
    });
    await db.practiceNodes.clear();
    await importBackup(backup, 'replace');
    expect(await db.practiceNodes.get(node.id)).toEqual(node);
    await deleteQuestionSet(set.id);
    const removed = mergeSnapshots(backup, await exportDatabase());
    expect(removed.questionSets).toEqual([]);
    expect(removed.practiceNodes).toEqual([]);
    expect(
      validateBackup({ ...backup, practiceNodes: [{ ...node, questionSetId: undefined }] }),
    ).toBe(false);
    expect(() =>
      mergeSnapshots(backup, { ...backup, practiceNodes: [{ ...node, afterLessonId: 'missing' }] }),
    ).toThrow('Lesson');
  });

  it('preserves published assessment lineage metadata through backup and peer merge', async () => {
    const course = await createCourse('Lineage course');
    const assessment = (await db.courseAssessments.where('courseId').equals(course.id).first())!;
    const { updatedAt: _updatedAt, ...snapshot } = assessment;
    const mapping = {
      id: 'assessment-lineage', courseId: course.id,
      lessonIds: [], noteIds: [], cardIds: [], sequenceIds: [],
      lessonSnapshots: {}, noteSnapshots: {}, cardSnapshots: {},
      assessmentIds: [assessment.id], assessmentSnapshots: { [assessment.id]: snapshot },
    };
    await db.lineageIdMappings.put(mapping);
    const backup = await exportDatabase();
    expect(validateBackup(backup)).toBe(true);
    expect(validateBackup({ ...backup, lineageIdMappings: [{ ...mapping,
      assessmentSnapshots: { [assessment.id]: { ...snapshot, kind: 'wrong' } },
    }] })).toBe(false);
    await db.lineageIdMappings.clear();
    await importBackup(backup, 'replace');
    expect(await db.lineageIdMappings.get(mapping.id)).toEqual(mapping);

    const merged = mergeSnapshots(
      { ...backup, lineageIdMappings: [{ ...mapping, assessmentIds: [], assessmentSnapshots: {} }] },
      backup,
    );
    expect(merged.lineageIdMappings?.[0].assessmentIds).toEqual([assessment.id]);
    expect(merged.lineageIdMappings?.[0].assessmentSnapshots?.[assessment.id]).toEqual(snapshot);
  });
});
