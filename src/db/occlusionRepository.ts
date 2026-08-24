// CRUD and regeneration wiring for image-occlusion cards (Arc 6 slice 2, §6.3-6.4).
//
// Mirrors repository.ts's "Sequences" section exactly: an Occlusion is a source document
// that derives ordinary front_back Card rows, one per OcclusionRegion, via the pure
// generation logic in occlusionGeneration.ts. This module owns the Dexie wiring
// (persistence, transactions, cascading deletes, snapshot/restore) that
// occlusionGeneration.ts deliberately stays free of.

import type { Transaction } from 'dexie';
import { db, makeId } from './schema';
import type { Card, LessonCardExposure, LessonCardLink, Occlusion, OcclusionRegion } from './types';
import type { Concept } from '../questions/types';
import { buildCardConcept, conceptNameForCard } from '../questions/concepts';
import { ensureCourseBankBackingDeck, ensureLessonBackingDeck } from './backingDecks';
import { scheduleAssetGc } from './assets';
import {
  stampUpdatedAt,
  recordTombstone,
  recordTombstones,
  clearTombstone,
  clearTombstones,
  lessonCardExposureId,
} from './mutationStamp';
import {
  cardsWithReviewHistory,
  reviewHistoryEntriesForCard,
  type ReviewHistoryEntry,
} from './reviewHistory';
import { diffRegeneration, generateCards, type GeneratedCardPayload } from './occlusionGeneration';

async function tombstoneGeneratedCardCascade(
  tx: Transaction,
  cardIds: readonly string[],
): Promise<void> {
  if (cardIds.length === 0) return;
  const [lessonCards, exposures] = await Promise.all([
    db.lessonCards.where('cardId').anyOf(cardIds).toArray(),
    db.lessonCardExposures.where('cardId').anyOf(cardIds).toArray(),
  ]);
  await recordTombstones(tx, 'cards', cardIds);
  await recordTombstones(
    tx,
    'lessonCards',
    lessonCards.map((link) => link.id),
  );
  await recordTombstones(
    tx,
    'lessonCardExposures',
    exposures.map((exposure) => lessonCardExposureId(exposure.lessonId, exposure.cardId)),
  );
}

async function clearGeneratedCardCascade(
  tx: Transaction,
  cards: readonly Card[],
  lessonCards: readonly LessonCardLink[],
  exposures: readonly LessonCardExposure[],
): Promise<void> {
  await clearTombstones(
    tx,
    'cards',
    cards.map((card) => card.id),
  );
  await clearTombstones(
    tx,
    'lessonCards',
    lessonCards.map((link) => link.id),
  );
  await clearTombstones(
    tx,
    'lessonCardExposures',
    exposures.map((exposure) => lessonCardExposureId(exposure.lessonId, exposure.cardId)),
  );
}

/** Convert low-level IndexedDB errors into user-friendly messages (mirrors repository.ts's friendlyDbError). */
function friendlyDbError(err: unknown): Error {
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    return new Error('Your browser storage is full. Free up space or export your data to a file.');
  }
  if (err instanceof Error) return err;
  return new Error(String(err));
}

// Guarantees createOcclusion's createdAt strictly increases even when two occlusions are
// created within the same millisecond, mirroring sequences' nextSequenceTimestamp so
// listOcclusions's createdAt ordering doesn't fall back to comparing (random) ids.
let lastOcclusionTimestamp = 0;
function nextOcclusionTimestamp(): number {
  lastOcclusionTimestamp = Math.max(Date.now(), lastOcclusionTimestamp + 1);
  return lastOcclusionTimestamp;
}

/**
 * Turn a generation payload into a full Card row with fresh FSRS defaults. Mirrors
 * repository.ts's `generatedCardFromPayload` field-for-field; kept as a separate copy
 * because the payload shapes differ in their anchor field (`occlusionRegionId` here vs
 * `sequenceItemId` there), so the sequence version's type cannot take this payload.
 */
