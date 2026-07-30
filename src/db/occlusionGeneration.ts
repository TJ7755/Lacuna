// Pure generation and regeneration logic for image-occlusion cards.
//
// An Occlusion never itself sits in a study session — it is a source document (a diagram
// plus a set of masked regions) that derives ordinary `front_back` FSRS cards, one per
// region, exactly as `src/db/sequenceGeneration.ts` derives cards from a Sequence. This
// module is deliberately free of any Dexie/IndexedDB access so its correctness — the risk
// centre of this feature — can be covered by fast, exhaustive unit tests before any UI or
// repository code exists. Repository wiring (persisting the output of `diffRegeneration`)
// is a later task.
//
// -----------------------------------------------------------------------------
// What a generated card carries, and what it deliberately does not
// -----------------------------------------------------------------------------
// A generated card carries `occlusionRegionId` plus a plain-text `front`/`back`
// *fallback* only. Region geometry (the mask rectangles) is never copied onto the card:
// the study renderer resolves masking live from the owning `Occlusion` row via
// `resolveOcclusionFace`, keyed on `occlusionRegionId`. This is what keeps
// `diffRegeneration`'s front/back-only update contract intact — a card's presentation is
// entirely re-derivable from its region, so regenerating it can never touch anything else
// on the row (FSRS state, `deckId`, etc.).
//
// The plain-text fallback exists for clients that cannot render an occlusion at all
// (search, the card list preview, the question bank): `front` reads
// `"{Label|Feature} {n} of {total} — {occlusion.name}"`, and `back` appends the region's
// answer text (or a generic reveal line, when none is recorded) on its own paragraph,
// mirroring the header/body split `sequenceGeneration.ts` uses for the same purpose.
//
// -----------------------------------------------------------------------------
// Masking rules (§6.4)
// -----------------------------------------------------------------------------
// Both card kinds mask every `role: 'label'` region on the front, without exception: a
// feature card that left labels visible would be answerable by reading the picture, and a
// label card that left its siblings visible would be answerable by elimination. The
// region the card was generated from is always ringed as the target. The back lifts
// exactly one mask: the region itself for a label card, or its `pairedRegionId` for a
// feature card. An unpaired feature region has no mask to lift, so its back shows
// `answerText` instead.

import type { Card, CardType, Occlusion, OcclusionRegion } from './types';

/** The generated card type. Plain front/back is correct here for the same reason it is
 *  for sequences: the prompt/answer split maps directly onto front/back. */
const GENERATED_CARD_TYPE: CardType = 'front_back';

/** The shape a generated card takes before persistence assigns it an id and FSRS defaults. */
export interface GeneratedCardPayload {
  type: CardType;
  front: string;
  back: string;
  /** Anchors the card to the OcclusionRegion it was generated from. */
  occlusionRegionId: string;
  courseId: string;
  primaryLessonId: string | null;
}

/** A single field-level change to an existing generated card. Never includes FSRS/scheduling fields. */
export interface GeneratedCardUpdate {
  id: string;
  front?: string;
  back?: string;
}

export interface RegenerationDiff {
  creates: GeneratedCardPayload[];
  updates: GeneratedCardUpdate[];
  deletes: string[];
}

/** Find the Occlusion that owns a generated card's `occlusionRegionId` among a list of
 *  candidates. Used by management surfaces to resolve which occlusion a generated card
 *  belongs to (for grouping, badging, and linking back to the occlusion editor) without a
 *  dedicated index — mirrors `sequenceForItemId`. */
export function occlusionForRegionId(
  occlusions: Occlusion[],
  occlusionRegionId: string,
): Occlusion | undefined {
  return occlusions.find((occlusion) => occlusion.regions.some((region) => region.id === occlusionRegionId));
}

function roleLabel(role: OcclusionRegion['role']): string {
  return role === 'label' ? 'Label' : 'Feature';
}

/** The answer text a region's back reveals, independent of rendering: a label's own
 *  `answerText` (only ever set for typed mode), a paired feature's paired label's
 *  `answerText`, or an unpaired feature's own (required) `answerText`. Falls back to a
 *  generic reveal line when no text was recorded, since the mask itself carries the real
 *  answer and this text exists only to keep non-rendering clients legible. */
function revealText(occlusion: Occlusion, region: OcclusionRegion): string {
  if (region.role === 'feature' && region.pairedRegionId) {
    const paired = occlusion.regions.find((r) => r.id === region.pairedRegionId);
    return paired?.answerText ?? 'Revealed on the diagram.';
  }
  return region.answerText ?? 'Revealed on the diagram.';
}

