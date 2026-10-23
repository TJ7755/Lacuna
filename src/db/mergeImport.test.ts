import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import type { ShareLesson, SharePayloadV2, SharePayloadV3, SharePayloadV4, SharePayloadV5, SharePayloadV6 } from './share';
import type { Course } from './types';
import {
  acceptAllMergeReview,
  findCourseForLineage,
  importLineageFirstTime,
  mergeLineageUpdate,
} from './mergeImport';
import { performanceForCourseBackingDecks, performanceForReviewUnit } from './backingDecks';
import { recordReview } from './repository';
import { detachCourse } from './courseRepository';
import { hydrateCardsWithHistory } from './reviewHistoryRead';
import { answerQuestionAttempt, startQuestionAttempt } from '../questions/repository';
import { createQuestionSet, deleteQuestionSet, updateQuestionSet } from '../questions/questionSetRepository';
import { exportDatabase, importBackup } from './portability';
import { mergeSnapshots } from '../sync/mergeSnapshots';
import { manualMerge } from '../sync/manualMerge';
import { startQuestionSetAttempt } from '../questions/questionSetAttemptRepository';

// Arc 7 §7.7/§7.9 Task 5: mergeImport.ts. Payloads are built as plain object literals
// (bypassing encode/decode, which Task 3 already tests) matching the real wire shape:
// `li`/`rv` at the payload level, `i` on ShareLesson, `oi` on ShareNote, and ShareCard's
// existing `id` field doubling as the originating card id (see share.ts:68-74/97-121).

function coursePayload(overrides: Partial<SharePayloadV2> = {}): SharePayloadV2 {
  return {
    v: 2,
    by: 'Ms Teacher',
    at: 1000,
    course: { n: 'Biology', o: 0, c: 1000, e: 2_000_000, um: 'open' },
    lessons: [],
    li: 'lineage-1',
    rv: 1,
    ...overrides,
  };
}

function lessonOne(overrides: Partial<ShareLesson> = {}): ShareLesson {
  return {
    i: 'lesson-1',
    n: 'Cells',
    notes: [{ oi: 'note-1', n: 'Intro', c: 'Cells are the basic unit of life.' }],
    cards: [{ id: 'card-1', k: 0 as const, f: 'What is a cell?', b: 'The basic unit of life.' }],
    ...overrides,
  };
}

function questionPayloadV3(overrides: Partial<SharePayloadV3> = {}): SharePayloadV3 {
  return {
    v: 3,
    by: 'Ms Teacher',
    at: 1000,
    course: { n: 'Mathematics', o: 0, c: 1000, e: 2_000_000, um: 'open' },
    lessons: [
      {
        i: 'lesson-questions',
        n: 'Quadratics',
        notes: [],
        cards: [
          {
            id: 'card-quadratic-definition',
            k: 0,
            f: 'What is a quadratic equation?',
            b: 'A polynomial equation of degree two.',
            co: 'concept-quadratic',
          },
          {
            id: 'card-quadratic-example',
            k: 0,
            f: 'Give one quadratic equation.',
            b: 'For example, x² - 4 = 0.',
            co: 'concept-quadratic',
          },
        ],
      },
    ],
    concepts: [{ id: 'concept-quadratic', n: 'Solve a quadratic equation' }],
    questions: [
      {
        id: 'question-quadratic',
        k: 0,
        n: 'Apply the quadratic method',
        pl: 0,
        t: 'concept-quadratic',
        pr: [],
        f: 'What is the positive root of x² - 4 = 0?',
        p: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '2' } },
        e: 'Factorise to (x - 2)(x + 2) = 0. The positive root is x = 2.',
      },
    ],
    li: 'lineage-questions',
    rv: 1,
    ...overrides,
  };
}

function questionPayloadV4(overrides: Partial<SharePayloadV4> = {}): SharePayloadV4 {
  const base = questionPayloadV3();
  return {
    ...base,
    v: 4,
    questionSets: [
      {
        id: 'set-quadratics',
        courseId: 'teacher-course',
        title: 'Quadratics paper',
        lessonIds: ['lesson-questions'],
        assessmentIds: [],
        questions: [
          {
            id: 'set-question-quadratics',
            prompt: 'Solve x² - 4 = 0.',
            answer: {
              maxMarks: 1,
              response: { kind: 'written' },
              prerequisiteConceptIds: [],
              allocations: [
                {
                  id: 'allocation-quadratics',
                  criterion: 'Finds both roots',
                  maxMarks: 1,
                  dimension: 'knowledge',
                  targetConceptIds: ['concept-quadratic'],
                },
              ],
            },
            parts: [],
          },
        ],
        contentVersion: 1,
        contentRevisionId: 'set-revision-1',
        createdAt: 1_000,
        updatedAt: 1_000,
      },
    ],
    ...overrides,
  };
}

function questionPayloadV5(overrides: Partial<SharePayloadV5> = {}): SharePayloadV5 {
  return {
    ...questionPayloadV4(),
    v: 5,
    questionSetPracticeNodes: [{
      id: 'activity-quadratics', courseId: 'teacher-course', type: 'question-set',
      name: 'Practice Qs', questionSetIds: ['set-quadratics'], afterLessonId: 'lesson-questions',
      createdAt: 1_000, updatedAt: 1_000,
    }],
    ...overrides,
  };
}

