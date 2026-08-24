// CRUD and regeneration wiring for sequence cards.
//
// A Sequence is a source document that derives ordinary front_back Card rows
// via the pure generation logic in sequenceGeneration.ts. This module owns
// the Dexie wiring (persistence, transactions, cascading deletes,
// snapshot/restore) that sequenceGeneration.ts deliberately stays free of.

import { db, makeId } from './schema';
import type { Card, LessonCardExposure, LessonCardLink, Sequence, SequenceItem } from './types';
import type { Concept } from '../questions/types';
import { buildCardConcept, conceptNameForCard } from '../questions/concepts';
import {
  cardsWithReviewHistory,
  reviewHistoryEntriesForCard,
  type ReviewHistoryEntry,
} from './reviewHistory';
import {
  ensureCourseBankBackingDeck as ensureCourseBankDeck,
  ensureLessonBackingDeck as ensureLessonDeck,
} from './backingDecks';
import { scheduleAssetGc } from './assets';
import {
  diffRegeneration,
  generateCards,
  baseItemId,
  LABEL_CARD_SUFFIX,
  type GeneratedCardPayload,
} from './sequenceGeneration';
import { friendlyDbError } from './dbErrors';
import {
  stampUpdatedAt,
  recordTombstone,
  recordTombstones,
  clearTombstone,
  clearTombstones,
  lessonCardExposureId,
} from './mutationStamp';

// Guarantees `createSequence`'s createdAt strictly increases even when two sequences are
// created within the same millisecond (e.g. back-to-back in a test or a scripted import),
// so `listSequences`'s createdAt ordering doesn't fall back to comparing (random) ids.
let lastSequenceTimestamp = 0;
function nextSequenceTimestamp(): number {
  lastSequenceTimestamp = Math.max(Date.now(), lastSequenceTimestamp + 1);
  return lastSequenceTimestamp;
}

/** Every `Card.sequenceItemId` a sequence could ever have produced (positional + label), keyed by item. */
function sequenceItemKeys(sequence: Sequence): string[] {
  return sequence.items.flatMap((item) => [item.id, `${item.id}${LABEL_CARD_SUFFIX}`]);
}

/** Turn a generation payload into a full Card row with fresh FSRS defaults (mirrors {@link createCards}). */
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
      sequenceItemId: payload.sequenceItemId,
    },
    createdAt,
  );
}

function conceptIdForSequenceItem(sequenceId: string, sequenceItemId: string): string {
  return `concept:sequence:${encodeURIComponent(sequenceId)}:${encodeURIComponent(baseItemId(sequenceItemId))}`;
}

function conceptsForSequencePayloads(
  sequence: Sequence,
  deckId: string,
  payloads: readonly GeneratedCardPayload[],
  now: number,
): Concept[] {
  const byItem = new Map<string, GeneratedCardPayload>();
  for (const payload of payloads) {
    const itemId = baseItemId(payload.sequenceItemId);
    if (!byItem.has(itemId)) byItem.set(itemId, payload);
  }
  return [...byItem.entries()].map(([itemId, payload], index) =>
    buildCardConcept({
      id: conceptIdForSequenceItem(sequence.id, itemId),
      courseId: sequence.courseId,
      schedulingUnitId: deckId,
      name: conceptNameForCard(payload.type, payload.front, payload.back),
      now: now + index,
    }),
  );
}

/** All cards ever generated from a sequence (positional and label cards alike). */
export async function cardsForSequence(sequence: Sequence): Promise<Card[]> {
  const keys = sequenceItemKeys(sequence);
  if (keys.length === 0) return [];
  return db.cards.where('sequenceItemId').anyOf(keys).toArray();
}

/**
 * Create a Sequence and, in the same transaction, every card {@link generateCards} derives
 * from it. Cards get a real backing deck via the same lazy lesson/question-bank deck as
 * ordinary lesson/course cards (see {@link ensureLessonDeck} / {@link ensureCourseBankDeck}),
 * looked up before the transaction since those helpers may open their own table writes.
 */
