// Shared limits and enum values for persisted learner memories and their MCP wire schemas.
// This module deliberately has no database dependency so Electron can register contracts
// without bundling the renderer-only persistence graph.

export const AGENT_MEMORY_CONTENT_LIMIT = 8_000;
export const AGENT_MEMORY_IDENTIFIER_LIMIT = 160;
export const AGENT_MEMORY_REFERENCE_LABEL_LIMIT = 500;
export const AGENT_MEMORY_REFERENCE_LIMIT = 25;
export const AGENT_MEMORY_PROVENANCE_ID_LIMIT = 160;
export const AGENT_MEMORY_QUERY_LIMIT = 1_000;
export const AGENT_MEMORY_RESULT_LIMIT = 50;

export const AGENT_MEMORY_TAGS = [
  'misconception',
  'plateau',
  'preference',
  'session',
  'strength',
  'context',
] as const;
export const AGENT_MEMORY_STATUSES = ['active', 'uncertain', 'resolved'] as const;
export const AGENT_MEMORY_BASES = [
  'learner-stated',
  'agent-inferred',
  'observed-performance',
] as const;
export const AGENT_MEMORY_REFERENCE_KINDS = [
  'card',
  'concept',
  'lesson',
  'question',
  'course',
] as const;
