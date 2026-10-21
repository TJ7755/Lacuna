/**
 * Public contract for the optional Jev decision model (issue #715).
 *
 * The UI imports only from this module. The implementation behind it (settings storage, the
 * hosted client and how verdicts are persisted) may change freely, but these exported names
 * and shapes are the boundary between the study/settings UI and the engine.
 */

/** Bump when the provider, its hosting region or the disclosure wording changes; users re-consent. */
export const JEV_CONSENT_VERSION = 1;

export const JEV_PROVIDER = {
  name: 'TypeSafe AI',
  region: 'United States',
  // Unverified placeholder: confirm against TypeSafe's published privacy policy.
  privacyPolicyUrl: 'https://typesafe.ai/privacy',
} as const;

/** Per-device only: never included in backups, exports or sync. */
export interface JevSettings {
  enabled: boolean;
  /** Version of the warning the user accepted on this device, or null. */
  acceptedConsentVersion: number | null;
}

export type JevPauseReason =
  | 'offline'
  | 'no-access-code'
  | 'access-code-rejected'
  | 'service-disabled'
  | 'limit-reached'
  | 'error';

export type JevStatus =
  | { state: 'off' }
  | { state: 'ready'; lastUsedAt: number | null }
  | { state: 'paused'; reason: JevPauseReason; lastUsedAt: number | null };

/** Recorded with every mark Jev applies, so it can be audited and told apart from the learner's. */
export interface JevMarkProvenance {
  by: 'jev';
  /** Pinned provider model identifier that produced the decision. */
  model: string;
  /** 0–1 confidence of the applied decision. */
  confidence: number;
  markedAt: number;
}

/** A typed flashcard answer that the word-by-word comparison marked wrong. */
export interface JevTypedAnswerRequest {
  cardId: string;
  /** Plain-text front of the card. */
  prompt: string;
  /** Plain-text expected answer, as compared word by word. */
  expected: string;
  answer: string;
  signal?: AbortSignal;
}

/**
 * correct / incorrect: confident enough to apply without asking.
 * unsure: below threshold, timed out, offline or refused; keep the manual flow.
 */
export type JevTypedVerdict =
  { outcome: 'correct' | 'incorrect'; provenance: JevMarkProvenance } | { outcome: 'unsure' };

/** Background marking of one submitted written-answer attempt. */
export type JevAttemptMarking =
  | { state: 'idle' }
  | { state: 'marking'; remaining: number }
  | { state: 'done'; marked: number; leftForYou: number };

export interface JevController {
  /** Turning on requires the current consent version to be accepted in the same call. */
  enable(acceptedConsentVersion: number): void;
  /** Stops all requests immediately and cancels queued work. */
  disable(): void;
  /** Stores the shared hosted access code locally after a successful exchange. */
  connectAccessCode(code: string): Promise<{ ok: true } | { ok: false; message: string }>;
  hasAccessCode(): boolean;
}

/** Longest the study screen waits for a typed verdict before falling back to manual grading. */
export const JEV_TYPED_TIMEOUT_MS = 2500;

// Placeholder implementations so the UI compiles; replaced by the engine implementation.

export function useJevSettings(): JevSettings {
  return { enabled: false, acceptedConsentVersion: null };
}

export function useJevStatus(): JevStatus {
  return { state: 'off' };
}

export function useJevController(): JevController {
  return {
    enable: () => {},
    disable: () => {},
    connectAccessCode: async () => ({ ok: false, message: 'Jev is not available yet.' }),
    hasAccessCode: () => false,
  };
}

/**
 * Null while Jev is off, not consented, without an access code or paused, so callers keep
 * the manual flow without making a request. Resolves within `JEV_TYPED_TIMEOUT_MS`.
 */
export function useJevTypedMarker():
  ((request: JevTypedAnswerRequest) => Promise<JevTypedVerdict>) | null {
  return null;
}

/** Progress of background marking for a submitted attempt. */
export function useJevAttemptMarking(_attemptId: string): JevAttemptMarking {
  return { state: 'idle' };
}
