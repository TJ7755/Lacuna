import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { createCourse, publishCourse, updateCourse } from './courseRepository';
import { createLesson, createLessonCard } from './repository';
import {
  buildCourseSharePayload,
  decodeShareDirect,
  encodeShareDirect,
  importSharePayload,
  parseSharePayload,
  type SharePayloadV5,
} from './share';
import { buildCourseFile, decodeCourseFile, withCourseFileAssets } from './courseFile';
import { importLineageFirstTime, mergeLineageUpdate } from './mergeImport';
import {
  answerQuestionAttempt,
  createConcept,
  createFixedQuestion,
  startQuestionAttempt,
} from '../questions/repository';

const reference = {
  specificationId: 'pearson-4bi1-2028',
  tier: 'higher',
  routeIds: ['route-not-installed'],
  futureOptionalMetadata: { sourceIssue: 'Retain this additive metadata' },
};
const links = ['pearson-4bi1-2028:1.a', 'uninstalled-spec:outside-current-selection'];
const qualification = {
  specificationRef: reference,
  examBoard: 'Custom board fallback',
  specification: 'Custom specification fallback',
};

async function clearDatabase() {
  await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((table) => table.clear())));
}

async function authoredCourse() {
  const course = await createCourse('Biology', qualification);
  const lesson = await createLesson(course.id, 'Cells');
  const card = await createLessonCard(
    course.id,
    lesson.id,
    'front_back',
    'What is a cell?',
    'A unit of life.',
  );
  await db.concepts.update(card.conceptId, { specificationPointIds: links });
  return { course, card };
}

function publishedPayload(): SharePayloadV5 {
  return {
    v: 5,
    by: 'Teacher',
    at: 1_000,
    li: 'science-lineage',
    rv: 1,
    course: { n: 'Biology', o: 0, c: 1_000, e: 2_000_000, um: 'open', ...qualification },
    lessons: [],
    concepts: [{ id: 'concept-cells', n: 'Cells', specificationPointIds: links }],
    questions: [
      {
        id: 'question-cells',
        k: 0,
        n: 'Cell count',
        t: 'concept-cells',
        pr: [],
        f: 'How many cells are shown?',
        p: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '2' } },
        e: 'There are two cells.',
      },
    ],
    questionSets: [],
    questionSetPracticeNodes: [],
  };
}

beforeEach(clearDatabase);