function generatedCardFromPayload(
  deckId: string,
  payload: GeneratedCardPayload,
  createdAt: number,
  conceptId: string,
): Card {
  return stampUpdatedAt(
    {
      id: makeId(),
      conceptId,
      deckId,
      schedulingUnitId: deckId,
      courseId: payload.courseId,
      primaryLessonId: payload.primaryLessonId,
      type: payload.type,
      front: payload.front,
      back: payload.back,
      stability: null,
      difficulty: null,
      lastReviewed: null,
      reps: 0,
      lapses: 0,
      state: 0,
      due: null,
      scheduledDays: 0,
      learningSteps: 0,
      history: [],
      createdAt,
      tags: [],
      suspended: false,
      buriedUntil: null,
      occlusionRegionId: payload.occlusionRegionId,
    },
    createdAt,
  );
}

function conceptIdForRegion(occlusionId: string, regionId: string): string {
  return `concept:occlusion:${encodeURIComponent(occlusionId)}:${encodeURIComponent(regionId)}`;
}

function conceptsForOcclusionPayloads(
  occlusion: Occlusion,
  deckId: string,
  payloads: readonly GeneratedCardPayload[],
  now: number,
): Concept[] {
  return payloads.map((payload, index) =>
    buildCardConcept({
      id: conceptIdForRegion(occlusion.id, payload.occlusionRegionId),
      courseId: occlusion.courseId,
      schedulingUnitId: deckId,
      name: conceptNameForCard(payload.type, payload.front, payload.back),
      now: now + index,
    }),
  );
}

/** All cards ever generated from an occlusion, looked up via the `occlusionRegionId` index. */
export async function cardsForOcclusion(occlusion: Occlusion): Promise<Card[]> {
  const keys = occlusion.regions.map((region) => region.id);
  if (keys.length === 0) return [];
  return db.cards.where('occlusionRegionId').anyOf(keys).toArray();
}

/**
 * Create an Occlusion and, in the same transaction, every card {@link generateCards}
 * derives from it. Cards get a real backing deck via the same lazy lesson/question-bank
 * deck as ordinary lesson/course cards (see {@link ensureLessonBackingDeck} /
 * {@link ensureCourseBankBackingDeck}), looked up before the transaction since those helpers may
 * open their own table writes.
 */
