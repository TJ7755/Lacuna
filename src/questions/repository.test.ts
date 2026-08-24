import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { createCard, createCourse } from '../db/repository';
import { questionGeneratorRegistry } from './generators';
import {
  abandonQuestionAttempt,
  answerQuestionAttempt,
  createConcept,
  createFixedQuestion,
  createGeneratedQuestion,
  deleteConcept,
  deleteQuestion,
  recordQuestionCorrection,
  restoreConcept,
  restoreQuestion,
  snapshotConcept,
  snapshotQuestion,
  startQuestionAttempt,
  undoQuestionAttempt,
  updateConcept,
  updateFixedQuestion,
  updateGeneratedQuestion,
} from './repository';

async function reset(): Promise<void> {
  await Promise.all([
    db.cards.clear(),
    db.concepts.clear(),
    db.questions.clear(),
    db.questionConcepts.clear(),
    db.questionAttempts.clear(),
    db.courses.clear(),
    db.courseAssessments.clear(),
    db.schedulingUnits.clear(),
    db.coursePerformance.clear(),
    db.schedulingPerformance.clear(),
    db.reviewHistory.clear(),
    db.sessionHistory.clear(),
    db.tombstones.clear(),
  ]);
}

async function fixture() {
  const course = await createCourse('Algebra');
  const target = await createConcept(course.id, 'Solve a linear equation');
  const prerequisite = await createConcept(course.id, 'Collect like terms');
  const question = await createFixedQuestion({
    courseId: course.id,
    name: 'Linear equation application',
    prompt: 'Solve $2x + 1 = 7$.',
    payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '3' } },
    explanation: 'Subtract 1, then divide by 2.',
    targetConceptId: target.id,
    prerequisiteConceptIds: [prerequisite.id],
  });
  return { course, target, prerequisite, question };
}

