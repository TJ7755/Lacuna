import 'fake-indexeddb/auto';
import { importQuestionBank } from '../questions/bank';
import familyExample from '../../../../docs/question-bank/examples/numeric-family.json';
import type { BackupFile } from '@lacuna/core/db/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { createCourse } from './courseRepository';
import { createLesson } from './lessonRepository';
import {
  createPracticeNode,
  deleteQuestionSetPracticeNode,
  createQuestionSetPracticeNode,
  updateQuestionSetPracticeNode,
} from './practiceNodeRepository';
import { startQuestionSetAttempt } from '../questions/questionSetAttemptRepository';
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
    expect(backup).toMatchObject({ app: 'lacuna-v15', version: 15 });
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
              [node.id]: { questionSetIds: [set.id], afterLessonId: lesson.id, name: node.name },
            },
          },
        ],
      },
    ).lineageIdMappings?.[0];
    expect(mergedMapping?.questionSetPracticeNodeIds).toEqual([node.id]);
    expect(mergedMapping?.questionSetPracticeNodeSnapshots?.[node.id]).toMatchObject({
      questionSetIds: [set.id],
      afterLessonId: lesson.id,
    });
    await db.practiceNodes.clear();
    await importBackup(backup, 'replace');
    expect(await db.practiceNodes.get(node.id)).toEqual(node);
    await expect(deleteQuestionSet(set.id)).rejects.toThrow(node.id);
    await deleteQuestionSetPracticeNode(node.id);
    await deleteQuestionSet(set.id);
    const removed = mergeSnapshots(backup, await exportDatabase());
    expect(removed.questionSets).toEqual([]);
    expect(removed.practiceNodes).toEqual([]);
    expect(
      validateBackup({ ...backup, practiceNodes: [{ ...node, questionSetIds: undefined }] }),
    ).toBe(false);
    expect(() =>
      mergeSnapshots(backup, { ...backup, practiceNodes: [{ ...node, afterLessonId: 'missing' }] }),
    ).toThrow('Lesson');
  });

  it.each([
    { name: 'incoming newer replacement', incomingWins: true, equalTime: false },
    { name: 'local newer replacement', incomingWins: false, equalTime: false },
    { name: 'incoming equal-time winner', incomingWins: true, equalTime: true },
    { name: 'local equal-time winner', incomingWins: false, equalTime: true },
  ])('retains $name on backup merge', async ({ incomingWins, equalTime }) => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const set = await createQuestionSet({
      id: 'set-a',
      courseId: course.id,
      title: 'Cells',
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
    const replacement = await createQuestionSet({ ...set, id: 'set-b', title: 'Tissues' });
    const node = await createQuestionSetPracticeNode(course.id, set.id, lesson.id);
    const attempt = await startQuestionSetAttempt(set.id, 'practice');
    let older = await exportDatabase();
    const updated = await updateQuestionSetPracticeNode(
      node.id,
      lesson.id,
      replacement.id,
      node.updatedAt,
    );
    const newer = await exportDatabase();
    expect(updated.createdAt).toBe(node.createdAt);
    expect(updated.updatedAt).toBeGreaterThan(node.updatedAt);
    if (equalTime) {
      older = { ...older, practiceNodes: [{ ...node, updatedAt: updated.updatedAt }] };
      expect(mergeSnapshots(older, newer).practiceNodes).toEqual([updated]);
      expect(mergeSnapshots(newer, older).practiceNodes).toEqual([updated]);
    }
    if (incomingWins) {
      await importBackup(older, 'replace');
      await importBackup(newer, 'merge');
    } else {
      await importBackup(older, 'merge');
    }
    expect(await db.practiceNodes.get(node.id)).toEqual(updated);
    expect(await db.questionSetAttempts.toArray()).toEqual([attempt]);
    expect((await exportDatabase()).practiceNodes).toEqual([updated]);
  });

  it('retains the existing creation-time merge rule for Card practice activities', async () => {
    const course = await createCourse('Biology');
    const node = await createPracticeNode(course.id, { type: 'manual', name: 'Local' });
    const backup = await exportDatabase();
    backup.practiceNodes = [{ ...node, name: 'Incoming', createdAt: node.createdAt + 1 }];
    await db.practiceNodes.update(node.id, { updatedAt: node.updatedAt + 100 });
    await importBackup(backup, 'merge');
    expect(await db.practiceNodes.get(node.id)).toEqual(backup.practiceNodes[0]);
  });

  it.each([false, true])(
    'merges membership and order as one record (equal time: %s)',
    async (equalTime) => {
      const course = await createCourse('Physics');
      const lesson = await createLesson(course.id, 'Density');
      const [first] = await importQuestionBank(familyExample, course.id);
      const second = await createQuestionSet({ ...first, id: 'set-b' });
      const third = await createQuestionSet({ ...first, id: 'set-c' });
      const node = await createQuestionSetPracticeNode(
        course.id,
        [second.id, first.id, third.id],
        lesson.id,
      );
      const attempt = await startQuestionSetAttempt(first.id, 'practice');
      const backup = await exportDatabase();
      const winner = {
        ...node,
        questionSetIds: [third.id, second.id],
        updatedAt: node.updatedAt + (equalTime ? 0 : 1),
      };
      const incoming = { ...backup, practiceNodes: [winner] };
      expect(mergeSnapshots(backup, incoming).practiceNodes).toEqual([winner]);
      expect(mergeSnapshots(incoming, backup).practiceNodes).toEqual([winner]);
      await importBackup(incoming, 'merge');
      expect(await db.practiceNodes.get(node.id)).toEqual(winner);
      await importBackup(backup, 'merge');
      expect(await db.practiceNodes.get(node.id)).toEqual(winner);
      expect(await db.questionSetAttempts.toArray()).toEqual([attempt]);

      const { questionSetIds: _ids, ...legacyNode } = node;
      const legacy = {
        ...backup,
        app: 'lacuna-v14',
        version: 14,
        practiceNodes: [{ ...legacyNode, questionSetId: first.id }],
      } as unknown as BackupFile;
      expect(validateBackup(legacy)).toBe(false);
      const before = await exportDatabase();
      await expect(importBackup(legacy, 'replace')).rejects.toThrow('Unsupported old backup');
      const after = await exportDatabase();
      expect({ ...after, exportedAt: 0 }).toEqual({ ...before, exportedAt: 0 });
    },
  );

  it('preserves published assessment lineage metadata through backup and peer merge', async () => {
    const course = await createCourse('Lineage course');
    const assessment = (await db.courseAssessments.where('courseId').equals(course.id).first())!;
    const { updatedAt: _updatedAt, ...snapshot } = assessment;
    const mapping = {
      id: 'assessment-lineage',
      courseId: course.id,
      lessonIds: [],
      noteIds: [],
      cardIds: [],
      sequenceIds: [],
      lessonSnapshots: {},
      noteSnapshots: {},
      cardSnapshots: {},
      assessmentIds: [assessment.id],
      assessmentSnapshots: { [assessment.id]: snapshot },
    };
    await db.lineageIdMappings.put(mapping);
    const backup = await exportDatabase();
    expect(validateBackup(backup)).toBe(true);
    expect(
      validateBackup({
        ...backup,
        lineageIdMappings: [
          { ...mapping, assessmentSnapshots: { [assessment.id]: { ...snapshot, kind: 'wrong' } } },
        ],
      }),
    ).toBe(false);
    await db.lineageIdMappings.clear();
    await importBackup(backup, 'replace');
    expect(await db.lineageIdMappings.get(mapping.id)).toEqual(mapping);

    const merged = mergeSnapshots(
      {
        ...backup,
        lineageIdMappings: [{ ...mapping, assessmentIds: [], assessmentSnapshots: {} }],
      },
      backup,
    );
    expect(merged.lineageIdMappings?.[0].assessmentIds).toEqual([assessment.id]);
    expect(merged.lineageIdMappings?.[0].assessmentSnapshots?.[assessment.id]).toEqual(snapshot);
  });
});
