import Dexie, { type Table } from 'dexie';
import type {
  Deck,
  Card,
  SessionHistoryEntry,
  UserPerformance,
  BackupSnapshot,
  AppStateEntry,
  ImageAsset,
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
  backups!: Table<BackupSnapshot, number>;
  appState!: Table<AppStateEntry, string>;
  assets!: Table<ImageAsset, string>;

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

    // Version 3: add the automatic-backup restore-point store and a small key/value
    // store (for the optional File System Access folder handle), and backfill the
    // card fields introduced alongside tags/suspend/bury so existing data is clean.
    // Booleans are not valid IndexedDB keys, so `suspended` is filtered in memory,
    // not indexed.
    this.version(3)
      .stores({
        decks: 'id, createdAt, examDate',
        cards: 'id, deckId, type, lastReviewed',
        sessionHistory: '++id, deckId, timestamp',
        userPerformance: 'deckId',
        backups: '++id, createdAt',
        appState: 'key',
      })
      .upgrade(async (tx) => {
        await tx
          .table('cards')
          .toCollection()
          .modify((card) => {
            Object.assign(card, migrateCardRecord(card as LegacyCard));
          });
      });

    // Version 4: move embedded card images into a Blob asset table. Markdown keeps
    // only lacuna-asset://hash references, which keeps reactive card reads small.
    this.version(4)
      .stores({
        decks: 'id, createdAt, examDate',
        cards: 'id, deckId, type, lastReviewed',
        sessionHistory: '++id, deckId, timestamp',
        userPerformance: 'deckId',
        backups: '++id, createdAt',
        appState: 'key',
        assets: 'hash, createdAt',
      })
      .upgrade(async (tx) => {
        const { extractMarkdownAssets } = await import('./assets');
        await tx
          .table('cards')
          .toCollection()
          .modify(async (card) => {
            const front = await extractMarkdownAssets(card.front ?? '', (asset) =>
              tx.table('assets').put(asset),
            );
            const back = await extractMarkdownAssets(card.back ?? '', (asset) =>
              tx.table('assets').put(asset),
            );
            card.front = front;
            card.back = back;
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