describe('mergeImport: first import of a lineage', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('carries answer modes through first import and later author updates', async () => {
    const sharedLesson = lessonOne({ am: 'type' });
    sharedLesson.cards[0].am = 'reveal';
    const { course } = await importLineageFirstTime(coursePayload({ lessons: [sharedLesson] }));
    expect((await db.lessons.get('lesson-1'))?.answerMode).toBe('type');
    expect((await db.cards.get('card-1'))?.answerMode).toBe('reveal');
    await db.courses.update(course.id, { 'distributedCopy.autoAcceptUpdates': true });
    const updatedLesson = lessonOne({ am: 'reveal' });
    updatedLesson.cards[0].am = 'type';
    await mergeLineageUpdate(
      course.id,
      coursePayload({ rv: 2, at: 2000, lessons: [updatedLesson] }),
    );
    expect((await db.lessons.get('lesson-1'))?.answerMode).toBe('reveal');
    expect((await db.cards.get('card-1'))?.answerMode).toBe('type');
    await mergeLineageUpdate(course.id, coursePayload({ rv: 3, at: 3000, lessons: [lessonOne()] }));
    expect((await db.lessons.get('lesson-1'))?.answerMode).toBeUndefined();
    expect((await db.cards.get('card-1'))?.answerMode).toBeUndefined();
  });

  it("carries the teacher's retention, new-card limit and steady scheduling into the copy", async () => {
    const { course } = await importLineageFirstTime(
      coursePayload({
        course: { n: 'Biology', o: 0, c: 1000, um: 'open', r: 0.8, p: 7, sm: 1 },
        lessons: [lessonOne()],
      }),
    );
    const stored = await db.courses.get(course.id);
    expect(stored?.fsrsParameters.requestRetention).toBe(0.8);
    expect(stored?.newCardsPerDay).toBe(7);
    expect(course.schedulingMode).toBe('steady');
  });

  it('imports a plain, untracked copy when the lineage ids are already in use (detached copy)', async () => {
    const payload = coursePayload({ lessons: [lessonOne()] });
    const first = await importLineageFirstTime(payload);
    await detachCourse(first.course.id);

    const second = await importLineageFirstTime(payload);
    expect(second.course.id).not.toBe(first.course.id);
    expect(second.course.distributedCopy).toBeUndefined();
    expect(await db.lessons.where('courseId').equals(second.course.id).count()).toBe(1);
    expect(await db.cards.where('courseId').equals(second.course.id).count()).toBe(1);
    // The detached copy is untouched.
    expect((await db.lessons.get('lesson-1'))?.courseId).toBe(first.course.id);
  });

  it('keeps a first lineage import empty in both review-history stores', async () => {
    const { course } = await importLineageFirstTime(coursePayload({ lessons: [lessonOne()] }));
    const card = (await db.cards.get('card-1'))!;

    expect(card.history).toEqual([]);
    expect(await db.reviewHistory.where('cardId').equals(card.id).count()).toBe(0);
    expect((await hydrateCardsWithHistory([card]))[0].history).toEqual([]);
    expect(course.distributedCopy?.lineageId).toBe('lineage-1');
  });

  it('adopts originating ids and writes the LineageIdMapping registry', async () => {
    const payload = coursePayload({ lessons: [lessonOne()] });
    const { course } = await importLineageFirstTime(payload);

    expect(course.distributedCopy).toEqual({
      lineageId: 'lineage-1',
      revision: 1,
      locked: true,
      autoAcceptUpdates: true,
      sourceLabel: 'Ms Teacher',
      source: { name: 'Biology', description: '', unlockMode: 'open', creator: 'Ms Teacher' },
    });

    const lesson = await db.lessons.get('lesson-1');
    expect(lesson?.name).toBe('Cells');
    const note = await db.notes.get('note-1');
    expect(note?.content).toBe('Cells are the basic unit of life.');
    const card = await db.cards.get('card-1');
    expect(card?.front).toBe('What is a cell?');
    expect(card?.courseId).toBe(course.id);

    const mapping = await db.lineageIdMappings.get('lineage-1');
    expect(mapping?.lessonIds).toEqual(['lesson-1']);
    expect(mapping?.noteIds).toEqual(['note-1']);
    expect(mapping?.cardIds).toEqual(['card-1']);
    expect(mapping?.lessonSnapshots['lesson-1']).toMatchObject({ name: 'Cells' });

    expect(await findCourseForLineage('lineage-1')).toMatchObject({ id: course.id });

    const importedCard = (await db.cards.get('card-1'))!;
    expect(await db.schedulingPerformance.get(importedCard.schedulingUnitId)).toBeDefined();
    expect(await db.coursePerformance.get(course.id)).toBeDefined();
    expect(
      (await performanceForCourseBackingDecks(course.id, [importedCard])).map((row) => row.deckId),
    ).toEqual([importedCard.schedulingUnitId]);
    expect(await performanceForReviewUnit(course.id, 'course')).toMatchObject({
      deckId: course.id,
      totalCorrectReviews: 0,
    });
    expect(await performanceForReviewUnit(importedCard.schedulingUnitId!)).toMatchObject({
      deckId: importedCard.schedulingUnitId,
    });
  });

  it('creates a deterministic same-Course Concept for an adopted Card', async () => {
    const { course } = await importLineageFirstTime(coursePayload({ lessons: [lessonOne()] }));
    const card = (await db.cards.get('card-1'))!;

    expect(card.conceptId).toBe('concept:lineage-card:card-1');
    expect(await db.concepts.get(card.conceptId)).toMatchObject({
      id: card.conceptId,
      scope: 'course',
      scopeKey: `course:${course.id}`,
      courseId: course.id,
      name: 'The basic unit of life.',
      provisional: false,
    });
  });

  it('gives both presentations of an imported reversible Card one Concept', async () => {
    await importLineageFirstTime(
      coursePayload({
        lessons: [
          lessonOne({
            cards: [{ id: 'card-pair', k: 2 as const, f: 'Term', b: 'Definition' }],
          }),
        ],
      }),
    );

    const primary = (await db.cards.get('card-pair'))!;
    const reverse = (await db.cards.get('card-pair::rev'))!;
    expect(primary.conceptId).toBe('concept:lineage-card:card-pair');
    expect(reverse.conceptId).toBe(primary.conceptId);
    expect(primary.id).not.toBe(reverse.id);
    expect(primary.scheduledDays).toBe(0);
    expect(reverse.scheduledDays).toBe(0);
    expect(await db.concepts.where('id').equals(primary.conceptId).count()).toBe(1);
  });

  it('regenerates a sequence-generated card rather than also adopting the packed copy', async () => {
    // A published course packs its sequence-generated cards like any other lesson card,
    // so without the isGeneratedShareCard filter the merge path adopted the packed copy
    // *and* regenerated it from the sequence, leaving two cards for one item.
    await importLineageFirstTime(
      coursePayload({
        lessons: [
          lessonOne({
            cards: [
              { id: 'card-gen-1', k: 0 as const, f: 'stale front', b: 'Brackets', si: 'item-1' },
            ],
          }),
        ],
        sequences: [
          { id: 'seq-1', n: 'Order', items: [{ id: 'item-1', v: 'Brackets' }], cw: 2, pl: 0 },
        ],
      }),
    );

    const cards = await db.cards.toArray();
    expect(cards).toHaveLength(1);
    expect(cards[0].sequenceItemId).toBe('item-1');
    expect(await db.cards.get('card-gen-1')).toBeUndefined();
    expect((await db.lineageIdMappings.get('lineage-1'))?.cardIds).toEqual([]);
  });

  it('regenerates an occlusion-generated card rather than also adopting the packed copy', async () => {
    await importLineageFirstTime(
      coursePayload({
        lessons: [
          lessonOne({
            cards: [
              {
                id: 'card-occ-1',
                k: 0 as const,
                f: 'stale front',
                b: 'stale back',
                oc: 'region-1',
              },
            ],
          }),
        ],
        occlusions: [
          {
            id: 'occ-1',
            n: 'Plant cell',
            ah: 'abc123',
            regions: [{ id: 'region-1', r: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.1, a: 'Nucleus' }],
            pl: 0,
          },
        ],
      }),
    );

    const occlusion = await db.occlusions.get('occ-1');
    expect(occlusion?.name).toBe('Plant cell');
    expect(occlusion?.regions[0].shape).toBe('rectangle');
    const cards = await db.cards.toArray();
    expect(cards).toHaveLength(1);
    expect(cards[0].occlusionRegionId).toBe('region-1');
    expect(await db.cards.get('card-occ-1')).toBeUndefined();
    expect((await db.lineageIdMappings.get('lineage-1'))?.occlusionIds).toEqual(['occ-1']);
  });

  it('preserves a structured payload in the adopted card and its initial snapshot', async () => {
    const payload = {
      v: 1 as const,
      kind: 'numeric' as const,
      answer: { kind: 'exact' as const, value: '4' },
    };
    await importLineageFirstTime(
      coursePayload({
        lessons: [
          lessonOne({
            cards: [
              {
                id: 'card-1',
                k: 0 as const,
                f: '2 + 2',
                b: '4',
                p: payload,
              },
            ],
          }),
        ],
      }),
    );

    expect((await db.cards.get('card-1'))?.payload).toEqual(payload);
    expect((await db.lineageIdMappings.get('lineage-1'))?.cardSnapshots['card-1'].payload).toEqual(
      payload,
    );
  });
});

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