describe('specification sharing', () => {
  it.each(['share code', 'course file'] as const)(
    'round-trips references and qualified links through a real %s',
    async (format) => {
      const { course, card } = await authoredCourse();
      const payload =
        format === 'share code'
          ? await decodeShareDirect(
              await encodeShareDirect(await buildCourseSharePayload(course.id)),
            )
          : (await decodeCourseFile(await buildCourseFile(course.id))).payload;
      expect(payload.v).toBe(5);
      if (payload.v !== 5) throw new Error('Expected current course payload.');
      expect(payload.course).toMatchObject(qualification);
      expect(
        payload.concepts.find((concept) => concept.id === card.conceptId)?.specificationPointIds,
      ).toEqual(links);

      await clearDatabase();
      const imported = await importSharePayload(payload);
      expect(await db.courses.get(imported.courseIds[0])).toMatchObject(qualification);
      const [importedCard] = await db.cards.toArray();
      expect(importedCard.id).not.toBe(card.id);
      expect(importedCard.conceptId).not.toBe(card.conceptId);
      expect(await db.concepts.get(importedCard.conceptId)).toMatchObject({
        specificationPointIds: links,
      });
    },
  );

  it('retains unlinked Concepts and reference-free legacy payloads unchanged', async () => {
    const legacy = publishedPayload();
    delete legacy.course.specificationRef;
    delete legacy.course.examBoard;
    delete legacy.course.specification;
    delete legacy.concepts[0].specificationPointIds;
    const parsed = parseSharePayload(legacy);
    expect(parsed).toEqual(legacy);
    const imported = await importSharePayload(parsed);
    expect((await db.courses.get(imported.courseIds[0]))?.specificationRef).toBeUndefined();
    expect((await db.concepts.toArray())[0].specificationPointIds).toBeUndefined();
  });

  it.each([
    { course: { specificationRef: { specificationId: 'invalid:id' } } },
    { course: { specificationRef: { ...reference, routeIds: ['same', 'same'] } } },
    { concepts: [{ id: 'concept-cells', n: 'Cells', specificationPointIds: ['unqualified'] }] },
    {
      concepts: [{ id: 'concept-cells', n: 'Cells', specificationPointIds: [links[0], links[0]] }],
    },
  ])('rejects malformed specification fields before importing', (invalid) => {
    const base = publishedPayload();
    const payload = { ...base, ...invalid, course: { ...base.course, ...invalid.course } };
    expect(() => parseSharePayload(payload)).toThrow(/unsupported version/i);
  });

  it('carries a corrected published course file into managed imports without changing learner evidence', async () => {
    const course = await createCourse('Biology', qualification);
    const concept = await createConcept(course.id, 'Cells');
    await db.concepts.update(concept.id, { specificationPointIds: links });
    const question = await createFixedQuestion({
      courseId: course.id,
      name: 'Cell count',
      targetConceptId: concept.id,
      prompt: 'How many cells are shown?',
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '2' } },
      explanation: 'There are two cells.',
    });
    await publishCourse(course.id);
    const first = await decodeCourseFile(await buildCourseFile(course.id));
    const corrected = { specificationId: 'cambridge-0972-2028', routeIds: ['paper-5'] };
    await updateCourse(course.id, { specificationRef: corrected });
    await db.concepts.update(concept.id, { specificationPointIds: ['cambridge-0972-2028:p1'] });
    await publishCourse(course.id);
    const second = await decodeCourseFile(await buildCourseFile(course.id));
    await clearDatabase();

    const imported = await withCourseFileAssets(first, () => importLineageFirstTime(first.payload));
    expect(imported.course).toMatchObject(qualification);
    expect(await db.concepts.get(concept.id)).toMatchObject({ specificationPointIds: links });
    const attempt = await startQuestionAttempt({
      questionId: question.id,
      sessionId: 'study',
      now: 3_000,
    });
    await answerQuestionAttempt({
      attemptId: attempt.id,
      submittedAnswer: '2',
      marksEarned: 1,
      marksAvailable: 1,
      now: 4_000,
    });
    const before = (await db.questions.get(question.id))!;
    const attempts = await db.questionAttempts.toArray();
    await withCourseFileAssets(second, () =>
      mergeLineageUpdate(imported.course.id, second.payload),
    );

    expect((await db.courses.get(imported.course.id))?.specificationRef).toEqual(corrected);
    expect(await db.concepts.get(concept.id)).toMatchObject({
      specificationPointIds: ['cambridge-0972-2028:p1'],
    });
    expect(await db.questionAttempts.toArray()).toEqual(attempts);
    expect(await db.questions.get(question.id)).toMatchObject({
      contentVersion: before.contentVersion,
      contentRevisionId: before.contentRevisionId,
      scheduleEpoch: before.scheduleEpoch,
      scheduleUpdatedAt: before.scheduleUpdatedAt,
      stability: before.stability,
      difficulty: before.difficulty,
      lastReviewed: before.lastReviewed,
      reps: before.reps,
      lapses: before.lapses,
      state: before.state,
      due: before.due,
      scheduledDays: before.scheduledDays,
      learningSteps: before.learningSteps,
    });
  });

  it('keeps a learner selection while advancing the teacher source snapshot', async () => {
    const first = publishedPayload();
    const { course } = await importLineageFirstTime(first);
    const learner = { specificationId: 'learner-spec', tier: 'foundation' };
    const distributedCopy = course.distributedCopy!;
    await updateCourse(course.id, { distributedCopy: { ...distributedCopy, locked: false } });
    await updateCourse(course.id, { specificationRef: learner, examBoard: 'Learner fallback' });
    await updateCourse(course.id, { distributedCopy });
    const teacher = { specificationId: 'teacher-correction', tier: 'higher' };
    const second = {
      ...first,
      at: 2_000,
      rv: 2,
      course: { ...first.course, specificationRef: teacher, examBoard: 'Teacher correction' },
    };
    await mergeLineageUpdate(course.id, second);
    expect(await db.courses.get(course.id)).toMatchObject({
      specificationRef: learner,
      examBoard: 'Learner fallback',
      distributedCopy: { source: { specificationRef: teacher, examBoard: 'Teacher correction' } },
    });
  });

  it('clears removed teacher links and references without discarding Custom fallback text', async () => {
    const first = publishedPayload();
    const { course } = await importLineageFirstTime(first);
    const second = structuredClone(first);
    second.rv = 2;
    second.at = 2_000;
    delete second.course.specificationRef;
    delete second.concepts[0].specificationPointIds;
    await mergeLineageUpdate(course.id, second);
    const updated = await db.courses.get(course.id);
    expect(updated?.specificationRef).toBeUndefined();
    expect(updated?.examBoard).toBe(qualification.examBoard);
    expect(updated?.specification).toBe(qualification.specification);
    expect((await db.concepts.get('concept-cells'))?.specificationPointIds).toBeUndefined();
  });
});
