import type { Transaction } from 'dexie';
import { buildCardConcept, conceptNameForCard } from '../questions/concepts';
import type { Concept } from '@lacuna/core/questions/types';
import { db } from './schema';
import {
  ensureCourseBankBackingDeck,
  ensureLessonBackingDeck,
  syncCourseSchedulingUnits,
} from './backingDecks';
import type {
  CardUpdate,
  CreateCardPayload,
  CreateLessonPayload,
  CreateNotePayload,
} from '@lacuna/core/db/lineageDiff';
import {
  cardSnapshot,
  lessonSnapshot,
  lineageCardConceptId,
  noteSnapshot,
  toExistingCard,
  toExistingLesson,
  toExistingNote,
} from './lineageImportModel';
import type { LineagePayload } from './lineageImportModel';
import { clearTombstones, recordTombstones, stampUpdatedAt } from './mutationStamp';
import { assignCardsToLesson, updateCard } from './repository';
import type { Card, Lesson, LessonCardLink, LineageIdMapping, Note } from '@lacuna/core/db/types';

/** Build the full local Lesson/Note/Card rows a diff `creates` payload describes, and
 *  write the mapping's snapshot for each newly adopted entity. Card creates are always
 *  plain `front_back`/`cloze` here — `k: 2` cannot reach a `creates` entry via `diffLineage`
 *  (unreachable via today's course export, see `reverseCardId` in `lineageImportModel.ts`). */
export async function applyCreates(
  courseId: string,
  createdAt: number,
  creates: {
    lessons: CreateLessonPayload[];
    notes: CreateNotePayload[];
    cards: CreateCardPayload[];
  },
  mapping: LineageIdMapping,
  conceptIdByCard?: ReadonlyMap<string, string>,
): Promise<{ lessons: Lesson[]; notes: Note[]; cards: Card[] }> {
  const newLessons: Lesson[] = creates.lessons.map((l) => ({
    id: l.id,
    prerequisiteLessonIds: l.prerequisiteLessonIds,
    courseId,
    name: l.name,
    ...(l.description ? { description: l.description } : {}),
    isExtension: l.isExtension,
    ...(typeof l.releaseDate === 'number' ? { releaseDate: l.releaseDate } : {}),
    ...(typeof l.examDate === 'number' ? { examDate: l.examDate } : {}),
    ...(l.timeZone ? { timeZone: l.timeZone } : {}),
    ...(l.sessionFilter ? { sessionFilter: l.sessionFilter } : {}),
    answerMode: l.answerMode,
    orderIndex: l.orderIndex,
    createdAt,
    updatedAt: createdAt,
  }));
  if (newLessons.length > 0) await db.lessons.bulkAdd(newLessons);

  const newNotes: Note[] = creates.notes.map((n) => ({
    id: n.id,
    lessonId: n.lessonId,
    name: n.name,
    content: n.content,
    orderIndex: n.orderIndex,
    createdAt,
    updatedAt: createdAt,
  }));
  if (newNotes.length > 0) await db.notes.bulkAdd(newNotes);

  const newCards: Card[] = [];
  const newConcepts: Concept[] = [];
  for (const c of creates.cards) {
    const deckId = c.lessonId
      ? await ensureLessonBackingDeck(courseId, c.lessonId)
      : await ensureCourseBankBackingDeck(courseId);
    const conceptId = conceptIdByCard ? conceptIdByCard.get(c.id) : lineageCardConceptId(c.id);
    if (!conceptId) throw new Error(`A shared Card references a missing Concept: ${c.id}.`);
    if (!conceptIdByCard) {
      newConcepts.push(
        buildCardConcept({
          id: conceptId,
          courseId,
          schedulingUnitId: deckId,
          name: conceptNameForCard(c.type, c.front, c.back),
          now: createdAt,
        }),
      );
    }
    newCards.push({
      id: c.id,
      conceptId,
      deckId,
      courseId,
      primaryLessonId: c.lessonId,
      schedulingUnitId: deckId,
      type: c.type,
      front: c.front,
      back: c.back,
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
      updatedAt: createdAt,
      tags: c.tags ?? [],
      payload: c.payload,
      answerMode: c.answerMode,
      suspended: false,
      buriedUntil: null,
    });
  }
  if (newConcepts.length > 0) await db.concepts.bulkAdd(newConcepts);
  if (newCards.length > 0) await db.cards.bulkAdd(newCards);

  for (const l of newLessons) {
    mapping.lessonIds.push(l.id);
    mapping.lessonSnapshots[l.id] = lessonSnapshot(toExistingLesson(l));
  }
  for (const n of newNotes) {
    mapping.noteIds.push(n.id);
    mapping.noteSnapshots[n.id] = noteSnapshot(toExistingNote(n));
  }
  for (const c of newCards) {
    mapping.cardIds.push(c.id);
    mapping.cardSnapshots[c.id] = cardSnapshot(toExistingCard(c));
  }

  return { lessons: newLessons, notes: newNotes, cards: newCards };
}

