// Arc 7 classroom-distribution merge tools (next_plan.md §7.6, Task 10). Two additive
// tools sitting on top of the merge machinery `src/db/mergeImport.ts` (Task 5) and
// `src/db/lineageDiff.ts` (Task 3) already own:
//
// - `lacuna.diff_lineage_update` — read-tier, no-write preview. Gathers the course's
//   current lessons/notes/cards via read-only Dexie queries, adapts them to
//   `lineageDiff.ts`'s pure input shapes exactly as `mergeLineageUpdate` does, and calls
//   the same exported `diffLineage` + `detectStudentEdits` classification it uses —
//   never a second, independent classifier. The two small field-adapter functions below
//   (`toShareLessonInput`/`toExisting*`) are intentionally duplicated from
//   `mergeImport.ts` rather than imported: they are mechanical type coercions, not
//   classification logic, exactly the same shape as `lacuna.diff_import_preview`
//   (`src/mcp/tools/import.ts`) independently gathering existing cards via `read.ts`
//   rather than reusing `import_cards`' internals. Only `detectStudentEdits` itself
//   (the one piece of real classification logic outside `lineageDiff.ts`) is imported,
//   via a one-line export `mergeImport.ts` added for this purpose.
// - `lacuna.apply_lineage_update` — write-tier, consent-gated. Calls `mergeLineageUpdate`
//   directly (never a parallel apply path), then optionally resolves specific queued
//   items via the existing `acceptMergeReviewItems`/`rejectMergeReviewItems` review-
//   resolution functions when the caller supplies `decisions` — the same functions the
//   in-app `MergeReviewPanel` calls, so an agent's outcome matches the UI path exactly.

import { z } from 'zod';
import { db } from '../../db/schema';
import * as read from '../../db/read';
import { decodeShare } from '../../db/share';
import {
  acceptMergeReviewItems,
  detectStudentEdits,
  isLineagePayload,
  mergeLineageUpdate,
  rejectMergeReviewItems,
  type MergeLineageResult,
  type MergeReviewItemRef,
} from '../../db/mergeImport';
import {
  diffLineage,
  type ExistingCard,
  type ExistingLesson,
  type ExistingNote,
  type LineageDiffInput,
  type LineageDiffResult,
  type ShareCardInput,
  type ShareLessonInput,
  type ShareNoteInput,
} from '../../db/lineageDiff';
import type { Card, Lesson, LineageIdMapping, Note } from '../../db/types';
import { McpToolException, type ToolDefinition, type ToolResult } from '../types';

function ok<T>(data: T): ToolResult<T> {
  return { data };
}

function notFound(kind: string, id: string): never {
  throw new McpToolException({ kind: 'not_found', message: `${kind} "${id}" was not found.` });
}

// ---------------------------------------------------------------------------
// Field adapters — mirrors src/db/mergeImport.ts's own (unexported) toShareLessonInput/
// toExistingLesson/toExistingNote/toExistingCard. Deliberately duplicated, see the module
// doc comment above.
// ---------------------------------------------------------------------------

