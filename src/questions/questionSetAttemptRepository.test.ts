import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createCourse } from '../db/repository';
import { createLesson } from '../db/lessonRepository';
import { deleteCourse, restoreCourse, snapshotCourse } from '../db/courseRepository';
import { db } from '../db/schema';
import { exportDatabase, importBackup } from '../db/portability';
import { assetUrl, collectOrphanedAssets, storeImageBlob } from '../db/assets';
import { createConcept } from './repository';
import { createQuestionSet, deleteQuestionSet, updateQuestionSet } from './questionSetRepository';
import {
  completeQuestionSetAttempt,
  getQuestionSetAttempt,
  recordQuestionSetAssistance,
  saveQuestionSetMarking,
  saveQuestionSetResponseDraft,
  startQuestionSetAttempt,
  submitPracticeQuestion,
  submitQuestionSetPaper,
} from './questionSetAttemptRepository';
import { feedbackAvailable } from './questionSetAttempts';
import { parseQuestionSetAttemptRecord } from './questionSetAttemptCodec';
import type { QuestionSet } from './questionSets';

async function setFixture(): Promise<Awaited<ReturnType<typeof createQuestionSet>>> {
  const course = await createCourse('Biology');
  const lesson = await createLesson(course.id, 'Cells');
  const concept = await createConcept(course.id, 'Nucleus');
  const content: QuestionSet = {
    id: 'set-1',
    courseId: course.id,
    title: 'Cells',
    lessonIds: [lesson.id],
    assessmentIds: [],
    questions: [
      {
        id: 'q1',
        prompt: 'Describe the nucleus.',
        parts: [],
        answer: {
          maxMarks: 1,
          response: { kind: 'written' },
          prerequisiteConceptIds: [],
          allocations: [
            {
              id: 'a1',
              criterion: 'Control',
              maxMarks: 1,
              dimension: 'knowledge',
              targetConceptIds: [concept.id],
            },
          ],
        },
      },
      {
        id: 'q2',
        prompt: 'Choose.',
        parts: [],
        answer: {
          maxMarks: 1,
          response: {
            kind: 'multiple-choice',
            selection: 'single',
            options: [
              { id: 'o1', content: 'A' },
              { id: 'o2', content: 'B' },
            ],
            correctOptionIds: ['o2'],
          },
          prerequisiteConceptIds: [],
          allocations: [
            {
              id: 'a2',
              criterion: 'Correct option',
              maxMarks: 1,
              dimension: 'application',
              targetConceptIds: [],
            },
          ],
        },
      },
    ],
  };
  return createQuestionSet(content, 100);
}

