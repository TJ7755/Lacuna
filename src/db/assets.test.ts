import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './schema';
import {
  assetUrl,
  backupAssetToMediaAsset,
  blobToArrayBuffer,
  collectOrphanedAssets,
  extractMarkdownAssets,
  referencedAssetHashes,
  referencedAssetHashesInCards,
  referencedAssetHashesInValues,
  scheduleAssetGc,
  storeAudioBlob,
  storeImageBlob,
  stripAssetMedia,
  toBlob,
} from './assets';
import { compressImageBlob } from '../utils/compressImage';
import { createCard, createCourse, createLesson, createNote } from './repository';
import { exportDatabase, importBackup } from './portability';

vi.mock('../utils/compressImage', () => ({
  compressImageBlob: vi.fn(async (blob: Blob) => ({ blob, width: 0, height: 0 })),
}));

async function reset() {
  await Promise.all([
    db.schedulingUnits.clear(),
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

  it('converts whole and sliced byte buffers without including unrelated bytes', async () => {
    const original = new Blob(['native'], { type: 'image/png' });
    expect(toBlob(original)).toBe(original);

    const bytes = new TextEncoder().encode('prefix-image-suffix');
    const sliced = toBlob(bytes.subarray(7, 12), 'image/png');
    expect(sliced.type).toBe('image/png');
    expect(await sliced.text()).toBe('image');
    expect(await blobToArrayBuffer(bytes.subarray(7, 12))).toEqual(
      new TextEncoder().encode('image').buffer,
    );

    const buffer = new TextEncoder().encode('whole').buffer;
    expect(await toBlob(buffer, 'image/webp').text()).toBe('whole');
    expect(await blobToArrayBuffer(buffer)).toBe(buffer);
  });

  it('finds unique asset references in nested and cyclic recovery values', () => {
    const first = 'a'.repeat(64);
    const second = 'b'.repeat(64);
    const nested: Record<string, unknown> = {
      prompt: `![scan](${assetUrl(first)})`,
      choices: [null, 42, { explanation: assetUrl(second) }],
    };
    nested.self = nested;

    expect(referencedAssetHashesInValues(nested, [assetUrl(first)])).toEqual([first, second]);
    expect(
      referencedAssetHashesInCards([
        { front: assetUrl(first), back: assetUrl(second) },
        { front: assetUrl(first), back: 'No media' },
      ]),
    ).toEqual([first, second]);
  });

  it('strips inline, reference-style and HTML asset media from a share code', () => {
    const hash = 'c'.repeat(64);
    const source = [
      `![audio](${assetUrl(hash)})`,
      `![diagram](${assetUrl(hash)})`,
      `![scan][figure.1]`,
      `[figure.1]: ${assetUrl(hash)}`,
      `<img alt="hidden" src="${assetUrl(hash)}">`,
      '![remote](https://example.com/image.png)',
    ].join('\r\n');

    const result = stripAssetMedia(source);
    expect(result.stripped).toBe(true);
    expect(result.markdown).toContain('[Audio omitted from share code: audio]');
    expect(result.markdown).toContain('[Image omitted from share code: diagram]');
    expect(result.markdown).toContain('[Image omitted from share code: scan]');
    expect(result.markdown).toContain('![remote](https://example.com/image.png)');
    expect(result.markdown).not.toContain(hash);
    expect(stripAssetMedia('Plain text')).toEqual({ markdown: 'Plain text', stripped: false });
  });

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

  it('deduplicates repeated data URIs and trusts explicitly known asset hashes', async () => {
    const uri = `data:image/png;base64,${btoa('same-image')}`;
    const knownHash = 'd'.repeat(64);
    const putAsset = vi.fn(async () => undefined);
    const markdown = `![first](${uri}) ![second](${uri}) ![known](${assetUrl(knownHash)})`;

    const migrated = await extractMarkdownAssets(markdown, putAsset, new Set([knownHash]));
    expect(putAsset).toHaveBeenCalledOnce();
    expect(migrated).not.toContain(uri);
    expect(migrated).toContain(assetUrl(knownHash));
    expect(referencedAssetHashes(migrated)).toHaveLength(2);
  });

  it('keeps original image bytes when compression and dimension reading fail', async () => {
    vi.mocked(compressImageBlob).mockRejectedValueOnce(new Error('Canvas unavailable'));
    vi.stubGlobal('Image', undefined);
    try {
      const uri = `data:image/png;base64,${btoa('original-image')}`;
      const migrated = await extractMarkdownAssets(`![scan](${uri})`, (asset) =>
        db.assets.put(asset),
      );
      const hash = referencedAssetHashes(migrated)[0];
      const asset = await db.assets.get(hash);
      expect(asset).toMatchObject({ kind: 'image', width: 0, height: 0 });
      expect(new TextDecoder().decode(asset?.blob as Uint8Array)).toBe('original-image');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('round-trips referenced assets through backup export and import', async () => {
    const deck = await createCourse('Images');
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

  it('replaces references to missing assets with a broken-image placeholder', async () => {
    const missingHash = 'a'.repeat(64);
    const putAsset = vi.fn(async () => undefined);

    const migrated = await extractMarkdownAssets(`![missing](${assetUrl(missingHash)})`, putAsset);

    expect(migrated).not.toContain(assetUrl(missingHash));
    expect(migrated).toContain('data:image/svg+xml;base64,');
    expect(putAsset).not.toHaveBeenCalled();
  });

  it('rejects malformed base64 when converting a backup asset', async () => {
    expect(() =>
      // The hash is deliberately valid; the encoded bytes are not.
      backupAssetToMediaAsset({
        hash: 'b'.repeat(64),
        data: 'not base64 %%%',
        mimeType: 'image/png',
        kind: 'image',
        width: 1,
        height: 1,
        createdAt: 1,
      }),
    ).toThrow('Invalid base64 data in image asset.');
  });

  it('removes unreferenced assets while preserving card references', async () => {
    const course = await createCourse('Assets');
    const orphan = await storeImageBlob(
      new Blob(['orphan'], { type: 'image/png' }),
      'image/png',
      1,
      1,
    );
    const kept = await storeImageBlob(new Blob(['kept'], { type: 'image/png' }), 'image/png', 1, 1);
    await createCard(course.id, 'front_back', `![kept](${assetUrl(kept.hash)})`, 'answer');

    expect(await collectOrphanedAssets()).toBe(1);
    expect(await db.assets.get(orphan.hash)).toBeUndefined();
    expect(await db.assets.get(kept.hash)).toBeDefined();
  });

  it('runs one deferred orphan sweep after rapid rescheduling', async () => {
    const orphan = await storeImageBlob(new Blob(['deferred']), 'image/png', 1, 1);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      scheduleAssetGc(100);
      await vi.advanceTimersByTimeAsync(50);
      scheduleAssetGc(100);
      await vi.advanceTimersByTimeAsync(99);
      expect(await db.assets.get(orphan.hash)).toBeDefined();
      await vi.advanceTimersByTimeAsync(1);
      await vi.waitFor(async () => expect(await db.assets.get(orphan.hash)).toBeUndefined());
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('audio assets', () => {
  beforeEach(reset);

  it('stores audio without image dimensions and deduplicates by content', async () => {
    const first = await storeAudioBlob(new Blob(['clip'], { type: 'audio/mpeg' }));
    const second = await storeAudioBlob(new Blob(['clip'], { type: 'audio/mpeg' }));

    expect(first).toMatchObject({ kind: 'audio', mimeType: 'audio/mpeg' });
    expect(first.width).toBeUndefined();
    expect(first.hash).toBe(second.hash);
    expect(await db.assets.count()).toBe(1);
  });

  it('rejects unsupported and oversized audio', async () => {
    await expect(storeAudioBlob(new Blob(['x'], { type: 'audio/aac' }))).rejects.toThrow(
      /MP3, M4A, MP4, Ogg, WAV or WebM/,
    );
    await expect(
      storeAudioBlob(new Blob([new Uint8Array(25 * 1024 * 1024 + 1)], { type: 'audio/mpeg' })),
    ).rejects.toThrow(/25 MB/);
    await expect(storeAudioBlob(new Blob([], { type: 'audio/mpeg' }))).rejects.toThrow(/empty/);
    expect(
      await storeAudioBlob(new Blob(['valid'], { type: 'audio/ogg' }), 'AUDIO/OGG; codecs=opus'),
    ).toMatchObject({ kind: 'audio', mimeType: 'audio/ogg' });
  });

  it('round-trips its kind and bytes through backup export and import', async () => {
    const deck = await createCourse('Audio');
    const asset = await storeAudioBlob(new Blob(['spoken'], { type: 'audio/ogg' }));
    await createCard(deck.id, 'front_back', `![audio](${assetUrl(asset.hash)})`, 'answer');

    const backup = await exportDatabase();
    expect(backup.assets[0]).toMatchObject({ hash: asset.hash, kind: 'audio' });
    await reset();
    await importBackup(backup, 'replace');

    const imported = (await db.assets.get(asset.hash))!;
    expect(imported.kind).toBe('audio');
    expect(new TextDecoder().decode(await blobToArrayBuffer(imported.blob))).toBe('spoken');
  });
});