function toShareLessonInput(lesson: Extract<Awaited<ReturnType<typeof decodeShare>>, { v: 2 }>['lessons'][number]): ShareLessonInput {
  if (!lesson.i) throw new McpToolException({ kind: 'validation', message: 'Lineage payload lesson is missing its originating id.' });
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
      if (!note.oi) throw new McpToolException({ kind: 'validation', message: 'Lineage payload note is missing its originating id.' });
      return { i: note.oi, n: note.n, c: note.c };
    }),
    cards: lesson.cards.map((card): ShareCardInput => {
      if (!card.id) throw new McpToolException({ kind: 'validation', message: 'Lineage payload card is missing its originating id.' });
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

/** Empty membership/snapshot registry for a lineage this course has not merged before —
 *  mirrors `mergeImport.ts`'s own `emptyMapping`, needed here only as a fallback default. */
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

// ---------------------------------------------------------------------------
// lacuna.diff_lineage_update
// ---------------------------------------------------------------------------

const diffLineageUpdateSchema = z.object({
  courseId: z.string().describe('The id of the locally-tracked course to diff against.'),
  shareCode: z.string().describe('The teacher\'s re-published share code to preview against this course.'),
});

interface LineageDiffSummary {
  counts: {
    createLessons: number;
    createNotes: number;
    createCards: number;
    updateLessons: number;
    updateNotes: number;
    updateCards: number;
    removeLessons: number;
    removeNotes: number;
    removeCards: number;
    conflicts: number;
  };
  diff: LineageDiffResult;
}

function summariseDiff(diff: LineageDiffResult): LineageDiffSummary {
  return {
    counts: {
      createLessons: diff.creates.lessons.length,
      createNotes: diff.creates.notes.length,
      createCards: diff.creates.cards.length,
      updateLessons: diff.updates.lessons.length,
      updateNotes: diff.updates.notes.length,
      updateCards: diff.updates.cards.length,
      removeLessons: diff.removals.lessonIds.length,
      removeNotes: diff.removals.noteIds.length,
      removeCards: diff.removals.cardIds.length,
      conflicts: diff.conflicts.length,
    },
    diff,
  };
}

const diffLineageUpdate: ToolDefinition<z.infer<typeof diffLineageUpdateSchema>, LineageDiffSummary> = {
  name: 'lacuna.diff_lineage_update',
  description:
    'Preview how a teacher\'s re-published share code compares to a course already tracking that ' +
    'lineage, without writing anything: creates/updates/removals and student-edit conflicts, exactly ' +
    'the classification the in-app review panel would show.',
  inputSchema: diffLineageUpdateSchema,
  requiredScope: 'read',
  async handler({ courseId, shareCode }) {
    const course = await read.getCourse(courseId);
    if (!course) notFound('Course', courseId);

    const payload = await decodeShare(shareCode);
    if (!isLineagePayload(payload)) {
      throw new McpToolException({ kind: 'validation', message: 'Share code does not carry a course lineage.' });
    }
    if (!course.distributedCopy || course.distributedCopy.lineageId !== payload.li) {
      throw new McpToolException({
        kind: 'conflict',
        message: `Course "${courseId}" is not an imported copy of this lineage.`,
      });
    }

    const [existingLessons, courseCards] = await Promise.all([
      db.lessons.where('courseId').equals(courseId).toArray(),
      db.cards.where('courseId').equals(courseId).toArray(),
    ]);
    const lessonIds = existingLessons.map((l) => l.id);
    const existingNotes = lessonIds.length
      ? await db.notes.where('lessonId').anyOf(lessonIds).toArray()
      : [];

    const mapping = (await db.lineageIdMappings.get(payload.li)) ?? emptyMapping(payload.li, courseId);
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

    return ok(summariseDiff(diffLineage(diffInput)));
  },
};

// ---------------------------------------------------------------------------
// lacuna.apply_lineage_update
// ---------------------------------------------------------------------------

const mergeReviewRefSchema = z.object({
  kind: z.enum(['lesson', 'note', 'card']),
  entityId: z.string(),
});

const applyLineageUpdateSchema = z.object({
  courseId: z.string().describe('The id of the locally-tracked course to update.'),
  shareCode: z.string().describe('The teacher\'s re-published share code to merge in.'),
  decisions: z
    .object({
      accept: z.array(mergeReviewRefSchema).optional().describe('Queued updates/removals/conflicts to accept ("take theirs").'),
      reject: z.array(mergeReviewRefSchema).optional().describe('Queued updates/removals/conflicts to reject ("keep mine").'),
    })
    .optional()
    .describe('Pre-resolve specific queued items, mirroring the review panel. Anything left unresolved stays queued.'),
});

interface ApplyLineageUpdateResult {
  merge: MergeLineageResult;
  queuedForReview: boolean;
  reviewId: string | null;
}

const applyLineageUpdate: ToolDefinition<z.infer<typeof applyLineageUpdateSchema>, ApplyLineageUpdateResult> = {
  name: 'lacuna.apply_lineage_update',
  description:
    'Apply a teacher\'s re-published share code to a course already tracking that lineage, exactly ' +
    'as the in-app review flow would: creates apply immediately, updates/removals apply or queue per ' +
    'the course\'s auto-accept setting, and student-edit conflicts always queue. Optionally pass ' +
    '`decisions` to pre-resolve specific queued items in the same call.',
  inputSchema: applyLineageUpdateSchema,
  requiredScope: 'write',
  async handler({ courseId, shareCode, decisions }) {
    const course = await read.getCourse(courseId);
    if (!course) notFound('Course', courseId);

    const payload = await decodeShare(shareCode);
    if (!isLineagePayload(payload)) {
      throw new McpToolException({ kind: 'validation', message: 'Share code does not carry a course lineage.' });
    }

    const merge = await mergeLineageUpdate(courseId, payload);

    let review = merge.queuedForReview
      ? await db.pendingMergeReviews.where('courseId').equals(courseId).first()
      : undefined;

    if (review && decisions) {
      if (decisions.accept?.length) {
        await acceptMergeReviewItems(review.id, decisions.accept as MergeReviewItemRef[]);
      }
      if (decisions.reject?.length) {
        await rejectMergeReviewItems(review.id, decisions.reject as MergeReviewItemRef[]);
      }
      review = await db.pendingMergeReviews.get(review.id);
    }

    return ok({ merge, queuedForReview: review !== undefined, reviewId: review?.id ?? null });
  },
};

/** The lineage-merge MCP tools, in §7.6's inventory order. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see src/mcp/tools/read.ts's READ_TOOLS comment.
export const LINEAGE_TOOLS: readonly ToolDefinition<any, any>[] = [diffLineageUpdate, applyLineageUpdate];

// Also export individually for direct handler-level unit tests.
export { diffLineageUpdate, applyLineageUpdate };
