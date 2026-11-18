import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './schema';
import {
  assetUrl,
  ASSET_GC_GRACE_MS,
  collectOrphanedAssets,
  storeAudioBlob,
  storeImageBlob,
} from './assets';
import { createCard, createCourse, deleteCards, updateCard } from './repository';
import { clearDraft, draftKey, saveDraft } from '../utils/drafts';
import { createOcclusion, deleteOcclusion } from './occlusionRepository';
import type { OcclusionRegion } from '@lacuna/core/db/types';
import {
  createConcept,
  createFixedQuestion,
  deleteQuestion,
  startQuestionAttempt,
} from '../questions/repository';

/** A sweep after the grace period, so fresh test assets are eligible for collection. */
const afterGrace = () => Date.now() + ASSET_GC_GRACE_MS;

async function reset() {
  localStorage.clear();
  await Promise.all([
    db.schedulingUnits.clear(),
    db.cards.clear(),
    db.assets.clear(),
    db.sessionHistory.clear(),
    db.userPerformance.clear(),
    db.notes.clear(),
    db.courses.clear(),
    db.occlusions.clear(),
    db.concepts.clear(),
    db.questions.clear(),
    db.questionConcepts.clear(),
    db.questionAttempts.clear(),
    db.appState.clear(),
  ]);
}