/** Plain-text front fallback: `"{Label|Feature} {n} of {total} — {occlusion.name}"`. */
function plainFront(occlusion: Occlusion, region: OcclusionRegion, index: number, total: number): string {
  return `${roleLabel(region.role)} ${index} of ${total} — ${occlusion.name}`;
}

/** Plain-text back fallback: the front header plus the region's reveal text, with
 *  `backNote` appended as its own paragraph where present. */
function plainBack(occlusion: Occlusion, region: OcclusionRegion, index: number, total: number): string {
  const parts = [plainFront(occlusion, region, index, total), revealText(occlusion, region)];
  if (region.backNote) parts.push(region.backNote);
  return parts.join('\n\n');
}

/** What one region's card shows, resolved live from the owning Occlusion rather than
 *  stored on the card. Consumed by the study renderer (Task 9) so no masking logic ends
 *  up in a component. */
export interface OcclusionFace {
  /** Every region masked on the front: all `role: 'label'` regions, without exception. */
  frontMaskedRegionIds: string[];
  /** The region this card was generated from; ringed on both faces. */
  targetRegionId: string;
  /** The single mask lifted on the back — a member of `frontMaskedRegionIds` — or
   *  undefined for an unpaired feature region, which has no mask to lift. */
  backLiftedRegionId: string | undefined;
  /** Shown on the back in place of a lifted mask, for an unpaired feature region only. */
  answerText: string | undefined;
  /** Extra text shown below the image on the back, where present. */
  backNote: string | undefined;
}

/** Resolve what a region's card shows on its front and back. Returns undefined if the
 *  region is not found in `occlusion.regions`. */
export function resolveOcclusionFace(occlusion: Occlusion, occlusionRegionId: string): OcclusionFace | undefined {
  const region = occlusion.regions.find((r) => r.id === occlusionRegionId);
  if (!region) return undefined;

  const frontMaskedRegionIds = occlusion.regions.filter((r) => r.role === 'label').map((r) => r.id);
  const backLiftedRegionId = region.role === 'label' ? region.id : region.pairedRegionId;

  return {
    frontMaskedRegionIds,
    targetRegionId: region.id,
    backLiftedRegionId,
    answerText: region.role === 'feature' && !region.pairedRegionId ? region.answerText : undefined,
    backNote: region.backNote,
  };
}

/** Deterministically generate every card payload for an occlusion: one card per region,
 *  in region order, both roles included. */
export function generateCards(occlusion: Occlusion): GeneratedCardPayload[] {
  const total = occlusion.regions.length;
  return occlusion.regions.map((region, i) => ({
    type: GENERATED_CARD_TYPE,
    front: plainFront(occlusion, region, i + 1, total),
    back: plainBack(occlusion, region, i + 1, total),
    occlusionRegionId: region.id,
    courseId: occlusion.courseId,
    primaryLessonId: occlusion.primaryLessonId,
  }));
}

/**
 * Diff an occlusion's freshly-generated cards against its previously-generated cards
 * (i.e. `existingCards` should already be filtered by the caller to the cards whose
 * `occlusionRegionId` was generated from this occlusion). Keyed on the stable
 * `occlusionRegionId`, never on array position, so moves/resizes/role changes/pairing
 * changes/deletes/adds all fall out of one straightforward key comparison:
 *
 *  - key only in the desired set  -> create
 *  - key only in the existing set -> delete
 *  - key in both, front/back differ -> update (content fields only; FSRS/scheduling
 *    fields on the existing card, e.g. stability/difficulty/history, are left untouched
 *    by omitting them from the update entirely)
 */
export function diffRegeneration(occlusion: Occlusion, existingCards: Card[]): RegenerationDiff {
  const desired = generateCards(occlusion);
  const desiredByKey = new Map(desired.map((payload) => [payload.occlusionRegionId, payload]));
  const existingByKey = new Map(
    existingCards
      .filter((card): card is Card & { occlusionRegionId: string } => card.occlusionRegionId !== undefined)
      .map((card) => [card.occlusionRegionId, card]),
  );

  const creates: GeneratedCardPayload[] = [];
  const updates: GeneratedCardUpdate[] = [];
  const deletes: string[] = [];

  for (const [key, payload] of desiredByKey) {
    const existing = existingByKey.get(key);
    if (!existing) {
      creates.push(payload);
      continue;
    }
    const update: GeneratedCardUpdate = { id: existing.id };
    let changed = false;
    if (existing.front !== payload.front) {
      update.front = payload.front;
      changed = true;
    }
    if (existing.back !== payload.back) {
      update.back = payload.back;
      changed = true;
    }
    if (changed) updates.push(update);
  }

  for (const [key, existing] of existingByKey) {
    if (!desiredByKey.has(key)) deletes.push(existing.id);
  }

  return { creates, updates, deletes };
}
