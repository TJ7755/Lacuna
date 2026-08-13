import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { assetUrl, collectOrphanedAssets, storeImageBlob } from './assets';
import { createCard, createCourse, deleteCards, updateCard } from './repository';
import { createOcclusion, deleteOcclusion } from './occlusionRepository';
import type { OcclusionRegion } from './types';

async function reset() {
  await Promise.all([
    db.schedulingUnits.clear(),
    db.cards.clear(),
    db.assets.clear(),
    db.sessionHistory.clear(),
    db.userPerformance.clear(),
    db.notes.clear(),
    db.courses.clear(),
    db.occlusions.clear(),
  ]);
}

describe('asset garbage collection', () => {
  beforeEach(reset);

  it('deletes an asset that is no longer referenced by any card', async () => {
    const deck = await createCourse('GC');
    const asset = await storeImageBlob(
      new Blob(['orphan'], { type: 'image/png' }),
      'image/png',
      4,
      3,
    );
    const card = await createCard(
      deck.id,
      'front_back',
      `![pic](${assetUrl(asset.hash)})`,
      'answer',
    );

    await deleteCards([card.id]);
    const removed = await collectOrphanedAssets();
    expect(removed).toBe(1);
    expect(await db.assets.count()).toBe(0);
  });

  it('retains an asset still referenced by another card', async () => {
    const deck = await createCourse('GC');
    const asset = await storeImageBlob(
      new Blob(['shared'], { type: 'image/png' }),
      'image/png',
      4,
      3,
    );
    const c1 = await createCard(deck.id, 'front_back', `![pic](${assetUrl(asset.hash)})`, 'a');
    const c2 = await createCard(deck.id, 'front_back', `![pic](${assetUrl(asset.hash)})`, 'b');

    await deleteCards([c1.id]);
    const removed = await collectOrphanedAssets();
    expect(removed).toBe(0);
    expect(await db.assets.count()).toBe(1);

    await deleteCards([c2.id]);
    const removed2 = await collectOrphanedAssets();
    expect(removed2).toBe(1);
    expect(await db.assets.count()).toBe(0);
  });

  it('collects an asset orphaned by replacing an image in a card', async () => {
    const deck = await createCourse('GC');
    const oldAsset = await storeImageBlob(
      new Blob(['old'], { type: 'image/png' }),
      'image/png',
      4,
      3,
    );
    const card = await createCard(
      deck.id,
      'front_back',
      `![old](${assetUrl(oldAsset.hash)})`,
      'answer',
    );

    await updateCard(card.id, { front: 'No image here.' });
    const removed = await collectOrphanedAssets();
    expect(removed).toBe(1);
    expect(await db.assets.count()).toBe(0);
  });

  it('collects an asset orphaned by deleting a deck', async () => {
    const deck = await createCourse('GC');
    const asset = await storeImageBlob(
      new Blob(['deck-orphan'], { type: 'image/png' }),
      'image/png',
      4,
      3,
    );
    await createCard(deck.id, 'front_back', `![pic](${assetUrl(asset.hash)})`, 'answer');

    const { deleteCourse } = await import('./repository');
    await deleteCourse(deck.id);
    const removed = await collectOrphanedAssets();
    expect(removed).toBe(1);
    expect(await db.assets.count()).toBe(0);
  });

  it('retains an asset referenced only by a note', async () => {
    const asset = await storeImageBlob(
      new Blob(['note-only'], { type: 'image/png' }),
      'image/png',
      4,
      3,
    );
    await db.notes.put({
      id: 'note',
      lessonId: 'lesson',
      name: 'Note',
      content: `![pic](${assetUrl(asset.hash)})`,
      orderIndex: 0,
      createdAt: 1,
    });

    expect(await collectOrphanedAssets()).toBe(0);
    expect(await db.assets.get(asset.hash)).toBeDefined();
  });

  it('retains an occlusion diagram referenced only by Occlusion.assetHash, not by any card Markdown', async () => {
    const course = await createCourse('Biology');
    const asset = await storeImageBlob(
      new Blob(['diagram'], { type: 'image/png' }),
      'image/png',
      4,
      3,
    );
    const region: OcclusionRegion = {
      id: 'r1',
      role: 'label',
      shape: 'rectangle',
      x: 0,
      y: 0,
      w: 0.1,
      h: 0.1,
    };
    await createOcclusion(course.id, null, 'Cell diagram', asset.hash, [region]);

    expect(await collectOrphanedAssets()).toBe(0);
    expect(await db.assets.get(asset.hash)).toBeDefined();
  });

  it('collects an occlusion diagram once its occlusion is deleted', async () => {
    const course = await createCourse('Biology');
    const asset = await storeImageBlob(
      new Blob(['diagram'], { type: 'image/png' }),
      'image/png',
      4,
      3,
    );
    const region: OcclusionRegion = {
      id: 'r1',
      role: 'label',
      shape: 'rectangle',
      x: 0,
      y: 0,
      w: 0.1,
      h: 0.1,
    };
    const occlusion = await createOcclusion(course.id, null, 'Cell diagram', asset.hash, [region]);

    await deleteOcclusion(occlusion.id);
    const removed = await collectOrphanedAssets();
    expect(removed).toBe(1);
    expect(await db.assets.get(asset.hash)).toBeUndefined();
  });
});
