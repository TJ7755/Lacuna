/**
 * Arc 7 classroom-distribution merge importer (next_plan.md §7.5, Task 5).
 *
 * Two entry points:
 *  - {@link importLineageFirstTime} — first import of a published lineage. Adopts every
 *    incoming lesson/note/card's originating id directly as the local id (§7.1's id
 *    adoption decision — never `makeId()`), and creates the `LineageIdMapping`
 *    membership registry that every later merge consults.
 *  - {@link mergeLineageUpdate} — re-import of an updated code against a course that
 *    already tracks the lineage. Runs the pure diff (`src/db/lineageDiff.ts`) against the
 *    current local state, applies creates unconditionally, applies or queues
 *    updates/removals per `distributedCopy.autoAcceptUpdates`, and always queues
 *    conflicts — never silently discarding or overwriting a student's own edit.
 *
 * Sequence-shaped payload items never go through `lineageDiff.ts` (out of scope by
 * design, §7.1/§7.3) — both entry points hand them to `updateSequence`
 * (`src/db/repository.ts`), which already owns "diff against the previous generation,
 * touch content fields only" via `diffRegeneration`. `updateSequence` also covers the
 * create case: `db.sequences.put` on an id with no existing row is an insert, and its
 * internal diff against zero existing cards is all-creates.
 *
 * Deliberately out of scope for this task (not part of `LineageIdMapping`'s tracked
 * entity kinds, §7.2): course-level assessments and question-bank cards. A lineage
 * payload's `exams`/`bankCards` are not touched here; only lessons, notes, cards and
 * sequences are lineage-tracked. This mirrors §7.9 Task 5's brief, which scopes id
 * adoption to "lessons/notes/cards" only.
 *
 * This module uses Dexie directly (never edits `src/db/repository.ts`, owned by a
 * concurrent Arc 7 task) but does import its existing, unmodified exports for creates,
 * updates and deletes wherever they already do the right thing — exactly as
 * `src/db/share.ts` imports `createCourse`/`createCards`/`ensureLessonDeck` today.
 */

import { db, makeId } from './schema';
import {
  createCourse,
  deleteCards,
  deleteLesson,
  deleteNote,
  ensureLessonDeck,
  updateCard,
  updateLesson,
  updateNote,
  updateSequence,
} from './repository';
import { diffLineage } from './lineageDiff';
import type {
  CreateCardPayload,
  CreateLessonPayload,
  CreateNotePayload,
  ExistingCard,
  ExistingLesson,
  ExistingNote,
  LineageDiffInput,
  ShareCardInput,
  ShareLessonInput,
  ShareNoteInput,
} from './lineageDiff';
import type { SharePayload } from './share';
import type {
  Card,
  CardType,
  Course,
  CourseRecord,
  Lesson,
  LineageCardSnapshot,
  LineageIdMapping,
  LineageLessonSnapshot,
  LineageNoteSnapshot,
  Note,
  PendingMergeReview,
  Sequence,
} from './types';

/** Narrowed view of the fields this module reads off a decoded v2 share payload. */
type LineagePayload = Extract<SharePayload, { v: 2 }> & { li: string; rv: number };

/** Type guard: a decoded payload actually carries a lineage (`li`/`rv`, §7.2). */
export function isLineagePayload(payload: SharePayload): payload is LineagePayload {
  return payload.v === 2 && typeof payload.li === 'string' && typeof payload.rv === 'number';
}

/** `k` -> local `CardType`, mirroring `unpackCard`'s decode in `src/db/share.ts:771-784`
 *  exactly (including `k: 3`, the retired "typing" kind, folding to `front_back`). */
function shareCardKindToType(k: 0 | 1 | 2 | 3): CardType {
  if (k === 1) return 'cloze';
  return 'front_back';
}

/**
 * `unpackCard`'s reverse-pair id, deterministic and stable across merges so a later
 * re-import recognises the same mirror row. `k: 2` cannot actually occur in a course
 * lesson's cards today — `packCards` in `share.ts:673-736` only folds a front/back pair
 * into a reversible entry when `preserveIds` is false, and every course-lesson export
 * calls it with `preserveIds: true` (`share.ts:857`) precisely so originating ids survive
 * — but the wire format still declares `k: 2` as a valid discriminant, and `unpackCard`
 * still decodes it as two independent `front_back` cards (never `CardType`
 * `'basic_reversed'`, which is an unrelated, explicitly-linked pair feature — see
 * `repository.ts:285-302`). Handled defensively here so a future producer of `k: 2`
 * course-lesson payloads is not silently mishandled by the merge path.
 */
function reverseCardId(primaryId: string): string {
  return `${primaryId}::rev`;
}

// ---------------------------------------------------------------------------
// Adapting the real share payload shape to lineageDiff's input types (the two
// diverge in field naming from what next_plan.md §7.2 originally specified — see
// this task's brief. ShareLesson packs the originating id as `i`, ShareNote as `oi`
// (its own `i` is taken by the image-omission flag), and ShareCard's existing `id`
// field doubles as the originating card id for a published course, share.ts:68-74).
// ---------------------------------------------------------------------------

