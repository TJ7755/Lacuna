import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './schema';
import {
  assetUrl,
  blobToArrayBuffer,
  extractMarkdownAssets,
  referencedAssetHashes,
  storeImageBlob,
} from './assets';
import { createCard, createCourse, createDeck, createLesson, createNote } from './repository';
import { exportDatabase, importBackup } from './portability';

vi.mock('../utils/compressImage', () => ({
  compressImageBlob: vi.fn(async (blob: Blob) => ({ blob, width: 0, height: 0 })),
}));

async function reset() {
  await Promise.all([
    db.decks.clear(),
    db.cards.clear(),
    db.assets.clear(),
    db.sessionHistory.clear(),
    db.userPerformance.clear(),
    db.courses.clear(),
    db.lessons.clear(),
    db.notes.clear(),
  ]);
}

describe('image assets', () => {
  beforeEach(reset);

  it('deduplicates identical blobs by content hash', async () => {
    const first = await storeImageBlob(
      new Blob(['same'], { type: 'image/png' }),
      'image/png',
      10,
      8,
    );
    const second = await storeImageBlob(
      new Blob(['same'], { type: 'image/png' }),
      'image/png',
      10,
      8,
    );

    expect(first.hash).toBe(second.hash);
    expect(await db.assets.count()).toBe(1);
  });

  it('extracts base64 image Markdown into asset references idempotently', async () => {
    const dataUri = `data:image/png;base64,${btoa('png-bytes')}`;
    const markdown = `Before ![diagram](${dataUri}) after`;

    const migrated = await extractMarkdownAssets(markdown, (asset) => db.assets.put(asset));
    const hashes = referencedAssetHashes(migrated);

    expect(hashes).toHaveLength(1);
    expect(migrated).toContain(assetUrl(hashes[0]));
    expect(migrated).not.toContain('data:image/png;base64');

    const again = await extractMarkdownAssets(migrated, (asset) => db.assets.put(asset));
    expect(again).toBe(migrated);
    expect(await db.assets.count()).toBe(1);
  });

  it('round-trips referenced assets through backup export and import', async () => {
    const deck = await createDeck('Images');
    const asset = await storeImageBlob(
      new Blob(['backup-image'], { type: 'image/png' }),
      'image/png',
      20,
      12,
    );
    await createCard(deck.id, 'front_back', `![scan](${assetUrl(asset.hash)})`, 'answer');

    const backup = await exportDatabase();
    expect(backup.assets).toHaveLength(1);
    expect(backup.assets[0].hash).toBe(asset.hash);

    await reset();
    await importBackup(backup, 'replace');

    expect(await db.assets.count()).toBe(1);
    const imported = (await db.assets.get(asset.hash))!;
    expect(new TextDecoder().decode(await blobToArrayBuffer(imported.blob))).toBe('backup-image');
    const card = (await db.cards.toArray())[0];
    expect(card.front).toContain(assetUrl(asset.hash));
  });

  it('round-trips an asset referenced only by a note', async () => {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson');
    const asset = await storeImageBlob(
      new Blob(['note-image'], { type: 'image/png' }),
      'image/png',
      20,
      12,
    );
    const note = await createNote(
      lesson.id,
      'Illustrated note',
      `![scan](${assetUrl(asset.hash)})`,
    );

    const backup = await exportDatabase();
    expect(backup.assets.map((item) => item.hash)).toEqual([asset.hash]);

    await reset();
    await importBackup(backup, 'replace');

    expect(await db.assets.get(asset.hash)).toBeDefined();
    expect((await db.notes.get(note.id))?.content).toContain(assetUrl(asset.hash));
  });

  it('extracts a legacy inline note image while importing a backup', async () => {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson');
    const note = await createNote(lesson.id, 'Legacy note', 'placeholder');
    const backup = await exportDatabase();
    backup.notes![0] = {
      ...note,
      content: `![scan](data:image/png;base64,${btoa('legacy-note-image')})`,
    };

    await importBackup(backup, 'replace');

    const imported = await db.notes.get(note.id);
    expect(referencedAssetHashes(imported!.content)).toHaveLength(1);
    expect(await db.assets.count()).toBe(1);
  });
});
