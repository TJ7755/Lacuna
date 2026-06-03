import Dexie, { type Table } from 'dexie';
import type {
  Deck,
  Card,
  SessionHistoryEntry,
  UserPerformance,
} from './types';

/**
 * Lacuna's IndexedDB database. A single Dexie instance owns every store.
 * Indexes are declared in version().stores(); only indexed fields are listed there,
 * other properties are stored implicitly on the record.
 */
export class LacunaDatabase extends Dexie {
  decks!: Table<Deck, string>;
  cards!: Table<Card, string>;
  sessionHistory!: Table<SessionHistoryEntry, number>;
  userPerformance!: Table<UserPerformance, string>;

  constructor() {
    super('lacuna');
    this.version(1).stores({
      decks: 'id, createdAt, examDate',
      cards: 'id, deckId, type, lastReviewed',
      sessionHistory: '++id, deckId, timestamp',
      userPerformance: 'deckId',
    });
  }
}

export const db = new LacunaDatabase();

/** Generate a stable, collision-resistant identifier without external dependencies. */
export function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
