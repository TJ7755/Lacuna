import type { CardType, ItemPayload } from '../db/types';

const DRAFT_PREFIX = 'lacuna:draft';

export interface DraftData {
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

export function saveDraft<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Silently fail if quota is exceeded.
  }
}

export function loadDraft<T = DraftData>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Draft cleanup must not turn a successful repository write into a failed save.
  }
}
