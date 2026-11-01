import { expect } from 'vitest';
import { assetUrl, storeImageBlob } from './assets';
import { createCard, createCourse, createLesson, createNote, recordReview } from './repository';
import { waitForTrajectorySample } from './reviewRepository.testFixtures';
import { reviewHistoryEntryIdForEvent } from '@lacuna/core/db/reviewHistory';
import { db } from './schema';
import type { BackupFile } from '@lacuna/core/db/types';

export async function recoverySequenceSeed(name: string) {
  const course = await createCourse(name);
  const lesson = await createLesson(course.id, `${name} lesson`);
  const asset = await storeImageBlob(new Blob([name]), 'image/png', 2, 1);
  const card = await createCard(
    course.id,
    'front_back',
    `![${name}](${assetUrl(asset.hash)})`,
    `${name} answer`,
  );
  const note = await createNote(lesson.id, `${name} note`, `${name} retained text`);
  const eventId = `${name}-review`;
  const timestamp = 1_725_123_456_789;
  await recordReview({
    card,
    deck: course,
    eventId,
    sessionId: `${name}-session`,
    sessionKind: 'deck',
    grade: 3,
    responseTimeSec: 2,
    distracted: false,
    correct: true,
    hintUsed: true,
    now: timestamp,
  });
  await waitForTrajectorySample(eventId);
  return { name, course, card, note, asset, eventId, timestamp };
}

export function recoverySequenceContent({ exportedAt: _exportedAt, ...content }: BackupFile) {
  return content;
}

export async function recoverySequenceExpect(
  ...seeds: Awaited<ReturnType<typeof recoverySequenceSeed>>[]
) {
  expect(await db.cards.count()).toBe(seeds.length);
  expect(await db.courses.count()).toBe(seeds.length);
  expect(await db.notes.count()).toBe(seeds.length);
  expect(await db.reviewHistory.count()).toBe(seeds.length);
  expect(await db.sessionHistory.count()).toBe(seeds.length);
  expect(await db.assets.count()).toBe(seeds.length);
  for (const { name, course, card, note, asset, eventId, timestamp } of seeds) {
    expect(await db.courses.get(course.id)).toMatchObject({ name });
    expect(await db.cards.get(card.id)).toMatchObject({
      front: `![${name}](${assetUrl(asset.hash)})`,
      back: `${name} answer`,
      reps: 1,
      history: [],
    });
    expect(await db.notes.get(note.id)).toMatchObject({ content: `${name} retained text` });
    expect(await db.reviewHistory.get(reviewHistoryEntryIdForEvent(eventId))).toMatchObject({
      eventId,
      cardId: card.id,
      timestamp,
      grade: 3,
      responseTimeSec: 2,
      correct: true,
      hintUsed: true,
    });
    expect(await db.sessionHistory.where('eventId').equals(eventId).toArray()).toEqual([
      expect.objectContaining({ timestamp, sessionId: `${name}-session` }),
    ]);
    const storedAsset = await db.assets.get(asset.hash);
    expect(storedAsset).toMatchObject({ mimeType: 'image/png', width: 2, height: 1 });
    expect(new Uint8Array(storedAsset!.blob as Uint8Array)).toEqual(new TextEncoder().encode(name));
  }
}
