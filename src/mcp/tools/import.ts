// The diff/preview and import tools (Arc 2 §2.3): the agent-facing surface for
// src/mcp/diffImport.ts's pure classification. `lacuna.diff_import_preview` writes
// nothing (requiredScope 'read'); `lacuna.import_cards` actually creates the `toCreate`
// items and reports the rest, so re-running it with the same payload creates nothing new
// — the "re-run safely" shape the script-to-sequence and lecture-notes-diff use cases need.
//
// Cards already in the target lesson (if given) or the course's question bank are the
// comparison set — matching diffImport's `ExistingCardForDiff` shape via
// src/db/read.ts's listCardsForCourse/listCardsForLesson.

import type { z } from 'zod';
import * as read from '../../db/read';
import { createCourseCard, createLessonCard } from '../../db/repository';
import { diffImportPreviewContract, importCardsContract } from '../contracts/import';
import { diffImport, type ExistingCardForDiff, type ProposedImportItem } from '../diffImport';
import { McpToolException, type ToolDefinition, type ToolResult } from '../types';

function ok<T>(data: T): ToolResult<T> {
  return { data };
}

function notFound(kind: string, id: string): never {
  throw new McpToolException({ kind: 'not_found', message: `${kind} "${id}" was not found.` });
}

interface DiffSummary {
  toCreate: ProposedImportItem[];
  toSkip: ProposedImportItem[];
  toUpdate: { item: ProposedImportItem; existingCardId: string; backChanged: boolean; tagsChanged: boolean }[];
}

/** Gather the existing cards relevant to a diff: every card in the course, so items
 * targeting any lesson (or the question bank) are compared against the right set. */
async function existingCardsForCourse(courseId: string): Promise<ExistingCardForDiff[]> {
  const cards = await read.listCardsForCourse(courseId);
  return cards.map((card) => ({
    id: card.id,
    front: card.front,
    back: card.back,
    tags: card.tags,
    lessonId: card.primaryLessonId ?? null,
  }));
}

async function runDiff(courseId: string, items: ProposedImportItem[]): Promise<DiffSummary> {
  if (!(await read.getCourse(courseId))) notFound('Course', courseId);
  for (const item of items) {
    if (item.lessonId !== undefined && !(await read.getLesson(item.lessonId))) {
      notFound('Lesson', item.lessonId);
    }
  }
  const existing = await existingCardsForCourse(courseId);
  return diffImport(existing, items);
}

const diffImportPreview: ToolDefinition<z.infer<typeof diffImportPreviewContract.inputSchema>, DiffSummary> = {
  ...diffImportPreviewContract,
  async handler({ courseId, items }) {
    return ok(await runDiff(courseId, items));
  },
};

interface ImportResult {
  createdIds: string[];
  createdCount: number;
  skippedCount: number;
  toUpdate: DiffSummary['toUpdate'];
}
const importCards: ToolDefinition<z.infer<typeof importCardsContract.inputSchema>, ImportResult> = {
  ...importCardsContract,
  async handler({ courseId, items }) {
    const { toCreate, toSkip, toUpdate } = await runDiff(courseId, items);
    const createdIds: string[] = [];
    for (const item of toCreate) {
      const card = item.lessonId
        ? await createLessonCard(courseId, item.lessonId, 'front_back', item.front, item.back, item.tags)
        : await createCourseCard(courseId, 'front_back', item.front, item.back, item.tags);
      createdIds.push(card.id);
    }
    return ok({ createdIds, createdCount: createdIds.length, skippedCount: toSkip.length, toUpdate });
  },
};

/** The diff/preview and import tools, in the order they appear in Arc 2 §2.3's inventory. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a heterogeneous tool list is necessarily ToolDefinition<any, any>; each entry above is still checked against its own concrete Input/Output.
export const IMPORT_TOOLS: readonly ToolDefinition<any, any>[] = [diffImportPreview, importCards];

// Also export individually for direct handler-level unit tests.
export { diffImportPreview, importCards };
