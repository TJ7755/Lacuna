/**
 * Pure diff engine for Arc 7's classroom-distribution merge path (next_plan.md §7.3).
 *
 * Generalises `diffRegeneration`'s shape (`sequenceGeneration.ts:217`) — "one sequence's
 * cards, keyed on the stable `sequenceItemId`" — to "a lineage's lessons, notes, and
 * cards, keyed on the stable originating id (`i`) that Arc 7 adopts directly as the local
 * id (§7.1's id-adoption decision)". No Dexie import, no React, no UI: this module only
 * classifies; `src/db/mergeImport.ts` (Task 5) owns applying the result and deciding
 * apply-vs-queue policy.
 *
 * Sequences are explicitly out of scope (§7.1/§7.3's final bullet) — sequence-shaped
 * payload items are handed to the existing `diffRegeneration` unmodified by the caller,
 * never diffed here.
 */

import type { CardType } from './types';

// --- Incoming payload shapes -----------------------------------------------------------
//
// Mirrors the `i`-bearing `ShareCard`/`ShareNote`/`ShareLesson` extension described in
// next_plan.md §7.2, defined locally per this task's brief (Task 3 lands the real
// zod-schema versions in `src/db/share.ts`; these are structurally compatible so that
// reconciliation there is a type-only rename, not a shape change).

export interface ShareCardInput {
  /** Originating id — always present for a lineage-bearing merge (§7.2: "`i` is
   *  populated only when `li` is present", and this module is only ever invoked on the
   *  merge path, where `li` is present by construction). */
  i: string;
  k: 0 | 1 | 2 | 3;
  f: string;
  b?: string;
  g?: string[];
}

export interface ShareNoteInput {
  i: string;
  n: string;
  c: string;
}

export interface ShareLessonInput {
  i: string;
  n: string;
  d?: string;
  x?: 0 | 1;
  rd?: number;
  ed?: number;
  tz?: string;
  sf?: 'due' | 'mixed';
  notes: ShareNoteInput[];
  cards: ShareCardInput[];
}

// --- Existing local state ---------------------------------------------------------------
//
// Minimal local shapes the diff needs, kept structurally compatible with `src/db/types.ts`'s
// `Lesson`/`Note`/`Card` (this module deliberately does not import those value-bearing
// interfaces beyond `CardType`, so it never depends on FSRS/scheduling fields it must not
// touch).

export interface ExistingLesson {
  id: string;
  name: string;
  description?: string;
  isExtension: boolean;
  releaseDate?: number;
  examDate?: number;
  timeZone?: string;
  sessionFilter?: 'new' | 'due' | 'mixed';
  orderIndex: number;
}

export interface ExistingNote {
  id: string;
  lessonId: string;
  name: string;
  content: string;
  orderIndex: number;
}

export interface ExistingCard {
  id: string;
  type: CardType;
  front: string;
  back: string;
  tags?: string[];
}

/**
 * The adopted-id membership registry (next_plan.md §7.2's `LineageIdMapping`), defined
 * locally per this task's brief — Task 1 lands the real Dexie-schema version in
 * `src/db/types.ts`/`src/db/schema.ts`. Purely a membership check ("has this id already
 * been adopted"), never a translation table, since incoming id and local id are the same
 * value by construction (§7.1).
 */
export interface LineageIdMapping {
  id: string;
  courseId: string;
  lessonIds: string[];
  noteIds: string[];
  cardIds: string[];
  sequenceIds: string[];
}

export interface LineageDiffInput {
  incoming: { lessons: ShareLessonInput[] };
  existing: { lessons: ExistingLesson[]; notes: ExistingNote[]; cards: ExistingCard[] };
  mapping: LineageIdMapping;
  /** Local ids the student has touched since the last merge (§7.5's apply/queue split
   *  reads this too, but classification into `updates` vs `conflicts` happens here). */
  studentEdits: Set<string>;
}

// --- Result shapes ------------------------------------------------------------------------
//
// Create payloads intentionally omit fields the diff module cannot derive purely
// (`createdAt`, `courseId`, `deckId`, generated `lessonId` for notes/cards belonging to a
// newly created lesson) — exactly the precedent `diffRegeneration`'s `GeneratedCardPayload`
// sets by omitting `createdAt` and leaving deck/course wiring to the repository layer
// (`ensureLessonDeck`, `share.ts:1132`). The adopted id (`i`, §7.1) is the one field this
// module *does* supply, since it is fully determined by the incoming payload.

export interface CreateLessonPayload {
  id: string;
  name: string;
  description?: string;
  isExtension: boolean;
  releaseDate?: number;
  examDate?: number;
  timeZone?: string;
  sessionFilter?: 'new' | 'due' | 'mixed';
  orderIndex: number;
}

export interface CreateNotePayload {
  id: string;
  /** The adopted id of the lesson this note belongs to (may itself be a fresh create). */
  lessonId: string;
  name: string;
  content: string;
  orderIndex: number;
}

export interface CreateCardPayload {
  id: string;
  /** The adopted id of the lesson this card belongs to (may itself be a fresh create). */
  lessonId: string;
  type: CardType;
  front: string;
  back: string;
  tags?: string[];
}

