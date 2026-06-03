import Dexie, { type Table } from 'dexie';
import type {
  Deck,
  Card,
  SessionHistoryEntry,
  UserPerformance,
} from './types';
import {
  migrateCardRecord,
  migrateDeckRecord,
  type LegacyCard,
  type LegacyDeck,
} from './migrations';

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

    // Version 2: migrate the FSRS-4.5 (17-parameter) model to FSRS-6. The indexes
    // are unchanged; the upgrade only enriches existing records with the new
    // FSRS-6 fields. No user data is dropped.
    this.version(2)
      .stores({
        decks: 'id, createdAt, examDate',
        cards: 'id, deckId, type, lastReviewed',
        sessionHistory: '++id, deckId, timestamp',
        userPerformance: 'deckId',
      })
      .upgrade(async (tx) => {
        await tx
          .table('decks')
          .toCollection()
          .modify((deck) => {
            Object.assign(deck, migrateDeckRecord(deck as LegacyDeck));
          });
        await tx
          .table('cards')
          .toCollection()
          .modify((card) => {
            Object.assign(card, migrateCardRecord(card as LegacyCard));
          });
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
