import { jsonValuesEqual } from '@lacuna/core/db/lineageDiff';
import type {
  ExistingCard,
  ExistingLesson,
  ExistingNote,
  ShareCardInput,
  ShareLessonInput,
  ShareNoteInput,
} from '@lacuna/core/db/lineageDiff';
import type { SharePayload, SharePayloadV6 } from './share';
import type {
  Card,
  CardType,
  ItemPayload,
  Lesson,
  LineageCardSnapshot,
  LineageIdMapping,
  LineageLessonSnapshot,
  LineageNoteSnapshot,
  Note,
} from '@lacuna/core/db/types';

/** Narrowed view of the fields this module reads off a decoded course share payload. */
export type LineagePayload = SharePayloadV6 & {
  li: string;
  rv: number;
};

export type ShareCard = LineagePayload['lessons'][number]['cards'][number];

/** Type guard: a decoded payload actually carries a lineage (`li`/`rv`, §7.2). */
export function isLineagePayload(payload: SharePayload): payload is LineagePayload {
  return typeof payload.li === 'string' && typeof payload.rv === 'number';
}

/** `k` -> local `CardType`, mirroring `unpackCard`'s decode in `src/db/share.ts:771-784`
 *  exactly (including `k: 3`, the retired "typing" kind, folding to `front_back`). */
