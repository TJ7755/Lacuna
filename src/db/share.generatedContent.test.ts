import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { createCourse, createLesson, createSequence } from './repository';
import { createOcclusion } from './occlusionRepository';
import { buildCourseShareCode, decodeShare, encodeShareDirect, importSharePayload } from './share';
import { storeImageBlob } from './assets';
import { reset } from './share.testFixtures';

describe('generated content sharing', () => {
  beforeEach(reset);

  it('round-trips a course with a sequence and its generated cards, incl. a label card', async () => {
    const course = await createCourse('Chemistry');
    const lesson = await createLesson(course.id, 'Periodic table');
    const sequence = await createSequence(
      course.id,
      lesson.id,
      'Group 1 metals',
      [
        { id: 'item-li', value: 'Lithium', label: '3' },
        { id: 'item-na', value: 'Sodium', label: '11' },
      ],
      { generateLabelCards: true },
    );

    const code = await buildCourseShareCode(course.id);
    const payload = await decodeShare(code);
    if (payload.v === 1) throw new Error('expected a course payload');

    expect(payload.sequences).toHaveLength(1);
    expect(payload.sequences![0].n).toBe('Group 1 metals');
    expect(payload.sequences![0].items).toHaveLength(2);
    expect(payload.sequences![0].lc).toBe(1);
    // Positional + label cards for both items = 4 shared cards, each carrying `si`.
    expect(payload.lessons[0].cards).toHaveLength(4);
    expect(payload.lessons[0].cards.every((c) => typeof c.si === 'string')).toBe(true);
    expect(payload.lessons[0].cards.some((c) => c.si === 'item-li::label')).toBe(true);

    await importSharePayload(payload);

    const importedSequences = await db.sequences.toArray();
    const imported = importedSequences.find((s) => s.id !== sequence.id)!;
    expect(imported.name).toBe('Group 1 metals');
    expect(imported.generateLabelCards).toBe(true);
    expect(imported.items).toHaveLength(2);
    // Item ids are freshly minted, not reused from the original sequence.
    expect(imported.items.map((i) => i.id)).not.toContain('item-li');

    const importedLithiumItem = imported.items.find((i) => i.value === 'Lithium')!;
    const positional = await db.cards
      .where('sequenceItemId')
      .equals(importedLithiumItem.id)
      .first();
    const labelCard = await db.cards
      .where('sequenceItemId')
      .equals(`${importedLithiumItem.id}::label`)
      .first();
    expect(positional).toBeDefined();
    expect(labelCard).toBeDefined();
    expect(positional!.back).toBe('Lithium');
    expect(labelCard!.back).toBe('Lithium');
  });

  it('round-trips a lines-mode sequence with speaker-tagged items, mySpeaker and recitationChunkSize', async () => {
    const course = await createCourse('Drama');
    const lesson = await createLesson(course.id, 'Scene one');
    const sequence = await createSequence(
      course.id,
      lesson.id,
      'Scene one',
      [
        { id: 'l1', value: 'Hello there.', speaker: 'BOB' },
        { id: 'l2', value: 'General Kenobi.', speaker: 'ALICE' },
      ],
      { mode: 'lines', mySpeaker: 'ALICE', recitationChunkSize: 4 },
    );

    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v === 1) throw new Error('expected a course payload');

    expect(payload.sequences).toHaveLength(1);
    expect(payload.sequences![0].m).toBe('lines');
    expect(payload.sequences![0].ms).toBe('ALICE');
    expect(payload.sequences![0].rc).toBe(4);
    expect(payload.sequences![0].items.map((i) => i.sp)).toEqual(['BOB', 'ALICE']);
    // Only ALICE's line generates a card.
    expect(payload.lessons[0].cards).toHaveLength(1);

    await importSharePayload(payload);

    const importedSequences = await db.sequences.toArray();
    const imported = importedSequences.find((s) => s.id !== sequence.id)!;
    expect(imported.mode).toBe('lines');
    expect(imported.mySpeaker).toBe('ALICE');
    expect(imported.recitationChunkSize).toBe(4);
    expect(imported.items.map((i) => i.speaker)).toEqual(['BOB', 'ALICE']);
  });

  it('round-trips a speakerless lines-mode sequence, omitting the preset id when it matches the m/ms inference', async () => {
    const course = await createCourse('Poetry');
    const lesson = await createLesson(course.id, 'Sonnets');
    const sequence = await createSequence(
      course.id,
      lesson.id,
      'Sonnet 18',
      [{ id: 'l1', value: 'Shall I compare thee to a summer’s day?' }],
      { mode: 'lines', presetId: 'poetry' },
    );

    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v === 1) throw new Error('expected a course payload');

    expect(payload.sequences).toHaveLength(1);
    expect(payload.sequences![0].m).toBe('lines');
    expect(payload.sequences![0].ms).toBeUndefined();
    // presetForSequence already infers 'poetry' from mode 'lines' + no mySpeaker, so
    // the id itself doesn't need to travel.
    expect(payload.sequences![0].pr).toBeUndefined();

    await importSharePayload(payload);
    const imported = (await db.sequences.toArray()).find((s) => s.id !== sequence.id)!;
    expect(imported.presetId).toBeUndefined();
  });

  it('round-trips the preset id when it cannot be re-inferred from mode/mySpeaker (speech vs. poetry)', async () => {
    const course = await createCourse('Rhetoric');
    const lesson = await createLesson(course.id, 'Gettysburg Address');
    const sequence = await createSequence(
      course.id,
      lesson.id,
      'Opening lines',
      [{ id: 'l1', value: 'Four score and seven years ago…' }],
      { mode: 'lines', presetId: 'speech' },
    );

    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v === 1) throw new Error('expected a course payload');

    expect(payload.sequences![0].pr).toBe('speech');

    await importSharePayload(payload);
    const imported = (await db.sequences.toArray()).find((s) => s.id !== sequence.id)!;
    expect(imported.presetId).toBe('speech');
  });

  it('excludes bank-scoped sequences from a course share while lesson-scoped ones still round-trip', async () => {
    const course = await createCourse('Chemistry');
    const lesson = await createLesson(course.id, 'Periodic table');
    await createSequence(course.id, lesson.id, 'Group 1 metals', [
      { id: 'item-li', value: 'Lithium', label: '3' },
      { id: 'item-na', value: 'Sodium', label: '11' },
    ]);
    // A sequence created from the Question Bank has no primary lesson, and its
    // generated cards (also primaryLessonId null) are never packed into a share —
    // so the sequence itself must be excluded too, or it would import with no cards.
    await createSequence(course.id, null, 'Bank sequence', [
      { id: 'item-k', value: 'Potassium', label: '19' },
    ]);

    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v === 1) throw new Error('expected a course payload');

    expect(payload.sequences).toHaveLength(1);
    expect(payload.sequences![0].n).toBe('Group 1 metals');

    await importSharePayload(payload);

    // Two originals (lesson-scoped + bank-scoped) already exist pre-import; the import
    // should only ever add the lesson-scoped one back, never a second bank sequence.
    const allSequences = await db.sequences.toArray();
    expect(allSequences.filter((s) => s.name === 'Group 1 metals')).toHaveLength(2);
    expect(allSequences.filter((s) => s.name === 'Bank sequence')).toHaveLength(1);
  });

  it('round-trips an occlusion, remapping region ids and pairings', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const asset = await storeImageBlob(
      new Blob(['diagram'], { type: 'image/png' }),
      'image/png',
      800,
      600,
    );
    const occlusion = await createOcclusion(course.id, lesson.id, 'Plant cell', asset.hash, [
      {
        id: 'region-nucleus',
        role: 'label',
        shape: 'rectangle',
        x: 0.1,
        y: 0.1,
        w: 0.2,
        h: 0.1,
        answerText: 'Nucleus',
      },
      {
        id: 'region-arrow',
        role: 'feature',
        shape: 'rectangle',
        x: 0.5,
        y: 0.4,
        w: 0.1,
        h: 0.1,
        pairedRegionId: 'region-nucleus',
        backNote: 'Contains the DNA.',
      },
    ]);

    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v === 1) throw new Error('expected a course payload');

    expect(payload.occlusions).toHaveLength(1);
    expect(payload.occlusions![0].n).toBe('Plant cell');
    expect(payload.occlusions![0].ah).toBe(asset.hash);
    expect(payload.occlusions![0].regions.map((r) => r.r)).toEqual([0, 1]);
    // One card per region, each carrying its `oc` reference.
    expect(payload.lessons[0].cards).toHaveLength(2);
    expect(payload.lessons[0].cards.every((c) => typeof c.oc === 'string')).toBe(true);

    await importSharePayload(payload);

    const imported = (await db.occlusions.toArray()).find((o) => o.id !== occlusion.id)!;
    expect(imported.name).toBe('Plant cell');
    expect(imported.assetHash).toBe(asset.hash);
    expect(imported.regions).toHaveLength(2);
    // Region ids are freshly minted, and the pairing follows them.
    expect(imported.regions.map((r) => r.id)).not.toContain('region-nucleus');
    const label = imported.regions.find((r) => r.role === 'label')!;
    const feature = imported.regions.find((r) => r.role === 'feature')!;
    expect(feature.pairedRegionId).toBe(label.id);
    expect(feature.backNote).toBe('Contains the DNA.');
    expect(label.shape).toBe('rectangle');
    expect(label.x).toBe(0.1);
    // The generated cards point at the remapped region ids.
    expect(await db.cards.where('occlusionRegionId').equals(label.id).count()).toBe(1);
    expect(await db.cards.where('occlusionRegionId').equals(feature.id).count()).toBe(1);
  });

  it('excludes bank-scoped occlusions from a course share', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const asset = await storeImageBlob(
      new Blob(['diagram'], { type: 'image/png' }),
      'image/png',
      800,
      600,
    );
    await createOcclusion(course.id, lesson.id, 'Plant cell', asset.hash, [
      { id: 'region-1', role: 'label', shape: 'rectangle', x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
    ]);
    // Bank-scoped, like the sequence case above: its generated cards are never packed,
    // so the occlusion must not travel either or it would import with no cards.
    await createOcclusion(course.id, null, 'Bank diagram', asset.hash, [
      { id: 'region-2', role: 'label', shape: 'rectangle', x: 0.3, y: 0.3, w: 0.2, h: 0.1 },
    ]);

    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v === 1) throw new Error('expected a course payload');

    expect(payload.occlusions).toHaveLength(1);
    expect(payload.occlusions![0].n).toBe('Plant cell');

    await importSharePayload(payload);

    const all = await db.occlusions.toArray();
    expect(all.filter((o) => o.name === 'Plant cell')).toHaveLength(2);
    expect(all.filter((o) => o.name === 'Bank diagram')).toHaveLength(1);
  });

  it('parses an old v2 payload with no sequences field', async () => {
    const legacyPayload = {
      v: 2 as const,
      by: null,
      at: Date.now(),
      course: {
        n: 'Legacy course',
        o: 0 as const,
        c: 0,
        e: 0,
        um: 'linear' as const,
      },
      lessons: [{ n: 'Lesson 1', notes: [], cards: [{ k: 0 as const, f: 'Q', b: 'A' }] }],
    };

    const code = await encodeShareDirect(legacyPayload);
    const payload = await decodeShare(code);
    if (payload.v === 1) throw new Error('expected a course payload');
    expect(payload.sequences).toBeUndefined();
    expect(payload.occlusions).toBeUndefined();
    expect(payload.lessons).toHaveLength(1);

    const result = await importSharePayload(payload);
    expect(result.courses).toBe(1);
    expect(await db.sequences.count()).toBe(0);
    expect(await db.occlusions.count()).toBe(0);
  });
});