export interface LessonUpdate {
  id: string;
  name?: string;
  description?: string;
  isExtension?: boolean;
  releaseDate?: number;
  examDate?: number;
  timeZone?: string;
  sessionFilter?: 'new' | 'due' | 'mixed';
  orderIndex?: number;
}

export interface NoteUpdate {
  id: string;
  name?: string;
  content?: string;
  orderIndex?: number;
}

/** Strict subset of `Card` excluding every FSRS/scheduling field (state, stability,
 *  difficulty, due, reps, lapses, history, etc.) — mirrors `diffRegeneration`'s
 *  `GeneratedCardUpdate` exactly (§7.3's final classification bullet). */
export interface CardUpdate {
  id: string;
  type?: CardType;
  front?: string;
  back?: string;
  tags?: string[];
}

export interface LineageConflict {
  entityId: string;
  kind: 'lesson' | 'note' | 'card';
  /** The incoming (teacher's) version, attached for review; the student's local version
   *  is left untouched by this module and by the caller (§7.5's conflicts bullet). */
  incoming: ShareLessonInput | ShareNoteInput | ShareCardInput;
}

export interface LineageDiffResult {
  creates: { lessons: CreateLessonPayload[]; notes: CreateNotePayload[]; cards: CreateCardPayload[] };
  updates: { lessons: LessonUpdate[]; notes: NoteUpdate[]; cards: CardUpdate[] };
  removals: { lessonIds: string[]; noteIds: string[]; cardIds: string[] };
  conflicts: LineageConflict[];
}

// --- Classification -------------------------------------------------------------------

/**
 * Maps a `ShareCard.k` discriminant to the local `CardType` (mirrors `share.ts`'s decode
 * logic at `share.ts:748-758`). `k: 3` ("typing", retired) decodes to `front_back`, same as
 * the existing importer. `k: 2` (reversible) is the *primary* direction's type; the
 * paired reverse card is a deterministically derived entity (like a sequence-generated
 * card) and is out of this module's scope for the same reason sequences are (§7.1/§7.3) —
 * it is regenerated by the caller from the primary card, never diffed independently here.
 */
function shareCardKindToType(k: 0 | 1 | 2 | 3): CardType {
  if (k === 1) return 'cloze';
  if (k === 2) return 'basic_reversed';
  return 'front_back';
}

function arraysEqual<T>(a: T[] | undefined, b: T[] | undefined): boolean {
  const x = a ?? [];
  const y = b ?? [];
  if (x.length !== y.length) return false;
  return x.every((v, i) => v === y[i]);
}

function diffLesson(incoming: ShareLessonInput, existing: ExistingLesson, orderIndex: number): LessonUpdate | undefined {
  const update: LessonUpdate = { id: existing.id };
  let changed = false;
  if (existing.name !== incoming.n) {
    update.name = incoming.n;
    changed = true;
  }
  if (existing.description !== incoming.d) {
    update.description = incoming.d;
    changed = true;
  }
  const incomingIsExtension = incoming.x === 1;
  if (existing.isExtension !== incomingIsExtension) {
    update.isExtension = incomingIsExtension;
    changed = true;
  }
  if (existing.releaseDate !== incoming.rd) {
    update.releaseDate = incoming.rd;
    changed = true;
  }
  if (existing.examDate !== incoming.ed) {
    update.examDate = incoming.ed;
    changed = true;
  }
  if (existing.timeZone !== incoming.tz) {
    update.timeZone = incoming.tz;
    changed = true;
  }
  if (existing.sessionFilter !== incoming.sf) {
    update.sessionFilter = incoming.sf;
    changed = true;
  }
  if (existing.orderIndex !== orderIndex) {
    update.orderIndex = orderIndex;
    changed = true;
  }
  return changed ? update : undefined;
}

function diffNote(incoming: ShareNoteInput, existing: ExistingNote, orderIndex: number): NoteUpdate | undefined {
  const update: NoteUpdate = { id: existing.id };
  let changed = false;
  if (existing.name !== incoming.n) {
    update.name = incoming.n;
    changed = true;
  }
  if (existing.content !== incoming.c) {
    update.content = incoming.c;
    changed = true;
  }
  if (existing.orderIndex !== orderIndex) {
    update.orderIndex = orderIndex;
    changed = true;
  }
  return changed ? update : undefined;
}

function diffCard(incoming: ShareCardInput, existing: ExistingCard): CardUpdate | undefined {
  const update: CardUpdate = { id: existing.id };
  let changed = false;
  const incomingType = shareCardKindToType(incoming.k);
  if (existing.type !== incomingType) {
    update.type = incomingType;
    changed = true;
  }
  if (existing.front !== incoming.f) {
    update.front = incoming.f;
    changed = true;
  }
  const incomingBack = incoming.b ?? '';
  if (existing.back !== incomingBack) {
    update.back = incomingBack;
    changed = true;
  }
  if (!arraysEqual(existing.tags, incoming.g)) {
    update.tags = incoming.g;
    changed = true;
  }
  return changed ? update : undefined;
}

