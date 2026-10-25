import type { AiBridgeRequest } from '../../src/ai/protocol.js';
import { AiCompanionOperationError } from '../../src/ai/companionErrors.js';

export function cancelledOperation(
  commitState: 'not_started' | 'unknown',
): AiCompanionOperationError {
  return new AiCompanionOperationError({
    kind: 'cancelled',
    message: 'The Lacuna AI request was cancelled.',
    retryable: true,
    suggestedAction: 'retry_same_request',
    userActionRequired: false,
    commitState,
  });
}

export function timedOutOperation(
  commitState: 'not_started' | 'unknown',
): AiCompanionOperationError {
  return new AiCompanionOperationError({
    kind: 'timeout',
    message: 'Lacuna did not answer the local AI companion in time.',
    retryable: true,
    suggestedAction: 'retry_same_request',
    userActionRequired: false,
    commitState,
  });
}

export function appConnectionError(message: string): AiCompanionOperationError {
  return new AiCompanionOperationError({
    kind: 'app_unavailable',
    message,
    retryable: true,
    suggestedAction: 'open_lacuna',
    userActionRequired: true,
    commitState: 'not_started',
  });
}

export function disconnectedOperation(request: AiBridgeRequest): AiCompanionOperationError {
  const commitState =
    request.type === 'invoke_tool' || request.type === 'reply' || request.type === 'renew_lease'
      ? 'unknown'
      : 'not_started';
  return new AiCompanionOperationError({
    kind: 'app_unavailable',
    message:
      commitState === 'unknown'
        ? 'Lacuna disconnected before acknowledging the request. Retry the exact same request.'
        : 'The running Lacuna application disconnected.',
    retryable: true,
    suggestedAction: commitState === 'unknown' ? 'retry_same_request' : 'open_lacuna',
    userActionRequired: commitState === 'not_started',
    commitState,
  });
}
