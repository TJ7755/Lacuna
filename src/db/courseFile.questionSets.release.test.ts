import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { assetUrl, storeImageBlob } from './assets';
import { buildCourseFile, decodeCourseFile, withCourseFileAssets } from './courseFile';
import { importSharePayload } from './share';
import { createCourse } from './repository';
import { exportDatabase, importBackup } from './portability';
import { db } from './schema';
import { createQuestionSet } from '../questions/questionSetRepository';
import {
  saveQuestionSetMarking,
  saveQuestionSetResponseDraft,
  startQuestionSetAttempt,
  submitQuestionSetPaper,
} from '../questions/questionSetAttemptRepository';

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});

describe('Question Set course-file release boundaries', () => {
  it('includes authored diagrams while excluding private answer drafts and annotations', async () => {
    const course = await createCourse('Biology');
    const image = await storeImageBlob(
      new Blob(['diagram'], { type: 'image/png' }),
      'image/png',
      32,
      24,
    );
    const set = await createQuestionSet({
      id: 'set-origin',
      courseId: course.id,
      title: 'Cell paper',
      lessonIds: [],
      assessmentIds: [],
      questions: [
        {
          id: 'question-origin',
          prompt: `Explain the diagram.\n\n![Cell](${assetUrl(image.hash)})`,
          parts: [],
          answer: {
            maxMarks: 1,
            response: { kind: 'written' },
            prerequisiteConceptIds: [],
            allocations: [
              {
                id: 'allocation-origin',
                criterion: 'Explains the cell',
                maxMarks: 1,
                dimension: 'knowledge',
                targetConceptIds: [],
              },
            ],
          },
        },
      ],
    });
    let attempt = await startQuestionSetAttempt(set.id, 'paper', 10);
    const privateAnswer = 'Private learner response that must not be shared.';
    attempt = await saveQuestionSetResponseDraft(
      attempt.id,
      attempt.revisionId,
      'question-origin',
      { kind: 'written', text: privateAnswer },
      'question-origin',
      11,
    );
    attempt = await submitQuestionSetPaper(attempt.id, attempt.revisionId, 12);
    const privateAnnotation = 'Private marking note that must not be shared.';
    await saveQuestionSetMarking(
      attempt.id,
      attempt.revisionId,
      {
        decisions: [],
        annotations: [
          {
            id: 'annotation-private',
            nodeId: 'question-origin',
            comment: privateAnnotation,
            createdAt: 13,
          },
        ],
        corrections: [],
        reflection: { reasons: [], note: '' },
        activeNodeId: 'question-origin',
        activeAllocationId: 'allocation-origin',
      },
      13,
    );

    const file = await decodeCourseFile(await buildCourseFile(course.id));
    expect(file.assets.map((asset) => asset.hash)).toEqual([image.hash]);
    expect(file.payload.v).toBe(5);
    if (file.payload.v !== 5) throw new Error('Expected a v5 course payload');
    expect(file.payload.questionSets).toHaveLength(1);
    expect(JSON.stringify(file)).not.toContain(privateAnswer);
    expect(JSON.stringify(file)).not.toContain(privateAnnotation);
    expect(JSON.stringify(file)).not.toContain('questionSetAttempts');

    await db.questionSets.clear();
    await db.questionSetAttempts.clear();
    await db.assets.clear();
    await withCourseFileAssets(file, () => importSharePayload(file.payload));
    expect(await db.questionSets.count()).toBe(1);
    expect(await db.questionSetAttempts.count()).toBe(0);
    expect((await db.assets.get(image.hash))?.blob).toBeDefined();
  });

  it('backup-restores long submitted responses and annotations without truncation', async () => {
    const course = await createCourse('Biology');
    const set = await createQuestionSet({
      id: 'set-origin',
      courseId: course.id,
      title: 'Cell paper',
      lessonIds: [],
      assessmentIds: [],
      questions: [
        {
          id: 'question-origin',
          prompt: 'Explain the cell.',
          parts: [],
          answer: {
            maxMarks: 1,
            response: { kind: 'written' },
            prerequisiteConceptIds: [],
            allocations: [
              {
                id: 'allocation-origin',
                criterion: 'Explains the cell',
                maxMarks: 1,
                dimension: 'knowledge',
                targetConceptIds: [],
              },
            ],
          },
        },
      ],
    });
    let attempt = await startQuestionSetAttempt(set.id, 'paper', 10);
    const longAnswer = 'Detailed biological explanation. '.repeat(4_000);
    attempt = await saveQuestionSetResponseDraft(
      attempt.id,
      attempt.revisionId,
      'question-origin',
      { kind: 'written', text: longAnswer },
      'question-origin',
      11,
    );
    attempt = await submitQuestionSetPaper(attempt.id, attempt.revisionId, 12);
    const longComment = 'Evidence note. '.repeat(2_000);
    await saveQuestionSetMarking(
      attempt.id,
      attempt.revisionId,
      {
        decisions: [],
        annotations: [
          { id: 'annotation-1', nodeId: 'question-origin', comment: longComment, createdAt: 13 },
        ],
        corrections: [],
        reflection: { reasons: [], note: '' },
        activeNodeId: 'question-origin',
        activeAllocationId: 'allocation-origin',
      },
      13,
    );

    const backup = await exportDatabase();
    await db.questionSetAttempts.clear();
    await importBackup(backup, 'replace');

    const restored = await db.questionSetAttempts.get(attempt.id);
    expect(restored?.responses[0].submitted).toEqual({ kind: 'written', text: longAnswer });
    expect(restored?.annotations).toEqual([
      { id: 'annotation-1', nodeId: 'question-origin', comment: longComment, createdAt: 13 },
    ]);
  });

  it('refuses to export a Question Set whose referenced diagram is missing', async () => {
    const course = await createCourse('Biology');
    const image = await storeImageBlob(
      new Blob(['diagram'], { type: 'image/png' }),
      'image/png',
      32,
      24,
    );
    await createQuestionSet({
      id: 'set-origin',
      courseId: course.id,
      title: 'Cell paper',
      lessonIds: [],
      assessmentIds: [],
      questions: [
        {
          id: 'question-origin',
          prompt: `Explain the diagram. ![Cell](${assetUrl(image.hash)})`,
          parts: [],
          answer: {
            maxMarks: 1,
            response: { kind: 'written' },
            prerequisiteConceptIds: [],
            allocations: [
              {
                id: 'allocation-origin',
                criterion: 'Explains the cell',
                maxMarks: 1,
                dimension: 'knowledge',
                targetConceptIds: [],
              },
            ],
          },
        },
      ],
    });
    await db.assets.delete(image.hash);

    await expect(buildCourseFile(course.id)).rejects.toThrow(/missing media/i);
  });
});
