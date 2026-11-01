import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { exportDatabase, importBackup } from './portability';
import { createCourse, createCard, createSequence } from './repository';
import { createOcclusion } from './occlusionRepository';
import { storeImageBlob } from './assets';

import { reset } from './portability.testFixtures';

describe('backup generated', () => {
  beforeEach(reset);

  it('round-trips a sequence in replace mode', async () => {
    const course = await createCourse('Chemistry');
    await createSequence(course.id, null, 'Group 1 metals', [
      { id: 'item-1', value: 'Lithium' },
      { id: 'item-2', value: 'Sodium' },
    ]);
    const backup = await exportDatabase();

    await createCourse('Ephemeral');
    expect(await db.courses.count()).toBe(2);

    await importBackup(backup, 'replace');

    const sequences = await db.sequences.toArray();
    expect(sequences).toHaveLength(1);
    expect(sequences[0].name).toBe('Group 1 metals');
    expect(sequences[0].items).toHaveLength(2);
    // The sequence's generated cards ride along as ordinary cards.
    const cards = await db.cards.where('sequenceItemId').equals('item-1').toArray();
    expect(cards).toHaveLength(1);
  });

  it('adds a missing sequence in merge mode', async () => {
    const course = await createCourse('Chemistry');
    const sequence = await createSequence(course.id, null, 'Group 1 metals', [
      { id: 'item-1', value: 'Lithium' },
    ]);
    const backup = await exportDatabase();

    await db.sequences.delete(sequence.id);
    expect(await db.sequences.count()).toBe(0);

    await importBackup(backup, 'merge');

    const sequences = await db.sequences.toArray();
    expect(sequences).toHaveLength(1);
    expect(sequences[0].name).toBe('Group 1 metals');
  });

  it('resolves a sequence id collision by newer createdAt in merge mode', async () => {
    const course = await createCourse('Chemistry');
    const sequence = await createSequence(course.id, null, 'Group 1 metals', [
      { id: 'item-1', value: 'Lithium' },
    ]);
    const backup = await exportDatabase();

    await db.sequences.update(sequence.id, {
      name: 'Group 1 metals (renamed)',
      createdAt: sequence.createdAt + 1000,
    });
    await importBackup(backup, 'merge');

    const updated = await db.sequences.get(sequence.id);
    expect(updated!.name).toBe('Group 1 metals (renamed)'); // local wins because more recently created/edited
  });

  it('round-trips an occlusion and its diagram in replace mode', async () => {
    const course = await createCourse('Biology');
    const asset = await storeImageBlob(
      new Blob(['diagram'], { type: 'image/png' }),
      'image/png',
      800,
      600,
    );
    await createOcclusion(course.id, null, 'Plant cell', asset.hash, [
      { id: 'region-1', role: 'label', shape: 'rectangle', x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
      { id: 'region-2', role: 'label', shape: 'rectangle', x: 0.5, y: 0.4, w: 0.2, h: 0.1 },
    ]);
    const backup = await exportDatabase();
    // The diagram is referenced only by Occlusion.assetHash, never by card Markdown,
    // so a backup that gathered assets from card content alone would lose it.
    expect(backup.assets.map((a) => a.hash)).toContain(asset.hash);

    await createCourse('Ephemeral');
    await importBackup(backup, 'replace');

    const occlusions = await db.occlusions.toArray();
    expect(occlusions).toHaveLength(1);
    expect(occlusions[0].name).toBe('Plant cell');
    expect(occlusions[0].regions).toHaveLength(2);
    expect(await db.assets.get(asset.hash)).toBeDefined();
    // Generated cards ride along as ordinary cards, anchored by region id.
    const cards = await db.cards.where('occlusionRegionId').equals('region-1').toArray();
    expect(cards).toHaveLength(1);
  });

  it('adds a missing occlusion in merge mode and keeps the newer copy on collision', async () => {
    const course = await createCourse('Biology');
    const asset = await storeImageBlob(
      new Blob(['diagram'], { type: 'image/png' }),
      'image/png',
      800,
      600,
    );
    const occlusion = await createOcclusion(course.id, null, 'Plant cell', asset.hash, [
      { id: 'region-1', role: 'label', shape: 'rectangle', x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
    ]);
    const backup = await exportDatabase();

    await db.occlusions.delete(occlusion.id);
    await importBackup(backup, 'merge');
    expect((await db.occlusions.toArray())[0].name).toBe('Plant cell');

    await db.occlusions.update(occlusion.id, {
      name: 'Plant cell (renamed)',
      createdAt: occlusion.createdAt + 1000,
    });
    await importBackup(backup, 'merge');
    // Local wins because it was more recently created/edited.
    expect((await db.occlusions.get(occlusion.id))!.name).toBe('Plant cell (renamed)');
  });

  it('imports an older backup without an occlusions array cleanly', async () => {
    const deck = await createCourse('Legacy');
    await createCard(deck.id, 'front_back', 'Q1', 'A1');
    const backup = await exportDatabase();
    const legacyBackup = { ...backup };
    delete legacyBackup.occlusions;

    await importBackup(legacyBackup, 'replace');

    expect(await db.occlusions.count()).toBe(0);
    expect(await db.schedulingUnits.count()).toBe(1);
  });

  it('imports an older backup without a sequences array cleanly', async () => {
    const deck = await createCourse('Legacy');
    await createCard(deck.id, 'front_back', 'Q1', 'A1');
    const backup = await exportDatabase();
    const legacyBackup = { ...backup };
    delete legacyBackup.sequences;

    await importBackup(legacyBackup, 'replace');

    expect(await db.sequences.count()).toBe(0);
    const decks = await db.schedulingUnits.toArray();
    expect(decks).toHaveLength(1);
  });
});
