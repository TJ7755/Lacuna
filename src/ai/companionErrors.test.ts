import { describe, expect, it } from 'vitest';
import {
  AiCompanionOperationError,
  bridgeOperationError,
  companionErrorDetails,
} from './companionErrors';

describe('AI companion errors', () => {
  it('gives renderer failures explicit recovery guidance', () => {
    expect(bridgeOperationError({
      kind: 'unavailable',
      reason: 'disconnected',
      message: 'Lacuna AI did not become ready.',
    }).details).toEqual({
      kind: 'renderer_unavailable',
      message: 'Lacuna AI did not become ready.',
      retryable: true,
      suggestedAction: 'restart_ai_runtime',
      userActionRequired: true,
      commitState: 'not_started',
    });
  });

  it('does not leak arbitrary exception text into model-visible diagnostics', () => {
    const privatePath = 'connect ENOENT /Users/Someone/Library/Application Support/Lacuna';
    expect(companionErrorDetails(new Error(privatePath))).toMatchObject({
      kind: 'internal',
      message: 'The Lacuna AI companion failed.',
    });
    expect(JSON.stringify(companionErrorDetails(new Error(privatePath)))).not.toContain('Someone');
  });

  it('preserves approval retry timing and identifies the required user action', () => {
    expect(bridgeOperationError({
      kind: 'approval_pending',
      approvalId: 'approval-1',
      approvalKind: 'write_grant',
      message: 'Approve the Course write in Lacuna.',
      retryAfterMs: 500,
    }).details).toMatchObject({
      kind: 'forbidden',
      retryable: true,
      suggestedAction: 'retry_same_request',
      userActionRequired: true,
      commitState: 'not_started',
      retryAfterMs: 500,
    });
  });

  it('preserves deliberate safe operation errors', () => {
    const error = new AiCompanionOperationError({
      kind: 'timeout',
      message: 'Lacuna did not answer in time.',
      retryable: true,
      suggestedAction: 'retry_same_request',
      userActionRequired: false,
      commitState: 'unknown',
    });
    expect(companionErrorDetails(error)).toEqual(error.details);
  });
});
