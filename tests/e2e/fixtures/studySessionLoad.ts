import { seed as seedHeavy } from '../../../scripts/performance-heavy/fixture';
import type { Card } from '../../../src/db/types';
import { db } from '../../../src/db/schema';
import { assetUrl, storeImageBlob } from '../../../src/db/assets';
import { reviewHistoryEntriesForCard } from '../../../src/db/reviewHistory';
import type { StudyImageFixture } from './largeStudyImages';
import { buildCardConcept } from '../../../src/questions/concepts';

/** Original-sized imported assets, stored through the same byte/hash seam as APKG media. */
export async function seed(images: StudyImageFixture[]) {
  await seedHeavy(true);
  await db.open();
  const originals = await db.cards.toArray();
  const history = await db.reviewHistory.toArray();
  const cards: Card[] = Array.from({ length: 322 }, (_, i) => {
    const source = originals[i % originals.length];
    return {
      ...source, id: `biology-card-${String(i).padStart(3, '0')}`,
      conceptId: `biology-concept-${i}`,
      front: `Biology ${i}: identify the cell structure and explain its function.`,
      back: 'The mitochondrion produces ATP through aerobic respiration.',
      history: history.filter((entry) => entry.cardId === source.id)
        .map((entry, r) => ({ ...entry, eventId: `biology-review-${i}-${r}` })),
    };
  });
  await db.cards.clear();
  await db.reviewHistory.clear();
  let bytes = 0;
  for (const [i, image] of images.entries()) {
    const blob = await (await fetch(image.url)).blob();
    const asset = await storeImageBlob(blob, image.mimeType, image.width, image.height);
    if (asset.hash !== image.hash) throw new Error('Fixture image bytes changed during seeding');
    const stored = (await db.assets.get(asset.hash))!.blob;
    bytes += stored instanceof Blob ? stored.size : stored.byteLength;
    const cardIndex = i;
    if (i % 2 === 0) {
      cards[cardIndex].front += `\n\n![Cell specimen](${assetUrl(asset.hash)})`;
    } else {
      const regionId = `biology-region-${i}`;
      Object.assign(cards[cardIndex], { occlusionRegionId: regionId });
      await db.occlusions.add({
        id: `biology-occlusion-${i}`, courseId: 'heavy-course-0', primaryLessonId: cards[cardIndex].primaryLessonId!,
        name: `Cell structures ${i}`, assetHash: asset.hash,
        regions: [{ id: regionId, role: 'label', shape: 'rectangle', x: 0.1, y: 0.2, w: 0.3, h: 0.1, answerText: 'Mitochondrion' }],
        createdAt: i, updatedAt: Date.now(),
      });
    }
  }
  await db.reviewHistory.bulkAdd(cards.flatMap(reviewHistoryEntriesForCard));
  await db.concepts.bulkPut(cards.map((card) => buildCardConcept({
    id: card.conceptId, courseId: card.courseId!, schedulingUnitId: card.schedulingUnitId,
    name: 'Cell biology', now: Date.now(),
  })));
  await db.cards.bulkAdd(cards);
  await db.courses.update('heavy-course-0', { name: 'Biology', learnFirst: false });
  await db.lessonCardExposures.clear();
  await db.lessonCardExposures.bulkAdd(cards.map((card) => ({
    lessonId: card.primaryLessonId!, cardId: card.id, taughtAt: card.createdAt, updatedAt: Date.now(),
  })));
  const reviews = await db.reviewHistory.count();
  db.close();
  return { cards: cards.length, imageCards: images.length / 2, occlusionCards: images.length / 2,
    imageBytes: bytes, reviews, distinctImages: new Set(images.map((image) => image.hash)).size,
    minImageBytes: Math.min(...images.map((image) => image.bytes)),
    maxImageBytes: Math.max(...images.map((image) => image.bytes)) };
}