export async function createOcclusion(
  courseId: string,
  primaryLessonId: string | null,
  name: string,
  assetHash: string,
  regions: OcclusionRegion[],
): Promise<Occlusion> {
  try {
    const createdAt = nextOcclusionTimestamp();
    const occlusion = stampUpdatedAt(
      {
        id: makeId(),
        courseId,
        primaryLessonId,
        name: name.trim() || 'Untitled occlusion',
        assetHash,
        regions,
        createdAt,
      },
      createdAt,
    );
    const deckId = primaryLessonId
      ? await ensureLessonBackingDeck(courseId, primaryLessonId)
      : await ensureCourseBankBackingDeck(courseId);
    const payloads = generateCards(occlusion);
    const now = Date.now();
    const concepts = conceptsForOcclusionPayloads(occlusion, deckId, payloads, now);
    const cards = payloads.map((payload, i) =>
      generatedCardFromPayload(
        deckId,
        payload,
        now + i,
        conceptIdForRegion(occlusion.id, payload.occlusionRegionId),
      ),
    );
    await db.transaction('rw', db.occlusions, db.cards, db.concepts, async () => {
      await db.occlusions.add(occlusion);
      if (concepts.length > 0) await db.concepts.bulkAdd(concepts);
      await db.cards.bulkAdd(cards);
    });
    return occlusion;
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/**
 * Persist an edited Occlusion and regenerate its cards to match: loads the
 * previously-stored occlusion to find its prior generated cards, clears any
 * `pairedRegionId` left dangling by a region this edit removed (see module doc), diffs
 * the cleaned occlusion against the prior cards via {@link diffRegeneration}, and applies
 * creates/updates/deletes to the cards table — all in one transaction alongside the
 * occlusion write. Updates only ever touch front/back, never FSRS/scheduling fields, so
 * existing memory state survives content-only regeneration (moves, resizes, role changes,
 * re-pairing).
 */
export async function updateOcclusion(occlusion: Occlusion): Promise<void> {
  try {
    await db.transaction(
      'rw',
      [
        db.occlusions,
        db.cards,
        db.lessonCards,
        db.lessonCardExposures,
        db.reviewHistory,
        db.courses,
        db.lessons,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
        db.tombstones,
        db.concepts,
      ],
      async (tx) => {
        const previous = await db.occlusions.get(occlusion.id);
        const existingCards = previous ? await cardsForOcclusion(previous) : [];

        // A feature region resolves its answer through `pairedRegionId` (see
        // resolveOcclusionFace). If this edit removed the label region a surviving
        // feature region was paired to, clear the dangling reference here so
        // diffRegeneration correctly regenerates that feature card's text (an unpaired
        // feature falls back to its own answerText) rather than leaving it pointed at
        // nothing.
        const removedIds = new Set(
          (previous?.regions ?? [])
            .map((region) => region.id)
            .filter((id) => !occlusion.regions.some((region) => region.id === id)),
        );
        const cleaned: Occlusion =
          removedIds.size === 0
            ? occlusion
            : {
                ...occlusion,
                regions: occlusion.regions.map((region) =>
                  region.pairedRegionId && removedIds.has(region.pairedRegionId)
                    ? { ...region, pairedRegionId: undefined }
                    : region,
                ),
              };

        const diff = diffRegeneration(cleaned, existingCards);
        const now = Date.now();

        await db.occlusions.put(stampUpdatedAt(cleaned, now));

        if (diff.deletes.length > 0) {
          await tombstoneGeneratedCardCascade(tx, diff.deletes);
          await db.lessonCards.where('cardId').anyOf(diff.deletes).delete();
          await db.lessonCardExposures.where('cardId').anyOf(diff.deletes).delete();
          await db.reviewHistory.where('cardId').anyOf(diff.deletes).delete();
          await db.cards.bulkDelete(diff.deletes);
        }
        for (const update of diff.updates) {
          const { id, ...changes } = update;
          await db.cards.update(id, stampUpdatedAt(changes, now));
        }
        if (diff.creates.length > 0) {
          const deckId = cleaned.primaryLessonId
            ? await ensureLessonBackingDeck(cleaned.courseId, cleaned.primaryLessonId)
            : await ensureCourseBankBackingDeck(cleaned.courseId);
          const concepts = conceptsForOcclusionPayloads(cleaned, deckId, diff.creates, now);
          const newCards = diff.creates.map((payload, i) =>
            generatedCardFromPayload(
              deckId,
              payload,
              now + i,
              conceptIdForRegion(cleaned.id, payload.occlusionRegionId),
            ),
          );
          if (concepts.length > 0) await db.concepts.bulkPut(concepts);
          await db.cards.bulkAdd(newCards);
        }

        if (diff.updates.length > 0 || diff.deletes.length > 0) {
          scheduleAssetGc();
        }
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/** Delete an occlusion and every card it generated, in one transaction. */
export async function deleteOcclusion(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.occlusions,
      db.cards,
      db.lessonCards,
      db.lessonCardExposures,
      db.reviewHistory,
      db.tombstones,
    ],
    async (tx) => {
      const occlusion = await db.occlusions.get(id);
      if (!occlusion) return;
      const keys = occlusion.regions.map((region) => region.id);
      if (keys.length > 0) {
        const cardIds = (await db.cards.where('occlusionRegionId').anyOf(keys).primaryKeys()).map(
          String,
        );
        if (cardIds.length > 0) {
          await tombstoneGeneratedCardCascade(tx, cardIds);
          await db.lessonCards.where('cardId').anyOf(cardIds).delete();
          await db.lessonCardExposures.where('cardId').anyOf(cardIds).delete();
        }
        await db.reviewHistory.where('cardId').anyOf(cardIds).delete();
        await db.cards.where('occlusionRegionId').anyOf(keys).delete();
      }
      await recordTombstone(tx, 'occlusions', id);
      await db.occlusions.delete(id);
    },
  );
  scheduleAssetGc();
}

/** All occlusions for a course, ordered by createdAt ascending. */
export async function listOcclusions(courseId: string): Promise<Occlusion[]> {
  return db.occlusions.where('courseId').equals(courseId).sortBy('createdAt');
}

/** An occlusion plus every card it generated, with full FSRS state — for the undo-toast pattern. */
export interface OcclusionSnapshot {
  occlusion: Occlusion;
  cards: Card[];
  concepts?: Concept[];
  lessonCards: LessonCardLink[];
  lessonCardExposures: LessonCardExposure[];
  reviewHistory: ReviewHistoryEntry[];
}

/** Capture an occlusion and its generated cards before deletion/regeneration, so the
 *  action can be offered with an "Undo". Returns null if the occlusion no longer exists. */
export async function snapshotOcclusion(id: string): Promise<OcclusionSnapshot | null> {
  const occlusion = await db.occlusions.get(id);
  if (!occlusion) return null;
  const cards = await cardsForOcclusion(occlusion);
  const cardIds = cards.map((card) => card.id);
  const [lessonCards, lessonCardExposures, reviewHistory, concepts] =
    cardIds.length > 0
      ? await Promise.all([
          db.lessonCards.where('cardId').anyOf(cardIds).toArray(),
          db.lessonCardExposures.where('cardId').anyOf(cardIds).toArray(),
          db.reviewHistory.where('cardId').anyOf(cardIds).toArray(),
          db.concepts.bulkGet([...new Set(cards.map((card) => card.conceptId))]),
        ])
      : [[], [], [], []];
  return {
    occlusion,
    cards,
    concepts: concepts.filter((concept): concept is Concept => concept !== undefined),
    lessonCards,
    lessonCardExposures,
    reviewHistory,
  };
}

/** Re-insert a previously captured OcclusionSnapshot (the inverse of deleteOcclusion/updateOcclusion). */
export async function restoreOcclusion(snapshot: OcclusionSnapshot): Promise<void> {
  try {
    const cardsToRestore =
      snapshot.reviewHistory === undefined
        ? snapshot.cards
        : cardsWithReviewHistory(snapshot.cards, snapshot.reviewHistory);
    await db.transaction(
      'rw',
      [
        db.occlusions,
        db.cards,
        db.concepts,
        db.lessonCards,
        db.lessonCardExposures,
        db.reviewHistory,
        db.tombstones,
      ],
      async (tx) => {
        await db.occlusions.put(snapshot.occlusion);
        const concepts =
          snapshot.concepts ??
          conceptsForOcclusionPayloads(
            snapshot.occlusion,
            cardsToRestore[0]?.schedulingUnitId ?? snapshot.occlusion.courseId,
            cardsToRestore.map((card) => ({
              type: card.type,
              front: card.front,
              back: card.back,
              courseId: snapshot.occlusion.courseId,
              primaryLessonId: snapshot.occlusion.primaryLessonId,
              occlusionRegionId: card.occlusionRegionId!,
            })),
            snapshot.occlusion.createdAt,
          );
        if (concepts.length > 0) await db.concepts.bulkPut(concepts);
        await db.cards.bulkPut(cardsToRestore);
        await db.lessonCards.bulkPut(snapshot.lessonCards);
        await db.lessonCardExposures.bulkPut(snapshot.lessonCardExposures);
        await db.reviewHistory.bulkPut(
          snapshot.reviewHistory ??
            cardsToRestore.flatMap((card) => reviewHistoryEntriesForCard(card)),
        );
        await clearTombstone(tx, 'occlusions', snapshot.occlusion.id);
        await clearGeneratedCardCascade(
          tx,
          cardsToRestore,
          snapshot.lessonCards,
          snapshot.lessonCardExposures,
        );
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}