describe('Question repository', () => {
  beforeEach(reset);

  it('creates a Question and its one-target relationship set atomically', async () => {
    const { course, target, prerequisite, question } = await fixture();

    expect(await db.questions.get(question.id)).toEqual(question);
    expect(await db.questionConcepts.get(question.id)).toMatchObject({
      courseId: course.id,
      targetConceptIds: [target.id],
      prerequisiteConceptIds: [prerequisite.id],
      authoringRevisionId: question.authoringRevisionId,
    });

    const otherCourse = await createCourse('Geometry');
    const foreign = await createConcept(otherCourse.id, 'Angles');
    await expect(
      createFixedQuestion({
        courseId: course.id,
        name: 'Invalid',
        prompt: 'Question?',
        payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '1' } },
        explanation: 'Answer.',
        targetConceptId: foreign.id,
      }),
    ).rejects.toThrow('primary target Concept');
    expect((await db.questions.toArray()).some((candidate) => candidate.name === 'Invalid')).toBe(
      false,
    );
  });

  it('persists the rendered receipt before answering and never touches Card evidence', async () => {
    const { course, question } = await fixture();
    const card = await createCard(course.id, 'front_back', 'Recall prompt', 'Recall answer');
    const cardBefore = await db.cards.get(card.id);
    const cardEvidenceBefore = {
      reviews: await db.reviewHistory.count(),
      sessions: await db.sessionHistory.count(),
      coursePerformance: await db.coursePerformance.toArray(),
      schedulingPerformance: await db.schedulingPerformance.toArray(),
    };

    const shown = await startQuestionAttempt({
      questionId: question.id,
      sessionId: 'question-session',
      now: 1_000,
    });
    expect(await db.questionAttempts.get(shown.id)).toMatchObject({
      status: 'shown',
      renderedPrompt: question.prompt,
      renderedExplanation: question.explanation,
      scheduleEffect: { kind: 'none' },
    });

    const answered = await answerQuestionAttempt({
      attemptId: shown.id,
      submittedAnswer: '3',
      marksEarned: 1,
      marksAvailable: 1,
      responseTimeSeconds: 12,
      now: 2_000,
    });
    expect(answered.attempt).toMatchObject({
      status: 'answered',
      grade: 3,
      scheduleEffect: { kind: 'replay', grade: 3 },
      schedulerVersion: 'fsrs-6-question-v1',
      gradeMappingVersion: 'full-good-otherwise-again-v1',
    });
    expect(answered.question.reps).toBe(1);

    expect(await db.cards.get(card.id)).toEqual(cardBefore);
    expect(await db.reviewHistory.count()).toBe(cardEvidenceBefore.reviews);
    expect(await db.sessionHistory.count()).toBe(cardEvidenceBefore.sessions);
    expect(await db.coursePerformance.toArray()).toEqual(cardEvidenceBefore.coursePerformance);
    expect(await db.schedulingPerformance.toArray()).toEqual(
      cardEvidenceBefore.schedulingPerformance,
    );
  });

  it('records an incomplete first submission as Again and keeps correction evidence separate', async () => {
    const { question } = await fixture();
    const shown = await startQuestionAttempt({
      questionId: question.id,
      sessionId: 'partial-session',
      now: 1_000,
    });
    const result = await answerQuestionAttempt({
      attemptId: shown.id,
      submittedAnswer: '2',
      marksEarned: 0,
      marksAvailable: 1,
      now: 2_000,
    });
    const corrected = await recordQuestionCorrection({
      attemptId: shown.id,
      submittedAnswer: '3',
      marksEarned: 1,
      marksAvailable: 1,
      now: 2_500,
    });

    expect(result.attempt.grade).toBe(1);
    expect(result.attempt.submittedAnswer).toBe('2');
    expect(corrected.correction?.submittedAnswer).toBe('3');
    expect(corrected.grade).toBe(1);
  });

  it('keeps corrections out of the immutable first submission', async () => {
    const { question } = await fixture();
    const shown = await startQuestionAttempt({
      questionId: question.id,
      sessionId: 'correction-boundary-session',
      now: 1_000,
    });
    const input = {
      attemptId: shown.id,
      submittedAnswer: '2',
      marksEarned: 0,
      marksAvailable: 1,
      // @ts-expect-error Corrections must enter through recordQuestionCorrection.
      correction: {
        submittedAt: 2_000,
        submittedAnswer: '3',
        marksEarned: 1,
        marksAvailable: 1,
      },
      now: 2_000,
    } satisfies Parameters<typeof answerQuestionAttempt>[0];

    const answered = await answerQuestionAttempt(input);

    expect(answered.attempt.correction).toBeUndefined();
  });

  it('withholds scheduling for disputed checker evidence', async () => {
    const { question } = await fixture();
    const shown = await startQuestionAttempt({
      questionId: question.id,
      sessionId: 'dispute-session',
      now: 1_000,
    });
    const result = await answerQuestionAttempt({
      attemptId: shown.id,
      submittedAnswer: '3',
      marksEarned: 1,
      marksAvailable: 1,
      checkerDisputes: [
        {
          reportedAt: 1_500,
          question: 'Solve',
          studentLine: '3',
          verdict: { correct: false, marksEarned: 0 },
          checkerSeeds: [],
        },
      ],
      now: 2_000,
    });

    expect(result.attempt.grade).toBeUndefined();
    expect(result.attempt.scheduleEffect).toEqual({ kind: 'none' });
    expect(result.question.reps).toBe(0);
  });

  it.each([
    { label: 'fractional earned marks', marksEarned: 0.5, marksAvailable: 1 },
    { label: 'fractional available marks', marksEarned: 0, marksAvailable: 1.5 },
    { label: 'no available marks', marksEarned: 0, marksAvailable: 0 },
    { label: 'negative earned marks', marksEarned: -1, marksAvailable: 1 },
    { label: 'earned marks above the available total', marksEarned: 2, marksAvailable: 1 },
  ])('rejects $label before recording the first submission', async (marks) => {
    const { question } = await fixture();
    const shown = await startQuestionAttempt({
      questionId: question.id,
      sessionId: `invalid-marks:${marks.label}`,
      now: 1_000,
    });

    await expect(
      answerQuestionAttempt({
        attemptId: shown.id,
        submittedAnswer: 'invalid',
        marksEarned: marks.marksEarned,
        marksAvailable: marks.marksAvailable,
        now: 2_000,
      }),
    ).rejects.toThrow('Question submission marks are invalid.');

    await expect(
      answerQuestionAttempt({
        attemptId: shown.id,
        submittedAnswer: '3',
        marksEarned: 1,
        marksAvailable: 1,
        now: 2_500,
      }),
    ).resolves.toMatchObject({ recorded: true });
  });

  it('retains the schedule epoch for presentation edits and resets it for semantic edits', async () => {
    const { question } = await fixture();
    const presentation = await updateFixedQuestion(question.id, {
      explanation: 'A clearer worked explanation.',
    });
    expect(presentation.scheduleEpoch.id).toBe(question.scheduleEpoch.id);
    expect(presentation.contentVersion).toBe(question.contentVersion);

    const semantic = await updateFixedQuestion(question.id, {
      prompt: 'Solve $3x + 1 = 7$.',
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '2' } },
    });
    expect(semantic.scheduleEpoch.id).not.toBe(question.scheduleEpoch.id);
    expect(semantic.scheduleEpoch.reason).toBe('semantic-edit');
    expect(semantic.contentVersion).toBe(question.contentVersion + 1);
    expect(semantic.reps).toBe(0);
  });

  it('undoes by marking immutable evidence and replaying the current epoch', async () => {
    const { question } = await fixture();
    const shown = await startQuestionAttempt({
      questionId: question.id,
      sessionId: 'undo-session',
      now: 1_000,
    });
    await answerQuestionAttempt({
      attemptId: shown.id,
      submittedAnswer: '3',
      marksEarned: 1,
      marksAvailable: 1,
      now: 2_000,
    });

    const undone = await undoQuestionAttempt(shown.id, 3_000);
    expect(undone.attempt.status).toBe('answered');
    expect(undone.attempt.undoneAt).toBe(3_000);
    expect(undone.question.reps).toBe(0);
    expect((await db.questionAttempts.get(shown.id))?.submittedAnswer).toBe('3');
  });

  it('records abandon without scheduling and retains attempts when a Question is deleted', async () => {
    const { question } = await fixture();
    const shown = await startQuestionAttempt({
      questionId: question.id,
      sessionId: 'abandon-session',
      now: 1_000,
    });
    await abandonQuestionAttempt(shown.id, 1_500);
    await deleteQuestion(question.id, 2_000);

    expect(await db.questions.get(question.id)).toBeUndefined();
    expect(await db.questionConcepts.get(question.id)).toBeUndefined();
    expect(await db.questionAttempts.get(shown.id)).toMatchObject({
      status: 'abandoned',
      abandonedAt: 1_500,
    });
    expect(await db.tombstones.get(['questions', question.id])).toBeDefined();
  });

  it('restores authored Question state without replacing immutable attempts', async () => {
    const { question } = await fixture();
    const shown = await startQuestionAttempt({
      questionId: question.id,
      sessionId: 'restore-session',
      now: 1_000,
    });
    await answerQuestionAttempt({
      attemptId: shown.id,
      submittedAnswer: '3',
      marksEarned: 1,
      marksAvailable: 1,
      now: 2_000,
    });
    const attemptBefore = await db.questionAttempts.get(shown.id);
    const snapshot = await snapshotQuestion(question.id);
    expect(snapshot).not.toBeNull();

    await deleteQuestion(question.id, 3_000);
    await restoreQuestion(snapshot!);

    expect(await db.questions.get(question.id)).toEqual(snapshot!.question);
    expect(await db.questionConcepts.get(question.id)).toEqual(snapshot!.concepts);
    expect(await db.questionAttempts.get(shown.id)).toEqual(attemptBefore);
    expect(await db.tombstones.get(['questions', question.id])).toBeUndefined();
    expect(await db.tombstones.get(['questionConcepts', question.id])).toBeUndefined();
  });

  it('restores an unreferenced Concept only into its original Course scope', async () => {
    const course = await createCourse('Geometry');
    const concept = await createConcept(course.id, 'Circle theorems');
    const snapshot = await snapshotConcept(concept.id);
    expect(snapshot).toEqual(concept);
    if (snapshot?.scope !== 'course') throw new Error('Expected a Course Concept fixture.');

    await deleteConcept(concept.id, 1_000);
    await restoreConcept(snapshot);
    expect(await db.concepts.get(concept.id)).toEqual(concept);
    expect(await db.tombstones.get(['concepts', concept.id])).toBeUndefined();

    await deleteConcept(concept.id, 2_000);
    await expect(
      restoreConcept({
        ...snapshot,
        courseId: 'missing-course',
        scopeKey: 'course:missing-course',
      }),
    ).rejects.toThrow('missing Course');
    expect(await db.concepts.get(concept.id)).toBeUndefined();
  });

  it('does not let a legacy scheduling-unit Concept claim verified status', async () => {
    await db.concepts.add({
      id: 'legacy-concept',
      scope: 'legacy-scheduling-unit',
      scopeKey: 'legacy-scheduling-unit:legacy-unit',
      courseId: null,
      legacySchedulingUnitId: 'legacy-unit',
      name: 'Migrated knowledge',
      provisional: true,
      createdAt: 1,
      updatedAt: 1,
    });

    await expect(updateConcept('legacy-concept', { provisional: false })).rejects.toThrow(
      'must remain provisional',
    );
    expect(await db.concepts.get('legacy-concept')).toMatchObject({ provisional: true });
  });

  it('updates a generated family semantically and refuses to delete referenced Concepts', async () => {
    const course = await createCourse('Quadratics');
    const concept = await createConcept(course.id, 'Solve quadratic equations');
    const configuration = {
      minimumRootMagnitude: 1,
      maximumRootMagnitude: 2,
      maximumLeadingCoefficient: 1,
      allowRepeatedRoots: false,
    };
    const question = await createGeneratedQuestion({
      courseId: course.id,
      name: 'Quadratic family',
      generatorKey: 'integer-root-quadratic',
      generatorVersion: 1,
      generatorConfig: configuration,
      targetConceptId: concept.id,
    });

    await expect(deleteConcept(concept.id)).rejects.toThrow('still referenced');
    const updated = await updateGeneratedQuestion(question.id, {
      generatorConfig: { ...configuration, maximumLeadingCoefficient: 2 },
    });
    expect(updated.contentVersion).toBe(2);
    expect(updated.scheduleEpoch.id).not.toBe(question.scheduleEpoch.id);

    await deleteQuestion(question.id);
    await expect(deleteConcept(concept.id)).resolves.toBeUndefined();
  });

  it('rejects generated receipts that differ from deterministic regeneration', async () => {
    const course = await createCourse('Quadratics');
    const concept = await createConcept(course.id, 'Solve quadratic equations');
    const configuration = {
      minimumRootMagnitude: 1,
      maximumRootMagnitude: 2,
      maximumLeadingCoefficient: 1,
      allowRepeatedRoots: false,
    };
    const question = await createGeneratedQuestion({
      courseId: course.id,
      name: 'Quadratic family',
      generatorKey: 'integer-root-quadratic',
      generatorVersion: 1,
      generatorConfig: configuration,
      targetConceptId: concept.id,
    });
    const resolved = questionGeneratorRegistry.resolve({
      generatorKey: question.generatorKey,
      generatorVersion: question.generatorVersion,
      configuration: question.generatorConfig,
      seed: 'repository-receipt-seed',
    });
    const forgedReceipts = [
      { ...resolved, renderedPrompt: `${resolved.renderedPrompt} Forged.` },
      { ...resolved, renderedExplanation: `${resolved.renderedExplanation} Forged.` },
      {
        ...resolved,
        resolvedPayload: {
          v: 1,
          kind: 'numeric',
          answer: { kind: 'exact', value: '999' },
        } as const,
      },
      { ...resolved, parameters: { ...resolved.parameters, root1: 999 } },
      { ...resolved, generatorFingerprint: `${resolved.generatorFingerprint}:forged` },
    ];

    for (const [index, instance] of forgedReceipts.entries()) {
      await expect(
        startQuestionAttempt({
          questionId: question.id,
          sessionId: 'generated-receipt-session',
          attemptId: `forged-receipt-${index}`,
          instance,
          now: 1_000 + index,
        }),
      ).rejects.toThrow('The generated Question receipt does not match its definition.');
    }

    await expect(
      startQuestionAttempt({
        questionId: question.id,
        sessionId: 'generated-receipt-session',
        attemptId: 'authentic-receipt',
        instance: resolved,
        now: 2_000,
      }),
    ).resolves.toMatchObject({ renderedPrompt: resolved.renderedPrompt });
  });
});