// Validate the final graph at each enclosing merge/review transaction boundary: a valid
// batch can reverse an edge and briefly form a cycle while individual rows are applied.
export async function applyLineageLessonUpdate(
  id: string,
  changes: Partial<Lesson>,
): Promise<void> {
  await db.lessons.update(id, stampUpdatedAt(changes));
  const lesson = await db.lessons.get(id);
  if (lesson) await syncCourseSchedulingUnits(lesson.courseId);
}

/** Apply a card update, routing a lesson move through `assignCardsToLesson` so the
 *  backing deck, scheduling unit and review history follow the card. */
export async function applyCardUpdate(courseId: string, update: CardUpdate): Promise<void> {
  const { id, primaryLessonId, ...changes } = update;
  if (primaryLessonId !== undefined) await assignCardsToLesson([id], courseId, primaryLessonId);
  if (Object.keys(changes).length > 0) await updateCard(id, changes);
}

/** Deterministic, so every device that imports the lineage converges on one row. */
function lineageLinkId(lessonId: string, cardId: string): string {
  return `lineage-link:${encodeURIComponent(lessonId)}:${encodeURIComponent(cardId)}`;
}

/**
 * Make the course's lineage-owned lesson-card links match the payload's. Links are
 * display-only (the card's primary lesson is unchanged), so they are applied directly
 * rather than queued for review. Only links with a lineage id are touched.
 */
export async function syncLineageLinks(
  tx: Transaction,
  payload: LineagePayload,
  courseId: string,
): Promise<void> {
  const lessonIds = (await db.lessons.where('courseId').equals(courseId).primaryKeys()) as string[];
  const lessonIdSet = new Set(lessonIds);
  const current = lessonIds.length
    ? (await db.lessonCards.where('lessonId').anyOf(lessonIds).toArray()).filter((link) =>
        link.id.startsWith('lineage-link:'),
      )
    : [];
  const currentIds = new Set(current.map((link) => link.id));
  const links = payload.links ?? [];
  const cards = await db.cards.bulkGet(links.map((link) => link.c));
  const now = Date.now();
  const wanted = new Set<string>();
  const added: LessonCardLink[] = [];
  links.forEach((link, index) => {
    const lessonId = payload.lessons[link.l]?.i;
    if (!lessonId || !lessonIdSet.has(lessonId) || cards[index]?.courseId !== courseId) return;
    const id = lineageLinkId(lessonId, link.c);
    if (wanted.has(id)) return;
    wanted.add(id);
    if (!currentIds.has(id)) {
      added.push({ id, lessonId, cardId: link.c, createdAt: now, updatedAt: now });
    }
  });
  const removed = current.filter((link) => !wanted.has(link.id)).map((link) => link.id);
  if (removed.length > 0) {
    await db.lessonCards.bulkDelete(removed);
    await recordTombstones(tx, 'lessonCards', removed);
  }
  if (added.length > 0) {
    await db.lessonCards.bulkAdd(added);
    await clearTombstones(
      tx,
      'lessonCards',
      added.map((link) => link.id),
    );
  }
}
