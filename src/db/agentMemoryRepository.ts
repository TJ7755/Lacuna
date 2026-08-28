import type { Transaction } from 'dexie';
import { db, makeId } from './schema';
import { clearTombstone, recordTombstone } from './mutationStamp';
import {
  AGENT_MEMORY_QUERY_LIMIT,
  AGENT_MEMORY_RESULT_LIMIT,
  assertAgentMemory,
} from './agentMemoryRecord';
import type {
  AgentMemory,
  AgentMemoryBasis,
  AgentMemoryProvenance,
  AgentMemoryReference,
  AgentMemoryStatus,
  AgentMemoryTag,
} from './types';

export interface CreateAgentMemoryInput {
  courseId: string | null;
  tags: AgentMemoryTag[];
  status?: AgentMemoryStatus;
  content: string;
  references?: AgentMemoryReference[];
  basis: AgentMemoryBasis;
  provenance?: AgentMemoryProvenance;
  expiresAt?: number;
}

export interface UpdateAgentMemoryInput {
  tags?: AgentMemoryTag[];
  status?: AgentMemoryStatus;
  content?: string;
  references?: AgentMemoryReference[];
  basis?: AgentMemoryBasis;
  provenance?: AgentMemoryProvenance;
  expiresAt?: number;
}

export type AgentMemorySearchScope =
  | { kind: 'all' }
  | { kind: 'global' }
  | { kind: 'course'; courseId: string };

export interface AgentMemorySearch {
  scope: AgentMemorySearchScope;
  query?: string;
  tags?: AgentMemoryTag[];
  statuses?: AgentMemoryStatus[];
  includeExpired?: boolean;
  limit?: number;
}

export interface DeletedAgentMemory {
  memory: AgentMemory;
  deletedAt: number;
}

function nextStamp(previous = 0, now = Date.now()): number {
  return Math.max(now, previous + 1);
}

async function assertReferenceOwnership(
  tx: Transaction,
  courseId: string,
  references: readonly AgentMemoryReference[],
): Promise<void> {
  for (const reference of references) {
    let owner: string | null | undefined;
    switch (reference.kind) {
      case 'course':
        owner = (await tx.table('courses').get(reference.id)) ? reference.id : undefined;
        break;
      case 'lesson':
        owner = (await tx.table('lessons').get(reference.id))?.courseId;
        break;
      case 'card':
        owner = (await tx.table('cards').get(reference.id))?.courseId;
        break;
      case 'concept':
        owner = (await tx.table('concepts').get(reference.id))?.courseId;
        break;
      case 'question':
        owner = (await tx.table('questions').get(reference.id))?.courseId;
        break;
    }
    if (owner !== courseId) {
      throw new Error(`The ${reference.kind} reference is unavailable in this Course.`);
    }
  }
}

async function assertCourseAndReferences(
  tx: Transaction,
  courseId: string | null,
  references: readonly AgentMemoryReference[],
): Promise<void> {
  if (courseId === null) {
    if (references.length > 0) throw new Error('Global memories cannot reference Course content.');
    return;
  }
  if (!(await tx.table('courses').get(courseId))) throw new Error('The Course could not be found.');
  await assertReferenceOwnership(tx, courseId, references);
}

export class AgentMemoryRepository {
  async get(id: string): Promise<AgentMemory | undefined> {
    return db.agentMemories.get(id);
  }

  async create(input: CreateAgentMemoryInput, now = Date.now()): Promise<AgentMemory> {
    const memory: AgentMemory = {
      id: makeId(),
      courseId: input.courseId,
      tags: [...input.tags],
      status: input.status ?? 'active',
      content: input.content.trim(),
      references: (input.references ?? []).map((reference) => ({ ...reference })),
      basis: input.basis,
      ...(input.provenance ? { provenance: { ...input.provenance } } : {}),
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
      createdAt: now,
      updatedAt: now,
    };
    assertAgentMemory(memory);
    await db.transaction(
      'rw',
      [db.agentMemories, db.courses, db.lessons, db.cards, db.concepts, db.questions],
      async (tx) => {
        await assertCourseAndReferences(tx, memory.courseId, memory.references);
        await db.agentMemories.add(memory);
      },
    );
    return memory;
  }

