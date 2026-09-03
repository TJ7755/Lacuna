import type {
  AgentMemory,
  AgentMemoryBasis,
  AgentMemoryProvenance,
  AgentMemoryReference,
  AgentMemoryStatus,
} from './types';
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
} from '../agentMemoryContract';

export {
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
};

function isBoundedString(value: unknown, limit: number, allowEmpty = false): value is string {
  return (
    typeof value === 'string' && value.length <= limit && (allowEmpty || value.trim().length > 0)
  );
}

function hasOnlyKeys(value: object, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isReference(value: unknown): value is AgentMemoryReference {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const reference = value as Partial<AgentMemoryReference>;
  return (
    hasOnlyKeys(value, ['kind', 'id', 'label']) &&
    AGENT_MEMORY_REFERENCE_KINDS.includes(reference.kind as AgentMemoryReference['kind']) &&
    isBoundedString(reference.id, AGENT_MEMORY_IDENTIFIER_LIMIT) &&
    isBoundedString(reference.label, AGENT_MEMORY_REFERENCE_LABEL_LIMIT)
  );
}

function isProvenance(value: unknown): value is AgentMemoryProvenance {
  if (value === undefined) return true;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const provenance = value as AgentMemoryProvenance;
  const values = [provenance.conversationId, provenance.messageId, provenance.agentId];
  return (
    hasOnlyKeys(value, ['conversationId', 'messageId', 'agentId']) &&
    values.every(
      (entry) => entry === undefined || isBoundedString(entry, AGENT_MEMORY_PROVENANCE_ID_LIMIT),
    )
  );
}

/** Structural validation used by the repository and every backup boundary. */
export function isAgentMemory(value: unknown): value is AgentMemory {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const memory = value as Partial<AgentMemory>;
  return (
    hasOnlyKeys(value, [
      'id',
      'courseId',
      'tags',
      'status',
      'content',
      'references',
      'basis',
      'provenance',
      'expiresAt',
      'createdAt',
      'updatedAt',
    ]) &&
    isBoundedString(memory.id, AGENT_MEMORY_IDENTIFIER_LIMIT) &&
    (memory.courseId === null || isBoundedString(memory.courseId, AGENT_MEMORY_IDENTIFIER_LIMIT)) &&
    Array.isArray(memory.tags) &&
    memory.tags.length > 0 &&
    memory.tags.every((tag) => AGENT_MEMORY_TAGS.includes(tag)) &&
    new Set(memory.tags).size === memory.tags.length &&
    AGENT_MEMORY_STATUSES.includes(memory.status as AgentMemoryStatus) &&
    isBoundedString(memory.content, AGENT_MEMORY_CONTENT_LIMIT) &&
    Array.isArray(memory.references) &&
    memory.references.length <= AGENT_MEMORY_REFERENCE_LIMIT &&
    memory.references.every(isReference) &&
    AGENT_MEMORY_BASES.includes(memory.basis as AgentMemoryBasis) &&
    isProvenance(memory.provenance) &&
    (memory.expiresAt === undefined || isTimestamp(memory.expiresAt)) &&
    isTimestamp(memory.createdAt) &&
    isTimestamp(memory.updatedAt) &&
    memory.updatedAt >= memory.createdAt &&
    (memory.tags.includes('session') ? isTimestamp(memory.expiresAt) : true) &&
    (memory.courseId === null ? memory.references.length === 0 : true)
  );
}

export function assertAgentMemory(value: unknown): asserts value is AgentMemory {
  if (!isAgentMemory(value)) throw new Error('Invalid agent memory.');
}