describe('mergeImport: v4 Question Set lineage', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it.each(['question', 'part', 'subpart'] as const)(
    'preserves local Question Set targets and prerequisites at %s depth through update and recovery',
    async (depth) => {
      const initial = questionPayloadV4({ questions: [], lessons: [], questionSets: [] });
      initial.concepts.push({ id: 'concept-prerequisite', n: 'Prerequisite' });
      const { course } = await importLineageFirstTime(initial);
      await db.courses.update(course.id, { 'distributedCopy.autoAcceptUpdates': true });
      const template = questionPayloadV4().questionSets[0];
      const answer = {
        ...template.questions[0].answer!,
        prerequisiteConceptIds: ['concept-prerequisite'],
      };
      const leaf = { id: 'leaf', prompt: 'Solve.', answer };
      const questions =
        depth === 'question'
          ? [{ ...leaf, parts: [] }]
          : [
              {
                id: 'question',
                prompt: 'Solve.',
                parts: [
                  depth === 'part'
                    ? { ...leaf, subparts: [] }
                    : { id: 'part', prompt: 'Solve.', subparts: [leaf] },
                ],
              },
            ];
      const created = await createQuestionSet(
        { ...template, id: 'local-set', courseId: course.id, lessonIds: [], questions },
        1_400,
      );
      const set = await updateQuestionSet(
        created.id,
        { ...created, title: 'Learner-edited paper' },
        { expectedContentRevisionId: created.contentRevisionId, now: 1_500 },
      );
      const attempt = await startQuestionSetAttempt(set.id, 'paper', 1_600);
      const before = await exportDatabase();
      expect(() => mergeSnapshots(before, before)).not.toThrow();
      await mergeLineageUpdate(
        course.id,
        questionPayloadV4({
          at: 2_000,
          rv: 2,
          concepts: [],
          questions: [],
          questionSets: [],
          lessons: [],
        }),
      );
      const after = await exportDatabase();
      expect(() => mergeSnapshots(after, after)).not.toThrow();
      expect(after.concepts).toEqual(before.concepts);
      expect(after.questionSets).toEqual(before.questionSets);
      expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
      expect(await db.tombstones.get(['concepts', 'concept-quadratic'])).toBeUndefined();
      await importBackup(after, 'replace');
      await manualMerge(before, { kind: 'peer' });
      expect(await db.questionSets.get(set.id)).toEqual(set);
      expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
    },
  );

  it('repairs an already damaged database by combining an intact backup without losing receipts', async () => {
    const initial = questionPayloadV4({ questions: [], lessons: [] });
    initial.questionSets[0].lessonIds = [];
    const { course } = await importLineageFirstTime(initial);
    const attempt = await startQuestionSetAttempt('set-quadratics', 'paper', 1_600);
    const intact = await exportDatabase();
    await db.concepts.delete('concept-quadratic');
    await db.tombstones.put({ table: 'concepts', recordId: 'concept-quadratic', deletedAt: 2_000 });
    const damaged = await exportDatabase();
    await expect(manualMerge(damaged)).rejects.toThrow('missing or cross-Course Concept');
    expect(await db.concepts.get('concept-quadratic')).toBeUndefined();
    expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
    await manualMerge(intact);
    expect(await db.concepts.get('concept-quadratic')).toEqual(intact.concepts![0]);
    expect(await db.tombstones.get(['concepts', 'concept-quadratic'])).toMatchObject({ deletedAt: 2_000 });
    expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
    const repaired = await exportDatabase();
    await importBackup(repaired, 'replace');
    await manualMerge(damaged, { kind: 'peer' });
    expect(await db.questionSets.get('set-quadratics')).toMatchObject({ courseId: course.id });
    expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
    expect(() => mergeSnapshots(repaired, damaged)).not.toThrow();
  });

  it('atomically rejects removal of a learner-edited published set and preserves syncable evidence', async () => {
    const initial = questionPayloadV4({ questions: [], lessons: [] });
    initial.questionSets[0].lessonIds = [];
    const { course } = await importLineageFirstTime(initial);
    await db.courses.update(course.id, { 'distributedCopy.autoAcceptUpdates': true });
    const imported = (await db.questionSets.get('set-quadratics'))!;
    const edited = await updateQuestionSet(imported.id, { ...imported, title: 'Learner revision' },
      { expectedContentRevisionId: imported.contentRevisionId, now: 1_500 });
    const attempt = await startQuestionSetAttempt(imported.id, 'paper', 1_600);
    const before = await exportDatabase();
    await expect(mergeLineageUpdate(course.id, questionPayloadV4({ at: 2_000, rv: 2,
      concepts: [], questions: [], questionSets: [], lessons: [] })))
      .rejects.toThrow('locally edited Question Set');
    const after = await exportDatabase();
    expect(after.concepts).toEqual(before.concepts);
    expect(await db.questionSets.get(imported.id)).toEqual(edited);
    expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
    expect(after.tombstones).toEqual(before.tombstones);
    expect(() => mergeSnapshots(after, before)).not.toThrow();
  });

  it('adopts a set and applies a later teacher revision', async () => {
    const first = questionPayloadV4();
    const { course } = await importLineageFirstTime(first);
    expect(await db.questionSets.get('set-quadratics')).toMatchObject({
      courseId: course.id,
      title: 'Quadratics paper',
    });

    await mergeLineageUpdate(
      course.id,
      questionPayloadV4({
        at: 2_000,
        rv: 2,
        questionSets: [
          {
            ...first.questionSets[0],
            title: 'Updated quadratics paper',
            contentVersion: 2,
            contentRevisionId: 'set-revision-2',
            updatedAt: 2_000,
          },
        ],
      }),
    );
    expect(await db.questionSets.get('set-quadratics')).toMatchObject({
      title: 'Updated quadratics paper',
      contentRevisionId: 'set-revision-2',
    });
  });

  it('fails closed on local edits and local deletion', async () => {
    const first = questionPayloadV4();
    const { course } = await importLineageFirstTime(first);
    await db.questionSets.update('set-quadratics', {
      title: 'Learner edit',
      contentRevisionId: 'local-revision',
      updatedAt: 1_500,
    });
    await expect(
      mergeLineageUpdate(course.id, questionPayloadV4({ at: 2_000, rv: 2 })),
    ).rejects.toThrow('locally edited Question Set');
    expect((await db.questionSets.get('set-quadratics'))?.title).toBe('Learner edit');

    await db.questionSets.update('set-quadratics', {
      title: first.questionSets[0].title,
      contentRevisionId: 'set-revision-1',
      updatedAt: 1_000,
    });
    await deleteQuestionSet('set-quadratics', 2_100);
    await expect(
      mergeLineageUpdate(course.id, questionPayloadV4({ at: 3_000, rv: 3 })),
    ).rejects.toThrow('locally deleted Question Set');

  });

  it('adopts linked assessments and retains attempts when the teacher revises or removes a set', async () => {
    const first = questionPayloadV4({
      exams: [{ id: 'assessment-origin', n: 'Final', k: 'f', a: 0, m: 'p', e: 2_000_000, c: 1_000 }],
    });
    first.questionSets[0] = { ...first.questionSets[0], assessmentIds: ['assessment-origin'] };
    const { course } = await importLineageFirstTime(first);
    expect((await db.courseAssessments.get('assessment-origin'))?.courseId).toBe(course.id);
    expect((await db.courseAssessments.where('courseId').equals(course.id).toArray())).toHaveLength(1);
    expect((await db.questionSets.get('set-quadratics'))?.assessmentIds).toEqual(['assessment-origin']);

    const attempt = await startQuestionSetAttempt('set-quadratics', 'paper', 1_100);
    await db.cards.update('card-quadratic-example', { stability: 14, reps: 3, due: 9_000 });
    await mergeLineageUpdate(course.id, questionPayloadV4({
      exams: [{ id: 'assessment-origin', n: 'Revised final', k: 'f', a: 0, m: 'p', e: 3_000_000, c: 1_000 }],
      questionSets: [{ ...first.questionSets[0], title: 'Revised paper', contentVersion: 2,
        contentRevisionId: 'set-revision-2' }],
      at: 2_000, rv: 2,
    }));
    expect((await db.courseAssessments.get('assessment-origin'))?.examDate).toBe(3_000_000);
    expect((await db.questionSets.get('set-quadratics'))?.assessmentIds).toEqual(['assessment-origin']);
    expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
    expect(await db.cards.get('card-quadratic-example')).toMatchObject({
      stability: 14, reps: 3, due: 9_000,
    });

    await mergeLineageUpdate(course.id, questionPayloadV4({
      exams: [{ id: 'assessment-origin', n: 'Revised final', k: 'f', a: 0, m: 'p', e: 3_000_000, c: 1_000 }],
      questionSets: [], at: 3_000, rv: 3,
    }));
    expect(await db.questionSets.get('set-quadratics')).toBeUndefined();
    expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
  });

  it('rejects missing assessment links atomically', async () => {
    const payload = questionPayloadV4();
    payload.questionSets[0] = { ...payload.questionSets[0], assessmentIds: ['missing'] };
    await expect(importLineageFirstTime(payload)).rejects.toThrow('missing Assessment');
    expect(await db.courses.count()).toBe(0);
  });

  it('rejects local assessment edits and deletion without applying a teacher revision', async () => {
    const first = questionPayloadV4({
      exams: [{ id: 'assessment-origin', n: 'Final', k: 'f', a: 0, m: 'p', e: 2_000_000, c: 1_000 }],
    });
    first.questionSets[0] = { ...first.questionSets[0], assessmentIds: ['assessment-origin'] };
    const { course } = await importLineageFirstTime(first);
    const revised = questionPayloadV4({
      exams: [{ id: 'assessment-origin', n: 'Teacher revision', k: 'f', a: 0, m: 'p', e: 3_000_000, c: 1_000 }],
      questionSets: [{ ...first.questionSets[0], title: 'Teacher revision',
        contentVersion: 2, contentRevisionId: 'set-revision-2' }],
      at: 2_000, rv: 2,
    });
    await db.courseAssessments.update('assessment-origin', { name: 'Learner revision' });
    await expect(mergeLineageUpdate(course.id, revised)).rejects.toThrow('locally edited Assessment');
    expect((await db.questionSets.get('set-quadratics'))?.title).toBe('Quadratics paper');
    expect((await db.courses.get(course.id))?.distributedCopy?.revision).toBe(1);

    await db.courseAssessments.delete('assessment-origin');
    await db.tombstones.put({ table: 'courseAssessments', recordId: 'assessment-origin', deletedAt: 1_500 });
    await expect(mergeLineageUpdate(course.id, revised)).rejects.toThrow('locally deleted Assessment');
    expect((await db.questionSets.get('set-quadratics'))?.title).toBe('Quadratics paper');
  });

  it('removes a checkpoint when the teacher unlinks it from the set', async () => {
    const final = { id: 'final-origin', n: 'Final', k: 'f' as const,
      a: 0, m: 'p' as const, e: 4_000_000, c: 1_000 };
    const checkpoint = { id: 'checkpoint-origin', n: 'Checkpoint', k: 'c' as const,
      a: 0, m: 'p' as const, e: 2_000_000, c: 1_000 };
    const first = questionPayloadV4({ exams: [final, checkpoint] });
    first.questionSets[0] = { ...first.questionSets[0], assessmentIds: [checkpoint.id] };
    const { course } = await importLineageFirstTime(first);
    expect(course.examDate).toBe(4_000_000);
    const attempt = await startQuestionSetAttempt('set-quadratics', 'paper', 1_100);
    await db.questionSets.add({ ...first.questionSets[0], id: 'local-set', courseId: course.id,
      contentRevisionId: 'local-revision' });
    const removal = questionPayloadV4({
      exams: [final],
      questionSets: [{ ...first.questionSets[0], assessmentIds: [final.id],
        contentVersion: 2, contentRevisionId: 'set-revision-2' }],
      at: 2_000, rv: 2,
    });
    await expect(mergeLineageUpdate(course.id, removal)).rejects.toThrow(
      'local Question Set still links to a removed Assessment',
    );
    expect(await db.courseAssessments.get(checkpoint.id)).toBeDefined();
    await db.questionSets.delete('local-set');
    await mergeLineageUpdate(course.id, removal);
    expect(await db.courseAssessments.get(checkpoint.id)).toBeUndefined();
    expect(await db.tombstones.get(['courseAssessments', checkpoint.id])).toBeDefined();
    expect((await db.questionSets.get('set-quadratics'))?.assessmentIds).toEqual([final.id]);
    expect((await db.questionSetAttempts.get(attempt.id))?.receipt.assessmentIds).toEqual([checkpoint.id]);
  });

  it('removes an untouched set when the teacher removes it', async () => {
    const { course } = await importLineageFirstTime(questionPayloadV4());
    await mergeLineageUpdate(course.id, questionPayloadV4({ at: 2_000, rv: 2, questionSets: [] }));
    expect(await db.questionSets.get('set-quadratics')).toBeUndefined();
    expect(await db.tombstones.get(['questionSets', 'set-quadratics'])).toBeDefined();
  });
});

