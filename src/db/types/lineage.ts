import type { CardUpdate, LessonUpdate, LineageConflict, NoteUpdate } from '../lineageDiff';
import type { Card, CardType, ItemPayload } from './card';
import type { AnswerMode, CourseAssessment, Lesson, Note } from './course';

/**
 * Adopted-id membership registry for one distributed course lineage (Arc 7 §7.2).
 * Not a translation table — adopted ids and local ids are the same value, since a
 * student's merge import adopts a teacher's originating ids directly rather than
 * generating fresh local ones. Created on first import of a lineage and consulted
 * (never mutated except to add newly-created entities) by every subsequent merge.
 */
export interface LineageIdMapping {
  /** = lineageId; one row per distributed course. */
  id: string;
  /** The local `Course` this mapping belongs to. */
  courseId: string;
  /** Originating lesson ids already adopted as local ids. */
  lessonIds: string[];
  /** Originating note ids already adopted as local ids. */
  noteIds: string[];
  /** Originating card ids already adopted as local ids. */
  cardIds: string[];
  /** Originating Concept ids carried by v3 course shares. */
  conceptIds?: string[];
  /** Originating Question ids carried by v3 course shares. */
  questionIds?: string[];
  /** Originating authored Question Set ids carried by v4 course shares. */
  questionSetIds?: string[];
  /** Last teacher-authored revision imported for each set, used to detect local edits. */
  questionSetRevisions?: Record<string, string>;
  /** Adopted published assessments and their last imported authored content. */
  assessmentIds?: string[];
  assessmentSnapshots?: Record<string, Omit<CourseAssessment, 'updatedAt'>>;
  /** Adopted optional Question Set path activity IDs from v5 shares. */
  questionSetPracticeNodeIds?: string[];
  /** Last imported authored placement, used to reject local edits on update. */
  questionSetPracticeNodeSnapshots?: Record<
    string,
    {
      questionSetIds: string[];
      afterLessonId: string;
      name: string;
    }
  >;
  /** Originating sequence ids already adopted as local ids. */
  sequenceIds: string[];
  /** Originating occlusion ids already adopted as local ids. Absent on mappings written
   *  before image occlusion existed, so readers must tolerate `undefined`. */
  occlusionIds?: string[];
  /**
   * Last-merged content snapshot for every adopted lesson/note/card, keyed by local
   * (= originating) id. `src/db/mergeImport.ts` compares an entity's *current* local
   * content against its snapshot here to detect a student edit since the last merge
   * (Arc 7 §7.10's third risk: snapshot comparison over a separate dirty flag, so
   * there is no second field that can drift out of sync with reality). Populated with
   * the just-applied content on every successful first import or merge — including for
   * entities the student's own edit left untouched, since "untouched" is exactly what a
   * matching snapshot records. Extends the v18 shape in place (see the classroom
   * distribution contract in docs/spec/portability.md) rather than a schema bump, since no index is
   * needed for these fields.
   */
  lessonSnapshots: Record<string, LineageLessonSnapshot>;
  noteSnapshots: Record<string, LineageNoteSnapshot>;
  cardSnapshots: Record<string, LineageCardSnapshot>;
}

/** The subset of a Lesson's fields `lineageDiff.ts` diffs on, captured for student-edit detection. */
export interface LineageLessonSnapshot {
  prerequisiteLessonIds?: string[];
  answerMode?: AnswerMode;
  name: string;
  description?: string;
  isExtension: boolean;
  releaseDate?: number;
  examDate?: number;
  timeZone?: string;
  sessionFilter?: 'new' | 'due' | 'mixed';
  orderIndex: number;
}

/** The subset of a Note's fields `lineageDiff.ts` diffs on. */
export interface LineageNoteSnapshot {
  name: string;
  content: string;
  orderIndex: number;
}

/** The subset of a Card's fields `lineageDiff.ts` diffs on — content only, never FSRS fields. */
export interface LineageCardSnapshot {
  answerMode?: AnswerMode;
  type: CardType;
  front: string;
  back: string;
  tags?: string[];
  /** Content only, never FSRS state — same rule as the rest of this snapshot (Arc 11). */
  payload?: ItemPayload;
}

/**
 * A queued merge decision awaiting student review (Arc 7 §7.2/§7.5). One row per
 * merge import; a new merge for the same course supersedes rather than appends to
 * the previous pending row, so the table never accumulates a history. The `diff`
 * shape reuses `src/db/lineageDiff.ts`'s update/conflict types directly (Arc 7
 * §7.3) rather than a hand-duplicated `Partial<...>` shape, so the two cannot
 * drift apart; `creates` are never persisted here since `mergeImport.ts` applies
 * them immediately and unconditionally (Arc 7 §7.5 step 2) — the array is always
 * empty when this row is written, but keeps the full entity shape so a future
 * caller is not surprised by a narrower type.
 */
export interface PendingMergeReview {
  /** Generated review id (primary key). */
  id: string;
  /** The local `Course` this review belongs to. */
  courseId: string;
  /** The lineage this merge came from; matches `CourseDistributedCopy.lineageId`. */
  lineageId: string;
  /** The incoming revision this diff corresponds to. */
  revision: number;
  diff: {
    creates: { lessons: Lesson[]; notes: Note[]; cards: Card[] };
    updates: {
      lessons: LessonUpdate[];
      notes: NoteUpdate[];
      cards: CardUpdate[];
    };
    removals: { lessonIds: string[]; noteIds: string[]; cardIds: string[] };
    /**
     * `LineageConflict` covers a content clash (both sides changed the same entity).
     * `mergeImport.ts` also queues a second, narrower kind here — a teacher removal of
     * an entity the student has edited (§7.10's unresolved-in-planning policy: treat as
     * a conflict, student's copy retained until they accept the removal) — which has no
     * incoming content to attach, hence `incoming: null` rather than reusing
     * `LineageConflict`'s non-null `incoming`.
     */
    conflicts: Array<
      LineageConflict | { entityId: string; kind: 'lesson' | 'note' | 'card'; incoming: null }
    >;
  };
  createdAt: number;
}
