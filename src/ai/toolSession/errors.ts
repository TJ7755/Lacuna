import type { AiBridgeError } from '../protocol';

export function toolError(error: { kind: string; message: string }): AiBridgeError {
  const kinds = ['not_found', 'validation', 'forbidden', 'conflict', 'internal'] as const;
  const kind = kinds.includes(error.kind as (typeof kinds)[number])
    ? (error.kind as (typeof kinds)[number])
    : 'internal';
  return { kind: 'tool', error: { kind, message: error.message } };
}

export function internalError(error: unknown): AiBridgeError {
  return {
    kind: 'internal',
    message: error instanceof Error ? error.message : String(error),
  };
}

export function unavailableError(): AiBridgeError {
  return {
    kind: 'unavailable',
    reason: 'disconnected',
    message: 'The AI connection is disconnected.',
  };
}

export function stoppedError(runId: string): AiBridgeError {
  return { kind: 'stopped', runId, message: 'This AI run has stopped.' };
}