describe('mergeImport: v5 Question Set path activity lineage', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('adopts placements, applies teacher changes and removes untouched activities', async () => {
    const { course } = await importLineageFirstTime(questionPayloadV5());
    expect(await db.practiceNodes.get('activity-quadratics')).toMatchObject({
      courseId: course.id, questionSetIds: ['set-quadratics'], afterLessonId: 'lesson-questions',
    });
    const updated = questionPayloadV5({
      at: 2_000, rv: 2,
      questionSetPracticeNodes: [{
        ...questionPayloadV5().questionSetPracticeNodes[0], name: 'Past paper practice',
        updatedAt: 2_000,
      }],
    });
    await mergeLineageUpdate(course.id, updated);
    expect((await db.practiceNodes.get('activity-quadratics'))?.name).toBe('Past paper practice');
    await mergeLineageUpdate(course.id, questionPayloadV5({
      at: 3_000, rv: 3, questionSetPracticeNodes: [],
    }));
    expect(await db.practiceNodes.get('activity-quadratics')).toBeUndefined();
    expect(await db.tombstones.get(['practiceNodes', 'activity-quadratics'])).toBeDefined();
  });

  it('rejects a local placement edit without partial teacher changes', async () => {
    const { course } = await importLineageFirstTime(questionPayloadV5());
    await db.practiceNodes.update('activity-quadratics', { name: 'Learner edit' });
    await expect(mergeLineageUpdate(course.id, questionPayloadV5({
      at: 2_000, rv: 2,
    }))).rejects.toThrow('locally edited Question Set activity');
    expect((await db.practiceNodes.get('activity-quadratics'))?.name).toBe('Learner edit');
    expect((await db.courses.get(course.id))?.distributedCopy?.revision).toBe(1);
  });
});

