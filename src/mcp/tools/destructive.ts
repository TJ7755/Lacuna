// The destructive/bulk tool group (Arc 2 §2.3): thin wrappers over src/db/repository.ts's
// existing snapshot/undo primitives, gated behind the 'destructive' scope. Every tool that
// removes or bulk-mutates content captures a snapshot first (where the repository offers
// one) and attaches it to the result's internal `undo` envelope field (src/mcp/types.ts) —
// never in `data`, which is what the calling agent actually sees. The bridge layer
// (a later task) reads `undo` to offer an in-app undo toast identical to the DangerZone
// pattern, then strips it before replying over IPC.
//
// `lacuna.delete_card` refuses sequence-generated cards: `deleteCards` already enforces
// this via `assertNoGeneratedCards`, thrown as a plain Error, so it is translated into a
// `conflict` McpToolError here rather than leaking as `internal`.

import type { z } from 'zod';
import * as read from '../../db/read';
import {
  deleteCards,
  snapshotCards,
  deleteLesson as repoDeleteLesson,
  snapshotLesson,
  deleteCourse as repoDeleteCourse,
  snapshotCourse,
  deleteSequence as repoDeleteSequence,
  snapshotSequence,
  setCardsSuspended,
  setCardFlag,
  rescheduleCards as repoRescheduleCards,
  deleteCourseAssessment as repoDeleteCourseAssessment,
} from '../../db/repository';
import {
  deleteOcclusion as repoDeleteOcclusion,
  snapshotOcclusion,
} from '../../db/occlusionRepository';
import {
  deleteCardContract,
  deleteCourseAssessmentContract,
  deleteCourseContract,
  deleteLessonContract,
  deleteOcclusionContract,
  deleteSequenceContract,
  rescheduleCardsContract,
  setCardsFlagContract,
  suspendCardsContract,
} from '../contracts/destructive';
import { McpToolException, type ToolDefinition, type ToolResult } from '../types';

function ok<T>(data: T, undo?: ToolResult<T>['undo']): ToolResult<T> {
  return undo !== undefined ? { data, undo } : { data };
}

function notFound(kind: string, id: string): never {
  throw new McpToolException({ kind: 'not_found', message: `${kind} "${id}" was not found.` });
}

