import { z } from 'zod';
import type { ToolContract } from '../types';

export const diffLineageUpdateContract = {
  name: 'lacuna.diff_lineage_update',
  description:
    'Preview how a teacher\'s re-published share code compares to a course already tracking that ' +
    'lineage, without writing anything: creates/updates/removals and student-edit conflicts, exactly ' +
    'the classification the in-app review panel would show.',
  inputSchema: z.object({
    courseId: z.string().describe('The id of the locally-tracked course to diff against.'),
    shareCode: z.string().describe('The teacher\'s re-published share code to preview against this course.'),
  }),
  requiredScope: 'read',
} satisfies ToolContract;

const mergeReviewRefSchema = z.object({
  kind: z.enum(['lesson', 'note', 'card']),
  entityId: z.string(),
});

export const applyLineageUpdateContract = {
  name: 'lacuna.apply_lineage_update',
  description:
    'Apply a teacher\'s re-published share code to a course already tracking that lineage, exactly ' +
    'as the in-app review flow would: creates apply immediately, updates/removals apply or queue per ' +
    'the course\'s auto-accept setting, and student-edit conflicts always queue. Optionally pass ' +
    '`decisions` to pre-resolve specific queued items in the same call.',
  inputSchema: z.object({
    courseId: z.string().describe('The id of the locally-tracked course to update.'),
    shareCode: z.string().describe('The teacher\'s re-published share code to merge in.'),
    decisions: z.object({
      accept: z.array(mergeReviewRefSchema).optional().describe('Queued updates/removals/conflicts to accept ("take theirs").'),
      reject: z.array(mergeReviewRefSchema).optional().describe('Queued updates/removals/conflicts to reject ("keep mine").'),
    }).optional().describe('Pre-resolve specific queued items, mirroring the review panel. Anything left unresolved stays queued.'),
  }),
  requiredScope: 'write',
} satisfies ToolContract;

export const LINEAGE_TOOL_CONTRACTS = [
  diffLineageUpdateContract,
  applyLineageUpdateContract,
] as const satisfies readonly ToolContract[];