describe('mergeImport: ordered Question Set activity lineage', () => {
  beforeEach(async () => { await db.delete(); await db.open(); });

  function payload(): SharePayloadV6 {
    const base = questionPayloadV5();
    return { ...base, v: 6,
      questionSets: [base.questionSets[0], ...['set-b', 'set-c'].map((id) => ({ ...base.questionSets[0], id }))],
      questionSetPracticeNodes: [{ ...base.questionSetPracticeNodes[0], questionSetIds: ['set-c', 'set-quadratics', 'set-b'] }],
    };
  }

  it('adopts every published identity and order, removes only unreferenced sets and retains attempts', async () => {
    const first = payload();
    const { course } = await importLineageFirstTime(first);
    const node = (await db.practiceNodes.get('activity-quadratics'))!;
    expect(node.questionSetIds).toEqual(['set-c', 'set-quadratics', 'set-b']);
    const attempt = await startQuestionSetAttempt('set-quadratics', 'practice');
    const update = { ...first, at: 2000, rv: 2,
      questionSets: first.questionSets.filter((set) => set.id !== 'set-quadratics'),
      questionSetPracticeNodes: [{ ...first.questionSetPracticeNodes[0], questionSetIds: ['set-b', 'set-c'] }],
    };
    await mergeLineageUpdate(course.id, update);
    expect((await db.practiceNodes.get(node.id))?.questionSetIds).toEqual(['set-b', 'set-c']);
    expect(await db.questionSets.get('set-quadratics')).toBeUndefined();
    expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
  });

  it('recovers v6 membership only from retained baselines without duplicating adopted content', async () => {
    const first = payload();
    const { course } = await importLineageFirstTime(first);
    const attempt = await startQuestionSetAttempt('set-quadratics', 'practice');
    await db.lineageIdMappings.update(first.li!, {
      lessonIds: [], cardIds: [], questionSetIds: [], questionSetPracticeNodeIds: [],
    });
    const retained = (await db.lineageIdMappings.get(first.li!))!;
    const next = { ...first, at: 2000, rv: 2,
      lessons: first.lessons.map((lesson) => ({ ...lesson, n: 'Publisher lesson' })),
      questionSetPracticeNodes: [{ ...first.questionSetPracticeNodes[0], questionSetIds: ['set-b', 'set-c', 'set-quadratics'] }],
    };
    expect(await mergeLineageUpdate(course.id, next)).toMatchObject({
      createdLessons: 0, createdCards: 0, conflictCount: 0,
    });
    expect(await db.lessons.where('courseId').equals(course.id).count()).toBe(first.lessons.length);
    const recovered = (await db.lineageIdMappings.get(first.li!))!;
    const activity = next.questionSetPracticeNodes[0];
    expect(recovered.questionSetPracticeNodeIds).toEqual([activity.id]);
    expect(retained.questionSetPracticeNodeSnapshots?.[activity.id].questionSetIds)
      .toEqual(['set-c', 'set-quadratics', 'set-b']);
    expect(recovered.questionSetPracticeNodeSnapshots?.[activity.id]).toEqual({
      questionSetIds: activity.questionSetIds, afterLessonId: activity.afterLessonId, name: activity.name,
    });
    expect((await db.practiceNodes.get(activity.id))?.questionSetIds).toEqual(activity.questionSetIds);
    expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
  });

  it('rejects a v6 activity claimed by another lineage before applying publisher changes', async () => {
    const first = payload();
    const { course } = await importLineageFirstTime(first);
    await db.lineageIdMappings.add({ id: 'other-lineage', courseId: course.id,
      lessonIds: [], noteIds: [], cardIds: [], sequenceIds: [],
      lessonSnapshots: {}, noteSnapshots: {}, cardSnapshots: {},
      questionSetPracticeNodeIds: [first.questionSetPracticeNodes[0].id],
    });
    const before = await exportDatabase();
    await expect(mergeLineageUpdate(course.id, { ...first, rv: 2,
      lessons: first.lessons.map((lesson) => ({ ...lesson, n: 'Publisher lesson' })),
    })).rejects.toThrow(/integrity check failed.*claimed by another lineage/);
    expect({ ...await exportDatabase(), exportedAt: 0 }).toEqual({ ...before, exportedAt: 0 });
  });

  it.each(['missing activity baseline', 'missing assessment baseline', 'edited assessment'])(
    'retains protected v6 failures and rolls back recovery with %s', async (damage) => {
      const first: SharePayloadV6 = { ...payload(),
        exams: [{ id: 'published-final', n: 'Final', k: 'f', a: 0, m: 'p', e: 2_000_000, c: 1000 }],
      };
      const { course } = await importLineageFirstTime(first);
      await db.lineageIdMappings.update(first.li!, { lessonIds: [], cardIds: [],
        questionSetPracticeNodeIds: [],
        ...(damage === 'missing activity baseline' ? { questionSetPracticeNodeSnapshots: {} } : {}),
        ...(damage === 'missing assessment baseline' ? { assessmentSnapshots: {} } : {}),
      });
      if (damage === 'edited assessment') await db.courseAssessments.update('published-final', { name: 'Local final' });
      const before = await exportDatabase();
      await expect(mergeLineageUpdate(course.id, { ...first, rv: 2,
        lessons: first.lessons.map((lesson) => ({ ...lesson, n: 'Publisher lesson' })),
      })).rejects.toThrow(damage === 'missing activity baseline' ? 'Question Set activity' : 'Assessment');
      expect({ ...await exportDatabase(), exportedAt: 0 }).toEqual({ ...before, exportedAt: 0 });
    },
  );

  it.each(['membership', 'order', 'anchor', 'name', 'deletion race'])('rejects %s conflicts without partial published changes', async (conflict) => {
    const first = payload();
    const { course } = await importLineageFirstTime(first);
    const id = 'activity-quadratics';
    if (conflict === 'membership') await db.practiceNodes.update(id, { questionSetIds: ['set-c'] });
    if (conflict === 'order') await db.practiceNodes.update(id, { questionSetIds: ['set-b', 'set-c', 'set-quadratics'] });
    if (conflict === 'anchor') await db.practiceNodes.update(id, { afterLessonId: 'local-anchor' });
    if (conflict === 'name') await db.practiceNodes.update(id, { name: 'Local name' });
    const before = await exportDatabase();
    const update = { ...first, at: 2000, rv: 2,
      questionSets: first.questionSets.filter((set) => conflict !== 'deletion race' || set.id !== 'set-b'),
    };
    await expect(mergeLineageUpdate(course.id, update)).rejects.toThrow('Question Set activity');
    expect(await db.practiceNodes.toArray()).toEqual(before.practiceNodes);
    expect(await db.questionSets.toArray()).toEqual(before.questionSets);
    expect((await db.courses.get(course.id))?.distributedCopy?.revision).toBe(1);
  });
});