/** Resolve card ids to existing rows, throwing not_found for anything missing. */
async function requireCards(ids: string[]): Promise<void> {
  for (const id of ids) {
    if (!(await read.getCard(id))) notFound('Card', id);
  }
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

const deleteCard: ToolDefinition<z.infer<typeof deleteCardContract.inputSchema>, { deletedCount: number }> = {
  ...deleteCardContract,
  async handler({ ids }) {
    await requireCards(ids);
    const snapshot = await snapshotCards(ids);
    try {
      await deleteCards(ids);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new McpToolException({ kind: 'conflict', message });
    }
    return ok({ deletedCount: ids.length }, { kind: 'restoreCards', snapshot });
  },
};

const suspendCards: ToolDefinition<z.infer<typeof suspendCardsContract.inputSchema>, { updatedCount: number }> = {
  ...suspendCardsContract,
  async handler({ ids, suspended }) {
    await requireCards(ids);
    const snapshot = await snapshotCards(ids);
    await setCardsSuspended(ids, suspended);
    return ok({ updatedCount: ids.length }, { kind: 'restoreCards', snapshot });
  },
};

const setCardsFlagTool: ToolDefinition<z.infer<typeof setCardsFlagContract.inputSchema>, { updatedCount: number }> = {
  ...setCardsFlagContract,
  async handler({ ids, flagged }) {
    await requireCards(ids);
    const snapshot = await snapshotCards(ids);
    await Promise.all(ids.map((id) => setCardFlag(id, flagged)));
    return ok({ updatedCount: ids.length }, { kind: 'restoreCards', snapshot });
  },
};

const rescheduleCardsTool: ToolDefinition<z.infer<typeof rescheduleCardsContract.inputSchema>, { updatedCount: number }> = {
  ...rescheduleCardsContract,
  async handler({ ids, reset, due }) {
    await requireCards(ids);
    const snapshot = await snapshotCards(ids);
    await repoRescheduleCards(ids, reset !== undefined ? { reset, due } : { due });
    return ok({ updatedCount: ids.length }, { kind: 'restoreCards', snapshot });
  },
};

// ---------------------------------------------------------------------------
// Lessons / courses / sequences
// ---------------------------------------------------------------------------

const deleteLessonTool: ToolDefinition<z.infer<typeof deleteLessonContract.inputSchema>, { id: string }> = {
  ...deleteLessonContract,
  async handler({ lessonId }) {
    const snapshot = await snapshotLesson(lessonId);
    if (!snapshot) notFound('Lesson', lessonId);
    await repoDeleteLesson(lessonId);
    return ok({ id: lessonId }, { kind: 'restoreLesson', snapshot });
  },
};

const deleteCourseTool: ToolDefinition<z.infer<typeof deleteCourseContract.inputSchema>, { id: string }> = {
  ...deleteCourseContract,
  async handler({ courseId }) {
    const snapshot = await snapshotCourse(courseId);
    if (!snapshot) notFound('Course', courseId);
    await repoDeleteCourse(courseId);
    return ok({ id: courseId }, { kind: 'restoreCourse', snapshot });
  },
};

const deleteSequenceTool: ToolDefinition<z.infer<typeof deleteSequenceContract.inputSchema>, { id: string }> = {
  ...deleteSequenceContract,
  async handler({ sequenceId }) {
    const snapshot = await snapshotSequence(sequenceId);
    if (!snapshot) notFound('Sequence', sequenceId);
    await repoDeleteSequence(sequenceId);
    return ok({ id: sequenceId }, { kind: 'restoreSequence', snapshot });
  },
};

const deleteOcclusionTool: ToolDefinition<z.infer<typeof deleteOcclusionContract.inputSchema>, { id: string }> = {
  ...deleteOcclusionContract,
  async handler({ occlusionId }) {
    const snapshot = await snapshotOcclusion(occlusionId);
    if (!snapshot) notFound('Occlusion', occlusionId);
    await repoDeleteOcclusion(occlusionId);
    return ok({ id: occlusionId }, { kind: 'restoreOcclusion', snapshot });
  },
};

const deleteCourseAssessmentTool: ToolDefinition<
  z.infer<typeof deleteCourseAssessmentContract.inputSchema>,
  { id: string }
> = {
  ...deleteCourseAssessmentContract,
  async handler({ assessmentId }) {
    const details = await read.getCourseAssessmentDetails(assessmentId);
    if (!details) notFound('Course assessment', assessmentId);
    const snapshot = await snapshotCourse(details.assessment.courseId);
    if (!snapshot) notFound('Course', details.assessment.courseId);
    try {
      await repoDeleteCourseAssessment(assessmentId);
    } catch (error) {
      throw new McpToolException({
        kind: 'conflict',
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return ok({ id: assessmentId }, { kind: 'restoreCourse', snapshot });
  },
};

/** The destructive/bulk tool group, in the order they appear in Arc 2 §2.3's inventory. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a heterogeneous tool list is necessarily ToolDefinition<any, any>; each entry above is still checked against its own concrete Input/Output.
export const DESTRUCTIVE_TOOLS: readonly ToolDefinition<any, any>[] = [
  deleteCard,
  deleteLessonTool,
  deleteCourseTool,
  deleteSequenceTool,
  deleteOcclusionTool,
  deleteCourseAssessmentTool,
  suspendCards,
  setCardsFlagTool,
  rescheduleCardsTool,
];

// Also export individually for direct handler-level unit tests.
export {
  deleteCard,
  deleteLessonTool as deleteLesson,
  deleteCourseTool as deleteCourse,
  deleteSequenceTool as deleteSequence,
  deleteOcclusionTool as deleteOcclusion,
  deleteCourseAssessmentTool as deleteCourseAssessment,
  suspendCards,
  setCardsFlagTool as setCardsFlag,
  rescheduleCardsTool as rescheduleCards,
};
