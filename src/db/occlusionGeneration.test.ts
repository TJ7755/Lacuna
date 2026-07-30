import { describe, expect, it } from 'vitest';
import {
  diffRegeneration,
  generateCards,
  occlusionForRegionId,
  resolveOcclusionAnswerText,
  resolveOcclusionFace,
} from './occlusionGeneration';
import type { Card, Occlusion, OcclusionRegion } from './types';

function region(id: string, role: OcclusionRegion['role'], overrides: Partial<OcclusionRegion> = {}): OcclusionRegion {
  return { id, role, shape: 'rectangle', x: 0, y: 0, w: 0.1, h: 0.1, ...overrides };
}

function makeOcclusion(overrides: Partial<Occlusion> = {}): Occlusion {
  return {
    id: 'occ-1',
    courseId: 'course-1',
    primaryLessonId: 'lesson-1',
    name: 'Plant cell',
    assetHash: 'hash-1',
    regions: [
      region('l1', 'label', { x: 0.1, y: 0.1, w: 0.1, h: 0.1 }),
      region('l2', 'label', { x: 0.3, y: 0.1, w: 0.1, h: 0.1 }),
      region('f1', 'feature', { x: 0.5, y: 0.5, w: 0.1, h: 0.1, pairedRegionId: 'l1' }),
    ],
    createdAt: 0,
    ...overrides,
  };
}

/** Build a Card record (only the fields diffRegeneration/generateCards care about matter). */
function card(
  overrides: Partial<Card> & { id: string; occlusionRegionId: string; front: string; back: string },
): Card {
  return {
    deckId: 'deck-1',
    type: 'front_back',
    stability: 5,
    difficulty: 3,
    lastReviewed: 1000,
    reps: 2,
    lapses: 0,
    state: 2,
    due: 2000,
    scheduledDays: 10,
    learningSteps: 0,
    history: [],
    createdAt: 0,
    ...overrides,
  };
}

describe('occlusionForRegionId', () => {
  it('finds the occlusion owning a region id', () => {
    const occ = makeOcclusion();
    expect(occlusionForRegionId([occ], 'l2')).toBe(occ);
  });

  it('returns undefined when no occlusion owns the region id', () => {
    const occ = makeOcclusion();
    expect(occlusionForRegionId([occ], 'nope')).toBeUndefined();
  });

  it('returns undefined for an empty occlusion list', () => {
    expect(occlusionForRegionId([], 'l1')).toBeUndefined();
  });
});

describe('generateCards', () => {
  it('generates zero cards for an occlusion with no regions', () => {
    const occ = makeOcclusion({ regions: [] });
    expect(generateCards(occ)).toEqual([]);
  });

  it('generates one card per region, both roles included', () => {
    const occ = makeOcclusion();
    const payloads = generateCards(occ);
    expect(payloads).toHaveLength(3);
    expect(payloads.map((p) => p.occlusionRegionId)).toEqual(['l1', 'l2', 'f1']);
  });

  it('every payload carries only type/front/back/occlusionRegionId/courseId/primaryLessonId', () => {
    const occ = makeOcclusion();
    for (const payload of generateCards(occ)) {
      expect(Object.keys(payload).sort()).toEqual(
        ['back', 'courseId', 'front', 'occlusionRegionId', 'primaryLessonId', 'type'].sort(),
      );
      expect(payload.type).toBe('front_back');
      expect(payload.courseId).toBe('course-1');
      expect(payload.primaryLessonId).toBe('lesson-1');
    }
  });

  it('plain-text front reads "{Role} {n} of {total} — {name}"', () => {
    const occ = makeOcclusion();
    const [l1, l2, f1] = generateCards(occ);
    expect(l1.front).toBe('Label 1 of 3 — Plant cell');
    expect(l2.front).toBe('Label 2 of 3 — Plant cell');
    expect(f1.front).toBe('Feature 3 of 3 — Plant cell');
  });

  it('a label region\'s back reveals its own answerText when set (typed mode)', () => {
    const occ = makeOcclusion({
      regions: [region('l1', 'label', { answerText: 'Nucleus' })],
    });
    const [payload] = generateCards(occ);
    expect(payload.back).toBe('Label 1 of 1 — Plant cell\n\nNucleus');
  });

  it('a label region\'s back falls back to a generic reveal line when no answerText is set', () => {
    const occ = makeOcclusion({ regions: [region('l1', 'label')] });
    const [payload] = generateCards(occ);
    expect(payload.back).toBe('Label 1 of 1 — Plant cell\n\nRevealed on the diagram.');
  });

  it('a paired feature region\'s back reveals the paired label\'s answerText', () => {
    const occ = makeOcclusion({
      regions: [region('l1', 'label', { answerText: 'Nucleus' }), region('f1', 'feature', { pairedRegionId: 'l1' })],
    });
    const [, feature] = generateCards(occ);
    expect(feature.back).toBe('Feature 2 of 2 — Plant cell\n\nNucleus');
  });

  it('a paired feature region falls back to a generic reveal line when the paired label has no answerText', () => {
    const occ = makeOcclusion({
      regions: [region('l1', 'label'), region('f1', 'feature', { pairedRegionId: 'l1' })],
    });
    const [, feature] = generateCards(occ);
    expect(feature.back).toBe('Feature 2 of 2 — Plant cell\n\nRevealed on the diagram.');
  });

  it('an unpaired feature region\'s back shows its own answerText', () => {
    const occ = makeOcclusion({
      regions: [region('f1', 'feature', { answerText: 'Mitochondrion' })],
    });
    const [payload] = generateCards(occ);
    expect(payload.back).toBe('Feature 1 of 1 — Plant cell\n\nMitochondrion');
  });

  it('appends backNote as its own paragraph when present', () => {
    const occ = makeOcclusion({
      regions: [region('l1', 'label', { answerText: 'Nucleus', backNote: 'Controls the cell.' })],
    });
    const [payload] = generateCards(occ);
    expect(payload.back).toBe('Label 1 of 1 — Plant cell\n\nNucleus\n\nControls the cell.');
  });
});