describe('mergeImport: merge apply', () => {
  let courseId: string;
  let course: Course;

  beforeEach(async () => {
    await db.delete();
    await db.open();
    const imported = await importLineageFirstTime(coursePayload({ lessons: [lessonOne()] }));
    course = imported.course;
    courseId = course.id;
    await db.courses.update(courseId, { 'distributedCopy.autoAcceptUpdates': false });
  });

  it('re-importing an unchanged payload produces an empty diff (no queue, revision updated)', async () => {
    const before = (await db.courses.get(courseId))!.updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 2));
    const result = await mergeLineageUpdate(
      courseId,
      coursePayload({ rv: 2, lessons: [lessonOne()] }),
    );
    expect(result).toMatchObject({
      createdLessons: 0,
      createdNotes: 0,
      createdCards: 0,
      appliedUpdates: 0,
      appliedRemovals: 0,
      queuedForReview: false,
      conflictCount: 0,
    });
    const course = await db.courses.get(courseId);
    expect(course?.distributedCopy?.revision).toBe(2);
    expect(course?.updatedAt).toBeGreaterThan(before);
    expect(await db.pendingMergeReviews.where('courseId').equals(courseId).count()).toBe(0);
  });

  it("preserves the learner's introduction preference when the teacher publishes an update", async () => {
    await db.courses.update(courseId, { learnFirst: false });
    const payload = coursePayload({ rv: 2, lessons: [lessonOne()] });
    expect(payload.course.lf).toBeUndefined();
    await mergeLineageUpdate(courseId, payload);
    expect((await db.courses.get(courseId))?.learnFirst).toBe(false);
  });

  it('creates new lessons/notes/cards immediately, unconditionally', async () => {
    const payload = coursePayload({
      rv: 2,
      lessons: [lessonOne(), lessonOne({ i: 'lesson-2', n: 'Genetics', notes: [], cards: [] })],
    });
    const result = await mergeLineageUpdate(courseId, payload);
    expect(result.createdLessons).toBe(1);
    expect(result.queuedForReview).toBe(false);
    expect(await db.lessons.get('lesson-2')).toBeDefined();
  });

  it('creates a stable Concept when a lineage update adds a Card', async () => {
    const result = await mergeLineageUpdate(
      courseId,
      coursePayload({
        rv: 2,
        lessons: [
          lessonOne({
            cards: [
              ...lessonOne().cards,
              { id: 'card-2', k: 0 as const, f: 'What contains DNA?', b: 'The nucleus.' },
            ],
          }),
        ],
      }),
    );

    expect(result.createdCards).toBe(1);
    const card = (await db.cards.get('card-2'))!;
    expect(card.conceptId).toBe('concept:lineage-card:card-2');
    expect(await db.concepts.get(card.conceptId)).toMatchObject({
      courseId,
      name: 'The nucleus.',
    });
  });

  it('queues a teacher update for review when autoAcceptUpdates is false', async () => {
    const payload = coursePayload({
      rv: 2,
      lessons: [lessonOne({ n: 'Cells (revised)' })],
    });
    const result = await mergeLineageUpdate(courseId, payload);
    expect(result.appliedUpdates).toBe(0);
    expect(result.queuedForReview).toBe(true);

    const lesson = await db.lessons.get('lesson-1');
    expect(lesson?.name).toBe('Cells'); // untouched until reviewed

    const review = await db.pendingMergeReviews.where('courseId').equals(courseId).first();
    expect(review?.diff.updates.lessons).toEqual([{ id: 'lesson-1', name: 'Cells (revised)' }]);
  });

  it('applies a teacher update silently when autoAcceptUpdates is true', async () => {
    await db.courses.update(courseId, {
      distributedCopy: {
        lineageId: 'lineage-1',
        revision: 1,
        locked: true,
        autoAcceptUpdates: true,
      },
    });
    const payload = coursePayload({ rv: 2, lessons: [lessonOne({ n: 'Cells (revised)' })] });
    const result = await mergeLineageUpdate(courseId, payload);
    expect(result.appliedUpdates).toBe(1);
    expect(result.queuedForReview).toBe(false);

    const lesson = await db.lessons.get('lesson-1');
    expect(lesson?.name).toBe('Cells (revised)');
  });

  it('applies and snapshots a payload-only teacher update', async () => {
    await db.courses.update(courseId, {
      distributedCopy: {
        lineageId: 'lineage-1',
        revision: 1,
        locked: true,
        autoAcceptUpdates: true,
      },
    });
    const payload = {
      v: 1 as const,
      kind: 'working' as const,
      scheme: [{ marks: 2, kind: 'waypoint' as const, expression: 'x = 4' }],
    };
    const result = await mergeLineageUpdate(
      courseId,
      coursePayload({
        rv: 2,
        lessons: [
          lessonOne({
            cards: [
              {
                id: 'card-1',
                k: 0 as const,
                f: 'What is a cell?',
                b: 'The basic unit of life.',
                p: payload,
              },
            ],
          }),
        ],
      }),
    );

    expect(result.appliedUpdates).toBe(1);
    expect((await db.cards.get('card-1'))?.payload).toEqual(payload);
    expect((await db.lineageIdMappings.get('lineage-1'))?.cardSnapshots['card-1'].payload).toEqual(
      payload,
    );
  });

  it('queues a conflict when the student has edited an entity the teacher also changed, leaving the local copy untouched', async () => {
    await db.notes.update('note-1', { content: 'My own rewritten notes.' });
    const payload = coursePayload({
      rv: 2,
      lessons: [
        lessonOne({ notes: [{ oi: 'note-1', n: 'Intro', c: 'Teacher rewrote this too.' }] }),
      ],
    });
    const result = await mergeLineageUpdate(courseId, payload);
    expect(result.conflictCount).toBe(1);
    expect(result.queuedForReview).toBe(true);

    const note = await db.notes.get('note-1');
    expect(note?.content).toBe('My own rewritten notes.');

    const review = await db.pendingMergeReviews.where('courseId').equals(courseId).first();
    expect(review?.diff.conflicts).toEqual([
      {
        entityId: 'note-1',
        kind: 'note',
        incoming: { i: 'note-1', n: 'Intro', c: 'Teacher rewrote this too.' },
        lessonId: 'lesson-1',
      },
    ]);
  });

  it('does not conflict when the student edit reproduces content identical to the incoming update (no merge since)', async () => {
    // Student edits the note to exactly what the teacher will later publish — content
    // matches on both sides, so there is nothing to reconcile.
    await db.notes.update('note-1', { content: 'Converged content.' });
    const payload = coursePayload({
      rv: 2,
      lessons: [lessonOne({ notes: [{ oi: 'note-1', n: 'Intro', c: 'Converged content.' }] })],
    });
    const result = await mergeLineageUpdate(courseId, payload);
    expect(result.conflictCount).toBe(0);
    expect(result.queuedForReview).toBe(false);
  });

  it('queues a teacher removal for review as a plain removal after opting out', async () => {
    const payload = coursePayload({ rv: 2, lessons: [lessonOne({ cards: [] })] });
    const result = await mergeLineageUpdate(courseId, payload);
    expect(result.queuedForReview).toBe(true);
    expect(await db.cards.get('card-1')).toBeDefined(); // untouched until reviewed
    const review = await db.pendingMergeReviews.where('courseId').equals(courseId).first();
    expect(review?.diff.removals.cardIds).toEqual(['card-1']);
    expect(review?.diff.conflicts).toEqual([]);
  });

  it('queues a removal of a student-edited entity as a conflict, retaining the student copy', async () => {
    await db.cards.update('card-1', { front: 'My own version of this question.' });
    const payload = coursePayload({ rv: 2, lessons: [lessonOne({ cards: [] })] });
    const result = await mergeLineageUpdate(courseId, payload);
    expect(result.conflictCount).toBe(1);
    const review = await db.pendingMergeReviews.where('courseId').equals(courseId).first();
    expect(review?.diff.removals.cardIds).toEqual([]);
    expect(review?.diff.conflicts).toEqual([{ entityId: 'card-1', kind: 'card', incoming: null }]);
    expect(await db.cards.get('card-1')).toBeDefined();
  });

  it('applies a queued removal once autoAcceptUpdates is on', async () => {
    await db.courses.update(courseId, {
      distributedCopy: {
        lineageId: 'lineage-1',
        revision: 1,
        locked: true,
        autoAcceptUpdates: true,
      },
    });
    const payload = coursePayload({ rv: 2, lessons: [lessonOne({ cards: [] })] });
    const result = await mergeLineageUpdate(courseId, payload);
    expect(result.appliedRemovals).toBe(1);
    expect(await db.cards.get('card-1')).toBeUndefined();
  });

  it('supersedes rather than accumulates: a second merge replaces the pending review row', async () => {
    await mergeLineageUpdate(
      courseId,
      coursePayload({ rv: 2, lessons: [lessonOne({ n: 'Cells v2' })] }),
    );
    expect(await db.pendingMergeReviews.where('courseId').equals(courseId).count()).toBe(1);

    await mergeLineageUpdate(
      courseId,
      coursePayload({ rv: 3, lessons: [lessonOne({ n: 'Cells v3' })] }),
    );
    const rows = await db.pendingMergeReviews.where('courseId').equals(courseId).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].revision).toBe(3);
    expect(rows[0].diff.updates.lessons).toEqual([{ id: 'lesson-1', name: 'Cells v3' }]);
  });

  it('does not replace newer local performance rows during a lineage update', async () => {
    const card = (await db.cards.get('card-1'))!;
    const backing = {
      deckId: card.deckId!,
      runningMeanResponseTime: 31,
      runningStdDevResponseTime: 2,
      m2: 8,
      totalCorrectReviews: 6,
    };
    const calibration = {
      deckId: courseId,
      runningMeanResponseTime: 17,
      runningStdDevResponseTime: 3,
      m2: 12,
      totalCorrectReviews: 4,
    };
    await db.userPerformance.bulkPut([backing, calibration]);
    await db.schedulingPerformance.put({
      schedulingUnitId: card.schedulingUnitId!,
      courseId,
      lessonId: card.primaryLessonId!,
      runningMeanResponseTime: backing.runningMeanResponseTime,
      runningStdDevResponseTime: backing.runningStdDevResponseTime,
      m2: backing.m2,
      totalCorrectReviews: backing.totalCorrectReviews,
      updatedAt: 0,
    });
    await db.coursePerformance.put({
      courseId,
      runningMeanResponseTime: calibration.runningMeanResponseTime,
      runningStdDevResponseTime: calibration.runningStdDevResponseTime,
      m2: calibration.m2,
      totalCorrectReviews: calibration.totalCorrectReviews,
      updatedAt: 0,
    });
    const backingDeck = (await db.schedulingUnits.get(card.schedulingUnitId))!;
    const localCourse = (await db.courses.get(courseId))!;
    const newerBackingInteraction = (backingDeck.lastInteractedAt ?? backingDeck.createdAt) + 1000;
    const newerCourseInteraction = (localCourse.lastInteractedAt ?? localCourse.createdAt) + 1000;
    await db.schedulingUnits.update(card.schedulingUnitId, {
      lastInteractedAt: newerBackingInteraction,
    });
    await db.schedulingUnits.update(card.schedulingUnitId!, {
      lastInteractedAt: newerBackingInteraction,
    });
    await db.courses.update(courseId, { lastInteractedAt: newerCourseInteraction });
    expect((await db.schedulingUnits.get(card.schedulingUnitId))?.lastInteractedAt).toBe(
      newerBackingInteraction,
    );
    expect((await db.schedulingUnits.get(card.schedulingUnitId!))?.lastInteractedAt).toBe(
      newerBackingInteraction,
    );
    expect((await db.courses.get(courseId))?.lastInteractedAt).toBe(newerCourseInteraction);
    await db.courses.update(courseId, {
      distributedCopy: {
        lineageId: 'lineage-1',
        revision: 1,
        locked: true,
        autoAcceptUpdates: true,
      },
    });

    await mergeLineageUpdate(
      courseId,
      coursePayload({ rv: 2, lessons: [lessonOne({ n: 'Cells revised' })] }),
    );

    expect((await db.schedulingUnits.get(card.schedulingUnitId))?.lastInteractedAt).toBe(
      newerBackingInteraction,
    );
    expect((await db.courses.get(courseId))?.lastInteractedAt).toBe(newerCourseInteraction);
    expect(await db.userPerformance.get(card.deckId!)).toEqual(backing);
    expect(await db.userPerformance.get(courseId)).toEqual(calibration);
    expect(
      (await performanceForCourseBackingDecks(courseId, [card])).map((row) => row.deckId),
    ).toEqual([card.schedulingUnitId]);
    expect(await performanceForReviewUnit(courseId, 'course')).toMatchObject({
      deckId: courseId,
      runningMeanResponseTime: 17,
      totalCorrectReviews: 4,
    });
    expect(await performanceForReviewUnit(card.schedulingUnitId!)).toMatchObject({
      deckId: card.schedulingUnitId,
      runningMeanResponseTime: 31,
      totalCorrectReviews: 6,
    });
  });

  it('preserves local review evidence through an auto-applied lineage update', async () => {
    const card = (await db.cards.get('card-1'))!;
    const result = await recordReview({
      card,
      eventId: 'event-lineage-consistency',
      sessionId: 'session-lineage-consistency',
      sessionKind: 'lesson',
      deck: course,
      kind: 'course',
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      correct: true,
      now: 1_725_123_456_789,
    });
    const reviewed = (await db.cards.get(card.id))!;
    await db.courses.update(courseId, {
      distributedCopy: {
        lineageId: 'lineage-1',
        revision: 1,
        locked: true,
        autoAcceptUpdates: true,
      },
    });

    await mergeLineageUpdate(
      courseId,
      coursePayload({
        rv: 2,
        lessons: [
          lessonOne({
            cards: [
              { id: 'card-1', k: 0 as const, f: 'Revised question?', b: 'The basic unit of life.' },
            ],
          }),
        ],
      }),
    );

    const merged = (await db.cards.get(card.id))!;
    const canonical = await db.reviewHistory.where('cardId').equals(card.id).first();
    const hydrated = (await hydrateCardsWithHistory([merged]))[0];
    expect(merged.history).toEqual(reviewed.history);
    expect(canonical).toMatchObject({
      eventId: 'event-lineage-consistency',
      cardId: card.id,
      deckId: merged.deckId,
      schedulingUnitId: merged.deckId,
      timestamp: 1_725_123_456_789,
    });
    expect(hydrated.history).toHaveLength(1);
    expect(hydrated.history[0]).toMatchObject({
      eventId: 'event-lineage-consistency',
      timestamp: 1_725_123_456_789,
    });
    expect(result.recorded).toBe(true);
  });

  it('never modifies FSRS/scheduling fields on an auto-applied card update', async () => {
    await db.cards.update('card-1', {
      state: 2,
      stability: 4.2,
      difficulty: 6.1,
      reps: 3,
      lastReviewed: 5000,
      due: 9000,
    });
    await db.courses.update(courseId, {
      distributedCopy: {
        lineageId: 'lineage-1',
        revision: 1,
        locked: true,
        autoAcceptUpdates: true,
      },
    });
    const payload = coursePayload({
      rv: 2,
      lessons: [
        lessonOne({
          cards: [
            { id: 'card-1', k: 0 as const, f: 'Revised question?', b: 'The basic unit of life.' },
          ],
        }),
      ],
    });
    await mergeLineageUpdate(courseId, payload);
    const card = await db.cards.get('card-1');
    expect(card?.front).toBe('Revised question?');
    expect(card).toMatchObject({
      state: 2,
      stability: 4.2,
      difficulty: 6.1,
      reps: 3,
      lastReviewed: 5000,
      due: 9000,
    });
  });

  it('hands sequence-shaped payload items to the existing diffRegeneration path via updateSequence', async () => {
    const seqPayload = coursePayload({
      rv: 2,
      lessons: [lessonOne()],
      sequences: [
        {
          id: 'seq-1',
          n: 'Order of operations',
          items: [
            { id: 'item-1', v: 'Brackets' },
            { id: 'item-2', v: 'Orders' },
          ],
          cw: 2,
          pl: 0,
        },
      ],
    });
    await mergeLineageUpdate(courseId, seqPayload);

    const sequence = await db.sequences.get('seq-1');
    expect(sequence?.name).toBe('Order of operations');
    const generated = await db.cards.where('sequenceItemId').equals('item-1').toArray();
    expect(generated).toHaveLength(1);
    expect(generated[0].front).toContain('Order of operations');

    const mapping = await db.lineageIdMappings.get('lineage-1');
    expect(mapping?.sequenceIds).toEqual(['seq-1']);

    // A second merge with an edited sequence item regenerates content only.
    await mergeLineageUpdate(
      courseId,
      coursePayload({
        rv: 3,
        lessons: [lessonOne()],
        sequences: [
          {
            id: 'seq-1',
            n: 'Order of operations',
            items: [
              { id: 'item-1', v: 'Brackets and powers' },
              { id: 'item-2', v: 'Orders' },
            ],
            cw: 2,
            pl: 0,
          },
        ],
      }),
    );
    const regenerated = await db.cards.where('sequenceItemId').equals('item-1').toArray();
    expect(regenerated).toHaveLength(1);
    expect(regenerated[0].back).toBe('Brackets and powers');
  });

  it('hands occlusion-shaped payload items to updateOcclusion on a merge update', async () => {
    const occlusionPayload = (revision: number, y: number) =>
      coursePayload({
        rv: revision,
        lessons: [lessonOne()],
        occlusions: [
          {
            id: 'occ-1',
            n: 'Plant cell',
            ah: 'abc123',
            regions: [
              { id: 'region-1', r: 0, x: 0.1, y, w: 0.2, h: 0.1, a: 'Nucleus' },
              { id: 'region-2', r: 1, x: 0.5, y: 0.4, w: 0.1, h: 0.1, p: 'region-1' },
            ],
            pl: 0,
          },
        ],
      });

    await mergeLineageUpdate(courseId, occlusionPayload(2, 0.1));
    expect((await db.occlusions.get('occ-1'))?.regions).toHaveLength(2);
    const first = await db.cards.where('occlusionRegionId').equals('region-1').first();
    expect(first).toBeDefined();
    expect((await db.lineageIdMappings.get('lineage-1'))?.occlusionIds).toEqual(['occ-1']);

    // Moving a region regenerates content only: the card keeps its identity, so its
    // FSRS memory state survives the merge.
    await db.cards.update(first!.id, { reps: 4, stability: 12 });
    await mergeLineageUpdate(courseId, occlusionPayload(3, 0.3));

    const after = await db.cards.where('occlusionRegionId').equals('region-1').toArray();
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(first!.id);
    expect(after[0].reps).toBe(4);
    expect(after[0].stability).toBe(12);
    expect((await db.occlusions.get('occ-1'))?.regions[0].y).toBe(0.3);
  });
});

