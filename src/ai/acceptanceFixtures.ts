export type AiAcceptanceScenarioId =
  | 'conversation'
  | 'reload-recovery'
  | 'content-actions'
  | 'misconception-first'
  | 'cooperative-stop'
  | 'sync-and-replace';

export type AiAcceptanceCapability =
  | 'browser-connection'
  | 'conversation-persistence'
  | 'tool-idempotency'
  | 'permissions'
  | 'structured-receipts'
  | 'memory'
  | 'instructions'
  | 'cooperative-stop'
  | 'undo'
  | 'peer-sync'
  | 'replace-import';

export interface AiAcceptanceScenario {
  id: AiAcceptanceScenarioId;
  title: string;
  capabilities: readonly AiAcceptanceCapability[];
  assertions: readonly string[];
}

/** Stable scenario records for later scripted browser adapters and manual live smoke evidence. */
export const AI_ACCEPTANCE_SCENARIOS = [
  {
    id: 'conversation',
    title: 'Connect and exchange a complete response',
    capabilities: ['browser-connection'],
    assertions: [
      'AI is enabled before the page seam is exposed.',
      'A terminal client claims one user message and records one non-streamed response.',
    ],
  },
  {
    id: 'reload-recovery',
    title: 'Recover an unclaimed message after reload',
    capabilities: ['conversation-persistence', 'tool-idempotency'],
    assertions: [
      'An unclaimed message survives reload and is claimed once after reconnection.',
      'Repeating a stable tool-call identifier returns its recorded result.',
    ],
  },
  {
    id: 'content-actions',
    title: 'Create course content through approved domain tools',
    capabilities: ['permissions', 'structured-receipts'],
    assertions: [
      'Global course creation and subsequent course writes require the correct approvals.',
      'Course, Lesson, Card, Question and assessment receipts link to records that exist.',
    ],
  },
  {
    id: 'misconception-first',
    title: 'Use memory-guided misconception-first teaching',
    capabilities: ['memory', 'instructions'],
    assertions: [
      'The client retrieves relevant memories rather than dumping the memory store.',
      'The exchange diagnoses, conflicts, resolves and tests transfer before updating evidence.',
    ],
  },
  {
    id: 'cooperative-stop',
    title: 'Stop between actions without pretending to roll back',
    capabilities: ['cooperative-stop', 'undo'],
    assertions: [
      'Stop rejects calls admitted after the persisted stop request.',
      'Earlier committed work remains visible and offers Undo where the domain supports it.',
    ],
  },
  {
    id: 'sync-and-replace',
    title: 'Keep live AI state through sync and clear it on replacement',
    capabilities: ['peer-sync', 'replace-import'],
    assertions: [
      'Peer sync waits for an active write and preserves the connection and local transcript.',
      'Full replacement performs destructive shutdown and clears local conversation state.',
    ],
  },
] as const satisfies readonly AiAcceptanceScenario[];
