export type AgentMemoryTag =
  'misconception' | 'plateau' | 'preference' | 'session' | 'strength' | 'context';

export type AgentMemoryStatus = 'active' | 'uncertain' | 'resolved';
export type AgentMemoryBasis = 'learner-stated' | 'agent-inferred' | 'observed-performance';
export type AgentMemoryReferenceKind = 'card' | 'concept' | 'lesson' | 'question' | 'course';

export interface AgentMemoryReference {
  kind: AgentMemoryReferenceKind;
  id: string;
  /** Historical display snapshot. The entity id remains authoritative. */
  label: string;
}

export interface AgentMemoryProvenance {
  conversationId?: string;
  messageId?: string;
  agentId?: string;
}

/** Learner-correctable teaching context owned by either the learner globally or one Course. */
export interface AgentMemory {
  id: string;
  courseId: string | null;
  tags: AgentMemoryTag[];
  status: AgentMemoryStatus;
  content: string;
  references: AgentMemoryReference[];
  basis: AgentMemoryBasis;
  provenance?: AgentMemoryProvenance;
  expiresAt?: number;
  createdAt: number;
  updatedAt: number;
}