describe('mergeImport: course details', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  const course = (overrides: Partial<SharePayloadV2['course']> = {}): SharePayloadV2['course'] => ({
    n: 'Biology',
    d: 'Cells and genes',
    o: 0,
    c: 1000,
    um: 'open',
    ...overrides,
  });

  it("passes the teacher's new name, description and unlock mode on to the copy", async () => {
    const imported = await importLineageFirstTime(coursePayload({ course: course(), lessons: [lessonOne()] }));
    await mergeLineageUpdate(
      imported.course.id,
      coursePayload({
        rv: 2,
        course: course({ n: 'Biology A', d: 'Revised', um: 'linear' }),
        lessons: [lessonOne()],
      }),
    );
    expect(await db.courses.get(imported.course.id)).toMatchObject({
      name: 'Biology A',
      description: 'Revised',
      unlockMode: 'linear',
    });
  });

  it("keeps the learner's own rename while still taking other teacher changes", async () => {
    const imported = await importLineageFirstTime(coursePayload({ course: course(), lessons: [lessonOne()] }));
    await db.courses.update(imported.course.id, { name: 'My biology' });
    await mergeLineageUpdate(
      imported.course.id,
      coursePayload({ rv: 2, course: course({ n: 'Biology A', d: 'Revised' }), lessons: [lessonOne()] }),
    );
    expect(await db.courses.get(imported.course.id)).toMatchObject({
      name: 'My biology',
      description: 'Revised',
    });
  });
});