function toShareLessonInput(lesson: LineagePayload['lessons'][number]): ShareLessonInput {
  if (!lesson.i) throw new Error('Lineage payload lesson is missing its originating id.');
  return {
    i: lesson.i,
    n: lesson.n,
    d: lesson.d,
    x: lesson.x,
    rd: lesson.rd,
    ed: lesson.ed,
    tz: lesson.tz,
    sf: lesson.sf,
    notes: lesson.notes.map((note): ShareNoteInput => {
      if (!note.oi) throw new Error('Lineage payload note is missing its originating id.');
      return { i: note.oi, n: note.n, c: note.c };
    }),
    cards: lesson.cards.map((card): ShareCardInput => {
      if (!card.id) throw new Error('Lineage payload card is missing its originating id.');
      return { i: card.id, k: card.k, f: card.f, b: card.b, g: card.g };
    }),
  };
}

function toExistingLesson(lesson: Lesson): ExistingLesson {
  return {
    id: lesson.id,
    name: lesson.name,
    description: lesson.description,
    isExtension: lesson.isExtension,
    releaseDate: lesson.releaseDate,
    examDate: lesson.examDate,
    timeZone: lesson.timeZone,
    sessionFilter: lesson.sessionFilter === 'new' ? undefined : lesson.sessionFilter,
    orderIndex: lesson.orderIndex,
  };
}

function toExistingNote(note: Note): ExistingNote {
  return { id: note.id, lessonId: note.lessonId, name: note.name, content: note.content, orderIndex: note.orderIndex };
}

function toExistingCard(card: Card): ExistingCard {
  return { id: card.id, type: card.type, front: card.front, back: card.back, tags: card.tags };
}

function lessonSnapshot(lesson: ExistingLesson): LineageLessonSnapshot {
  const { id: _id, ...rest } = lesson;
  return rest;
}

function noteSnapshot(note: ExistingNote): LineageNoteSnapshot {
  return { name: note.name, content: note.content, orderIndex: note.orderIndex };
}

function cardSnapshot(card: ExistingCard): LineageCardSnapshot {
  return { type: card.type, front: card.front, back: card.back, tags: card.tags };
}

/**
 * Which adopted ids the student has edited since the last merge (§7.3's `studentEdits`,
 * populated per §7.10's third risk: compare current local content against the mapping's
 * last-merged snapshot rather than a separate dirty flag that could drift out of sync).
 * Only adopted (mapping-known) ids are ever compared — a freshly created local entity
 * has no snapshot to diverge from and is irrelevant to a lineage merge.
 */
/** Exported for `src/mcp/tools/lineage.ts`'s `lacuna.diff_lineage_update` (Arc 7 §7.6,
 *  Task 10) — the read-only MCP preview reuses this classification verbatim rather than
 *  reimplementing it, so the two can never drift apart on what counts as a student edit. */
export function detectStudentEdits(
  mapping: LineageIdMapping,
  lessons: Lesson[],
  notes: Note[],
  cards: Card[],
): Set<string> {
  const edited = new Set<string>();
  const lessonsById = new Map(lessons.map((l) => [l.id, l]));
  const notesById = new Map(notes.map((n) => [n.id, n]));
  const cardsById = new Map(cards.map((c) => [c.id, c]));

  for (const id of mapping.lessonIds) {
    const snapshot = mapping.lessonSnapshots[id];
    const current = lessonsById.get(id);
    if (snapshot && current && !lessonSnapshotsEqual(snapshot, lessonSnapshot(toExistingLesson(current)))) {
      edited.add(id);
    }
  }
  for (const id of mapping.noteIds) {
    const snapshot = mapping.noteSnapshots[id];
    const current = notesById.get(id);
    if (snapshot && current && !noteSnapshotsEqual(snapshot, noteSnapshot(toExistingNote(current)))) {
      edited.add(id);
    }
  }
  for (const id of mapping.cardIds) {
    const snapshot = mapping.cardSnapshots[id];
    const current = cardsById.get(id);
    if (snapshot && current && !cardSnapshotsEqual(snapshot, cardSnapshot(toExistingCard(current)))) {
      edited.add(id);
    }
  }
  return edited;
}

function lessonSnapshotsEqual(a: LineageLessonSnapshot, b: LineageLessonSnapshot): boolean {
  return (
    a.name === b.name &&
    a.description === b.description &&
    a.isExtension === b.isExtension &&
    a.releaseDate === b.releaseDate &&
    a.examDate === b.examDate &&
    a.timeZone === b.timeZone &&
    a.sessionFilter === b.sessionFilter &&
    a.orderIndex === b.orderIndex
  );
}

function noteSnapshotsEqual(a: LineageNoteSnapshot, b: LineageNoteSnapshot): boolean {
  return a.name === b.name && a.content === b.content && a.orderIndex === b.orderIndex;
}

