import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  addTagToCards,
  assignCardsToLesson,
  buryCard,
  buryCards,
  completeRevisionWindow,
  createBasicReversedPair,
  createCard,
  createCards,
  createCardWithReverse,
  createCourse,
  createCourseAssessment,
  createCourseBasicReversedPair,
  createCourseCard,
  createCourseCardWithReverse,
  createLesson,
  createLessonBasicReversedPair,
  createLessonCard,
  createLessonCardWithReverse,
  createNote,
  createOrResumeRevisionPlan,
  createSequence,
  deleteCards,
  deleteCourse,
  deleteLesson,
  linkCardsToLesson,
  markLessonComplete,
  moveCards,
  recordReview,
  refreshRevisionPlan,
  removeRevisionDay,
  removeTagFromCards,
  rescheduleCards,
  restoreCourse,
  setCardFlag,
  setCardsSuspended,
  setRevisionDayBudget,
  snapshotCourse,
  stampMissingLessonViewModes,
  startRevisionWindow,
  suspendCard,
  unsuspendCard,
  updateCard,
  updateCourse,
  updateCourseAssessment,
  updateNote,
  updateSequence,
  upsertLessonCardExposure,
} from './repository';
import { createOcclusion, updateOcclusion } from './occlusionRepository';
import {
  createPracticeNode,
  savePracticeMilestoneProgress,
  updatePracticeNode,
} from './practiceNodeRepository';
import type { OcclusionRegion, RevisionProjection } from './types';

const revisionFallback: RevisionProjection = {
  projectionMode: 'fsrs-6-practice-fallback',
  memoryModelVersion: 'fsrs-6',
  fallbackReason: 'missing',
};

function labelRegion(id: string): OcclusionRegion {
  return { id, role: 'label', shape: 'rectangle', x: 0.1, y: 0.1, w: 0.1, h: 0.1 };
}

function waitForStamp(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 2));
}

async function expectStampAdvanced(
  read: () => Promise<number | undefined>,
  mutate: () => Promise<unknown>,
): Promise<void> {
  const before = await read();
  expect(before).toBeGreaterThan(0);
  await waitForStamp();
  await mutate();
  expect(await read()).toBeGreaterThan(before!);
}

async function reset() {
  db.close();
  await db.delete();
  await db.open();
}

