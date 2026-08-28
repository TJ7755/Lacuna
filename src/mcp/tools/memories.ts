import { z } from 'zod';
import {
  agentMemoryRepository,
  type CreateAgentMemoryInput,
  type UpdateAgentMemoryInput,
} from '../../db/agentMemoryRepository';
import {
  AGENT_MEMORY_BASES,
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
} from '../../db/agentMemoryRecord';
import { McpToolException, type ToolDefinition, type ToolResult } from '../types';

const identifierSchema = z.string().trim().min(1).max(AGENT_MEMORY_IDENTIFIER_LIMIT);
const provenanceIdSchema = identifierSchema.max(AGENT_MEMORY_PROVENANCE_ID_LIMIT);
const globalScopeSchema = z.object({ kind: z.literal('global') }).strict();
const courseScopeSchema = z
  .object({ kind: z.literal('course'), courseId: identifierSchema })
  .strict();
const memoryScopeSchema = z.discriminatedUnion('kind', [globalScopeSchema, courseScopeSchema]);
const tagSchema = z.enum(AGENT_MEMORY_TAGS);
const statusSchema = z.enum(AGENT_MEMORY_STATUSES);
const basisSchema = z.enum(AGENT_MEMORY_BASES);
const referenceSchema = z
  .object({
    kind: z.enum(AGENT_MEMORY_REFERENCE_KINDS),
    id: identifierSchema,
    label: z.string().trim().min(1).max(AGENT_MEMORY_REFERENCE_LABEL_LIMIT),
  })
  .strict();
const provenanceSchema = z
  .object({
    conversationId: provenanceIdSchema.optional(),
    messageId: provenanceIdSchema.optional(),
  })
  .strict();
const tagsSchema = z
  .array(tagSchema)
  .min(1)
  .max(AGENT_MEMORY_TAGS.length)
  .refine((tags) => new Set(tags).size === tags.length, 'Memory tags must be unique.');
const referencesSchema = z.array(referenceSchema).max(AGENT_MEMORY_REFERENCE_LIMIT);

function ok<T>(data: T, undo?: ToolResult<T>['undo']): ToolResult<T> {
  return undo ? { data, undo } : { data };
}

function notFound(id: string): never {
  throw new McpToolException({ kind: 'not_found', message: `Memory "${id}" was not found.` });
}

async function requireMemory(id: string) {
  const memory = await agentMemoryRepository.get(id);
  if (!memory) notFound(id);
  return memory;
}

const searchMemoriesSchema = z
  .object({
    scope: memoryScopeSchema,
    query: z.string().max(AGENT_MEMORY_QUERY_LIMIT).optional(),
    tags: z.array(tagSchema).max(AGENT_MEMORY_TAGS.length).optional(),
    statuses: z.array(statusSchema).max(AGENT_MEMORY_STATUSES.length).optional(),
    limit: z.number().int().min(1).max(AGENT_MEMORY_RESULT_LIMIT).optional(),
  })
  .strict();

const searchMemories: ToolDefinition<
  z.infer<typeof searchMemoriesSchema>,
  Awaited<ReturnType<typeof agentMemoryRepository.search>>
> = {
  name: 'lacuna.search_memories',
  description:
    'Search relevant learner-correctable memories in one explicit global or Course scope. ' +
    'Results exclude expired session memories and are ordered by most recent evidence.',
  inputSchema: searchMemoriesSchema,
  requiredScope: 'read',
  async handler({ scope, query, tags, statuses, limit }) {
    return ok(await agentMemoryRepository.search({ scope, query, tags, statuses, limit }));
  },
};

const createMemorySchema = z
  .object({
    scope: memoryScopeSchema,
    tags: tagsSchema,
    status: statusSchema.optional(),
    content: z.string().trim().min(1).max(AGENT_MEMORY_CONTENT_LIMIT),
    references: referencesSchema.optional(),
    basis: basisSchema,
    provenance: provenanceSchema.optional(),
    expiresAt: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.tags.includes('session') && input.expiresAt === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'Session memories require expiresAt.',
      });
    }
    if (input.scope.kind === 'global' && (input.references?.length ?? 0) > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['references'],
        message: 'Global memories cannot reference Course content.',
      });
    }
  });

const createMemory: ToolDefinition<
  z.infer<typeof createMemorySchema>,
  Awaited<ReturnType<typeof agentMemoryRepository.create>>
> = {
  name: 'lacuna.create_memory',
  description:
    'Create bounded, learner-correctable teaching context from stated, inferred or observed ' +
    'evidence. Global memories cannot reference Course content.',
  inputSchema: createMemorySchema,
  requiredScope: 'write',
  async handler({ scope, provenance, ...input }, context) {
    const memoryInput: CreateAgentMemoryInput = {
      ...input,
      courseId: scope.kind === 'course' ? scope.courseId : null,
      provenance: { ...provenance, agentId: context.agentId },
    };
    try {
      return ok(await agentMemoryRepository.create(memoryInput));
    } catch (error) {
      throw new McpToolException({
        kind: 'validation',
        message: error instanceof Error ? error.message : 'The memory is invalid.',
      });
    }
  },
};

const updateMemorySchema = z
  .object({
    memoryId: identifierSchema,
    tags: tagsSchema.optional(),
    status: statusSchema.optional(),
    content: z.string().trim().min(1).max(AGENT_MEMORY_CONTENT_LIMIT).optional(),
    references: referencesSchema.optional(),
    basis: basisSchema.optional(),
    provenance: provenanceSchema.optional(),
    expiresAt: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(({ memoryId: _memoryId, ...changes }) => Object.keys(changes).length > 0, {
    message: 'At least one memory field must be updated.',
  });

const updateMemory: ToolDefinition<
  z.infer<typeof updateMemorySchema>,
  Awaited<ReturnType<typeof agentMemoryRepository.update>>
> = {
  name: 'lacuna.update_memory',
  description:
    'Correct evidence, status or wording for one learner memory without moving its immutable scope.',
  inputSchema: updateMemorySchema,
  requiredScope: 'write',
  async handler({ memoryId, provenance, ...changes }, context) {
    await requireMemory(memoryId);
    const update: UpdateAgentMemoryInput = {
      ...changes,
      ...(provenance ? { provenance: { ...provenance, agentId: context.agentId } } : {}),
    };
    try {
      return ok(await agentMemoryRepository.update(memoryId, update));
    } catch (error) {
      throw new McpToolException({
        kind: 'validation',
        message: error instanceof Error ? error.message : 'The memory update is invalid.',
      });
    }
  },
};

const deleteMemorySchema = z.object({ memoryId: identifierSchema }).strict();
const deleteMemory: ToolDefinition<z.infer<typeof deleteMemorySchema>, { id: string }> = {
  name: 'lacuna.delete_memory',
  description: 'Delete one learner memory. Lacuna retains an exhaustive local Undo snapshot.',
  inputSchema: deleteMemorySchema,
  requiredScope: 'destructive',
  async handler({ memoryId }) {
    await requireMemory(memoryId);
    const snapshot = await agentMemoryRepository.delete(memoryId);
    return ok({ id: memoryId }, { kind: 'restoreAgentMemory', snapshot });
  },
};

export const MEMORY_TOOLS = [searchMemories, createMemory, updateMemory, deleteMemory] as const;

export { searchMemories, createMemory, updateMemory, deleteMemory };