function tagsEqual(a?: string[], b?: string[]): boolean {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

function cardSnapshotsEqual(a: LineageCardSnapshot, b: LineageCardSnapshot): boolean {
  return a.type === b.type && a.front === b.front && a.back === b.back && tagsEqual(a.tags, b.tags);
}

const MERGE_TABLES = [
  db.courses,
  db.lessons,
  db.notes,
  db.noteAnnotations,
  db.cards,
  db.lessonCards,
  db.lessonCardExposures,
  db.lessonCompletions,
  db.decks,
  db.userPerformance,
  db.sessionHistory,
  db.sequences,
  db.courseAssessments,
  db.lineageIdMappings,
  db.pendingMergeReviews,
] as const;

/** Empty membership/snapshot registry for a brand-new lineage mapping row. */
function emptyMapping(lineageId: string, courseId: string): LineageIdMapping {
  return {
    id: lineageId,
    courseId,
    lessonIds: [],
    noteIds: [],
    cardIds: [],
    sequenceIds: [],
    lessonSnapshots: {},
    noteSnapshots: {},
    cardSnapshots: {},
  };
}

/**
 * Insert a payload's sequences via `updateSequence`, which already handles both create
 * (an id with no existing row — `db.sequences.put` inserts, and the diff against zero
 * existing generated cards is all-creates) and update (regenerate content-only via
 * `diffRegeneration`) in one call. The sequence's own packed `id` is its originating id,
 * adopted directly exactly like lessons/notes/cards (§7.1) — `buildCourseSharePayload`
 * always packs a sequence's real local id (`share.ts:914-917`), never a payload-scoped
 * placeholder, so there is nothing to remap.
 */
async function applySequences(
  payload: LineagePayload,
  courseId: string,
  lessonIdByIndex: (index: number) => string | null,
  mapping: LineageIdMapping,
): Promise<void> {
  for (const shareSeq of payload.sequences ?? []) {
    const sequence: Sequence = {
      id: shareSeq.id,
      courseId,
      primaryLessonId: typeof shareSeq.pl === 'number' ? lessonIdByIndex(shareSeq.pl) : null,
      name: shareSeq.n || 'Shared sequence',
      ...(shareSeq.d ? { description: shareSeq.d } : {}),
      items: shareSeq.items.map((item) => ({
        id: item.id,
        value: item.v,
        ...(item.l ? { label: item.l } : {}),
        ...(item.ci !== undefined ? { chunkIndex: item.ci } : {}),
        ...(item.sp ? { speaker: item.sp } : {}),
      })),
      cueWindow: shareSeq.cw,
      ...(shareSeq.cl && shareSeq.cl.length ? { chunkLabels: shareSeq.cl } : {}),
      ...(shareSeq.lc === 1 ? { generateLabelCards: true } : {}),
      ...(shareSeq.m === 'lines' ? { mode: 'lines' as const } : {}),
      ...(shareSeq.ms ? { mySpeaker: shareSeq.ms } : {}),
      createdAt: Date.now(),
    };
    await updateSequence(sequence);
    if (!mapping.sequenceIds.includes(sequence.id)) mapping.sequenceIds.push(sequence.id);
  }
}

/** Build the full local Lesson/Note/Card rows a diff `creates` payload describes, and
 *  write the mapping's snapshot for each newly adopted entity. Card creates are always
 *  plain `front_back`/`cloze` here — `k: 2` cannot reach a `creates` entry via `diffLineage`
 *  (unreachable via today's course export, see `reverseCardId`'s doc comment above). */
async function applyCreates(
  courseId: string,
  createdAt: number,
  creates: { lessons: CreateLessonPayload[]; notes: CreateNotePayload[]; cards: CreateCardPayload[] },
  mapping: LineageIdMapping,
): Promise<{ lessons: Lesson[]; notes: Note[]; cards: Card[] }> {
  const newLessons: Lesson[] = creates.lessons.map((l) => ({
    id: l.id,
    courseId,
    name: l.name,
    ...(l.description ? { description: l.description } : {}),
    isExtension: l.isExtension,
    ...(typeof l.releaseDate === 'number' ? { releaseDate: l.releaseDate } : {}),
    ...(typeof l.examDate === 'number' ? { examDate: l.examDate } : {}),
    ...(l.timeZone ? { timeZone: l.timeZone } : {}),
    ...(l.sessionFilter ? { sessionFilter: l.sessionFilter } : {}),
    orderIndex: l.orderIndex,
    createdAt,
  }));
  if (newLessons.length > 0) await db.lessons.bulkAdd(newLessons);

  const newNotes: Note[] = creates.notes.map((n) => ({
    id: n.id,
    lessonId: n.lessonId,
    name: n.name,
    content: n.content,
    orderIndex: n.orderIndex,
    createdAt,
  }));
  if (newNotes.length > 0) await db.notes.bulkAdd(newNotes);

  const newCards: Card[] = [];
  for (const c of creates.cards) {
    const deckId = await ensureLessonDeck(courseId, c.lessonId);
    newCards.push({
      id: c.id,
      deckId,
      courseId,
      primaryLessonId: c.lessonId,
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
      tags: c.tags ?? [],
      suspended: false,
      buriedUntil: null,
    });
  }
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

/**
 * First import of a published lineage (§7.1/§7.2/§7.9 Task 5). Diverges from
 * `importCourseSharePayload` (`share.ts:1083`) precisely in id handling: every
 * lesson/note/card adopts its incoming originating id directly as the local id
 * instead of `makeId()`, and a `LineageIdMapping` membership registry plus initial
 * content snapshots are written so the next re-import can diff against this state.
 */
export async function importLineageFirstTime(payload: SharePayload): Promise<{ course: Course }> {
  if (!isLineagePayload(payload)) {
    throw new Error('Payload does not carry a course lineage (missing li/rv).');
  }

  return db.transaction('rw', MERGE_TABLES, async () => {
    const course = await createCourse(payload.course.n || 'Shared course', {
      description: payload.course.d ?? '',
      examObjective: payload.course.o === 1 ? 'securedTopics' : 'expectedMarks',
      createdAt: payload.course.c,
      examDate: payload.course.e,
      unlockMode: payload.course.um,
      lessonViewMode: 'study',
      ...(payload.course.l ? { colour: payload.course.l } : {}),
      distributedCopy: {
        lineageId: payload.li,
        revision: payload.rv,
        locked: true,
        autoAcceptUpdates: false,
        ...(payload.by ? { sourceLabel: payload.by } : {}),
      },
    });

    const mapping = emptyMapping(payload.li, course.id);
    const createdAt = Date.now();

    const newLessons: Lesson[] = payload.lessons.map((shareLesson, orderIndex) => {
      if (!shareLesson.i) throw new Error('Lineage payload lesson is missing its originating id.');
      return {
        id: shareLesson.i,
        courseId: course.id,
        name: shareLesson.n.trim() || 'Untitled lesson',
        orderIndex,
        createdAt: createdAt + orderIndex,
        ...(shareLesson.d ? { description: shareLesson.d } : {}),
        isExtension: shareLesson.x === 1,
        ...(typeof shareLesson.rd === 'number' ? { releaseDate: shareLesson.rd } : {}),
        ...(typeof shareLesson.ed === 'number' ? { examDate: shareLesson.ed } : {}),
        ...(shareLesson.tz ? { timeZone: shareLesson.tz } : {}),
        ...(shareLesson.sf ? { sessionFilter: shareLesson.sf } : {}),
      };
    });
    if (newLessons.length > 0) await db.lessons.bulkAdd(newLessons);
    for (const lesson of newLessons) {
      mapping.lessonIds.push(lesson.id);
      mapping.lessonSnapshots[lesson.id] = lessonSnapshot(toExistingLesson(lesson));
    }

    const newNotes: Note[] = payload.lessons.flatMap((shareLesson, lessonIndex) =>
      shareLesson.notes.map((shareNote, orderIndex) => {
        if (!shareNote.oi) throw new Error('Lineage payload note is missing its originating id.');
        return {
          id: shareNote.oi,
          lessonId: newLessons[lessonIndex].id,
          name: shareNote.n.trim() || 'Untitled note',
          content: shareNote.c,
          orderIndex,
          createdAt: createdAt + orderIndex,
        };
      }),
    );
    if (newNotes.length > 0) await db.notes.bulkAdd(newNotes);
    for (const note of newNotes) {
      mapping.noteIds.push(note.id);
      mapping.noteSnapshots[note.id] = noteSnapshot(toExistingNote(note));
    }

    const newCards: Card[] = [];
    for (let lessonIndex = 0; lessonIndex < payload.lessons.length; lessonIndex++) {
      const shareLesson = payload.lessons[lessonIndex];
      const lessonId = newLessons[lessonIndex].id;
      if (shareLesson.cards.length === 0) continue;
      const deckId = await ensureLessonDeck(course.id, lessonId);
      let cardCreatedAt = createdAt;
      for (const shareCard of shareLesson.cards) {
        if (!shareCard.id) throw new Error('Lineage payload card is missing its originating id.');
        const base = {
          deckId,
          courseId: course.id,
          primaryLessonId: lessonId,
          stability: null,
          difficulty: null,
          lastReviewed: null,
          reps: 0,
          lapses: 0,
          state: 0 as const,
          due: null,
          scheduledDays: 0,
          learningSteps: 0,
          history: [],
          tags: shareCard.g ?? [],
          suspended: false,
          buriedUntil: null,
        };
        if (shareCard.k === 2) {
          // See reverseCardId's doc comment: unreachable via today's course export, but
          // handled the way `unpackCard` decodes it (two independent front_back cards)
          // for robustness.
          const back = shareCard.b ?? '';
          newCards.push({
            id: shareCard.id,
            type: 'front_back',
            front: shareCard.f,
            back,
            createdAt: cardCreatedAt++,
            ...base,
          });
          newCards.push({
            id: reverseCardId(shareCard.id),
            type: 'front_back',
            front: back,
            back: shareCard.f,
            createdAt: cardCreatedAt++,
            ...base,
          });
        } else {
          newCards.push({
            id: shareCard.id,
            type: shareCardKindToType(shareCard.k),
            front: shareCard.f,
            back: shareCard.k === 1 ? '' : (shareCard.b ?? ''),
            createdAt: cardCreatedAt++,
            ...base,
          });
        }
      }
    }
    if (newCards.length > 0) await db.cards.bulkAdd(newCards);
    for (const card of newCards) {
      mapping.cardIds.push(card.id);
      mapping.cardSnapshots[card.id] = cardSnapshot(toExistingCard(card));
    }

    await applySequences(
      payload,
      course.id,
      (index) => newLessons[index]?.id ?? null,
      mapping,
    );

    await db.lineageIdMappings.put(mapping);
    await db.pendingMergeReviews.where('courseId').equals(course.id).delete();

    return { course };
  });
}

export interface MergeLineageResult {
  createdLessons: number;
  createdNotes: number;
  createdCards: number;
  appliedUpdates: number;
  appliedRemovals: number;
  queuedForReview: boolean;
  conflictCount: number;
}

/**
 * Re-import an updated share code against a course that already tracks the payload's
 * lineage (§7.5's "merge apply, in order" steps 1-6). `courseId` must already carry a
 * matching `distributedCopy.lineageId` — routing that decision is Task 9's job
 * (`SharePage`/`UnifiedImportPanel`'s decode-time branch); this function assumes the
 * caller has already established the match.
 */
export async function mergeLineageUpdate(
  courseId: string,
  payload: SharePayload,
): Promise<MergeLineageResult> {
  if (!isLineagePayload(payload)) {
    throw new Error('Payload does not carry a course lineage (missing li/rv).');
  }

  return db.transaction('rw', MERGE_TABLES, async () => {
    const course = await db.courses.get(courseId);
    if (!course) throw new Error('Course not found.');
    const dc = course.distributedCopy;
    if (!dc || dc.lineageId !== payload.li) {
      throw new Error('Course is not an imported copy of this lineage.');
    }

    const existingMapping = await db.lineageIdMappings.get(payload.li);
    const mapping = existingMapping ?? emptyMapping(payload.li, courseId);

    const [existingLessons, courseCards] = await Promise.all([
      db.lessons.where('courseId').equals(courseId).toArray(),
      db.cards.where('courseId').equals(courseId).toArray(),
    ]);
    const lessonIds = existingLessons.map((l) => l.id);
    const existingNotes = lessonIds.length
      ? await db.notes.where('lessonId').anyOf(lessonIds).toArray()
      : [];

    const studentEdits = detectStudentEdits(mapping, existingLessons, existingNotes, courseCards);

    const diffInput: LineageDiffInput = {
      incoming: { lessons: payload.lessons.map(toShareLessonInput) },
      existing: {
        lessons: existingLessons.map(toExistingLesson),
        notes: existingNotes.map(toExistingNote),
        cards: courseCards.map(toExistingCard),
      },
      mapping: {
        id: mapping.id,
        courseId: mapping.courseId,
        lessonIds: mapping.lessonIds,
        noteIds: mapping.noteIds,
        cardIds: mapping.cardIds,
        sequenceIds: mapping.sequenceIds,
      },
      studentEdits,
    };
    const diff = diffLineage(diffInput);

    // A removal the student has also edited is not a clean delete — queue it as a
    // conflict instead (§7.10's unresolved policy: student's copy retained until they
    // accept the removal, consistent with the student-wins default elsewhere).
    const removalLessonIds: string[] = [];
    const removalNoteIds: string[] = [];
    const removalCardIds: string[] = [];
    const conflicts: PendingMergeReview['diff']['conflicts'] = [...diff.conflicts];
    for (const id of diff.removals.lessonIds) {
      if (studentEdits.has(id)) conflicts.push({ entityId: id, kind: 'lesson', incoming: null });
      else removalLessonIds.push(id);
    }
    for (const id of diff.removals.noteIds) {
      if (studentEdits.has(id)) conflicts.push({ entityId: id, kind: 'note', incoming: null });
      else removalNoteIds.push(id);
    }
    for (const id of diff.removals.cardIds) {
      if (studentEdits.has(id)) conflicts.push({ entityId: id, kind: 'card', incoming: null });
      else removalCardIds.push(id);
    }

    // 1. Creates are always applied immediately (§7.5 step 2) — purely additive.
    const createdAt = Date.now();
    const created = await applyCreates(courseId, createdAt, diff.creates, mapping);

    // 2/3. Updates and removals: apply now if autoAcceptUpdates, otherwise queue.
    let appliedUpdates = 0;
    let appliedRemovals = 0;
    const queuedUpdates = { lessons: diff.updates.lessons, notes: diff.updates.notes, cards: diff.updates.cards };
    const queuedRemovals = { lessonIds: removalLessonIds, noteIds: removalNoteIds, cardIds: removalCardIds };

    if (dc.autoAcceptUpdates) {
      for (const update of diff.updates.lessons) {
        const { id, ...changes } = update;
        await updateLesson(id, changes);
        appliedUpdates++;
      }
      for (const update of diff.updates.notes) {
        const { id, ...changes } = update;
        await updateNote(id, changes);
        appliedUpdates++;
      }
      for (const update of diff.updates.cards) {
        const { id, ...changes } = update;
        await updateCard(id, changes);
        appliedUpdates++;
      }
      for (const id of removalLessonIds) {
        await deleteLesson(id);
        appliedRemovals++;
      }
      for (const id of removalNoteIds) {
        await deleteNote(id);
        appliedRemovals++;
      }
      if (removalCardIds.length > 0) {
        await deleteCards(removalCardIds);
        appliedRemovals += removalCardIds.length;
      }
      queuedUpdates.lessons = [];
      queuedUpdates.notes = [];
      queuedUpdates.cards = [];
      queuedRemovals.lessonIds = [];
      queuedRemovals.noteIds = [];
      queuedRemovals.cardIds = [];
    }

    // Refresh the mapping's snapshots for every entity whose incoming content was just
    // applied (creates and, when auto-accepted, updates) so the *next* merge's
    // student-edit detection compares against what is now on disk. Entities left
    // queued (not auto-accepted) or in conflict keep their old snapshot on purpose —
    // nothing changed locally for them yet.
    if (dc.autoAcceptUpdates) {
      for (const update of diff.updates.lessons) {
        const lesson = await db.lessons.get(update.id);
        if (lesson) mapping.lessonSnapshots[update.id] = lessonSnapshot(toExistingLesson(lesson));
      }
      for (const update of diff.updates.notes) {
        const note = await db.notes.get(update.id);
        if (note) mapping.noteSnapshots[update.id] = noteSnapshot(toExistingNote(note));
      }
      for (const update of diff.updates.cards) {
        const card = await db.cards.get(update.id);
        if (card) mapping.cardSnapshots[update.id] = cardSnapshot(toExistingCard(card));
      }
      for (const id of removalLessonIds) {
        mapping.lessonIds = mapping.lessonIds.filter((x) => x !== id);
        delete mapping.lessonSnapshots[id];
      }
      for (const id of removalNoteIds) {
        mapping.noteIds = mapping.noteIds.filter((x) => x !== id);
        delete mapping.noteSnapshots[id];
      }
      for (const id of removalCardIds) {
        mapping.cardIds = mapping.cardIds.filter((x) => x !== id);
        delete mapping.cardSnapshots[id];
      }
    }

    // 4. Sequences hand off to `updateSequence` unconditionally (§7.1/§7.5 step 5) —
    // never gated by autoAcceptUpdates, mirroring how a local sequence edit is never a
    // "pending review" concept either.
    const lessonIdByIndex = (index: number): string | null => {
      const shareLesson = payload.lessons[index];
      if (!shareLesson?.i) return null;
      return shareLesson.i;
    };
    await applySequences(payload, courseId, lessonIdByIndex, mapping);

    // 6. Revision + mapping bookkeeping.
    await db.courses.update(courseId, {
      distributedCopy: { ...dc, revision: payload.rv },
    });
    await db.lineageIdMappings.put(mapping);

    // Queue whatever remains unresolved, superseding any previous pending row for this
    // course (§7.10's second risk — one outstanding diff, never an accumulating history).
    await db.pendingMergeReviews.where('courseId').equals(courseId).delete();
    const hasQueuedContent =
      queuedUpdates.lessons.length > 0 ||
      queuedUpdates.notes.length > 0 ||
      queuedUpdates.cards.length > 0 ||
      queuedRemovals.lessonIds.length > 0 ||
      queuedRemovals.noteIds.length > 0 ||
      queuedRemovals.cardIds.length > 0 ||
      conflicts.length > 0;
    if (hasQueuedContent) {
      const review: PendingMergeReview = {
        id: makeId(),
        courseId,
        lineageId: payload.li,
        revision: payload.rv,
        diff: {
          creates: { lessons: [], notes: [], cards: [] },
          updates: queuedUpdates,
          removals: queuedRemovals,
          conflicts,
        },
        createdAt: Date.now(),
      };
      await db.pendingMergeReviews.add(review);
    }

    return {
      createdLessons: created.lessons.length,
      createdNotes: created.notes.length,
      createdCards: created.cards.length,
      appliedUpdates,
      appliedRemovals,
      queuedForReview: hasQueuedContent,
      conflictCount: conflicts.length,
    };
  });
}

/** Find the local course record (if any) already tracking the given lineage — used by
 *  the decode-time routing this task hands off to Task 9. Exported here since the merge
 *  path is the natural owner of "what does it mean to already track a lineage". Returns
 *  the raw `CourseRecord` (not the hydrated `Course`, which needs an assessment lookup
 *  this check does not require). */
export async function findCourseForLineage(lineageId: string): Promise<CourseRecord | undefined> {
  return db.courses.filter((c) => c.distributedCopy?.lineageId === lineageId).first();
}

// ---------------------------------------------------------------------------
// Review resolution (§7.5's review UI actions, Task 7). A `pendingMergeReviews`
// row holds the still-outstanding updates/removals/conflicts from the last merge;
// these functions apply the student's per-row or bulk decision through the same
// content-only apply paths `mergeLineageUpdate`'s auto-accept branch uses (never a
// second apply implementation), remove the resolved item from the row, delete the
// row once nothing outstanding remains, and refresh the lineage mapping's snapshot
// for every accepted item so the next merge's student-edit detection compares
// against what is now on disk (and does not re-flag an update the student has
// already taken).
// ---------------------------------------------------------------------------

export type MergeReviewItemKind = 'lesson' | 'note' | 'card';

/** Identifies one outstanding item in a pending review. `kind` + `entityId` is unique:
 *  `diffLineage` classifies each entity into exactly one of updates/removals/conflicts. */
export interface MergeReviewItemRef {
  kind: MergeReviewItemKind;
  entityId: string;
}

type PendingDiff = PendingMergeReview['diff'];

function updatesBucket(diff: PendingDiff, kind: MergeReviewItemKind) {
  return kind === 'lesson' ? diff.updates.lessons : kind === 'note' ? diff.updates.notes : diff.updates.cards;
}

function removalsBucket(diff: PendingDiff, kind: MergeReviewItemKind): string[] {
  return kind === 'lesson' ? diff.removals.lessonIds : kind === 'note' ? diff.removals.noteIds : diff.removals.cardIds;
}

function diffIsEmpty(diff: PendingDiff): boolean {
  return (
    diff.updates.lessons.length === 0 &&
    diff.updates.notes.length === 0 &&
    diff.updates.cards.length === 0 &&
    diff.removals.lessonIds.length === 0 &&
    diff.removals.noteIds.length === 0 &&
    diff.removals.cardIds.length === 0 &&
    diff.conflicts.length === 0
  );
}

/** Every outstanding item in a review as refs. Conflicts are optionally excluded so a
 *  bulk "accept all" leaves student-edited conflicts queued — the manual equivalent of
 *  `autoAcceptUpdates`, which applies updates/removals but never overrides a student edit
 *  (§7.5 step 4). */
function collectRefs(diff: PendingDiff, includeConflicts: boolean): MergeReviewItemRef[] {
  const refs: MergeReviewItemRef[] = [];
  for (const u of diff.updates.lessons) refs.push({ kind: 'lesson', entityId: u.id });
  for (const u of diff.updates.notes) refs.push({ kind: 'note', entityId: u.id });
  for (const u of diff.updates.cards) refs.push({ kind: 'card', entityId: u.id });
  for (const id of diff.removals.lessonIds) refs.push({ kind: 'lesson', entityId: id });
  for (const id of diff.removals.noteIds) refs.push({ kind: 'note', entityId: id });
  for (const id of diff.removals.cardIds) refs.push({ kind: 'card', entityId: id });
  if (includeConflicts) {
    for (const c of diff.conflicts) refs.push({ kind: c.kind, entityId: c.entityId });
  }
  return refs;
}

/** Delete an accepted removal and drop it from the mapping registry + snapshots. */
async function deleteAdoptedEntity(kind: MergeReviewItemKind, entityId: string, mapping: LineageIdMapping): Promise<void> {
  if (kind === 'lesson') {
    await deleteLesson(entityId);
    mapping.lessonIds = mapping.lessonIds.filter((x) => x !== entityId);
    delete mapping.lessonSnapshots[entityId];
  } else if (kind === 'note') {
    await deleteNote(entityId);
    mapping.noteIds = mapping.noteIds.filter((x) => x !== entityId);
    delete mapping.noteSnapshots[entityId];
  } else {
    await deleteCards([entityId]);
    mapping.cardIds = mapping.cardIds.filter((x) => x !== entityId);
    delete mapping.cardSnapshots[entityId];
  }
}

/** Refresh the mapping snapshot for an entity whose local content was just changed. */
async function refreshSnapshot(kind: MergeReviewItemKind, entityId: string, mapping: LineageIdMapping): Promise<void> {
  if (kind === 'lesson') {
    const lesson = await db.lessons.get(entityId);
    if (lesson) mapping.lessonSnapshots[entityId] = lessonSnapshot(toExistingLesson(lesson));
  } else if (kind === 'note') {
    const note = await db.notes.get(entityId);
    if (note) mapping.noteSnapshots[entityId] = noteSnapshot(toExistingNote(note));
  } else {
    const card = await db.cards.get(entityId);
    if (card) mapping.cardSnapshots[entityId] = cardSnapshot(toExistingCard(card));
  }
}

/** Apply a queued content update (accept "their" version of a plain, non-conflicting
 *  change) through the same repository writes the auto-accept branch uses. */
async function applyQueuedUpdate(
  kind: MergeReviewItemKind,
  update:
    | PendingDiff['updates']['lessons'][number]
    | PendingDiff['updates']['notes'][number]
    | PendingDiff['updates']['cards'][number],
  mapping: LineageIdMapping,
): Promise<void> {
  const id = update.id;
  if (kind === 'lesson') {
    const { id: _id, ...changes } = update as PendingDiff['updates']['lessons'][number];
    await updateLesson(id, changes);
  } else if (kind === 'note') {
    const { id: _id, ...changes } = update as PendingDiff['updates']['notes'][number];
    await updateNote(id, changes);
  } else {
    const { id: _id, ...changes } = update as PendingDiff['updates']['cards'][number];
    await updateCard(id, changes);
  }
  await refreshSnapshot(kind, id, mapping);
}

/** Overwrite a student-edited entity with the teacher's incoming version ("take theirs"
 *  on a conflict). Unlike a plain update this replaces every content field, since the
 *  incoming version is authoritative — a field absent from the payload clears locally
 *  (Dexie deletes an `undefined`-valued property), matching first-import decode. */
async function takeIncomingConflict(
  kind: MergeReviewItemKind,
  entityId: string,
  incoming: ShareLessonInput | ShareNoteInput | ShareCardInput,
  mapping: LineageIdMapping,
): Promise<void> {
  if (kind === 'lesson') {
    const inc = incoming as ShareLessonInput;
    await updateLesson(entityId, {
      name: inc.n.trim() || 'Untitled lesson',
      description: inc.d,
      isExtension: inc.x === 1,
      releaseDate: inc.rd,
      examDate: inc.ed,
      timeZone: inc.tz,
      sessionFilter: inc.sf,
    });
  } else if (kind === 'note') {
    const inc = incoming as ShareNoteInput;
    await updateNote(entityId, { name: inc.n.trim() || 'Untitled note', content: inc.c });
  } else {
    const inc = incoming as ShareCardInput;
    await updateCard(entityId, {
      type: shareCardKindToType(inc.k),
      front: inc.f,
      back: inc.k === 1 ? '' : (inc.b ?? ''),
      tags: inc.g ?? [],
    });
  }
  await refreshSnapshot(kind, entityId, mapping);
}

/** Resolve a single item in place: locate it across the three buckets, act if accepting,
 *  and remove it from the row regardless (a rejected item is simply dropped, keeping the
 *  student's current version untouched). */
async function resolveOne(
  diff: PendingDiff,
  mapping: LineageIdMapping,
  ref: MergeReviewItemRef,
  accept: boolean,
): Promise<void> {
  const updates = updatesBucket(diff, ref.kind);
  const upIdx = updates.findIndex((u) => u.id === ref.entityId);
  if (upIdx >= 0) {
    const [update] = updates.splice(upIdx, 1);
    if (accept) await applyQueuedUpdate(ref.kind, update, mapping);
    return;
  }

  const removals = removalsBucket(diff, ref.kind);
  const remIdx = removals.indexOf(ref.entityId);
  if (remIdx >= 0) {
    removals.splice(remIdx, 1);
    if (accept) await deleteAdoptedEntity(ref.kind, ref.entityId, mapping);
    return;
  }

  const cIdx = diff.conflicts.findIndex((c) => c.kind === ref.kind && c.entityId === ref.entityId);
  if (cIdx >= 0) {
    const [conflict] = diff.conflicts.splice(cIdx, 1);
    if (accept) {
      if (conflict.incoming === null) await deleteAdoptedEntity(ref.kind, ref.entityId, mapping);
      else await takeIncomingConflict(ref.kind, ref.entityId, conflict.incoming, mapping);
    }
    return;
  }
}

async function resolveMergeReviewItems(
  reviewId: string,
  refs: MergeReviewItemRef[],
  accept: boolean,
): Promise<void> {
  return db.transaction('rw', MERGE_TABLES, async () => {
    const review = await db.pendingMergeReviews.get(reviewId);
    if (!review) return;
    const mapping = await db.lineageIdMappings.get(review.lineageId);
    const workingMapping = mapping ?? emptyMapping(review.lineageId, review.courseId);

    for (const ref of refs) {
      await resolveOne(review.diff, workingMapping, ref, accept);
    }

    if (mapping) await db.lineageIdMappings.put(workingMapping);

    if (diffIsEmpty(review.diff)) await db.pendingMergeReviews.delete(reviewId);
    else await db.pendingMergeReviews.put(review);
  });
}

/** Accept the given items: apply teacher updates, perform accepted removals, and take the
 *  teacher's version on accepted conflicts. Resolved items leave the review row. */
export async function acceptMergeReviewItems(reviewId: string, refs: MergeReviewItemRef[]): Promise<void> {
  return resolveMergeReviewItems(reviewId, refs, true);
}

/** Reject the given items ("keep mine"): drop them from the review row, leaving the
 *  student's current version untouched. */
export async function rejectMergeReviewItems(reviewId: string, refs: MergeReviewItemRef[]): Promise<void> {
  return resolveMergeReviewItems(reviewId, refs, false);
}

/** Accept every queued update and removal, leaving student-edited conflicts queued —
 *  the manual equivalent of `autoAcceptUpdates` for this one merge (§7.5). */
export async function acceptAllMergeReview(reviewId: string): Promise<void> {
  const review = await db.pendingMergeReviews.get(reviewId);
  if (!review) return;
  return resolveMergeReviewItems(reviewId, collectRefs(review.diff, false), true);
}

/** Reject every outstanding item, including conflicts — clears the review entirely,
 *  keeping the student's current version of everything. */
export async function rejectAllMergeReview(reviewId: string): Promise<void> {
  const review = await db.pendingMergeReviews.get(reviewId);
  if (!review) return;
  return resolveMergeReviewItems(reviewId, collectRefs(review.diff, true), false);
}