describe('repository mutation stamps and tombstones', () => {
  beforeEach(reset);

  it('advances updatedAt on course and note writes', async () => {
    const course = await createCourse('Biology');
    expect(course.updatedAt).toBeGreaterThan(0);
    const before = course.updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 2));
    await updateCourse(course.id, { description: 'Cells' });
    const updated = await db.courses.get(course.id);
    expect(updated?.updatedAt).toBeGreaterThan(before);

    const lesson = await createLesson(course.id, 'Intro');
    const note = await createNote(lesson.id, 'Notes', 'Body');
    const noteBefore = note.updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 2));
    await updateNote(note.id, { content: 'Edited' });
    expect((await db.notes.get(note.id))?.updatedAt).toBeGreaterThan(noteBefore);
  });

  it('does not stamp stampMissingLessonViewModes', async () => {
    const course = await createCourse('Biology');
    await db.courses.update(course.id, { lessonViewMode: undefined, updatedAt: 42 });
    await stampMissingLessonViewModes();
    expect(await db.courses.get(course.id)).toMatchObject({ updatedAt: 42 });
  });

  it('advances updatedAt on card writes including recordReview', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Intro');
    const other = await createCourse('Chemistry');

    const card = await createCard(course.id, 'front_back', 'Q', 'A');
    expect(card.updatedAt).toBeGreaterThan(0);

    const bulk = await createCards(course.id, [
      { type: 'front_back', front: 'B1', back: 'B1a' },
      { type: 'front_back', front: 'B2', back: 'B2a' },
    ]);
    expect(bulk[0].updatedAt).toBeGreaterThan(0);
    expect(bulk[1].updatedAt).toBeGreaterThan(0);

    const reversed = await createCardWithReverse(course.id, 'Front', 'Back');
    expect(reversed.card.updatedAt).toBeGreaterThan(0);
    expect(reversed.reverse.updatedAt).toBeGreaterThan(0);

    const pair = await createBasicReversedPair(course.id, 'Alpha', 'Beta');
    expect(pair.card.updatedAt).toBeGreaterThan(0);
    expect(pair.reverse.updatedAt).toBeGreaterThan(0);

    const lessonCard = await createLessonCard(course.id, lesson.id, 'front_back', 'LQ', 'LA');
    expect(lessonCard.updatedAt).toBeGreaterThan(0);
    const lessonReversed = await createLessonCardWithReverse(course.id, lesson.id, 'LF', 'LB');
    expect(lessonReversed.card.updatedAt).toBeGreaterThan(0);
    const lessonPair = await createLessonBasicReversedPair(course.id, lesson.id, 'LP', 'LR');
    expect(lessonPair.card.updatedAt).toBeGreaterThan(0);

    const courseCard = await createCourseCard(course.id, 'front_back', 'CQ', 'CA');
    expect(courseCard.updatedAt).toBeGreaterThan(0);
    const courseReversed = await createCourseCardWithReverse(course.id, 'CF', 'CB');
    expect(courseReversed.card.updatedAt).toBeGreaterThan(0);
    const coursePair = await createCourseBasicReversedPair(course.id, 'CP', 'CR');
    expect(coursePair.card.updatedAt).toBeGreaterThan(0);

    const read = (id: string) => db.cards.get(id).then((row) => row?.updatedAt);

    await expectStampAdvanced(() => read(card.id), () => updateCard(card.id, { back: 'Edited' }));
    await expectStampAdvanced(
      () => read(courseCard.id),
      () => assignCardsToLesson([courseCard.id], course.id, lesson.id),
    );
    await expectStampAdvanced(() => read(card.id), () => moveCards([card.id], other.id));
    await expectStampAdvanced(() => read(card.id), () => suspendCard(card.id));
    await expectStampAdvanced(() => read(card.id), () => unsuspendCard(card.id));
    await expectStampAdvanced(() => read(card.id), () => setCardsSuspended([card.id], true));
    await expectStampAdvanced(() => read(card.id), () => addTagToCards([card.id], 'exam'));
    await expectStampAdvanced(() => read(card.id), () => removeTagFromCards([card.id], 'exam'));
    await expectStampAdvanced(() => read(card.id), () => buryCard(card.id, Date.now() + 60_000));
    await expectStampAdvanced(() => read(bulk[0].id), () => buryCards([bulk[0].id], Date.now() + 60_000));
    await expectStampAdvanced(
      () => read(bulk[1].id),
      () => rescheduleCards([bulk[1].id], { due: Date.now() + 86_400_000 }),
    );
    await expectStampAdvanced(() => read(card.id), () => setCardFlag(card.id, true));

    const reviewed = await createCard(course.id, 'front_back', 'Review me', 'Answer');
    await expectStampAdvanced(
      () => read(reviewed.id),
      () =>
        recordReview({
          card: reviewed,
          eventId: 'event-stamp-review',
          sessionId: 'session-stamp-review',
          sessionKind: 'deck',
          deck: course,
          grade: 3,
          responseTimeSec: 2,
          distracted: false,
          correct: true,
        }),
    );
  });

  it('advances updatedAt on sequence writes', async () => {
    const course = await createCourse('Chemistry');
    const sequence = await createSequence(course.id, null, 'Halogens', [
      { id: 'item-0', value: 'F' },
      { id: 'item-1', value: 'Cl' },
    ]);
    expect(sequence.updatedAt).toBeGreaterThan(0);
    const generated = await db.cards.where('sequenceItemId').anyOf(['item-0', 'item-1']).toArray();
    expect(generated.every((card) => card.updatedAt > 0)).toBe(true);

    await expectStampAdvanced(
      () => db.sequences.get(sequence.id).then((row) => row?.updatedAt),
      () => updateSequence({ ...sequence, name: 'Group 17' }),
    );
  });

  it('advances updatedAt on occlusion writes', async () => {
    const course = await createCourse('Biology');
    const occlusion = await createOcclusion(course.id, null, 'Cell', 'hash-1', [labelRegion('r1')]);
    expect(occlusion.updatedAt).toBeGreaterThan(0);
    const generated = await db.cards.where('occlusionRegionId').equals('r1').toArray();
    expect(generated[0]?.updatedAt).toBeGreaterThan(0);

    await expectStampAdvanced(
      () => db.occlusions.get(occlusion.id).then((row) => row?.updatedAt),
      () => updateOcclusion({ ...occlusion, name: 'Plant cell' }),
    );
  });

  it('advances updatedAt on practice node writes', async () => {
    const node = await createPracticeNode('course-1', { type: 'manual', name: 'Practice' });
    expect(node.updatedAt).toBeGreaterThan(0);

    await expectStampAdvanced(
      () => db.practiceNodes.get(node.id).then((row) => row?.updatedAt),
      () => updatePracticeNode(node.id, { name: 'Past paper' }),
    );

    const milestone = await savePracticeMilestoneProgress(node.id, 'course-1', 'scope-1', 1, 3);
    expect(milestone.updatedAt).toBeGreaterThan(0);
    await expectStampAdvanced(
      () => db.practiceMilestones.get(node.id).then((row) => row?.updatedAt),
      () => savePracticeMilestoneProgress(node.id, 'course-1', 'scope-1', 2, 3),
    );
  });

  it('advances updatedAt on course assessment writes', async () => {
    const course = await createCourse('Biology');
    const created = await createCourseAssessment(course.id, 'Mock', Date.now() + 86_400_000);
    expect(created.updatedAt).toBeGreaterThan(0);

    await expectStampAdvanced(
      () => db.courseAssessments.get(created.id).then((row) => row?.updatedAt),
      () => updateCourseAssessment(created.id, { name: 'Paper 1' }),
    );
  });

  it('advances updatedAt on revision plan writes', async () => {
    const now = Date.parse('2026-07-17T08:00:00Z');
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Q', 'A');
    await upsertLessonCardExposure(lesson.id, card.id, now - 1_000);
    const assessment = await createCourseAssessment(course.id, 'Paper 1', Date.parse('2026-07-19T12:00:00Z'), {
      timeZone: 'UTC',
      afterLessonId: lesson.id,
    });

    const plan = await createOrResumeRevisionPlan(assessment.id, 20, revisionFallback, now);
    expect(plan.updatedAt).toBeGreaterThan(0);

    await expectStampAdvanced(
      () => db.revisionPlans.get(plan.id).then((row) => row?.updatedAt),
      () => setRevisionDayBudget(plan.id, '2026-07-18', 35, now + 1),
    );
    await expectStampAdvanced(
      () => db.revisionPlans.get(plan.id).then((row) => row?.updatedAt),
      () => removeRevisionDay(plan.id, '2026-07-18', now + 2),
    );

    await updateCourseAssessment(assessment.id, { examDate: Date.parse('2026-07-20T12:00:00Z') });
    await expectStampAdvanced(
      () => db.revisionPlans.get(plan.id).then((row) => row?.updatedAt),
      () => refreshRevisionPlan(plan.id, revisionFallback, now + 3),
    );

    const windowId = (await db.revisionPlans.get(plan.id))!.windows[0].id;
    await expectStampAdvanced(
      () => db.revisionPlans.get(plan.id).then((row) => row?.updatedAt),
      () => startRevisionWindow(plan.id, windowId, now + 10),
    );
    await expectStampAdvanced(
      () => db.revisionPlans.get(plan.id).then((row) => row?.updatedAt),
      () =>
        completeRevisionWindow(
          plan.id,
          windowId,
          {
            id: 'session-1',
            windowId,
            startedAt: now + 10,
            completedAt: now + 30,
            cardIds: [card.id],
            reviewEventIds: ['event-1'],
          },
          now + 30,
        ),
    );
  });

  it('advances updatedAt on lesson links, exposures and completions', async () => {
    const course = await createCourse('Biology');
    const primary = await createLesson(course.id, 'Cells');
    const linked = await createLesson(course.id, 'Review');
    const card = await createLessonCard(course.id, primary.id, 'front_back', 'Q', 'A');

    const [link] = await linkCardsToLesson(linked.id, [card.id]);
    expect(link.updatedAt).toBeGreaterThan(0);

    const exposure = await upsertLessonCardExposure(primary.id, card.id, 100);
    expect(exposure.updatedAt).toBeGreaterThan(0);
    // A second upsert must not restamp — it is not a write.
    await waitForStamp();
    const replayed = await upsertLessonCardExposure(primary.id, card.id, 200);
    expect(replayed.updatedAt).toBe(exposure.updatedAt);

    const completion = await markLessonComplete(primary.id, 300);
    expect(completion.updatedAt).toBeGreaterThan(0);
    await waitForStamp();
    const completionReplay = await markLessonComplete(primary.id, 400);
    expect(completionReplay.updatedAt).toBe(completion.updatedAt);
  });

  it('advances updatedAt on scheduling units and performance rows', async () => {
    const course = await createCourse('Biology');
    const courseUnit = await db.schedulingUnits.get(course.id);
    const coursePerf = await db.coursePerformance.get(course.id);
    const schedulingPerf = await db.schedulingPerformance.get(course.id);
    expect(courseUnit?.updatedAt).toBeGreaterThan(0);
    expect(coursePerf?.updatedAt).toBeGreaterThan(0);
    expect(schedulingPerf?.updatedAt).toBeGreaterThan(0);

    await expectStampAdvanced(
      () => db.schedulingUnits.get(course.id).then((row) => row?.updatedAt),
      () => updateCourse(course.id, { name: 'Cell biology' }),
    );

    const lesson = await createLesson(course.id, 'Intro');
    expect((await db.schedulingUnits.get(lesson.id))?.updatedAt).toBeGreaterThan(0);
    expect((await db.schedulingPerformance.get(lesson.id))?.updatedAt).toBeGreaterThan(0);

    const card = await createCard(course.id, 'front_back', 'Q', 'A');
    const unitBefore = (await db.schedulingUnits.get(course.id))!.updatedAt;
    const perfBefore = (await db.schedulingPerformance.get(course.id))!.updatedAt;
    expect(unitBefore).toBeGreaterThan(0);
    expect(perfBefore).toBeGreaterThan(0);
    await waitForStamp();
    await recordReview({
      card,
      eventId: 'event-stamp-scheduling-perf',
      sessionId: 'session-stamp-scheduling-perf',
      sessionKind: 'deck',
      deck: course,
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      correct: true,
    });
    expect((await db.schedulingUnits.get(course.id))?.updatedAt).toBeGreaterThan(unitBefore);
    expect((await db.schedulingPerformance.get(course.id))?.updatedAt).toBeGreaterThan(perfBefore);

    const courseCard = await createLessonCard(course.id, lesson.id, 'front_back', 'CQ', 'CA');
    await expectStampAdvanced(
      () => db.coursePerformance.get(course.id).then((row) => row?.updatedAt),
      () =>
        recordReview({
          card: courseCard,
          eventId: 'event-stamp-course-perf',
          sessionId: 'session-stamp-course-perf',
          sessionKind: 'lesson',
          deck: course,
          kind: 'course',
          grade: 3,
          responseTimeSec: 2,
          distracted: false,
          correct: true,
        }),
    );
  });

  it('tombstones a deleted card in the same transaction', async () => {
    const course = await createCourse('Biology');
    const card = await createCard(course.id, 'front_back', 'Q', 'A');
    await deleteCards([card.id]);
    expect(await db.cards.get(card.id)).toBeUndefined();
    expect(await db.tombstones.get(['cards', card.id])).toMatchObject({
      table: 'cards',
      recordId: card.id,
    });
  });

  it('tombstones every snapshot-carried row when deleting a course, including occlusions', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Intro');
    await createNote(lesson.id, 'Notes', 'Body');
    await createCard(course.id, 'front_back', 'Q', 'A');
    const occlusion = await createOcclusion(course.id, null, 'Diagram', 'hash', []);

    const snapshot = await snapshotCourse(course.id);
    expect(snapshot?.occlusions).toHaveLength(1);

    await deleteCourse(course.id);

    const tombstones = await db.tombstones.toArray();
    const tables = new Set(tombstones.map((row) => row.table));
    expect(tables.has('courses')).toBe(true);
    expect(tables.has('lessons')).toBe(true);
    expect(tables.has('notes')).toBe(true);
    expect(tables.has('cards')).toBe(true);
    expect(tables.has('occlusions')).toBe(true);
    expect(tables.has('schedulingUnits')).toBe(true);
    expect(tombstones.some((row) => row.table === 'noteAnnotations')).toBe(false);
    expect(await db.occlusions.get(occlusion.id)).toBeUndefined();

    await restoreCourse(snapshot!);
    expect(await db.courses.get(course.id)).toMatchObject({
      name: 'Biology',
      updatedAt: snapshot!.course.updatedAt,
    });
    expect(await db.occlusions.get(occlusion.id)).toMatchObject({ id: occlusion.id });
    expect(await db.tombstones.count()).toBe(0);
  });

  it('does not tombstone cards when a lesson is deleted', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Intro');
    const card = await createCard(course.id, 'front_back', 'Q', 'A');
    await db.cards.update(card.id, { primaryLessonId: lesson.id });

    await deleteLesson(lesson.id);

    expect(await db.cards.get(card.id)).toMatchObject({ id: card.id, primaryLessonId: null });
    expect(await db.tombstones.get(['cards', card.id])).toBeUndefined();
    expect(await db.tombstones.get(['lessons', lesson.id])).toMatchObject({ table: 'lessons' });
  });
});