describe('asset garbage collection', () => {
  beforeEach(reset);

  it('returns zero for an empty asset store', async () => {
    expect(await collectOrphanedAssets()).toBe(0);
  });

  it('keeps a freshly stored asset that an open editor has not saved yet', async () => {
    // Uploading stores the asset before the card that references it is saved; a sweep
    // scheduled by anything else in that window must not delete it.
    const asset = await storeImageBlob(
      new Blob(['unsaved'], { type: 'image/png' }),
      'image/png',
      4,
      3,
    );

    expect(await collectOrphanedAssets()).toBe(0);
    expect(await db.assets.get(asset.hash)).toBeDefined();
  });

  it('collects an orphan exactly one grace period after it was stored', async () => {
    const storedAt = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(storedAt);
    const asset = await storeImageBlob(
      new Blob(['expired'], { type: 'image/png' }),
      'image/png',
      4,
      3,
    );
    vi.restoreAllMocks();

    expect(await collectOrphanedAssets(storedAt + ASSET_GC_GRACE_MS)).toBe(1);
    expect(await db.assets.get(asset.hash)).toBeUndefined();
  });

  it('still sweeps eligible and undated assets when grace-exempt assets share the store', async () => {
    const [expired, undated, fresh] = await Promise.all(
      ['expired', 'undated', 'fresh'].map((label) =>
        storeImageBlob(new Blob([label], { type: 'image/png' }), 'image/png', 4, 3),
      ),
    );
    const now = Date.now();
    await db.assets.update(expired.hash, { createdAt: now - ASSET_GC_GRACE_MS });
    await db.assets.update(undated.hash, { createdAt: undefined });

    expect(await collectOrphanedAssets(now)).toBe(2);
    expect(await db.assets.get(expired.hash)).toBeUndefined();
    expect(await db.assets.get(undated.hash)).toBeUndefined();
    expect(await db.assets.get(fresh.hash)).toBeDefined();
  });

  it('retains an asset referenced only by a local Question Set draft', async () => {
    const asset = await storeImageBlob(
      new Blob(['draft'], { type: 'image/png' }),
      'image/png',
      4,
      3,
    );
    await db.appState.put({
      key: 'questionSetDraft:course:set',
      value: { content: { title: `![draft](${assetUrl(asset.hash)})` } },
    });

    expect(await collectOrphanedAssets(afterGrace())).toBe(0);
    expect(await db.assets.get(asset.hash)).toBeDefined();
  });

  it.each([
    ['lesson card', draftKey('lesson', 'new')],
    ['bank card', draftKey('bank:course', 'card')],
    ['session card', draftKey('lesson', 'session:card')],
    ['Question', draftKey('question:course', 'new')],
  ])('keeps draft-only image and audio for a saved %s until discarded', async (owner, key) => {
    const image = await storeImageBlob(new Blob(['draft image']), 'image/png', 4, 3);
    const audio = await storeAudioBlob(new Blob(['draft audio'], { type: 'audio/mpeg' }));
    const front = `![diagram](${assetUrl(image.hash)})`;
    const back = `![audio](${assetUrl(audio.hash)})`;
    saveDraft(
      key,
      owner === 'Question'
        ? { state: { prompt: front, explanation: back }, timestamp: 1 }
        : { type: 'front_back', front, back, tags: [], timestamp: 1 },
    );
    // Neither unrelated storage nor malformed drafts should protect orphaned media.
    const orphan = await storeImageBlob(new Blob(['orphan']), 'image/png', 4, 3);
    localStorage.setItem('unrelated', JSON.stringify({ front: assetUrl(orphan.hash) }));
    localStorage.setItem(draftKey('broken', 'new'), `{ "front": "${assetUrl(orphan.hash)}"`);

    const now = afterGrace();
    expect(await collectOrphanedAssets(now)).toBe(1);
    expect(await db.assets.get(image.hash)).toBeDefined();
    expect(await db.assets.get(audio.hash)).toBeDefined();
    expect(await db.assets.get(orphan.hash)).toBeUndefined();

    clearDraft(key);

    expect(await collectOrphanedAssets(now)).toBe(2);
    expect(await db.assets.count()).toBe(0);
  });

  it('does not delete assets when saved drafts cannot be read', async () => {
    const asset = await storeImageBlob(new Blob(['unreadable draft']), 'image/png', 4, 3);
    saveDraft(draftKey('lesson', 'new'), { front: assetUrl(asset.hash) });
    const read = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    try {
      await expect(collectOrphanedAssets(afterGrace())).rejects.toThrow('Storage unavailable');
      expect(await db.assets.get(asset.hash)).toBeDefined();
    } finally {
      read.mockRestore();
    }
    // A failed sweep must also release the collector for subsequent sweeps.
    clearDraft(draftKey('lesson', 'new'));
    expect(await collectOrphanedAssets(afterGrace())).toBe(1);
  });

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
    const removed = await collectOrphanedAssets(afterGrace());
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
    const removed = await collectOrphanedAssets(afterGrace());
    expect(removed).toBe(0);
    expect(await db.assets.count()).toBe(1);

    await deleteCards([c2.id]);
    const removed2 = await collectOrphanedAssets(afterGrace());
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
    const removed = await collectOrphanedAssets(afterGrace());
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
    const removed = await collectOrphanedAssets(afterGrace());
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
      updatedAt: 1,
    });

    expect(await collectOrphanedAssets(afterGrace())).toBe(0);
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

    expect(await collectOrphanedAssets(afterGrace())).toBe(0);
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
    const removed = await collectOrphanedAssets(afterGrace());
    expect(removed).toBe(1);
    expect(await db.assets.get(asset.hash)).toBeUndefined();
  });

  it('retains an asset referenced by an immutable Question receipt after deletion', async () => {
    const course = await createCourse('Questions');
    const concept = await createConcept(course.id, 'Addition');
    const asset = await storeImageBlob(
      new Blob(['worked-diagram'], { type: 'image/png' }),
      'image/png',
      4,
      3,
    );
    const question = await createFixedQuestion({
      courseId: course.id,
      name: 'Addition',
      targetConceptId: concept.id,
      prompt: `Calculate 1 + 1\n\n![diagram](${assetUrl(asset.hash)})`,
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '2' } },
      explanation: 'One plus one is two.',
    });
    await startQuestionAttempt({ questionId: question.id, sessionId: 'session-1' });
    await deleteQuestion(question.id);

    expect(await collectOrphanedAssets(afterGrace())).toBe(0);
    expect(await db.assets.get(asset.hash)).toBeDefined();
  });
});