  async update(
    id: string,
    changes: UpdateAgentMemoryInput,
    now = Date.now(),
  ): Promise<AgentMemory> {
    return db.transaction(
      'rw',
      [db.agentMemories, db.courses, db.lessons, db.cards, db.concepts, db.questions],
      async (tx) => {
        const current = await db.agentMemories.get(id);
        if (!current) throw new Error('The memory could not be found.');
        const updated: AgentMemory = {
          ...current,
          ...changes,
          id: current.id,
          courseId: current.courseId,
          createdAt: current.createdAt,
          content: changes.content === undefined ? current.content : changes.content.trim(),
          tags: changes.tags === undefined ? current.tags : [...changes.tags],
          references:
            changes.references === undefined
              ? current.references
              : changes.references.map((reference) => ({ ...reference })),
          provenance:
            changes.provenance === undefined ? current.provenance : { ...changes.provenance },
          updatedAt: nextStamp(current.updatedAt, now),
        };
        assertAgentMemory(updated);
        // Existing references may become unavailable after content deletion. Only a newly
        // supplied set is asserted again; otherwise a harmless correction would be blocked.
        if (changes.references !== undefined) {
          await assertCourseAndReferences(tx, current.courseId, updated.references);
        }
        await db.agentMemories.put(updated);
        return updated;
      },
    );
  }

  async search(options: AgentMemorySearch): Promise<AgentMemory[]> {
    const query = (options.query ?? '').trim();
    if (query.length > AGENT_MEMORY_QUERY_LIMIT)
      throw new Error('Memory search query is too long.');
    const requestedLimit = options.limit ?? AGENT_MEMORY_RESULT_LIMIT;
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
      throw new Error('Memory search limit must be a positive integer.');
    }
    const limit = Math.min(requestedLimit, AGENT_MEMORY_RESULT_LIMIT);
    let memories: AgentMemory[];
    if (options.scope.kind === 'course') {
      memories = await db.agentMemories.where('courseId').equals(options.scope.courseId).toArray();
    } else {
      // IndexedDB has no null key. Global and inspector-wide searches are deliberately
      // filtered over the small collection in memory.
      memories = await db.agentMemories.toArray();
      if (options.scope.kind === 'global')
        memories = memories.filter((row) => row.courseId === null);
    }
    const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const now = Date.now();
    return memories
      .filter(
        (memory) =>
          options.includeExpired || memory.expiresAt === undefined || memory.expiresAt > now,
      )
      .filter(
        (memory) => !options.tags?.length || options.tags.every((tag) => memory.tags.includes(tag)),
      )
      .filter((memory) => !options.statuses?.length || options.statuses.includes(memory.status))
      .filter((memory) => {
        const haystack = `${memory.content}\n${memory.references
          .map((reference) => reference.label)
          .join('\n')}`.toLocaleLowerCase();
        return terms.every((term) => haystack.includes(term));
      })
      .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
      .slice(0, limit);
  }

  async delete(id: string, now = Date.now()): Promise<DeletedAgentMemory> {
    return db.transaction('rw', [db.agentMemories, db.tombstones], async (tx) => {
      const memory = await db.agentMemories.get(id);
      if (!memory) throw new Error('The memory could not be found.');
      const deletedAt = nextStamp(memory.updatedAt, now);
      await db.agentMemories.delete(id);
      await recordTombstone(tx, 'agentMemories', id, deletedAt);
      return { memory, deletedAt };
    });
  }

  async restore(snapshot: DeletedAgentMemory, now = Date.now()): Promise<AgentMemory> {
    return db.transaction('rw', [db.agentMemories, db.tombstones, db.courses], async (tx) => {
      if (snapshot.memory.courseId !== null && !(await db.courses.get(snapshot.memory.courseId))) {
        throw new Error('The memory Course is no longer available.');
      }
      const restored = {
        ...snapshot.memory,
        updatedAt: nextStamp(snapshot.deletedAt, now),
      };
      assertAgentMemory(restored);
      await db.agentMemories.put(restored);
      await clearTombstone(tx, 'agentMemories', restored.id);
      return restored;
    });
  }
}

export const agentMemoryRepository = new AgentMemoryRepository();