describe('mergeImport: bank cards, lesson links and lesson moves', () => {
  const bankCard = { id: 'bank-1', k: 0 as const, f: 'Bank front', b: 'Bank back' };
  const lessonTwo = (overrides: Partial<ShareLesson> = {}) =>
    lessonOne({ i: 'lesson-2', n: 'Genetics', notes: [], cards: [], ...overrides });

  async function autoAccept(courseId: string) {
    await db.courses.update(courseId, {
      distributedCopy: { lineageId: 'lineage-1', revision: 1, locked: true, autoAcceptUpdates: true },
    });
  }

  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('adopts linked bank cards and lesson links on first import', async () => {
    const { course } = await importLineageFirstTime(
      coursePayload({
        lessons: [lessonOne(), lessonTwo()],
        bankCards: [bankCard],
        links: [{ l: 0, c: 'bank-1' }, { l: 1, c: 'card-1' }],
      }),
    );
    const card = await db.cards.get('bank-1');
    expect(card).toMatchObject({ courseId: course.id, primaryLessonId: null, front: 'Bank front' });
    const links = await db.lessonCards.toArray();
    expect(links.map(({ lessonId, cardId }) => [lessonId, cardId]).sort()).toEqual([
      ['lesson-1', 'bank-1'],
      ['lesson-2', 'card-1'],
    ]);
    expect((await db.lineageIdMappings.get('lineage-1'))?.cardIds).toContain('bank-1');
  });

  it('keeps bank cards and links on an unchanged update, even with auto-accept on', async () => {
    const payload = coursePayload({
      lessons: [lessonOne()],
      bankCards: [bankCard],
      links: [{ l: 0, c: 'bank-1' }],
    });
    const { course } = await importLineageFirstTime(payload);
    await autoAccept(course.id);
    const result = await mergeLineageUpdate(course.id, { ...payload, rv: 2 });
    expect(result).toMatchObject({ appliedUpdates: 0, appliedRemovals: 0, queuedForReview: false });
    expect(await db.cards.get('bank-1')).toBeDefined();
    expect(await db.lessonCards.count()).toBe(1);
  });

  it('applies teacher changes to bank cards and links on update', async () => {
    const { course } = await importLineageFirstTime(
      coursePayload({ lessons: [lessonOne(), lessonTwo()], bankCards: [bankCard], links: [{ l: 0, c: 'bank-1' }] }),
    );
    await autoAccept(course.id);
    await mergeLineageUpdate(
      course.id,
      coursePayload({
        rv: 2,
        lessons: [lessonOne(), lessonTwo()],
        bankCards: [{ ...bankCard, f: 'Bank front (revised)' }, { id: 'bank-2', k: 0, f: 'New', b: 'New' }],
        links: [{ l: 1, c: 'bank-2' }],
      }),
    );
    expect((await db.cards.get('bank-1'))?.front).toBe('Bank front (revised)');
    expect(await db.cards.get('bank-2')).toMatchObject({ primaryLessonId: null });
    const links = await db.lessonCards.toArray();
    expect(links.map(({ lessonId, cardId }) => [lessonId, cardId])).toEqual([['lesson-2', 'bank-2']]);
  });

  it('moves a note and a card to the lesson the teacher moved them to', async () => {
    const { course } = await importLineageFirstTime(coursePayload({ lessons: [lessonOne(), lessonTwo()] }));
    await autoAccept(course.id);
    const moved = lessonOne();
    await mergeLineageUpdate(
      course.id,
      coursePayload({
        rv: 2,
        lessons: [lessonOne({ notes: [], cards: [] }), lessonTwo({ notes: moved.notes, cards: moved.cards })],
      }),
    );
    expect((await db.notes.get('note-1'))?.lessonId).toBe('lesson-2');
    expect(await db.cards.get('card-1')).toMatchObject({
      primaryLessonId: 'lesson-2',
      deckId: 'lesson-2',
      schedulingUnitId: 'lesson-2',
    });
  });

  it('moves a card when the queued update is accepted later', async () => {
    const { course } = await importLineageFirstTime(coursePayload({ lessons: [lessonOne(), lessonTwo()] }));
    await db.courses.update(course.id, { 'distributedCopy.autoAcceptUpdates': false });
    await mergeLineageUpdate(
      course.id,
      coursePayload({
        rv: 2,
        lessons: [lessonOne({ cards: [] }), lessonTwo({ cards: lessonOne().cards })],
      }),
    );
    expect((await db.cards.get('card-1'))?.primaryLessonId).toBe('lesson-1');
    const review = (await db.pendingMergeReviews.where('courseId').equals(course.id).first())!;
    await acceptAllMergeReview(review.id);
    expect((await db.cards.get('card-1'))?.primaryLessonId).toBe('lesson-2');
  });
});

describe.each([5, 6] as const)('lineage recovery preserves protected V%i authoring baselines', (version) => {
  beforeEach(async () => { await db.delete(); await db.open(); });

  it.each(['missing registry', 'missing set revision', 'edited set'])(
    'rejects %s atomically instead of bypassing Question Set guards', async (damage) => {
      const payload = { ...questionPayloadV5(), v: version };
      const { course } = await importLineageFirstTime(payload);
      if (damage === 'missing registry') await db.lineageIdMappings.delete(payload.li!);
      else await db.lineageIdMappings.update(payload.li!, { lessonIds: [],
        ...(damage === 'missing set revision' ? { questionSetRevisions: {} } : {}) });
      if (damage === 'edited set') await db.questionSets.update('set-quadratics', {
        title: 'Learner paper', contentRevisionId: 'learner-revision',
      });
      const before = await exportDatabase();
      const next = { ...questionPayloadV5({ rv: 22 }), v: version };
      next.questionSets[0].title = 'Publisher paper';
      await expect(mergeLineageUpdate(course.id, next)).rejects.toThrow(/Question Set/);
      expect({ ...await exportDatabase(), exportedAt: 0 }).toEqual({ ...before, exportedAt: 0 });
    },
  );

  it('restores Lesson membership without changing Question evidence or path activities', async () => {
    const payload = { ...questionPayloadV5(), v: version };
    const { course } = await importLineageFirstTime(payload);
    await db.lineageIdMappings.update(payload.li!, { lessonIds: [], cardIds: [] });
    const before = await exportDatabase();
    await mergeLineageUpdate(course.id, { ...questionPayloadV5({ rv: 22 }), v: version });
    const after = await exportDatabase();
    expect(after.questionSetAttempts).toEqual(before.questionSetAttempts);
    expect(after.questions?.map(({ authoringRevisionId: _revision, ...row }) => row))
      .toEqual(before.questions?.map(({ authoringRevisionId: _revision, ...row }) => row));
    expect(after.practiceNodes).toEqual(before.practiceNodes);
  });
});
