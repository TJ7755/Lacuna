import Dexie, { type Table, type Transaction } from 'dexie';
import type {
  Deck,
  Card,
  SessionHistoryEntry,
  UserPerformance,
  BackupSnapshot,
  BackupFile,
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
        // Migration safety: take a pre-migration restore point inside the same
        // transaction, before any card is rewritten, so a failure rolls the whole
        // thing back and a successful upgrade still leaves a fallback snapshot.
        // This captures the original (base64-bearing) cards; the assets table is
        // still empty at this point. See Task 8.
        await snapshotBeforeUpgrade(tx, 4);

        const { extractMarkdownAssets } = await import('./assets');
        // Read, transform (async, extracting images into the asset store), then write
        // back explicitly. We avoid an async `.modify()` callback because mutating the
        // record after an await is not reliably persisted by Dexie.
        const cards = await tx.table('cards').toArray();
        for (const card of cards) {
          const front = await extractMarkdownAssets(card.front ?? '', (asset) =>
            tx.table('assets').put(asset),
          );
          const back = await extractMarkdownAssets(card.back ?? '', (asset) =>
            tx.table('assets').put(asset),
          );
          const migrated = { ...card, front, back };
          Object.assign(migrated, migrateCardRecord(migrated as LegacyCard));
          await tx.table('cards').put(migrated);
        }
      });
  }
}

/**
 * Capture a full pre-migration restore point within the upgrade transaction, before
 * any record is rewritten. Reuses the BackupSnapshot mechanism and tags the snapshot
 * so the normal daily-snapshot pruning never evicts it. Idempotent: if a
 * pre-migration snapshot for this target version already exists it does nothing.
 */
export async function snapshotBeforeUpgrade(
  tx: Transaction,
  targetVersion: number,
): Promise<void> {
  const backups = tx.table('backups');
  const already = await backups
    .toCollection()
    .filter((b: BackupSnapshot) => b.tag === 'pre-migration')
    .first();
  if (already) return;

  const [decks, cards, sessionHistory, userPerformance] = await Promise.all([
    tx.table('decks').toArray(),
    tx.table('cards').toArray(),
    tx.table('sessionHistory').toArray(),
    tx.table('userPerformance').toArray(),
  ]);

  const payload: BackupFile = {
    app: 'lacuna',
    version: targetVersion,
    exportedAt: Date.now(),
    decks,
    cards,
    // Assets are introduced by this very migration, so none exist yet.
    assets: [],
    sessionHistory,
    userPerformance,
  };

  const snapshot: BackupSnapshot = {
    createdAt: Date.now(),
    tag: 'pre-migration',
    deckCount: decks.length,
    cardCount: cards.length,
    payload,
  };
  await backups.add(snapshot);
}

export const db = new LacunaDatabase();

/** Generate a stable, collision-resistant identifier without external dependencies. */
export function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