export function shareCardKindToType(k: 0 | 1 | 2 | 3): CardType {
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
export function reverseCardId(primaryId: string): string {
  return `${primaryId}::rev`;
}

/**
 * Concept identity follows the originating Card, not the locally generated Course id.
 * Lineage imports adopt that Card identity across clients, so this id converges too.
 */
export function lineageCardConceptId(sourceCardId: string): string {
  return `concept:lineage-card:${encodeURIComponent(sourceCardId)}`;
}

// ---------------------------------------------------------------------------
// Adapting the share payload shape to lineageDiff's input types.
// ShareLesson packs the originating id as `i`, ShareNote as `oi`
// (its own `i` is taken by the image-omission flag), and ShareCard's existing `id`
// field doubles as the originating card id for a published course; see share.ts).
// ---------------------------------------------------------------------------

/**
 * True for a share card that some authoring entity regenerates rather than the diff
 * owning directly. Such cards are packed into a course payload like any other (the
 * recipient of a plain share import needs them), but a lineage merge must skip them:
 * `applySequences`/`applyOcclusions` recreate them from their owning entity, so diffing
 * them as well adopts a second, stale copy under the payload's own card id.
 */
export function isGeneratedShareCard(card: ShareCard): boolean {
  return card.si !== undefined || card.oc !== undefined;
}

export function toShareLessonInput(lesson: LineagePayload['lessons'][number]): ShareLessonInput {
  if (!lesson.i) throw new Error('Lineage payload lesson is missing its originating id.');
  return {
    i: lesson.i,
    pr: lesson.pr,
    n: lesson.n,
    d: lesson.d,
    x: lesson.x,
    rd: lesson.rd,
    ed: lesson.ed,
    tz: lesson.tz,
    sf: lesson.sf,
    am: lesson.am,
    notes: lesson.notes.map((note): ShareNoteInput => {
      if (!note.oi) throw new Error('Lineage payload note is missing its originating id.');
      return { i: note.oi, n: note.n, c: note.c };
    }),
    cards: lesson.cards.filter((card) => !isGeneratedShareCard(card)).map(toShareCardInput),
  };
}

export function toShareCardInput(card: ShareCard): ShareCardInput {
  if (!card.id) throw new Error('Lineage payload card is missing its originating id.');
  return {
    i: card.id,
    k: card.k,
    f: card.f,
    b: card.b,
    g: card.g,
    p: card.p as ItemPayload | undefined,
    am: card.am,
  };
}

export function toExistingLesson(lesson: Lesson): ExistingLesson {
  return {
    id: lesson.id,
    prerequisiteLessonIds: lesson.prerequisiteLessonIds,
    name: lesson.name,
    description: lesson.description,
    isExtension: lesson.isExtension,
    releaseDate: lesson.releaseDate,
    examDate: lesson.examDate,
    timeZone: lesson.timeZone,
    sessionFilter: lesson.sessionFilter === 'new' ? undefined : lesson.sessionFilter,
    answerMode: lesson.answerMode,
    orderIndex: lesson.orderIndex,
  };
}

export function toExistingNote(note: Note): ExistingNote {
  return {
    id: note.id,
    lessonId: note.lessonId,
    name: note.name,
    content: note.content,
    orderIndex: note.orderIndex,
  };
}

export function toExistingCard(card: Card): ExistingCard {
  return {
    id: card.id,
    lessonId: card.primaryLessonId ?? null,
    type: card.type,
    front: card.front,
    back: card.back,
    tags: card.tags,
    payload: card.payload,
    answerMode: card.answerMode,
  };
}

export function lessonSnapshot(lesson: ExistingLesson): LineageLessonSnapshot {
  const { id: _id, ...rest } = lesson;
  return rest;
}

export function noteSnapshot(note: ExistingNote): LineageNoteSnapshot {
  return { name: note.name, content: note.content, orderIndex: note.orderIndex };
}

export function cardSnapshot(card: ExistingCard): LineageCardSnapshot {
  return {
    type: card.type,
    front: card.front,
    back: card.back,
    tags: card.tags,
    payload: card.payload,
    answerMode: card.answerMode,
  };
}

/**
 * Which adopted ids the student has edited since the last merge (§7.3's `studentEdits`,
 * populated per §7.10's third risk: compare current local content against the mapping's
 * last-merged snapshot rather than a separate dirty flag that could drift out of sync).
 * Only adopted (mapping-known) ids are compared. A missing baseline is unknown,
 * so differing incoming content must go through conflict review.
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
    if (
      current &&
      (!snapshot || !lessonSnapshotsEqual(snapshot, lessonSnapshot(toExistingLesson(current))))
    ) {
      edited.add(id);
    }
  }
  for (const id of mapping.noteIds) {
    const snapshot = mapping.noteSnapshots[id];
    const current = notesById.get(id);
    if (
      current &&
      (!snapshot || !noteSnapshotsEqual(snapshot, noteSnapshot(toExistingNote(current))))
    ) {
      edited.add(id);
    }
  }
  for (const id of mapping.cardIds) {
    const snapshot = mapping.cardSnapshots[id];
    const current = cardsById.get(id);
    if (
      current &&
      (!snapshot || !cardSnapshotsEqual(snapshot, cardSnapshot(toExistingCard(current))))
    ) {
      edited.add(id);
    }
  }
  return edited;
}

function lessonSnapshotsEqual(a: LineageLessonSnapshot, b: LineageLessonSnapshot): boolean {
  return (
    tagsEqual(
      [...(a.prerequisiteLessonIds ?? [])].sort(),
      [...(b.prerequisiteLessonIds ?? [])].sort(),
    ) &&
    a.name === b.name &&
    a.description === b.description &&
    a.isExtension === b.isExtension &&
    a.releaseDate === b.releaseDate &&
    a.examDate === b.examDate &&
    a.timeZone === b.timeZone &&
    a.sessionFilter === b.sessionFilter &&
    a.answerMode === b.answerMode &&
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
  return (
    a.type === b.type &&
    a.front === b.front &&
    a.back === b.back &&
    tagsEqual(a.tags, b.tags) &&
    a.answerMode === b.answerMode &&
    jsonValuesEqual(a.payload, b.payload)
  );
}

/** Empty membership/snapshot registry for a brand-new lineage mapping row. */
export function emptyMapping(lineageId: string, courseId: string): LineageIdMapping {
  return {
    id: lineageId,
    courseId,
    lessonIds: [],
    noteIds: [],
    cardIds: [],
    conceptIds: [],
    questionIds: [],
    questionSetIds: [],
    questionSetRevisions: {},
    assessmentIds: [],
    assessmentSnapshots: {},
    sequenceIds: [],
    occlusionIds: [],
    lessonSnapshots: {},
    noteSnapshots: {},
    cardSnapshots: {},
  };
}

export function incomingCardConceptIds(payload: LineagePayload): Map<string, string> {
  const result = new Map<string, string>();
  for (const card of [
    ...payload.lessons.flatMap((lesson) => lesson.cards),
    ...(payload.bankCards ?? []),
  ]) {
    if (!card.id || !card.co || isGeneratedShareCard(card)) continue;
    result.set(card.id, card.co);
    if (card.k === 2) result.set(reverseCardId(card.id), card.co);
  }
  return result;
}
