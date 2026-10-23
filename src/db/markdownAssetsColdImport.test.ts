import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('./markdownAssets', async (importOriginal) => {
  await new Promise((resolve) => setTimeout(resolve, 40));
  return importOriginal();
});
vi.mock('./markdownAssetExtraction', async (importOriginal) => {
  await new Promise((resolve) => setTimeout(resolve, 40));
  return importOriginal();
});
vi.mock('../utils/compressImage', () => ({
  compressImageBlob: vi.fn(async (blob: Blob) => ({ blob, width: 12, height: 8 })),
}));

import { extractMarkdownAssets, referencedAssetHashes } from './assets';
import { db, ensurePreMigrationSnapshot } from './schema';
import { getPreMigrationSnapshot } from './preMigrationSnapshots';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

it('preserves inline recovery bytes while the real v4 extractor loads cold', async () => {
  await db.delete();
  await new Dexie('lacuna-pre-migration').delete();
  const legacy = new Dexie('lacuna');
  legacy.version(3).stores({
    decks: 'id, createdAt, examDate',
    cards: 'id, deckId, type, lastReviewed',
    sessionHistory: '++id, deckId, timestamp',
    userPerformance: 'deckId',
    backups: '++id, createdAt',
    appState: 'key',
  });
  await legacy.open();
  await legacy.table('decks').put({ id: 'legacy', name: 'Legacy', createdAt: 1 });
  const markdown = `![scan](data:image/png;base64,${btoa('migration-image')})`;
  await legacy.table('cards').put({
    id: 'illustrated', deckId: 'legacy', type: 'front_back',
    front: markdown, back: 'Answer', createdAt: 1, history: [],
  });
  await legacy.table('cards').put({
    id: 'missing-content', deckId: 'legacy', type: 'front_back',
    front: null, createdAt: 1, history: [],
  });
  await legacy.table('sessionHistory').add({ deckId: 'legacy', timestamp: 123 });
  await legacy.table('userPerformance').put({
    deckId: 'legacy', runningMeanResponseTime: 2,
    runningStdDevResponseTime: 0, m2: 0, totalCorrectReviews: 1,
  });
  legacy.close();

  await ensurePreMigrationSnapshot();
  expect((await getPreMigrationSnapshot(30))?.payload.cards[0].front).toBe(markdown);
  await db.open();

  const card = await db.cards.get('illustrated');
  const hashes = referencedAssetHashes(card!.front);
  expect(hashes).toHaveLength(1);
  expect(await db.assets.get(hashes[0])).toMatchObject({
    kind: 'image', mimeType: 'image/png', width: 12, height: 8,
    blob: new TextEncoder().encode('migration-image'),
  });
  expect(card?.back).toBe('Answer');
  expect(await db.cards.get('missing-content')).toMatchObject({ front: '', back: '' });
  expect((await db.sessionHistory.toArray())[0]).toMatchObject({
    timestamp: 123, courseId: card!.courseId,
  });
  expect(await db.userPerformance.get('legacy')).toMatchObject({
    courseId: card!.courseId, runningMeanResponseTime: 2, totalCorrectReviews: 1,
  });
});

it('retains the write transaction while embedded-image processing loads cold', async () => {
  const markdown = `![scan](data:image/png;base64,${btoa('original-image')})`;
  const migrated = await db.transaction('rw', db.assets, () =>
    extractMarkdownAssets(markdown, (asset) => db.assets.put(asset)),
  );
  const hashes = referencedAssetHashes(migrated);
  expect(hashes).toHaveLength(1);
  expect(await db.assets.get(hashes[0])).toMatchObject({
    kind: 'image',
    mimeType: 'image/png',
    width: 12,
    height: 8,
    blob: new TextEncoder().encode('original-image'),
  });
});
