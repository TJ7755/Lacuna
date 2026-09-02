import { z } from 'zod';
import {
  AGENT_MEMORY_CONTENT_LIMIT,
  AGENT_MEMORY_IDENTIFIER_LIMIT,
  AGENT_MEMORY_PROVENANCE_ID_LIMIT,
  AGENT_MEMORY_QUERY_LIMIT,
  AGENT_MEMORY_REFERENCE_KINDS,
  AGENT_MEMORY_REFERENCE_LABEL_LIMIT,
  AGENT_MEMORY_REFERENCE_LIMIT,
  AGENT_MEMORY_RESULT_LIMIT,
  AGENT_MEMORY_STATUSES,
  AGENT_MEMORY_TAGS,
  AGENT_MEMORY_BASES,
} from '../../agentMemoryContract';
import type { ToolContract } from '../types';

const identifierSchema = z.string().trim().min(1).max(AGENT_MEMORY_IDENTIFIER_LIMIT);
const provenanceIdSchema = identifierSchema.max(AGENT_MEMORY_PROVENANCE_ID_LIMIT);
const globalScopeSchema = z.object({ kind: z.literal('global') }).strict();
const courseScopeSchema = z.object({ kind: z.literal('course'), courseId: identifierSchema }).strict();
export const memoryScopeSchema = z.discriminatedUnion('kind', [globalScopeSchema, courseScopeSchema]);
const tagSchema = z.enum(AGENT_MEMORY_TAGS);
const statusSchema = z.enum(AGENT_MEMORY_STATUSES);
const basisSchema = z.enum(AGENT_MEMORY_BASES);
const referenceSchema = z.object({
  kind: z.enum(AGENT_MEMORY_REFERENCE_KINDS),
  id: identifierSchema,
  label: z.string().trim().min(1).max(AGENT_MEMORY_REFERENCE_LABEL_LIMIT),
}).strict();
const provenanceSchema = z.object({
  conversationId: provenanceIdSchema.optional(),
  messageId: provenanceIdSchema.optional(),
}).strict();
const tagsSchema = z.array(tagSchema).min(1).max(AGENT_MEMORY_TAGS.length)
  .refine((tags) => new Set(tags).size === tags.length, 'Memory tags must be unique.');
const referencesSchema = z.array(referenceSchema).max(AGENT_MEMORY_REFERENCE_LIMIT);

export const searchMemoriesContract = {
  name: 'lacuna.search_memories',
  description:
    'Search relevant learner-correctable memories in one explicit global or Course scope. ' +
    'Results exclude expired session memories and are ordered by most recent evidence.',
  inputSchema: z.object({
    scope: memoryScopeSchema,
    query: z.string().max(AGENT_MEMORY_QUERY_LIMIT).optional(),
    tags: z.array(tagSchema).max(AGENT_MEMORY_TAGS.length).optional(),
    statuses: z.array(statusSchema).max(AGENT_MEMORY_STATUSES.length).optional(),
    limit: z.number().int().min(1).max(AGENT_MEMORY_RESULT_LIMIT).optional(),
  }).strict(),
  requiredScope: 'read',
} satisfies ToolContract;

export const createMemoryContract = {
  name: 'lacuna.create_memory',
  description:
    'Create bounded, learner-correctable teaching context from stated, inferred or observed ' +
    'evidence. Global memories cannot reference Course content.',
  inputSchema: z.object({
    scope: memoryScopeSchema,
    tags: tagsSchema,
    status: statusSchema.optional(),
    content: z.string().trim().min(1).max(AGENT_MEMORY_CONTENT_LIMIT),
    references: referencesSchema.optional(),
    basis: basisSchema,
    provenance: provenanceSchema.optional(),
    expiresAt: z.number().int().nonnegative().optional(),
  }).strict().superRefine((input, context) => {
    if (input.tags.includes('session') && input.expiresAt === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'Session memories require expiresAt.' });
    }
    if (input.scope.kind === 'global' && (input.references?.length ?? 0) > 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['references'], message: 'Global memories cannot reference Course content.' });
    }
  }),
  requiredScope: 'write',
} satisfies ToolContract;

export const updateMemoryContract = {
  name: 'lacuna.update_memory',
  description: 'Correct evidence, status or wording for one learner memory without moving its immutable scope.',
  inputSchema: z.object({
    memoryId: identifierSchema,
    tags: tagsSchema.optional(),
    status: statusSchema.optional(),
    content: z.string().trim().min(1).max(AGENT_MEMORY_CONTENT_LIMIT).optional(),
    references: referencesSchema.optional(),
    basis: basisSchema.optional(),
    provenance: provenanceSchema.optional(),
    expiresAt: z.number().int().nonnegative().optional(),
  }).strict().refine(({ memoryId: _memoryId, ...changes }) => Object.keys(changes).length > 0, {
    message: 'At least one memory field must be updated.',
  }),
  requiredScope: 'write',
} satisfies ToolContract;

export const deleteMemoryContract = {
  name: 'lacuna.delete_memory',
  description: 'Delete one learner memory. Lacuna retains an exhaustive local Undo snapshot.',
  inputSchema: z.object({ memoryId: identifierSchema }).strict(),
  requiredScope: 'destructive',
} satisfies ToolContract;

export const MEMORY_TOOL_CONTRACTS = [
  searchMemoriesContract,
  createMemoryContract,
  updateMemoryContract,
  deleteMemoryContract,
] as const satisfies readonly ToolContract[];