/**
 * Diff an incoming lineage payload against the current local state of a distributed
 * course. Keyed exclusively on the mapping's adopted local ids (never array position or
 * content matching), exactly as `diffRegeneration` is keyed on `sequenceItemId`.
 *
 * Classification (§7.3):
 *  - id only in incoming                                     -> creates
 *  - id in both, content differs, id not in `studentEdits`    -> updates
 *  - id in both, content differs, id in `studentEdits`        -> conflicts (local left as-is)
 *  - id in both, content identical                            -> no-op, regardless of
 *    `studentEdits` (a student edit that reproduces the incoming content, or an incoming
 *    payload that never touched a student-edited entity, has nothing to reconcile)
 *  - id only in existing (present locally, absent incoming)   -> removals
 *
 * Sequences are entirely out of scope — see the module doc comment.
 */
export function diffLineage(input: LineageDiffInput): LineageDiffResult {
  const { incoming, existing, mapping, studentEdits } = input;

  const lessonIdSet = new Set(mapping.lessonIds);
  const noteIdSet = new Set(mapping.noteIds);
  const cardIdSet = new Set(mapping.cardIds);

  const existingLessonsById = new Map(existing.lessons.map((l) => [l.id, l]));
  const existingNotesById = new Map(existing.notes.map((n) => [n.id, n]));
  const existingCardsById = new Map(existing.cards.map((c) => [c.id, c]));

  const creates: LineageDiffResult['creates'] = { lessons: [], notes: [], cards: [] };
  const updates: LineageDiffResult['updates'] = { lessons: [], notes: [], cards: [] };
  const removals: LineageDiffResult['removals'] = { lessonIds: [], noteIds: [], cardIds: [] };
  const conflicts: LineageConflict[] = [];

  const seenLessonIds = new Set<string>();
  const seenNoteIds = new Set<string>();
  const seenCardIds = new Set<string>();

  incoming.lessons.forEach((incomingLesson, lessonOrderIndex) => {
    seenLessonIds.add(incomingLesson.i);
    const isKnownLesson = lessonIdSet.has(incomingLesson.i);
    const existingLesson = existingLessonsById.get(incomingLesson.i);

    if (!isKnownLesson || !existingLesson) {
      creates.lessons.push({
        id: incomingLesson.i,
        name: incomingLesson.n,
        description: incomingLesson.d,
        isExtension: incomingLesson.x === 1,
        releaseDate: incomingLesson.rd,
        examDate: incomingLesson.ed,
        timeZone: incomingLesson.tz,
        sessionFilter: incomingLesson.sf,
        orderIndex: lessonOrderIndex,
      });
    } else {
      const update = diffLesson(incomingLesson, existingLesson, lessonOrderIndex);
      if (update) {
        if (studentEdits.has(incomingLesson.i)) {
          conflicts.push({ entityId: incomingLesson.i, kind: 'lesson', incoming: incomingLesson });
        } else {
          updates.lessons.push(update);
        }
      }
    }

    incomingLesson.notes.forEach((incomingNote, noteOrderIndex) => {
      seenNoteIds.add(incomingNote.i);
      const isKnownNote = noteIdSet.has(incomingNote.i);
      const existingNote = existingNotesById.get(incomingNote.i);

      if (!isKnownNote || !existingNote) {
        creates.notes.push({
          id: incomingNote.i,
          lessonId: incomingLesson.i,
          name: incomingNote.n,
          content: incomingNote.c,
          orderIndex: noteOrderIndex,
        });
      } else {
        const update = diffNote(incomingNote, existingNote, noteOrderIndex);
        if (update) {
          if (studentEdits.has(incomingNote.i)) {
            conflicts.push({ entityId: incomingNote.i, kind: 'note', incoming: incomingNote });
          } else {
            updates.notes.push(update);
          }
        }
      }
    });

    incomingLesson.cards.forEach((incomingCard) => {
      seenCardIds.add(incomingCard.i);
      const isKnownCard = cardIdSet.has(incomingCard.i);
      const existingCard = existingCardsById.get(incomingCard.i);

      if (!isKnownCard || !existingCard) {
        creates.cards.push({
          id: incomingCard.i,
          lessonId: incomingLesson.i,
          type: shareCardKindToType(incomingCard.k),
          front: incomingCard.f,
          back: incomingCard.b ?? '',
          tags: incomingCard.g,
        });
      } else {
        const update = diffCard(incomingCard, existingCard);
        if (update) {
          if (studentEdits.has(incomingCard.i)) {
            conflicts.push({ entityId: incomingCard.i, kind: 'card', incoming: incomingCard });
          } else {
            updates.cards.push(update);
          }
        }
      }
    });
  });

  for (const lesson of existing.lessons) {
    if (!seenLessonIds.has(lesson.id)) removals.lessonIds.push(lesson.id);
  }
  for (const note of existing.notes) {
    if (!seenNoteIds.has(note.id)) removals.noteIds.push(note.id);
  }
  for (const card of existing.cards) {
    if (!seenCardIds.has(card.id)) removals.cardIds.push(card.id);
  }

  return { creates, updates, removals, conflicts };
}
