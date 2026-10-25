import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { findCourseForLineage, importLineageFirstTime, mergeLineageUpdate } from './mergeImport';
import { performanceForCourseBackingDecks, performanceForReviewUnit } from './backingDecks';
import { detachCourse } from './courseRepository';
import { hydrateCardsWithHistory } from './reviewHistoryRead';
import { coursePayload, lessonOne } from './mergeImport.testFixtures';

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
