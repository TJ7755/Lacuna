import type { z } from 'zod';
import {
  agentMemoryRepository,
  type CreateAgentMemoryInput,
  type UpdateAgentMemoryInput,
} from '../../db/agentMemoryRepository';
import {
  createMemoryContract,
  deleteMemoryContract,
  searchMemoriesContract,
  updateMemoryContract,
} from '../contracts/memories';
import { McpToolException, type ToolDefinition, type ToolResult } from '../types';

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

const searchMemories: ToolDefinition<
  z.infer<typeof searchMemoriesContract.inputSchema>,
  Awaited<ReturnType<typeof agentMemoryRepository.search>>
> = {
  ...searchMemoriesContract,
  async handler({ scope, query, tags, statuses, limit }) {
    return ok(await agentMemoryRepository.search({ scope, query, tags, statuses, limit }));
  },
};

const createMemory: ToolDefinition<
  z.infer<typeof createMemoryContract.inputSchema>,
  Awaited<ReturnType<typeof agentMemoryRepository.create>>
> = {
  ...createMemoryContract,
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

const updateMemory: ToolDefinition<
  z.infer<typeof updateMemoryContract.inputSchema>,
  Awaited<ReturnType<typeof agentMemoryRepository.update>>
> = {
  ...updateMemoryContract,
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

const deleteMemory: ToolDefinition<z.infer<typeof deleteMemoryContract.inputSchema>, { id: string }> = {
  ...deleteMemoryContract,
  async handler({ memoryId }) {
    await requireMemory(memoryId);
    const snapshot = await agentMemoryRepository.delete(memoryId);
    return ok({ id: memoryId }, { kind: 'restoreAgentMemory', snapshot });
  },
};

export const MEMORY_TOOLS = [searchMemories, createMemory, updateMemory, deleteMemory] as const;

export { searchMemories, createMemory, updateMemory, deleteMemory };