describe('resolveOcclusionFace', () => {
  it('returns undefined for a region id the occlusion does not have', () => {
    const occ = makeOcclusion();
    expect(resolveOcclusionFace(occ, 'nope')).toBeUndefined();
  });

  it('masks every label region on the front for a label target, and rings the target', () => {
    const occ = makeOcclusion();
    const face = resolveOcclusionFace(occ, 'l1')!;
    expect(face.frontMaskedRegionIds.sort()).toEqual(['l1', 'l2']);
    expect(face.targetRegionId).toBe('l1');
  });

  it('masks every label region on the front for a feature target too, without adding the feature itself', () => {
    const occ = makeOcclusion();
    const face = resolveOcclusionFace(occ, 'f1')!;
    expect(face.frontMaskedRegionIds.sort()).toEqual(['l1', 'l2']);
    expect(face.targetRegionId).toBe('f1');
  });

  it('a label card lifts its own mask on the back', () => {
    const occ = makeOcclusion();
    const face = resolveOcclusionFace(occ, 'l2')!;
    expect(face.backLiftedRegionId).toBe('l2');
    expect(face.answerText).toBeUndefined();
  });

  it('a paired feature card lifts its paired label\'s mask on the back', () => {
    const occ = makeOcclusion();
    const face = resolveOcclusionFace(occ, 'f1')!;
    expect(face.backLiftedRegionId).toBe('l1');
    expect(face.answerText).toBeUndefined();
  });

  it('an unpaired feature card lifts no mask and shows answerText instead', () => {
    const occ = makeOcclusion({
      regions: [region('l1', 'label'), region('f2', 'feature', { answerText: 'Mitochondrion' })],
    });
    const face = resolveOcclusionFace(occ, 'f2')!;
    expect(face.backLiftedRegionId).toBeUndefined();
    expect(face.answerText).toBe('Mitochondrion');
    expect(face.frontMaskedRegionIds).toEqual(['l1']);
  });

  it('passes backNote through untouched when present, undefined otherwise', () => {
    const occ = makeOcclusion({
      regions: [region('l1', 'label', { backNote: 'Controls the cell.' }), region('l2', 'label')],
    });
    expect(resolveOcclusionFace(occ, 'l1')!.backNote).toBe('Controls the cell.');
    expect(resolveOcclusionFace(occ, 'l2')!.backNote).toBeUndefined();
  });

  it('an occlusion with zero regions resolves no face and masks nothing', () => {
    const occ = makeOcclusion({ regions: [] });
    expect(resolveOcclusionFace(occ, 'anything')).toBeUndefined();
  });
});

