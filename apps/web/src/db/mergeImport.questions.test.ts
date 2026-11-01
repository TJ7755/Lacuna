import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { importLineageFirstTime, mergeLineageUpdate } from './mergeImport';
import { answerQuestionAttempt, startQuestionAttempt } from '../questions/repository';
import { questionPayloadV3 } from './mergeImport.testFixtures';

describe('mergeImport: v3 Question lineage', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('adopts shared Concept and Question identities while keeping Card presentations separate', async () => {
    const { course } = await importLineageFirstTime(questionPayloadV3());

    const cards = await db.cards.where('courseId').equals(course.id).sortBy('createdAt');
    expect(cards).toHaveLength(2);
    expect(cards.map((card) => card.conceptId)).toEqual(['concept-quadratic', 'concept-quadratic']);
    expect(await db.concepts.get('concept-quadratic')).toMatchObject({
      courseId: course.id,
      name: 'Solve a quadratic equation',
    });
    expect(await db.questions.get('question-quadratic')).toMatchObject({
      courseId: course.id,
      kind: 'fixed',
      reps: 0,
      due: null,
    });
    expect(await db.questionAttempts.count()).toBe(0);
    expect(await db.lineageIdMappings.get('lineage-questions')).toMatchObject({
      conceptIds: ['concept-quadratic'],
      questionIds: ['question-quadratic'],
    });
  });

  it('stamps updatedAt when a merge reassigns a card to another concept', async () => {
    const { course } = await importLineageFirstTime(questionPayloadV3());
    const before = (await db.cards.get('card-quadratic-example'))!;
    await new Promise((resolve) => setTimeout(resolve, 2));

    const base = questionPayloadV3();
    await mergeLineageUpdate(
      course.id,
      questionPayloadV3({
        at: 2_000,
        rv: 2,
        lessons: [
          {
            ...base.lessons[0],
            cards: base.lessons[0].cards.map((card) =>
              card.id === 'card-quadratic-example' ? { ...card, co: 'concept-factorise' } : card,
            ),
          },
        ],
        concepts: [...base.concepts, { id: 'concept-factorise', n: 'Factorise a quadratic' }],
      }),
    );

    const after = (await db.cards.get('card-quadratic-example'))!;
    expect(after.conceptId).toBe('concept-factorise');
    expect(after.updatedAt).toBeGreaterThan(before.updatedAt!);
  });

  it('applies teacher Question edits without touching immutable local attempts', async () => {
    const first = questionPayloadV3();
    const { course } = await importLineageFirstTime(first);
    const shown = await startQuestionAttempt({
      questionId: 'question-quadratic',
      sessionId: 'session-questions',
      attemptId: 'attempt-quadratic',
      now: 2_000,
    });
    await answerQuestionAttempt({
      attemptId: shown.id,
      submittedAnswer: '2',
      marksEarned: 1,
      marksAvailable: 1,
      now: 3_000,
    });
    const scheduled = (await db.questions.get('question-quadratic'))!;
    expect(scheduled.reps).toBe(1);

    const sharedQuestion = first.questions[0];
    if (sharedQuestion.k !== 0) throw new Error('Expected a fixed Question fixture.');
    await mergeLineageUpdate(
      course.id,
      questionPayloadV3({
        at: 4_000,
        rv: 2,
        questions: [
          {
            ...sharedQuestion,
            n: 'Apply factorisation',
            e: 'Use the difference of two squares, then set each factor equal to zero.',
          },
        ],
      }),
    );
    const presentationEdit = (await db.questions.get('question-quadratic'))!;
    expect(presentationEdit.name).toBe('Apply factorisation');
    expect(presentationEdit.contentVersion).toBe(scheduled.contentVersion);
    expect(presentationEdit.scheduleEpoch.id).toBe(scheduled.scheduleEpoch.id);
    expect(presentationEdit.reps).toBe(1);

    await mergeLineageUpdate(
      course.id,
      questionPayloadV3({
        at: 5_000,
        rv: 3,
        questions: [
          {
            ...sharedQuestion,
            f: 'What is the positive root of x² - 9 = 0?',
            p: {
              v: 1,
              kind: 'numeric',
              answer: { kind: 'exact', value: '3' },
            },
          },
        ],
      }),
    );
    const semanticEdit = (await db.questions.get('question-quadratic'))!;
    expect(semanticEdit.contentVersion).toBe(scheduled.contentVersion + 1);
    expect(semanticEdit.scheduleEpoch.id).not.toBe(scheduled.scheduleEpoch.id);
    expect(semanticEdit.reps).toBe(0);
    expect(semanticEdit.due).toBeNull();

    const immutableAttempt = await db.questionAttempts.get('attempt-quadratic');
    expect(immutableAttempt).toMatchObject({
      renderedPrompt: 'What is the positive root of x² - 4 = 0?',
      submittedAnswer: '2',
      marksEarned: 1,
    });

    await mergeLineageUpdate(course.id, questionPayloadV3({ at: 6_000, rv: 4, questions: [] }));
    expect(await db.questions.get('question-quadratic')).toBeUndefined();
    expect(await db.questionConcepts.get('question-quadratic')).toBeUndefined();
    expect(await db.questionAttempts.get('attempt-quadratic')).toEqual(immutableAttempt);
  });

  it('starts a new Question schedule when only the teacher prompt changes', async () => {
    const first = questionPayloadV3();
    const { course } = await importLineageFirstTime(first);
    const shown = await startQuestionAttempt({
      questionId: 'question-quadratic',
      sessionId: 'session-questions',
      attemptId: 'attempt-prompt-only',
      now: 2_000,
    });
    await answerQuestionAttempt({
      attemptId: shown.id,
      submittedAnswer: '2',
      marksEarned: 1,
      marksAvailable: 1,
      now: 3_000,
    });
    const scheduled = (await db.questions.get('question-quadratic'))!;
    const sharedQuestion = first.questions[0];
    if (sharedQuestion.k !== 0) throw new Error('Expected a fixed Question fixture.');

    await mergeLineageUpdate(
      course.id,
      questionPayloadV3({
        at: 4_000,
        rv: 2,
        questions: [{ ...sharedQuestion, f: 'What is the negative root of x² - 4 = 0?' }],
      }),
    );

    const edited = (await db.questions.get('question-quadratic'))!;
    expect(edited.contentVersion).toBe(scheduled.contentVersion + 1);
    expect(edited.scheduleEpoch.id).not.toBe(scheduled.scheduleEpoch.id);
    expect(edited.reps).toBe(0);
    expect(edited.due).toBeNull();
  });

  it('stamps updatedAt when a lineage merge reassigns a card concept', async () => {
    // Regression for #326: the concept reassignment path wrote conceptId without
    // stampUpdatedAt, so the reassignment kept its old timestamp and could lose a
    // later last-write-wins peer merge against an older peer row.
    const { course } = await importLineageFirstTime(questionPayloadV3());
    const targetId = 'card-quadratic-definition';
    const before = (await db.cards.get(targetId))!;
    expect(before.conceptId).toBe('concept-quadratic');

    // Force an old timestamp so the test fails when the reassignment does not stamp.
    await db.cards.update(targetId, { updatedAt: 1_000 });
    const peerUpdatedAt = 1_500;

    const first = questionPayloadV3();
    const sharedLesson = first.lessons[0];
    const [firstCard, secondCard] = sharedLesson.cards;
    if (!firstCard || !secondCard) throw new Error('Expected two fixture cards.');
    await mergeLineageUpdate(
      course.id,
      questionPayloadV3({
        at: 5_000,
        rv: 2,
        concepts: [
          { id: 'concept-quadratic', n: 'Solve a quadratic equation' },
          { id: 'concept-linear', n: 'Solve a linear equation' },
        ],
        lessons: [
          {
            ...sharedLesson,
            cards: [{ ...firstCard, co: 'concept-linear' }, secondCard],
          },
        ],
      }),
    );

    const after = (await db.cards.get(targetId))!;
    expect(after.conceptId).toBe('concept-linear');
    // The reassignment must carry a fresh timestamp, otherwise a peer row with the
    // old concept and a newer-than-1000 updatedAt would win the next LWW merge.
    expect(after.updatedAt).toBeGreaterThan(peerUpdatedAt);
    expect(after.updatedAt).toBeGreaterThan(1_000);
  });

  it('never moves updatedAt backwards when reassigning a card concept', async () => {
    // Follow-up from CodeRabbit on #326: stamping with Date.now() alone can lower
    // updatedAt when the card timestamp runs ahead of this clock, so the stamp
    // must exceed both values to preserve last-write-wins selection.
    const { course } = await importLineageFirstTime(questionPayloadV3());
    const targetId = 'card-quadratic-definition';
    const future = Date.now() + 10_000;
    await db.cards.update(targetId, { updatedAt: future });

    const first = questionPayloadV3();
    const sharedLesson = first.lessons[0];
    const [firstCard, secondCard] = sharedLesson.cards;
    if (!firstCard || !secondCard) throw new Error('Expected two fixture cards.');
    await mergeLineageUpdate(
      course.id,
      questionPayloadV3({
        at: 5_000,
        rv: 2,
        concepts: [
          { id: 'concept-quadratic', n: 'Solve a quadratic equation' },
          { id: 'concept-linear', n: 'Solve a linear equation' },
        ],
        lessons: [
          {
            ...sharedLesson,
            cards: [{ ...firstCard, co: 'concept-linear' }, secondCard],
          },
        ],
      }),
    );

    const after = (await db.cards.get(targetId))!;
    expect(after.conceptId).toBe('concept-linear');
    expect(after.updatedAt).toBeGreaterThan(future);
  });
});
