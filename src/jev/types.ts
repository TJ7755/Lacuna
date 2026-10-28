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
  privacyPolicyUrl: 'https://typesafe.ai/legal/privacy-policy',
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
  | 'rate-limited'
  | 'error';

export type JevStatus =
  | { state: 'off' }
  | { state: 'ready'; lastUsedAt: number | null }
  | { state: 'paused'; reason: JevPauseReason; lastUsedAt: number | null; retryAt?: number | null };

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
  | { outcome: 'correct' | 'incorrect'; provenance: JevMarkProvenance; feedback: JevTypedFeedback }
  | { outcome: 'unsure'; feedback: JevTypedFeedback | null };

/** How a typed answer relates to the expected one, asked alongside the verdict. */
export type JevAnswerKind = 'same' | 'spelling' | 'imprecise' | 'partial' | 'wrong' | 'blank';

/** One part of the expected answer, as offsets into `JevTypedAnswerRequest.expected`. */
export interface JevAnswerPart {
  start: number;
  end: number;
  /** null when the model was not confident either way. */
  covered: boolean | null;
}

export interface JevTypedFeedback {
  /** null when the model was not confident. */
  kind: JevAnswerKind | null;
  /** Empty when the expected answer has only one part. */
  parts: JevAnswerPart[];
}

/** Automatic marking of the written-answer criterion the learner has open. */
export type JevAllocationMarking =
  /** Nothing to do: Jev is off, the line is decided or it is not a written answer. */
  | { state: 'idle' }
  | { state: 'marking' }
  /** Jev is on but paused, so the learner marks this line. */
  | { state: 'unavailable' }
  /** Jev could not decide this line confidently; it stays with the learner. */
  | { state: 'left' }
  /** A confident verdict could not be saved; a later visit may retry. */
  | { state: 'failed' };

export interface JevController {
  /** Turning on requires the current consent version to be accepted in the same call. */
  enable(acceptedConsentVersion: number): void;
  /** Stops all requests immediately and cancels queued work. */
  disable(): void;
  /** Stores the shared hosted access code locally after a successful exchange. */
  connectAccessCode(code: string): Promise<{ ok: true } | { ok: false; message: string }>;
  hasAccessCode(): boolean;
}

/**
 * Shortest time, before motion scaling, an answer is shown being judged. Jev and local matches
 * can answer almost at once; without this a verdict lands before the learner sees it being made.
 */
export const JEV_JUDGING_MS = 1200;

/** Longest the study screen waits for a typed verdict before falling back to manual grading. */
export const JEV_TYPED_TIMEOUT_MS = 2500;
