import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  cardsForOcclusion,
  createOcclusion,
  deleteOcclusion,
  listOcclusions,
  restoreOcclusion,
  snapshotOcclusion,
  updateOcclusion,
} from './occlusionRepository';
import { createCourse, createLesson, deleteCards, moveCards } from './repository';
import type { Occlusion, OcclusionRegion } from './types';

async function reset() {
  await Promise.all([
    db.courses.clear(),
    db.lessons.clear(),
    db.cards.clear(),
    db.decks.clear(),
    db.userPerformance.clear(),
    db.sessionHistory.clear(),
    db.occlusions.clear(),
    db.lessonCards.clear(),
    db.lessonCardExposures.clear(),
  ]);
}

function labelRegion(id: string, overrides: Partial<OcclusionRegion> = {}): OcclusionRegion {
  return { id, role: 'label', shape: 'rectangle', x: 0.1, y: 0.1, w: 0.1, h: 0.1, ...overrides };
}

function featureRegion(id: string, overrides: Partial<OcclusionRegion> = {}): OcclusionRegion {
  return { id, role: 'feature', shape: 'rectangle', x: 0.5, y: 0.5, w: 0.1, h: 0.1, ...overrides };
}

describe('createOcclusion', () => {
  beforeEach(reset);

  it('persists the occlusion and generates one card per region with a real backing deck', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cell structure');
    const regions = [labelRegion('r1'), labelRegion('r2'), featureRegion('r3', { pairedRegionId: 'r1' })];

    const occlusion = await createOcclusion(course.id, lesson.id, 'Plant cell', 'hash-1', regions);

    expect(await db.occlusions.get(occlusion.id)).toEqual(occlusion);
    const cards = await cardsForOcclusion(occlusion);
    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.occlusionRegionId).sort()).toEqual(['r1', 'r2', 'r3']);
    for (const card of cards) {
      expect(card.state).toBe(0);
      expect(card.stability).toBeNull();
      expect(card.reps).toBe(0);
      expect(card.courseId).toBe(course.id);
      expect(card.primaryLessonId).toBe(lesson.id);
      expect(card.deckId).toBeTruthy();
      expect(card.sequenceItemId).toBeUndefined();
    }
  });

  it('falls back to "Untitled occlusion" for a blank name', async () => {
    const course = await createCourse('Biology');
    const occlusion = await createOcclusion(course.id, null, '   ', 'hash-1', [labelRegion('r1')]);
    expect(occlusion.name).toBe('Untitled occlusion');
  });
});

describe('updateOcclusion', () => {
  beforeEach(reset);

  it('applies the regeneration diff: creates, updates, and deletes cards to match', async () => {
    const course = await createCourse('Biology');
    const occlusion = await createOcclusion(course.id, null, 'Plant cell', 'hash-1', [
      labelRegion('r1'),
      labelRegion('r2'),
    ]);

    const updated: Occlusion = {
      ...occlusion,
      regions: [
        labelRegion('r1', { x: 0.3 }), // moved -> update
        // r2 removed -> delete
        labelRegion('r3'), // new -> create
      ],
    };
    await updateOcclusion(updated);

    const cards = await cardsForOcclusion(updated);
    expect(cards.map((c) => c.occlusionRegionId).sort()).toEqual(['r1', 'r3']);
    expect(await db.cards.where('occlusionRegionId').equals('r2').toArray()).toHaveLength(0);
  });

  it('preserves FSRS state across a region move, resize, role change and re-pairing', async () => {
    const course = await createCourse('Biology');
    const occlusion = await createOcclusion(course.id, null, 'Plant cell', 'hash-1', [
      labelRegion('r1'),
      featureRegion('r2', { pairedRegionId: 'r1' }),
    ]);
    const cards = await cardsForOcclusion(occlusion);
    const featureCard = cards.find((c) => c.occlusionRegionId === 'r2')!;

    // Simulate real study progress: give the card a full FSRS history, not just scalars.
    const reviewedState = {
      state: 2 as const,
      stability: 12.5,
      difficulty: 4.2,
      reps: 3,
      lapses: 1,
      due: 123456,
      lastReviewed: 100000,
      history: [
        {
          timestamp: 100000,
          grade: 3 as const,
          responseTimeSec: 2,
          distracted: false,
          stabilityBefore: null,
          stabilityAfter: 12.5,
          difficultyBefore: null,
          difficultyAfter: 4.2,
          retrievabilityAtReview: null,
        },
      ],
    };
    await db.cards.update(featureCard.id, reviewedState);
    const before = await db.cards.get(featureCard.id);

    // Move, resize, and flip the label region's role to feature, then re-pair r2 to a
    // freshly added label region — a genuine edit of everything diffRegeneration is
    // meant to survive without touching FSRS/scheduling fields.
    const updated: Occlusion = {
      ...occlusion,
      regions: [
        featureRegion('r1', { x: 0.6, y: 0.6, w: 0.2, h: 0.2 }),
        featureRegion('r2', { pairedRegionId: 'r3' }),
        labelRegion('r3'),
      ],
    };
    await updateOcclusion(updated);

    const after = await db.cards.get(featureCard.id);
    expect(after).toBeDefined();
    expect(after!.state).toBe(before!.state);
    expect(after!.stability).toBe(before!.stability);
    expect(after!.difficulty).toBe(before!.difficulty);
    expect(after!.reps).toBe(before!.reps);
    expect(after!.lapses).toBe(before!.lapses);
    expect(after!.due).toBe(before!.due);
    expect(after!.lastReviewed).toBe(before!.lastReviewed);
    expect(after!.history).toEqual(before!.history);
  });

  it('clears a dangling pairedRegionId when the paired region is deleted, regenerating the feature card', async () => {
    const course = await createCourse('Biology');
    const occlusion = await createOcclusion(course.id, null, 'Plant cell', 'hash-1', [
      labelRegion('r1', { answerText: 'Nucleus' }),
      featureRegion('r2', { pairedRegionId: 'r1' }),
    ]);
    const before = await cardsForOcclusion(occlusion);
    const featureCardBefore = before.find((c) => c.occlusionRegionId === 'r2')!;
    expect(featureCardBefore.back).toContain('Nucleus');

    // Delete r1 (the paired label) but leave r2 (the feature) as-is, without updating its
    // pairedRegionId — this is the case the repository must clean up itself.
    const updated: Occlusion = {
      ...occlusion,
      regions: [featureRegion('r2', { pairedRegionId: 'r1', answerText: 'Fallback answer' })],
    };
    await updateOcclusion(updated);

    const stored = await db.occlusions.get(occlusion.id);
    expect(stored!.regions.find((r) => r.id === 'r2')!.pairedRegionId).toBeUndefined();

    const after = await cardsForOcclusion(stored!);
    expect(after).toHaveLength(1);
    expect(after[0].back).toContain('Fallback answer');
    expect(after[0].back).not.toContain('Nucleus');
  });
});

