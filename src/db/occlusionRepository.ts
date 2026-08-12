// CRUD and regeneration wiring for image-occlusion cards (Arc 6 slice 2, §6.3-6.4).
//
// Mirrors repository.ts's "Sequences" section exactly: an Occlusion is a source document
// that derives ordinary front_back Card rows, one per OcclusionRegion, via the pure
// generation logic in occlusionGeneration.ts. This module owns the Dexie wiring
// (persistence, transactions, cascading deletes, snapshot/restore) that
// occlusionGeneration.ts deliberately stays free of.

import { db, makeId } from './schema';
import type { Card, LessonCardExposure, LessonCardLink, Occlusion, OcclusionRegion } from './types';
import { ensureCourseBankBackingDeck, ensureLessonBackingDeck } from './backingDecks';
import { scheduleAssetGc } from './assets';
import {
  cardsWithReviewHistory,
  reviewHistoryEntriesForCard,
  type ReviewHistoryEntry,
} from './reviewHistory';
import { diffRegeneration, generateCards, type GeneratedCardPayload } from './occlusionGeneration';

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
): Card {
  return {
    id: makeId(),
    deckId,
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
  };
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
    const occlusion: Occlusion = {
      id: makeId(),
      courseId,
      primaryLessonId,
      name: name.trim() || 'Untitled occlusion',
      assetHash,
      regions,
      createdAt: nextOcclusionTimestamp(),
    };
    const deckId = primaryLessonId
      ? await ensureLessonBackingDeck(courseId, primaryLessonId)
      : await ensureCourseBankBackingDeck(courseId);
    const payloads = generateCards(occlusion);
    const now = Date.now();
    const cards = payloads.map((payload, i) => generatedCardFromPayload(deckId, payload, now + i));
    await db.transaction('rw', db.occlusions, db.cards, async () => {
      await db.occlusions.add(occlusion);
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
        db.decks,
        db.userPerformance,
        db.courses,
        db.lessons,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
      ],
      async () => {
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

        await db.occlusions.put(cleaned);

        if (diff.deletes.length > 0) {
          await db.lessonCards.where('cardId').anyOf(diff.deletes).delete();
          await db.lessonCardExposures.where('cardId').anyOf(diff.deletes).delete();
          await db.reviewHistory.where('cardId').anyOf(diff.deletes).delete();
          await db.cards.bulkDelete(diff.deletes);
        }
        for (const update of diff.updates) {
          const { id, ...changes } = update;
          await db.cards.update(id, changes);
        }
        if (diff.creates.length > 0) {
          const deckId = cleaned.primaryLessonId
            ? await ensureLessonBackingDeck(cleaned.courseId, cleaned.primaryLessonId)
            : await ensureCourseBankBackingDeck(cleaned.courseId);
          const now = Date.now();
          const newCards = diff.creates.map((payload, i) =>
            generatedCardFromPayload(deckId, payload, now + i),
          );
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
    [db.occlusions, db.cards, db.lessonCards, db.lessonCardExposures, db.reviewHistory],
    async () => {
      const occlusion = await db.occlusions.get(id);
      if (!occlusion) return;
      const keys = occlusion.regions.map((region) => region.id);
      if (keys.length > 0) {
        const cardIds = await db.cards.where('occlusionRegionId').anyOf(keys).primaryKeys();
        if (cardIds.length > 0) {
          await db.lessonCards.where('cardId').anyOf(cardIds).delete();
          await db.lessonCardExposures.where('cardId').anyOf(cardIds).delete();
        }
        await db.reviewHistory.where('cardId').anyOf(cardIds).delete();
        await db.cards.where('occlusionRegionId').anyOf(keys).delete();
      }
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
  const [lessonCards, lessonCardExposures, reviewHistory] =
    cardIds.length > 0
      ? await Promise.all([
          db.lessonCards.where('cardId').anyOf(cardIds).toArray(),
          db.lessonCardExposures.where('cardId').anyOf(cardIds).toArray(),
          db.reviewHistory.where('cardId').anyOf(cardIds).toArray(),
        ])
      : [[], [], []];
  return { occlusion, cards, lessonCards, lessonCardExposures, reviewHistory };
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
      [db.occlusions, db.cards, db.lessonCards, db.lessonCardExposures, db.reviewHistory],
      async () => {
        await db.occlusions.put(snapshot.occlusion);
        await db.cards.bulkPut(cardsToRestore);
        await db.lessonCards.bulkPut(snapshot.lessonCards);
        await db.lessonCardExposures.bulkPut(snapshot.lessonCardExposures);
        await db.reviewHistory.bulkPut(
          snapshot.reviewHistory ??
            cardsToRestore.flatMap((card) => reviewHistoryEntriesForCard(card)),
        );
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}
