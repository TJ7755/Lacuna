import { z } from 'zod';
import type { ToolContract } from '../types';

const importItemSchema = z.object({
  front: z.string().describe('Markdown source for the question/prompt side.'),
  back: z.string().describe('Markdown source for the answer side.'),
  lessonId: z.string().optional().describe('If given, the card belongs to this lesson; otherwise the course question bank.'),
  tags: z.array(z.string()).optional().describe('Free-text tags.'),
});

const importSchema = z.object({
  courseId: z.string().describe('The id of the course to diff against.'),
  items: z.array(importItemSchema).describe('Proposed cards to compare against existing content.'),
});

export const diffImportPreviewContract = {
  name: 'lacuna.diff_import_preview',
  description:
    'Preview how a batch of proposed cards compares to a course\'s existing cards, without writing ' +
    'anything: which are new (toCreate), which already exist verbatim (toSkip), and which share a ' +
    'question but have different content (toUpdate, apply manually via lacuna.update_card).',
  inputSchema: importSchema,
  requiredScope: 'read',
} satisfies ToolContract;

export const importCardsContract = {
  name: 'lacuna.import_cards',
  description:
    'Import a batch of proposed cards into a course: creates cards that are new, skips ones that ' +
    'already exist verbatim, and reports (without applying) any that share a question but have ' +
    'different content. Safe to re-run with the same payload — the second call creates nothing new.',
  inputSchema: importSchema,
  requiredScope: 'write',
} satisfies ToolContract;

export const IMPORT_TOOL_CONTRACTS = [
  diffImportPreviewContract,
  importCardsContract,
] as const satisfies readonly ToolContract[];