export async function createSequence(
  courseId: string,
  primaryLessonId: string | null,
  name: string,
  items: SequenceItem[],
  opts?: Partial<Sequence>,
): Promise<Sequence> {
  try {
    const createdAt = nextSequenceTimestamp();
    const sequence = stampUpdatedAt(
      {
        id: makeId(),
        courseId,
        primaryLessonId,
        name: name.trim() || 'Untitled sequence',
        items,
        cueWindow: 2,
        createdAt,
        ...opts,
      },
      createdAt,
    );
    const deckId = primaryLessonId
      ? await ensureLessonDeck(courseId, primaryLessonId)
      : await ensureCourseBankDeck(courseId);
    const payloads = generateCards(sequence);
    const now = Date.now();
    const concepts = conceptsForSequencePayloads(sequence, deckId, payloads, now);
    const cards = payloads.map((payload, i) =>
      generatedCardFromPayload(
        deckId,
        payload,
        now + i,
        conceptIdForSequenceItem(sequence.id, payload.sequenceItemId),
      ),
    );
    await db.transaction('rw', db.sequences, db.cards, db.concepts, async () => {
      await db.sequences.add(sequence);
      if (concepts.length > 0) await db.concepts.bulkAdd(concepts);
      await db.cards.bulkAdd(cards);
    });
    return sequence;
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/**
 * Persist an edited Sequence and regenerate its cards to match: loads the previously-stored
 * sequence to find its prior generated cards, diffs against the new sequence via
 * {@link diffRegeneration}, and applies creates/updates/deletes to the cards table — all in
 * one transaction alongside the sequence write. Updates only ever touch front/back, never
 * FSRS/scheduling fields, so existing memory state survives content-only regeneration.
 */
export async function updateSequence(sequence: Sequence): Promise<void> {
  try {
    await db.transaction(
      'rw',
      [
        db.sequences,
        db.cards,
        db.lessonCards,
        db.lessonCardExposures,
        db.courses,
        db.lessons,
        db.reviewHistory,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
        db.tombstones,
        db.concepts,
      ],
      async (tx) => {
        const previous = await db.sequences.get(sequence.id);
        const existingCards = previous ? await cardsForSequence(previous) : [];
        const diff = diffRegeneration(sequence, existingCards);
        const now = Date.now();

        await db.sequences.put(stampUpdatedAt(sequence, now));

        if (diff.deletes.length > 0) {
          const [removedLinks, removedExposures] = await Promise.all([
            db.lessonCards.where('cardId').anyOf(diff.deletes).toArray(),
            db.lessonCardExposures.where('cardId').anyOf(diff.deletes).toArray(),
          ]);
          await db.lessonCards.where('cardId').anyOf(diff.deletes).delete();
          await db.lessonCardExposures.where('cardId').anyOf(diff.deletes).delete();
          await db.reviewHistory.where('cardId').anyOf(diff.deletes).delete();
          await db.cards.bulkDelete(diff.deletes);
          await recordTombstones(tx, 'cards', diff.deletes);
          await recordTombstones(
            tx,
            'lessonCards',
            removedLinks.map((link) => link.id),
          );
          await recordTombstones(
            tx,
            'lessonCardExposures',
            removedExposures.map((exposure) =>
              lessonCardExposureId(exposure.lessonId, exposure.cardId),
            ),
          );
        }
        for (const update of diff.updates) {
          const { id, ...changes } = update;
          await db.cards.update(id, stampUpdatedAt(changes, now));
        }
        if (diff.creates.length > 0) {
          const deckId = sequence.primaryLessonId
            ? await ensureLessonDeck(sequence.courseId, sequence.primaryLessonId)
            : await ensureCourseBankDeck(sequence.courseId);
          const now = Date.now();
          const concepts = conceptsForSequencePayloads(sequence, deckId, diff.creates, now);
          const newCards = diff.creates.map((payload, i) =>
            generatedCardFromPayload(
              deckId,
              payload,
              now + i,
              conceptIdForSequenceItem(sequence.id, payload.sequenceItemId),
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

/** Delete a sequence and every card it generated, in one transaction. */
export async function deleteSequence(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.sequences,
      db.cards,
      db.reviewHistory,
      db.lessonCards,
      db.lessonCardExposures,
      db.tombstones,
    ],
    async (tx) => {
      const sequence = await db.sequences.get(id);
      if (!sequence) return;
      const keys = sequenceItemKeys(sequence);
      const cardIds =
        keys.length > 0
          ? (await db.cards.where('sequenceItemId').anyOf(keys).primaryKeys()).map(String)
          : [];
      const [removedLinks, removedExposures] =
        cardIds.length > 0
          ? await Promise.all([
              db.lessonCards.where('cardId').anyOf(cardIds).toArray(),
              db.lessonCardExposures.where('cardId').anyOf(cardIds).toArray(),
            ])
          : [[], []];
      if (cardIds.length > 0) {
        await db.lessonCards.where('cardId').anyOf(cardIds).delete();
        await db.lessonCardExposures.where('cardId').anyOf(cardIds).delete();
        await db.reviewHistory.where('cardId').anyOf(cardIds).delete();
        await db.cards.where('sequenceItemId').anyOf(keys).delete();
      }
      await db.sequences.delete(id);
      await recordTombstone(tx, 'sequences', id);
      await recordTombstones(tx, 'cards', cardIds);
      await recordTombstones(
        tx,
        'lessonCards',
        removedLinks.map((link) => link.id),
      );
      await recordTombstones(
        tx,
        'lessonCardExposures',
        removedExposures.map((exposure) =>
          lessonCardExposureId(exposure.lessonId, exposure.cardId),
        ),
      );
    },
  );
  scheduleAssetGc();
}

/** All sequences for a course, ordered by createdAt ascending. */
export async function listSequences(courseId: string): Promise<Sequence[]> {
  return db.sequences.where('courseId').equals(courseId).sortBy('createdAt');
}

/** A sequence plus every card it generated, with full FSRS state — for the undo-toast pattern. */
export interface SequenceSnapshot {
  sequence: Sequence;
  cards: Card[];
  concepts?: Concept[];
  lessonCards: LessonCardLink[];
  lessonCardExposures: LessonCardExposure[];
  reviewHistory?: ReviewHistoryEntry[];
}

/** Capture a sequence and its generated cards before deletion/regeneration, so the
 *  action can be offered with an "Undo". Returns null if the sequence no longer exists. */
export async function snapshotSequence(id: string): Promise<SequenceSnapshot | null> {
  const sequence = await db.sequences.get(id);
  if (!sequence) return null;
  const cards = await cardsForSequence(sequence);
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
    sequence,
    cards,
    concepts: concepts.filter((concept): concept is Concept => concept !== undefined),
    lessonCards,
    lessonCardExposures,
    reviewHistory,
  };
}

/** Re-insert a previously captured SequenceSnapshot (the inverse of deleteSequence/updateSequence). */
export async function restoreSequence(snapshot: SequenceSnapshot): Promise<void> {
  try {
    const cardsToRestore =
      snapshot.reviewHistory === undefined
        ? snapshot.cards
        : cardsWithReviewHistory(snapshot.cards, snapshot.reviewHistory);
    await db.transaction(
      'rw',
      [
        db.sequences,
        db.cards,
        db.concepts,
        db.reviewHistory,
        db.lessonCards,
        db.lessonCardExposures,
        db.tombstones,
      ],
      async (tx) => {
        await db.sequences.put(snapshot.sequence);
        const concepts =
          snapshot.concepts ??
          conceptsForSequencePayloads(
            snapshot.sequence,
            cardsToRestore[0]?.schedulingUnitId ?? snapshot.sequence.courseId,
            cardsToRestore.map((card) => ({
              type: card.type,
              front: card.front,
              back: card.back,
              courseId: snapshot.sequence.courseId,
              primaryLessonId: snapshot.sequence.primaryLessonId,
              sequenceItemId: card.sequenceItemId!,
            })),
            snapshot.sequence.createdAt,
          );
        if (concepts.length > 0) await db.concepts.bulkPut(concepts);
        await db.cards.bulkPut(cardsToRestore);
        await db.lessonCards.bulkPut(snapshot.lessonCards);
        await db.lessonCardExposures.bulkPut(snapshot.lessonCardExposures);
        await db.reviewHistory.bulkPut(
          snapshot.reviewHistory ??
            cardsToRestore.flatMap((card) => reviewHistoryEntriesForCard(card)),
        );
        await clearTombstone(tx, 'sequences', snapshot.sequence.id);
        await clearTombstones(
          tx,
          'cards',
          cardsToRestore.map((card) => card.id),
        );
        await clearTombstones(
          tx,
          'lessonCards',
          snapshot.lessonCards.map((link) => link.id),
        );
        await clearTombstones(
          tx,
          'lessonCardExposures',
          snapshot.lessonCardExposures.map((exposure) =>
            lessonCardExposureId(exposure.lessonId, exposure.cardId),
          ),
        );
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}
