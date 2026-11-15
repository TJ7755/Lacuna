import { storedString } from '../state/localSetting';
import type { AnswerMode, CardType, ItemPayload } from '@lacuna/core/db/types';

const DRAFT_PREFIX = 'lacuna:draft';

export interface DraftData {
  answerMode?: AnswerMode;
  /** Legacy drafts stored only the card toggle. */
  requireCorrectSpelling?: boolean;
  /** Null records a deliberate return to the lesson default. */
  spellingOverride?: boolean | null;
  front: string;
  back: string;
  tags: string[];
  type: CardType;
  itemKind?: 'numeric' | 'working' | 'audio';
  payload?: ItemPayload;
  /** Uncompiled working-item source, retained even while a draft contains errors. */
  workingSource?: string;
  alsoReverse?: boolean;
  timestamp: number;
}

export function draftKey(scope: string, recordId: string): string {
  return `${DRAFT_PREFIX}:${scope}:${recordId}`;
}

export function saveDraft<T>(key: string, data: T): boolean {
  try {
    storedString(key).write(JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft<T = DraftData>(key: string): T | null {
  try {
    const raw = storedString(key).read();
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  try {
    storedString(key).remove();
  } catch {
    // Draft cleanup must not turn a successful repository write into a failed save.
  }
}

/** Read all saved authoring drafts, including nested Question state. */
export function loadAllDrafts(): unknown[] {
  const drafts: unknown[] = [];
  // Let storage access failures reach the collector: an unreadable draft is not
  // evidence that its media are orphaned. Only malformed JSON can be skipped.
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(`${DRAFT_PREFIX}:`)) continue;
    const raw = storedString(key).read();
    if (!raw) continue;
    try {
      drafts.push(JSON.parse(raw));
    } catch {
      // Match loadDraft: malformed JSON cannot be restored.
    }
  }
  return drafts;
}