describe('Question Set attempt repository', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  it('pins an immutable receipt and submitted original after authored content changes and deletion', async () => {
    const set = await setFixture();
    let attempt = await startQuestionSetAttempt(set.id, 'practice', 200);
    attempt = await saveQuestionSetResponseDraft(
      attempt.id,
      attempt.revisionId,
      'q1',
      { kind: 'written', text: 'Original' },
      'q1',
      210,
    );
    attempt = await submitPracticeQuestion(attempt.id, attempt.revisionId, 'q1', 220);
    const changed = { ...set, title: 'Changed cells' };
    await updateQuestionSet(set.id, changed, {
      expectedContentRevisionId: set.contentRevisionId,
      now: 230,
    });
    await deleteQuestionSet(set.id, 240);

    const retained = await getQuestionSetAttempt(attempt.id);
    expect(retained?.receipt.title).toBe('Cells');
    expect(retained?.responses[0].submitted).toEqual({ kind: 'written', text: 'Original' });
    expect(feedbackAvailable(retained!, 'q1')).toBe(true);
    await expect(
      saveQuestionSetResponseDraft(
        attempt.id,
        attempt.revisionId,
        'q1',
        { kind: 'written', text: 'Rewrite' },
        'q1',
        250,
      ),
    ).rejects.toThrow('immutable');
  });

  it('keeps Paper feedback hidden until every original response is captured', async () => {
    const set = await setFixture();
    let attempt = await startQuestionSetAttempt(set.id, 'paper', 200);
    attempt = await saveQuestionSetResponseDraft(
      attempt.id,
      attempt.revisionId,
      'q1',
      { kind: 'written', text: 'Answer' },
      'q2',
      210,
    );
    expect(feedbackAvailable(attempt, 'q1')).toBe(false);
    attempt = await submitQuestionSetPaper(attempt.id, attempt.revisionId, 220);
    expect(attempt.status).toBe('marking');
    expect(feedbackAvailable(attempt, 'q1')).toBe(true);
    expect(attempt.responses.every((response) => response.submittedAt === 220)).toBe(true);
  });

  it('distinguishes an explicit zero from unresolved and resumes the active criterion', async () => {
    const set = await setFixture();
    let attempt = await startQuestionSetAttempt(set.id, 'paper', 200);
    attempt = await submitQuestionSetPaper(attempt.id, attempt.revisionId, 220);
    attempt = await saveQuestionSetMarking(
      attempt.id,
      attempt.revisionId,
      {
        decisions: [
          { allocationId: 'a1', status: 'awarded', marks: 0 },
          { allocationId: 'a2', status: 'unsure' },
        ],
        annotations: [],
        corrections: [{ nodeId: 'q1', content: 'Corrected', updatedAt: 230 }],
        reflection: { reasons: ['forgotten-knowledge'], note: 'Review this.' },
        activeNodeId: 'q2',
        activeAllocationId: 'a2',
      },
      230,
    );
    expect(attempt.activeAllocationId).toBe('a2');
    await expect(completeQuestionSetAttempt(attempt.id, attempt.revisionId, 240)).rejects.toThrow(
      'Resolve every',
    );
    attempt = await saveQuestionSetMarking(
      attempt.id,
      attempt.revisionId,
      {
        decisions: [
          { allocationId: 'a1', status: 'awarded', marks: 0 },
          { allocationId: 'a2', status: 'awarded', marks: 0 },
        ],
        annotations: [],
        corrections: attempt.corrections,
        reflection: attempt.reflection,
        activeNodeId: 'q2',
        activeAllocationId: 'a2',
      },
      250,
    );
    attempt = await completeQuestionSetAttempt(attempt.id, attempt.revisionId, 260);
    expect(attempt.status).toBe('complete');
    expect(attempt.completedAt).toBe(260);
  });

  it('round-trips attempts and their immutable receipts through replacement backup', async () => {
    const set = await setFixture();
    const attempt = await startQuestionSetAttempt(set.id, 'paper', 200);
    const backup = await exportDatabase();
    expect(backup.app).toBe('lacuna-v13');
    expect(backup.questionSetAttempts).toEqual([attempt]);
    await db.questionSetAttempts.clear();
    await importBackup(backup, 'replace');
    expect(await getQuestionSetAttempt(attempt.id)).toEqual(attempt);
    await db.questionSetAttempts.clear();
    await importBackup(backup, 'merge');
    expect(await getQuestionSetAttempt(attempt.id)).toEqual(attempt);
  });

  it('cascades and restores attempts with their Course', async () => {
    const set = await setFixture();
    const attempt = await startQuestionSetAttempt(set.id, 'practice', 200);
    const snapshot = await snapshotCourse(set.courseId);
    await deleteCourse(set.courseId);
    expect(await getQuestionSetAttempt(attempt.id)).toBeNull();
    await restoreCourse(snapshot!);
    expect(await getQuestionSetAttempt(attempt.id)).toEqual(attempt);
  });

  it('rejects malformed nested evidence and inconsistent lifecycle state at the storage boundary', async () => {
    const set = await setFixture();
    const attempt = await startQuestionSetAttempt(set.id, 'paper', 200);
    expect(() =>
      parseQuestionSetAttemptRecord({
        ...attempt,
        responses: [...attempt.responses, attempt.responses[0]],
      }),
    ).toThrow(/responses/i);
    expect(() =>
      parseQuestionSetAttemptRecord({
        ...attempt,
        responses: attempt.responses.map((row) =>
          row.nodeId === 'q2'
            ? { ...row, draft: { kind: 'multiple-choice', selectedOptionIds: ['missing'] } }
            : row,
        ),
      }),
    ).toThrow(/responses/i);
    expect(() =>
      parseQuestionSetAttemptRecord({
        ...attempt,
        decisions: [{ allocationId: 'a1', status: 'awarded', marks: 0 }],
      }),
    ).toThrow(/decisions/i);
    expect(() =>
      parseQuestionSetAttemptRecord({
        ...attempt,
        annotations: [{ id: 'note-1', nodeId: 'missing', start: 3, comment: '', createdAt: 210 }],
      }),
    ).toThrow(/annotations/i);
    expect(() =>
      parseQuestionSetAttemptRecord({
        ...attempt,
        corrections: [{ nodeId: 'missing', content: '', updatedAt: 210 }],
      }),
    ).toThrow(/corrections/i);
    expect(() =>
      parseQuestionSetAttemptRecord({ ...attempt, revealedQuestionIds: ['q1'] }),
    ).toThrow(/Paper submission/i);
    expect(() =>
      parseQuestionSetAttemptRecord({ ...attempt, status: 'complete', completedAt: 220 }),
    ).toThrow(/lifecycle|unresolved/i);
  });

  it('retains media owned only by a deleted authored-set attempt receipt', async () => {
    const initial = await setFixture();
    const image = await storeImageBlob(
      new Blob(['receipt'], { type: 'image/png' }),
      'image/png',
      1,
      1,
    );
    const content = {
      ...initial,
      questions: initial.questions.map((question) => ({
        ...question,
        prompt: `${question.prompt}\n\n![diagram](${assetUrl(image.hash)})`,
      })),
    };
    const revised = await updateQuestionSet(initial.id, content, {
      expectedContentRevisionId: initial.contentRevisionId,
      now: 150,
    });
    await startQuestionSetAttempt(revised.id, 'practice', 200);
    await deleteQuestionSet(revised.id, 220);
    expect(await collectOrphanedAssets()).toBe(0);
    expect(await db.assets.get(image.hash)).toBeDefined();
  });

  it('recovery merge unions concurrent Practice submissions, reveals and assistance', async () => {
    const set = await setFixture();
    let base = await startQuestionSetAttempt(set.id, 'practice', 200);
    base = await saveQuestionSetResponseDraft(
      base.id,
      base.revisionId,
      'q1',
      { kind: 'written', text: 'First' },
      'q1',
      210,
    );
    base = await saveQuestionSetResponseDraft(
      base.id,
      base.revisionId,
      'q2',
      { kind: 'multiple-choice', selectedOptionIds: ['o2'] },
      'q2',
      220,
    );

    let local = await submitPracticeQuestion(base.id, base.revisionId, 'q1', 230);
    local = await recordQuestionSetAssistance(
      local.id,
      local.revisionId,
      { nodeId: 'q1', kind: 'related-knowledge', occurredAt: 225 },
      231,
    );

    await db.questionSetAttempts.put(base);
    let incoming = await submitPracticeQuestion(base.id, base.revisionId, 'q2', 240);
    incoming = await recordQuestionSetAssistance(
      incoming.id,
      incoming.revisionId,
      { nodeId: 'q2', kind: 'answer-revealed', occurredAt: 235 },
      241,
    );
    const backup = await exportDatabase();

    await db.questionSetAttempts.put(local);
    await importBackup(backup, 'merge');
    const merged = (await getQuestionSetAttempt(base.id))!;
    expect(merged.responses.every((response) => response.submitted)).toBe(true);
    expect(merged.revealedQuestionIds).toEqual(['q1', 'q2']);
    expect(merged.status).toBe('marking');
    expect(merged.assistance).toHaveLength(2);
  });
});