describe('deleteOcclusion', () => {
  beforeEach(reset);

  it('removes the occlusion and every card it generated', async () => {
    const course = await createCourse('Biology');
    const occlusion = await createOcclusion(course.id, null, 'Plant cell', 'hash-1', [
      labelRegion('r1'),
      labelRegion('r2'),
    ]);
    expect(await cardsForOcclusion(occlusion)).toHaveLength(2);

    await deleteOcclusion(occlusion.id);

    expect(await db.occlusions.get(occlusion.id)).toBeUndefined();
    expect(await cardsForOcclusion(occlusion)).toHaveLength(0);
  });
});

describe('listOcclusions', () => {
  beforeEach(reset);

  it('returns only occlusions for the given course, ordered by createdAt', async () => {
    const course1 = await createCourse('Biology');
    const course2 = await createCourse('Chemistry');
    const a = await createOcclusion(course1.id, null, 'A', 'hash-a', [labelRegion('r1')]);
    const b = await createOcclusion(course1.id, null, 'B', 'hash-b', [labelRegion('r2')]);
    await createOcclusion(course2.id, null, 'C', 'hash-c', [labelRegion('r3')]);

    const result = await listOcclusions(course1.id);
    expect(result.map((o) => o.id)).toEqual([a.id, b.id]);
  });
});

describe('snapshotOcclusion / restoreOcclusion', () => {
  beforeEach(reset);

  it('round-trips the occlusion and its cards, preserving FSRS state', async () => {
    const course = await createCourse('Biology');
    const occlusion = await createOcclusion(course.id, null, 'Plant cell', 'hash-1', [
      labelRegion('r1'),
      labelRegion('r2'),
    ]);
    const [first] = await cardsForOcclusion(occlusion);
    await db.cards.update(first.id, { state: 2, stability: 8.4, reps: 2 });

    const snapshot = await snapshotOcclusion(occlusion.id);
    expect(snapshot).not.toBeNull();

    await deleteOcclusion(occlusion.id);
    expect(await db.occlusions.get(occlusion.id)).toBeUndefined();

    await restoreOcclusion(snapshot!);

    expect(await db.occlusions.get(occlusion.id)).toEqual(occlusion);
    const restoredCard = await db.cards.get(first.id);
    expect(restoredCard).toBeDefined();
    expect(restoredCard!.state).toBe(2);
    expect(restoredCard!.stability).toBe(8.4);
    expect(restoredCard!.reps).toBe(2);
  });

  it('returns null when the occlusion no longer exists', async () => {
    expect(await snapshotOcclusion('missing')).toBeNull();
  });
});

describe('read-only guard on occlusion-generated cards', () => {
  beforeEach(reset);

  it('refuses to delete an occlusion-generated card via the generic deleteCards path', async () => {
    const course = await createCourse('Biology');
    const occlusion = await createOcclusion(course.id, null, 'Plant cell', 'hash-1', [labelRegion('r1')]);
    const [card] = await cardsForOcclusion(occlusion);

    await expect(deleteCards([card.id])).rejects.toThrow(
      'generated by a sequence or occlusion',
    );
    expect(await db.cards.get(card.id)).toBeDefined();
  });

  it('refuses to move an occlusion-generated card via the generic moveCards path', async () => {
    const course = await createCourse('Biology');
    const occlusion = await createOcclusion(course.id, null, 'Plant cell', 'hash-1', [labelRegion('r1')]);
    const [card] = await cardsForOcclusion(occlusion);

    await expect(moveCards([card.id], 'some-other-deck')).rejects.toThrow(
      'generated by a sequence or occlusion',
    );
  });
});
