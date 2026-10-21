/**
 * Public contract for the optional Jev decision model (issue #715).
 *
 * The UI imports only from this module. The implementation behind it (settings storage, the
 * background tagger, the hosted client and the suggestion store) may change freely, but these
 * exported names and shapes are the boundary between the settings/review UI and the engine.
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
  | { state: 'idle'; lastRunAt: number | null }
  | { state: 'running'; lastRunAt: number | null; remaining: number }
  | { state: 'paused'; reason: JevPauseReason; lastRunAt: number | null };

export interface JevSpecificationChoice {
  specificationPointId: string;
  /** Human-readable label, for example "4.2.1 Osmosis". */
  label: string;
  /** The single course Concept linked to this point, if exactly one exists. */
  conceptId: string | null;
  conceptName: string | null;
}

export interface JevTagSuggestion {
  id: string;
  courseId: string;
  questionId: string;
  /** Stable identifier of the mark allocation (mark-scheme line) within its question. */
  allocationId: string;
  questionExcerpt: string;
  lineText: string;
  /**
   * low-confidence: the model chose a point but below the threshold.
   * no-single-concept: confident point, but zero or several course Concepts link to it.
   * none-of-these: the model chose "none of these" at some level of the specification tree.
   */
  kind: 'low-confidence' | 'no-single-concept' | 'none-of-these';
  /** Deepest point the model reached, if any. */
  choice: JevSpecificationChoice | null;
  /** 0–1; null for none-of-these. */
  confidence: number | null;
  /** Course Concepts the learner may pick from when resolving manually. */
  conceptOptions: { id: string; name: string }[];
  createdAt: number;
}

export interface JevAppliedTag {
  id: string;
  courseId: string;
  questionId: string;
  allocationId: string;
  conceptId: string;
  conceptName: string;
  specificationPointId: string;
  specificationPointLabel: string;
  confidence: number;
  /** Pinned provider model identifier that produced the decision. */
  model: string;
  appliedAt: number;
  source: 'jev-automatic' | 'jev-accepted';
}

export interface JevController {
  /** Turning on requires the current consent version to be accepted in the same call. */
  enable(acceptedConsentVersion: number): void;
  /** Stops all requests immediately and cancels queued work. */
  disable(): void;
  /** Stores the shared hosted access code locally after a successful exchange. */
  connectAccessCode(code: string): Promise<{ ok: true } | { ok: false; message: string }>;
  hasAccessCode(): boolean;
  acceptSuggestion(suggestionId: string, conceptId: string): Promise<void>;
  rejectSuggestion(suggestionId: string): Promise<void>;
  /** Removes the tag from the allocation and records the undo; the item is not re-suggested. */
  undoAppliedTag(appliedTagId: string): Promise<void>;
}

// Placeholder implementations so the UI compiles; replaced by the engine implementation.
const notReady = (): Promise<never> => Promise.reject(new Error('Jev is not available yet.'));

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
    acceptSuggestion: notReady,
    rejectSuggestion: notReady,
    undoAppliedTag: notReady,
  };
}

export function useCourseJevSuggestions(_courseId: string): JevTagSuggestion[] | undefined {
  return [];
}

export function useCourseJevAppliedTags(_courseId: string): JevAppliedTag[] | undefined {
  return [];
}

/** Provenance for one allocation, for the quiet marker in tag details. */
export function useAllocationJevTag(
  _questionId: string,
  _allocationId: string,
): JevAppliedTag | null | undefined {
  return null;
}
