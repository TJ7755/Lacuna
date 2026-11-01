import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { db } from './schema';
import { acceptAllMergeReview, importLineageFirstTime, mergeLineageUpdate } from './mergeImport';
import {
  createLesson,
  setLocalLessonOrder,
  reorderLessons,
  upsertLessonCardExposure,
  markLessonComplete,
} from './lessonRepository';
import { recordReview } from './reviewRepository';
import { createNoteAnnotation } from './noteRepository';
import { createCourse, snapshotCourse, restoreCourse } from './courseRepository';
import { exportDatabase, importBackup, validateBackup } from './portability';
import { buildCourseSharePayload, importSharePayload, type SharePayloadV6 } from './share';
import { buildCourseFile, decodeCourseFile } from './courseFile';
import { mergeSnapshots } from '../sync/mergeSnapshots';
import { resolveCourseLessonOrder } from '../course/lessonOrder';
import { resolveAssessmentCoverage } from '../course/assessmentCoverage';
import { buildPath } from '../course/path';
import { answerQuestionAttempt, startQuestionAttempt } from '../questions/repository';
import {
  saveQuestionSetResponseDraft,
  startQuestionSetAttempt,
  submitPracticeQuestion,
} from '../questions/questionSetAttemptRepository';

function payload(revision = 1): SharePayloadV6 {
  return {
    v: 6,
    by: 'Teacher',
    at: 1000 * revision,
    li: 'science',
    rv: revision,
    course: { n: 'Science', o: 0, c: 1000, sm: 1, um: 'open' },
    lessons: (revision === 1 ? ['A', 'B'] : ['C', 'A', 'B']).map((id) => ({
      i: id,
      n: id === 'A' && revision > 1 ? 'A corrected' : id,
      ...(id === 'B' ? { d: 'Prerequisites: A' } : {}),
      notes: [
        {
          oi: `note-${id}`,
          n: id,
          c: id === 'A' && revision > 1 ? 'Corrected explanation' : 'Explanation',
        },
      ],
      cards: [
        {
          id: `card-${id}`,
          k: 0,
          f: id,
          b: id === 'A' && revision > 1 ? 'Corrected answer' : 'Answer',
          co: 'concept',
        },
      ],
    })),
    exams: [
      {
        id: 'checkpoint',
        n: 'Topic test',
        e: 2_000_000_000_000,
        k: 'c',
        a: revision === 1 ? 0 : 1,
        m: 'p',
        c: 1000,
      },
      { id: 'final', n: 'Steady retention', sm: 1, k: 'f', a: null, m: 'p', c: 1000 },
    ],
    concepts: [{ id: 'concept', n: 'Science concept' }],
    questions: [
      {
        id: 'numeric',
        k: 0,
        n: 'Calculate',
        pl: revision === 1 ? 0 : 1,
        t: 'concept',
        pr: [],
        f: 'One plus one?',
        p: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '2' } },
        e: 'Two',
      },
    ],
    questionSets: [
      {
        id: 'set',
        courseId: 'source',
        title: 'Written questions',
        lessonIds: ['B'],
        assessmentIds: [],
        questions: [
          {
            id: 'written',
            prompt: 'Explain',
            parts: [],
            answer: {
              maxMarks: 1,
              response: { kind: 'written' },
              prerequisiteConceptIds: [],
              allocations: [
                {
                  id: 'mark',
                  criterion: 'Explains',
                  maxMarks: 1,
                  dimension: 'knowledge',
                  targetConceptIds: ['concept'],
                },
              ],
            },
          },
        ],
        contentVersion: 1,
        contentRevisionId: 'set-v1',
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
    questionSetPracticeNodes: [
      {
        id: 'activity',
        courseId: 'source',
        type: 'question-set',
        name: 'Practice Qs',
        questionSetIds: ['set'],
        afterLessonId: 'B',
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
  };
}

beforeEach(async () => {
  localStorage.clear();
  await db.delete();
  await db.open();
});

async function imported(autoAcceptUpdates = false) {
  const { course } = await importLineageFirstTime(payload());
  // The share format has no autoPractice field: imports inherit global defaults.
  expect(course.autoPractice).toBe(true);
  await db.courses.update(course.id, {
    'distributedCopy.autoAcceptUpdates': autoAcceptUpdates,
  });
  return course;
}

async function displayed(courseId: string) {
  const course = (await db.courses.get(courseId))!;
  return resolveCourseLessonOrder(
    course,
    await db.lessons.where('courseId').equals(courseId).toArray(),
    await db.courseAssessments.where('courseId').equals(courseId).toArray(),
    await db.practiceNodes.where('courseId').equals(courseId).toArray(),
  ).map((lesson) => lesson.id);
}

async function storedSnapshot() {
  return { ...(await exportDatabase()), exportedAt: 0 };
}

async function evidence() {
  return {
    history: await db.reviewHistory.toArray(),
    exposures: await db.lessonCardExposures.toArray(),
    completions: await db.lessonCompletions.toArray(),
    annotations: await db.noteAnnotations.toArray(),
    numeric: await db.questionAttempts.toArray(),
    written: await db.questionSetAttempts.toArray(),
    scheduling: (await db.schedulingPerformance.toArray()).filter(
      (row) => row.schedulingUnitId !== 'C',
    ),
  };
}

it.each([true, false])(
  'retains real learner evidence and local order through lineage corrections (auto-accept %s)',
  async (autoAccept) => {
    const course = await imported(autoAccept);
    await recordReview({
      card: (await db.cards.get('card-A'))!,
      eventId: 'review',
      sessionId: 'lesson-session',
      sessionKind: 'lesson',
      deck: course,
      kind: 'course',
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      correct: true,
      now: 1_725_123_456_789,
    });
    await upsertLessonCardExposure('A', 'card-A');
    await markLessonComplete('A');
    await createNoteAnnotation('note-A', 0, 3, 'Exp', 'Remember this');
    const numeric = await startQuestionAttempt({
      questionId: 'numeric',
      sessionId: 'numeric-session',
      now: 2000,
    });
    await answerQuestionAttempt({
      attemptId: numeric.id,
      submittedAnswer: '2',
      marksEarned: 1,
      marksAvailable: 1,
      now: 3000,
    });
    let written = await startQuestionSetAttempt('set', 'practice', 2000);
    written = await saveQuestionSetResponseDraft(
      written.id,
      written.revisionId,
      'written',
      { kind: 'written', text: 'My explanation' },
      'written',
      3000,
    );
    await submitPracticeQuestion(written.id, written.revisionId, 'written', 4000);
    const before = await evidence();
    const reviewedCard = (await db.cards.get('card-A'))!;
    const question = await db.questions.get('numeric');
    await setLocalLessonOrder(course.id, ['B', 'A']);
    await mergeLineageUpdate(course.id, payload(2));
    expect(await displayed(course.id)).toEqual(autoAccept ? ['C', 'B', 'A'] : ['B', 'A', 'C']);
    if (!autoAccept) {
      const review = (await db.pendingMergeReviews.where('courseId').equals(course.id).first())!;
      expect(review.diff.conflicts).toEqual([]);
      expect(review.diff.updates.lessons.map((lesson) => lesson.id).sort()).toEqual(['A', 'B']);
      await acceptAllMergeReview(review.id);
    }
    const source = await db.lessons.where('courseId').equals(course.id).sortBy('orderIndex');
    expect(source.map((lesson) => [lesson.id, lesson.orderIndex])).toEqual([
      ['C', 0],
      ['A', 1],
      ['B', 2],
    ]);
    expect(source[1].name).toBe('A corrected');
    expect((await db.notes.get('note-A'))?.content).toBe('Corrected explanation');
    expect(await db.cards.get('card-A')).toMatchObject({
      id: reviewedCard.id,
      back: 'Corrected answer',
      due: reviewedCard.due,
      reps: reviewedCard.reps,
      stability: reviewedCard.stability,
      difficulty: reviewedCard.difficulty,
      lastReviewed: reviewedCard.lastReviewed,
    });
    expect(await db.questions.get('numeric')).toEqual({
      ...question,
      authoringRevisionId: 'question-authoring:lineage:science:2:numeric',
      authoringUpdatedAt: 2000,
    });
    expect(await evidence()).toEqual(before);
    expect((await db.courses.get(course.id))?.distributedCopy).toMatchObject({
      locked: true,
      lineageId: 'science',
      revision: 2,
    });
    const mapping = (await db.lineageIdMappings.get('science'))!;
    expect(['C', 'A', 'B'].map((id) => mapping.lessonSnapshots[id].orderIndex)).toEqual([0, 1, 2]);
    expect(JSON.stringify(mapping)).not.toContain('localLessonOrder');
    await mergeLineageUpdate(course.id, payload(2));
    expect(await db.lessons.count()).toBe(3);
    expect((await db.pendingMergeReviews.toArray()).map((review) => review.diff)).toEqual([]);
    expect(await evidence()).toEqual(before);
    expect(await displayed(course.id)).toEqual(['C', 'B', 'A']);
    const updatedCourse = (await db.courses.get(course.id))!;
    const assessments = await db.courseAssessments.where('courseId').equals(course.id).toArray();
    const practiceNodes = await db.practiceNodes.where('courseId').equals(course.id).toArray();
    const checkpoint = assessments.find((assessment) => assessment.kind === 'checkpoint')!;
    expect(updatedCourse.autoPractice).toBe(true);
    expect(
      resolveAssessmentCoverage(
        checkpoint,
        source,
        [],
        [],
        updatedCourse.localLessonOrder,
      ).coveredLessons.map((lesson) => lesson.id),
    ).toEqual(['C', 'B', 'A']);
    expect(
      buildPath(updatedCourse, source, assessments, new Map(), practiceNodes)
        .filter((node) => node.nodeType !== 'practice-auto')
        .map((node) => node.id),
    ).toEqual(['C', 'B', 'activity', 'A', checkpoint.id]);
    const backup = await storedSnapshot();
    await importBackup(backup, 'replace');
    db.close();
    await db.open();
    const restored = await storedSnapshot();
    expect({
      ...restored,
      reviewHistory: backup.reviewHistory,
      sessionHistory: backup.sessionHistory,
    }).toEqual(backup);
    // Recovery rekeys auto-increment session rows and fills their scheduling unit.
    expect(restored.sessionHistory.map(({ id: _id, ...row }) => row)).toEqual(
      backup.sessionHistory.map(({ id: _id, ...row }) => ({
        ...row,
        schedulingUnitId: row.deckId,
      })),
    );
    expect((await db.reviewHistory.toArray()).map(({ id: _id, ...row }) => row)).toEqual(
      backup.reviewHistory!.map(({ id: _id, ...row }) => ({
        ...row,
        schedulingUnitId: row.deckId,
      })),
    );
    expect(await displayed(course.id)).toEqual(['C', 'B', 'A']);
    await setLocalLessonOrder(course.id);
    expect(await displayed(course.id)).toEqual(['C', 'A', 'B']);
    expect((await db.courses.get(course.id))?.localLessonOrder).toBeUndefined();
  },
);

it.each([true, false])(
  'places new publisher lesson chains after their predecessor in local order (auto-accept %s)',
  async (autoAccept) => {
    const course = await imported(autoAccept);
    await setLocalLessonOrder(course.id, ['B', 'A']);
    const update = payload(2);
    const [leading, a, b] = update.lessons;
    update.lessons = [
      leading,
      a,
      b,
      { i: 'D', n: 'New topic', notes: [], cards: [] },
      { i: 'E', n: 'New follow-up', notes: [], cards: [] },
    ];
    await mergeLineageUpdate(course.id, update);
    if (!autoAccept) {
      const review = (await db.pendingMergeReviews.where('courseId').equals(course.id).first())!;
      await acceptAllMergeReview(review.id);
    }
    expect(await displayed(course.id)).toEqual(['C', 'B', 'D', 'E', 'A']);
    expect((await db.courses.get(course.id))?.localLessonOrder).toEqual(['B', 'A']);
    expect((await db.lessons.get('A'))?.name).toBe('A corrected');
    expect(
      (await db.lessons.where('courseId').equals(course.id).sortBy('orderIndex')).map(
        (lesson) => lesson.id,
      ),
    ).toEqual(['C', 'A', 'B', 'D', 'E']);
  },
);

it('changes only the Course preference and rejects invalid or stale permutations atomically', async () => {
  const course = await imported();
  const before = await storedSnapshot();
  for (const ids of [['A'], ['A', 'A'], ['A', 'foreign'], ['A', 'B', 'C']]) {
    await expect(setLocalLessonOrder(course.id, ids)).rejects.toThrow(/lesson list changed/);
    expect(await storedSnapshot()).toEqual(before);
    await expect(reorderLessons(course.id, ids)).rejects.toThrow(/locked/i);
  }
  await setLocalLessonOrder(course.id, ['B', 'A']);
  const after = await storedSnapshot();
  expect({ ...after, courses: before.courses }).toEqual(before);
  expect(after.courses?.[0]).toEqual({
    ...before.courses![0],
    localLessonOrder: ['B', 'A'],
    updatedAt: after.courses![0].updatedAt,
  });
  expect(after.courses![0].updatedAt).toBeGreaterThan(before.courses![0].updatedAt);
  await mergeLineageUpdate(course.id, payload(2));
  const added = await storedSnapshot();
  await expect(setLocalLessonOrder(course.id, ['B', 'A'])).rejects.toThrow(/lesson list changed/);
  expect(await storedSnapshot()).toEqual(added);
  const authored = await createCourse('Authored');
  const foreign = await createLesson(authored.id, 'Foreign');
  const withForeign = await storedSnapshot();
  await expect(setLocalLessonOrder(course.id, ['A', 'B', foreign.id])).rejects.toThrow(
    /lesson list changed/,
  );
  expect(await storedSnapshot()).toEqual(withForeign);
  await expect(setLocalLessonOrder(authored.id, [])).rejects.toThrow(/locked imported/);
  await expect(reorderLessons(authored.id, ['A', 'B', 'C'])).rejects.toThrow(/lesson list changed/);
  await expect(setLocalLessonOrder('missing', [])).rejects.toThrow('Course not found');
});

it('ignores a removed preference ID only after the publisher removal is accepted', async () => {
  const course = await imported();
  await setLocalLessonOrder(course.id, ['B', 'A']);
  const update = payload(2);
  update.lessons = update.lessons.filter((lesson) => lesson.i !== 'A');
  await mergeLineageUpdate(course.id, update);
  expect(await displayed(course.id)).toEqual(['B', 'A', 'C']);
  const review = (await db.pendingMergeReviews.where('courseId').equals(course.id).first())!;
  const pendingBackup = await exportDatabase();
  await importBackup(pendingBackup, 'replace');
  db.close();
  await db.open();
  expect(await db.pendingMergeReviews.get(review.id)).toEqual(review);
  expect(await displayed(course.id)).toEqual(['B', 'A', 'C']);
  await acceptAllMergeReview(review.id);
  expect(await displayed(course.id)).toEqual(['C', 'B']);
  expect((await db.courses.get(course.id))?.localLessonOrder).toEqual(['B', 'A']);
});

it('retains the preference in recovery and peer sync, and excludes it from shares and course files', async () => {
  const course = await imported();
  await setLocalLessonOrder(course.id, ['B', 'A']);
  const backup = await exportDatabase();
  expect(validateBackup(backup)).toBe(true);
  expect(
    validateBackup({ ...backup, courses: [{ ...backup.courses![0], localLessonOrder: [1] }] }),
  ).toBe(false);
  const snapshot = (await snapshotCourse(course.id))!;
  await setLocalLessonOrder(course.id);
  await restoreCourse(snapshot);
  expect(await displayed(course.id)).toEqual(['B', 'A']);
  await importBackup(backup, 'replace');
  db.close();
  await db.open();
  expect(await displayed(course.id)).toEqual(['B', 'A']);
  expect(await db.lineageIdMappings.get('science')).toEqual(backup.lineageIdMappings![0]);
  await setLocalLessonOrder(course.id);
  const reset = await exportDatabase();
  expect(mergeSnapshots(backup, reset).courses).toEqual(reset.courses);
  expect(mergeSnapshots(reset, backup).courses).toEqual(reset.courses);
  // Recovery merge uses createdAt, retaining the existing whole row on equal times.
  await importBackup(backup, 'merge');
  expect((await db.courses.get(course.id))?.localLessonOrder).toBeUndefined();
  const competitor = {
    ...reset,
    courses: [
      { ...reset.courses![0], name: 'Peer rename', updatedAt: reset.courses![0].updatedAt + 1 },
    ],
  };
  expect(mergeSnapshots(backup, competitor).courses).toEqual(competitor.courses);
  const tied = {
    ...backup,
    courses: [{ ...backup.courses![0], updatedAt: reset.courses![0].updatedAt }],
  };
  expect(mergeSnapshots(tied, reset).courses).toEqual(mergeSnapshots(reset, tied).courses);
  await setLocalLessonOrder(course.id, ['B', 'A']);
  const share = await buildCourseSharePayload(course.id);
  const file = await decodeCourseFile(await buildCourseFile(course.id));
  for (const output of [share, file.payload]) {
    expect(output.lessons.map((lesson) => lesson.n)).toEqual(['A', 'B']);
    expect(JSON.stringify(output)).not.toContain('localLessonOrder');
  }
  const plain = await importSharePayload(share);
  expect((await db.courses.get(plain.courseIds[0]))?.localLessonOrder).toBeUndefined();
  const collision = await importLineageFirstTime(payload());
  expect(collision.course.distributedCopy).toBeUndefined();
  expect(collision.course.localLessonOrder).toBeUndefined();
});

it('rejects saves when a retained preference is suspended and permits clearing it', async () => {
  const course = await imported();
  await setLocalLessonOrder(course.id, ['B', 'A']);
  for (const changes of [{ archived: true }]) {
    await db.courses.update(course.id, changes);
    const before = await storedSnapshot();
    await expect(setLocalLessonOrder(course.id, ['A', 'B'])).rejects.toThrow();
    expect(await storedSnapshot()).toEqual(before);
    expect(await displayed(course.id)).toEqual(['A', 'B']);
    expect((await db.courses.get(course.id))?.localLessonOrder).toEqual(['B', 'A']);
    await db.courses.update(course.id, {
      archived: false,
      autoPractice: false,
      unlockMode: 'open',
    });
  }
  await db.practiceNodes.add({
    id: 'manual',
    courseId: course.id,
    type: 'manual',
    position: 0,
    name: 'Cards',
    createdAt: 1,
    updatedAt: 1,
  });
  await setLocalLessonOrder(course.id, ['A', 'B']);
  expect(await displayed(course.id)).toEqual(['A', 'B']);
  await setLocalLessonOrder(course.id);
  expect((await db.courses.get(course.id))?.localLessonOrder).toBeUndefined();
});