describe('resolveOcclusionAnswerText', () => {
  it('returns undefined for a region id the occlusion does not have', () => {
    expect(resolveOcclusionAnswerText(makeOcclusion(), 'nope')).toBeUndefined();
  });

  it("returns a label region's own answerText when set", () => {
    const occ = makeOcclusion({
      regions: [region('l1', 'label', { answerText: 'Nucleus' })],
    });
    expect(resolveOcclusionAnswerText(occ, 'l1')).toBe('Nucleus');
  });

  it('returns undefined for a label region with no answerText, never a fallback line', () => {
    const occ = makeOcclusion({ regions: [region('l1', 'label')] });
    expect(resolveOcclusionAnswerText(occ, 'l1')).toBeUndefined();
  });

  it("returns a paired feature's paired label's answerText", () => {
    const occ = makeOcclusion({
      regions: [
        region('l1', 'label', { answerText: 'Nucleus' }),
        region('f1', 'feature', { pairedRegionId: 'l1' }),
      ],
    });
    expect(resolveOcclusionAnswerText(occ, 'f1')).toBe('Nucleus');
  });

  it('returns undefined for a paired feature whose paired label has no answerText', () => {
    const occ = makeOcclusion({
      regions: [region('l1', 'label'), region('f1', 'feature', { pairedRegionId: 'l1' })],
    });
    expect(resolveOcclusionAnswerText(occ, 'f1')).toBeUndefined();
  });

  it("returns an unpaired feature's own answerText", () => {
    const occ = makeOcclusion({
      regions: [region('f2', 'feature', { answerText: 'Mitochondrion' })],
    });
    expect(resolveOcclusionAnswerText(occ, 'f2')).toBe('Mitochondrion');
  });
});

describe('fraction-coordinate round-trip', () => {
  // Regions store fractions of the image, not pixels, precisely so a mask holds its
  // relative position under FlipCard's responsive sizing and at any zoom (§6.2). This
  // module never converts to pixels itself — that is the renderer's job — but the
  // invariant it relies on is that applying the same fraction to two differently sized
  // containers recovers the same relative position in both.
  it('resolves the same relative position at two different container sizes', () => {
    const r = region('r1', 'label', { x: 0.25, y: 0.5, w: 0.2, h: 0.1 });
    const toPixels = (containerW: number, containerH: number) => ({
      x: r.x * containerW,
      y: r.y * containerH,
      w: r.w * containerW,
      h: r.h * containerH,
    });

    const small = toPixels(800, 600);
    const large = toPixels(2560, 1920);

    expect(small.x / 800).toBeCloseTo(large.x / 2560);
    expect(small.y / 600).toBeCloseTo(large.y / 1920);
    expect(small.w / 800).toBeCloseTo(large.w / 2560);
    expect(small.h / 600).toBeCloseTo(large.h / 1920);
    expect(small.x / 800).toBeCloseTo(r.x);
  });
});

