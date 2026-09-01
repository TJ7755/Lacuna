import type { AiBridgeError } from './protocol';

export type AiCompanionErrorKind =
  | 'app_unavailable'
  | 'renderer_unavailable'
  | 'not_connected'
  | 'timeout'
  | 'cancelled'
  | 'stopped'
  | 'conflict'
  | 'validation'
  | 'forbidden'
  | 'tool'
  | 'internal';

export type AiCommitState = 'not_started' | 'unknown' | 'committed';

export interface AiCompanionErrorDetails {
  kind: AiCompanionErrorKind;
  message: string;
  retryable: boolean;
  suggestedAction: 'open_lacuna' | 'restart_ai_runtime' | 'connect' | 'retry_same_request' | 'stop' | 'inspect_input';
  userActionRequired: boolean;
  commitState: AiCommitState;
  retryAfterMs?: number;
}

export class AiCompanionOperationError extends Error {
  constructor(readonly details: AiCompanionErrorDetails) {
    super(details.message);
    this.name = 'AiCompanionOperationError';
  }
}

export function bridgeOperationError(error: AiBridgeError): AiCompanionOperationError {
  if (error.kind === 'tool') {
    return new AiCompanionOperationError({
      kind: 'tool',
      message: error.error.message,
      retryable: error.error.kind === 'conflict',
      suggestedAction: error.error.kind === 'validation' ? 'inspect_input' : 'retry_same_request',
      userActionRequired: false,
      commitState: 'not_started',
    });
  }
  if (error.kind === 'unavailable') {
    const disabled = error.reason === 'disabled';
    return new AiCompanionOperationError({
      kind: disabled ? 'not_connected' : 'renderer_unavailable',
      message: error.message,
      retryable: true,
      suggestedAction: disabled ? 'connect' : 'restart_ai_runtime',
      userActionRequired: true,
      commitState: 'not_started',
    });
  }
  if (error.kind === 'stopped') {
    return new AiCompanionOperationError({
      kind: 'stopped',
      message: error.message,
      retryable: false,
      suggestedAction: 'stop',
      userActionRequired: false,
      commitState: 'not_started',
    });
  }
  const kind = error.kind === 'version_mismatch'
    ? 'validation'
    : error.kind === 'approval_required' || error.kind === 'approval_pending'
      ? 'forbidden'
      : error.kind;
  return new AiCompanionOperationError({
    kind,
    message: error.kind === 'internal' ? 'The Lacuna AI request failed.' : error.message,
    retryable:
      error.kind === 'approval_required' ||
      error.kind === 'approval_pending' ||
      error.kind === 'conflict',
    suggestedAction: error.kind === 'validation' || error.kind === 'version_mismatch'
      ? 'inspect_input'
      : 'retry_same_request',
    userActionRequired: error.kind === 'approval_required' || error.kind === 'approval_pending',
    commitState: 'not_started',
    ...(error.kind === 'approval_pending' ? { retryAfterMs: error.retryAfterMs } : {}),
  });
}

export function companionErrorDetails(error: unknown): AiCompanionErrorDetails {
  if (error instanceof AiCompanionOperationError) return error.details;
  return {
    kind: 'internal',
    message: 'The Lacuna AI companion failed.',
    retryable: false,
    suggestedAction: 'stop',
    userActionRequired: false,
    commitState: 'unknown',
  };
}