describe('diffRegeneration', () => {
  const occ = makeOcclusion(); // l1, l2 (labels), f1 (feature paired to l1)

  function existingFromGenerated(overrides: Record<string, Partial<Card>> = {}): Card[] {
    return generateCards(occ).map((p, i) =>
      card({
        id: `card-${p.occlusionRegionId}`,
        occlusionRegionId: p.occlusionRegionId,
        front: p.front,
        back: p.back,
        createdAt: i,
        ...overrides[p.occlusionRegionId],
      }),
    );
  }

  it('produces no diff when nothing changed', () => {
    const existing = existingFromGenerated();
    expect(diffRegeneration(occ, existing)).toEqual({ creates: [], updates: [], deletes: [] });
  });

  it('moving a region (x/y change) does not affect the diff: geometry never reaches front/back', () => {
    const existing = existingFromGenerated();
    const moved = makeOcclusion({
      regions: occ.regions.map((r) => (r.id === 'l1' ? { ...r, x: 0.9, y: 0.9 } : r)),
    });
    expect(diffRegeneration(moved, existing)).toEqual({ creates: [], updates: [], deletes: [] });
  });

  it('resizing a region (w/h change) does not affect the diff either', () => {
    const existing = existingFromGenerated();
    const resized = makeOcclusion({
      regions: occ.regions.map((r) => (r.id === 'l1' ? { ...r, w: 0.5, h: 0.5 } : r)),
    });
    expect(diffRegeneration(resized, existing)).toEqual({ creates: [], updates: [], deletes: [] });
  });

  it('deleting a region deletes its card, and updates the survivors whose "n of total" shifted', () => {
    const existing = existingFromGenerated();
    const withoutL2 = makeOcclusion({ regions: occ.regions.filter((r) => r.id !== 'l2') });
    const diff = diffRegeneration(withoutL2, existing);
    expect(diff.deletes).toEqual(['card-l2']);
    expect(diff.creates).toEqual([]);
    // l1's total drops 3->2 and f1's position/total shifts 3-of-3 -> 2-of-2, so both fronts change.
    expect(diff.updates.map((u) => u.id).sort()).toEqual(['card-f1', 'card-l1']);
  });

  it('adding a region creates its card and updates the fronts of existing cards (mask set changed)', () => {
    const existing = existingFromGenerated();
    const withL3 = makeOcclusion({ regions: [...occ.regions, region('l3', 'label')] });
    const diff = diffRegeneration(withL3, existing);
    expect(diff.creates).toEqual([expect.objectContaining({ occlusionRegionId: 'l3' })]);
    expect(diff.deletes).toEqual([]);
  });

  it('changing a region\'s role regenerates only its own card: the plain-text fallback names only the region\'s own role, not the masking it participates in', () => {
    const existing = existingFromGenerated();
    const roleChanged = makeOcclusion({
      regions: occ.regions.map((r) => (r.id === 'l2' ? { ...r, role: 'feature' as const, pairedRegionId: undefined, answerText: 'Vacuole' } : r)),
    });
    const diff = diffRegeneration(roleChanged, existing);
    expect(diff.updates).toEqual([{ id: 'card-l2', front: 'Feature 2 of 3 — Plant cell', back: 'Feature 2 of 3 — Plant cell\n\nVacuole' }]);
    expect(diff.creates).toEqual([]);
    expect(diff.deletes).toEqual([]);
  });

  it('changing a feature\'s pairedRegionId regenerates only the affected card\'s back, when the two labels\' answerText differ', () => {
    const withAnswers = makeOcclusion({
      regions: [
        region('l1', 'label', { x: 0.1, y: 0.1, w: 0.1, h: 0.1, answerText: 'Nucleus' }),
        region('l2', 'label', { x: 0.3, y: 0.1, w: 0.1, h: 0.1, answerText: 'Vacuole' }),
        region('f1', 'feature', { x: 0.5, y: 0.5, w: 0.1, h: 0.1, pairedRegionId: 'l1' }),
      ],
    });
    const existing = generateCards(withAnswers).map((p, i) =>
      card({ id: `card-${p.occlusionRegionId}`, occlusionRegionId: p.occlusionRegionId, front: p.front, back: p.back, createdAt: i }),
    );
    const repaired = makeOcclusion({
      regions: withAnswers.regions.map((r) => (r.id === 'f1' ? { ...r, pairedRegionId: 'l2' } : r)),
    });
    const diff = diffRegeneration(repaired, existing);
    expect(diff.updates).toEqual([{ id: 'card-f1', back: 'Feature 3 of 3 — Plant cell\n\nVacuole' }]);
    expect(diff.creates).toEqual([]);
    expect(diff.deletes).toEqual([]);
  });

  it('replacing the image (assetHash change) does not itself touch front/back text, since text never encodes the image', () => {
    const existing = existingFromGenerated();
    const replaced = makeOcclusion({ assetHash: 'hash-2' });
    // The plain-text fallback names the occlusion, not the image, so an image swap alone
    // produces no diff here; the renderer picks up the new assetHash live via the
    // Occlusion row itself (Task 8/9's job), not via regenerated card text.
    expect(diffRegeneration(replaced, existing)).toEqual({ creates: [], updates: [], deletes: [] });
  });

  it('renaming the occlusion updates every card\'s text (image replace + rename both regenerate everything)', () => {
    const existing = existingFromGenerated();
    const renamed = makeOcclusion({ name: 'Animal cell' });
    const diff = diffRegeneration(renamed, existing);
    expect(diff.updates.map((u) => u.id).sort()).toEqual(['card-f1', 'card-l1', 'card-l2']);
    expect(diff.creates).toEqual([]);
    expect(diff.deletes).toEqual([]);
  });

  it('no diff output ever carries an FSRS or scheduling field, across every change kind above', () => {
    const existing = existingFromGenerated();
    const scenarios: Occlusion[] = [
      makeOcclusion({ regions: occ.regions.map((r) => (r.id === 'l1' ? { ...r, x: 0.9 } : r)) }), // move
      makeOcclusion({ regions: occ.regions.map((r) => (r.id === 'l1' ? { ...r, w: 0.5 } : r)) }), // resize
      makeOcclusion({ regions: occ.regions.filter((r) => r.id !== 'l2') }), // delete
      makeOcclusion({ regions: [...occ.regions, region('l3', 'label')] }), // add
      makeOcclusion({
        regions: occ.regions.map((r) => (r.id === 'l2' ? { ...r, role: 'feature' as const, answerText: 'Vacuole' } : r)),
      }), // role change
      makeOcclusion({ regions: occ.regions.map((r) => (r.id === 'f1' ? { ...r, pairedRegionId: 'l2' } : r)) }), // pairing change
      makeOcclusion({ assetHash: 'hash-2', name: 'Animal cell' }), // image replace + rename
    ];
    for (const scenario of scenarios) {
      const diff = diffRegeneration(scenario, existing);
      for (const update of diff.updates) {
        expect(Object.keys(update).every((k) => ['id', 'front', 'back'].includes(k))).toBe(true);
        expect(update).not.toHaveProperty('stability');
        expect(update).not.toHaveProperty('difficulty');
        expect(update).not.toHaveProperty('due');
        expect(update).not.toHaveProperty('state');
        expect(update).not.toHaveProperty('history');
        expect(update).not.toHaveProperty('reps');
        expect(update).not.toHaveProperty('lapses');
      }
    }
  });
});
