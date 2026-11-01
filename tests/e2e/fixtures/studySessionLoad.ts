import { seed as seedHeavy } from '../../../scripts/performance-heavy/fixture';
import type { Card } from '../../../apps/web/src/db/types';
import { db } from '../../../apps/web/src/db/schema';
import { assetUrl, storeImageBlob } from '../../../apps/web/src/db/assets';
import { reviewHistoryEntriesForCard } from '../../../apps/web/src/db/reviewHistory';
import { buildCardConcept } from '../../../apps/web/src/questions/concepts';

/** Disposable browser fixture using the same compressed byte assets as imported images. */
export async function seed() {
  await seedHeavy(true);
  await db.open();
  const originals = await db.cards.toArray();
  const history = await db.reviewHistory.toArray();
  const cards: Card[] = Array.from({ length: 322 }, (_, i) => {
    const source = originals[i % originals.length];
    return {
      ...source,
      id: `biology-card-${String(i).padStart(3, '0')}`,
      conceptId: `biology-concept-${i}`,
      front: `Biology ${i}: identify the cell structure and explain its function.`,
      back: 'The mitochondrion produces ATP through aerobic respiration.',
      history: history
        .filter((entry) => entry.cardId === source.id)
        .map((entry, r) => ({ ...entry, eventId: `biology-review-${i}-${r}` })),
    };
  });
  await db.cards.clear();
  await db.reviewHistory.clear();
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 960;
  const ctx = canvas.getContext('2d')!;
  let bytes = 0;
  for (let i = 0; i < 210; i++) {
    // A textured microscopy-like image: unique, decodable, and large enough to exercise storage.
    const pixels = ctx.createImageData(canvas.width, canvas.height);
    let random = i + 1;
    for (let p = 0; p < pixels.data.length; p += 4) {
      random = (Math.imul(random, 1664525) + 1013904223) | 0;
      pixels.data[p] = (random >>> 24) & 255;
      pixels.data[p + 1] = 100 + ((random >>> 16) & 127);
      pixels.data[p + 2] = 140;
      pixels.data[p + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.font = '40px sans-serif';
    ctx.fillText(`Biology specimen ${i}`, 40, 70);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.8),
    );
    const asset = await storeImageBlob(blob, blob.type, canvas.width, canvas.height);
    const stored = (await db.assets.get(asset.hash))!.blob;
    bytes += stored instanceof Blob ? stored.size : stored.byteLength;
    const cardIndex = i < 105 ? i * 2 : (i - 105) * 2 + 1;
    if (i < 105) {
      cards[cardIndex].front += `\n\n![Cell specimen](${assetUrl(asset.hash)})`;
    } else {
      const regionId = `biology-region-${i}`;
      Object.assign(cards[cardIndex], { occlusionRegionId: regionId });
      await db.occlusions.add({
        id: `biology-occlusion-${i}`,
        courseId: 'heavy-course-0',
        primaryLessonId: cards[cardIndex].primaryLessonId!,
        name: `Cell structures ${i}`,
        assetHash: asset.hash,
        regions: [
          {
            id: regionId,
            role: 'label',
            shape: 'rectangle',
            x: 0.1,
            y: 0.2,
            w: 0.3,
            h: 0.1,
            answerText: 'Mitochondrion',
          },
        ],
        createdAt: i,
        updatedAt: Date.now(),
      });
    }
  }
  await db.reviewHistory.bulkAdd(cards.flatMap(reviewHistoryEntriesForCard));
  await db.concepts.bulkPut(
    cards.map((card) =>
      buildCardConcept({
        id: card.conceptId,
        courseId: card.courseId!,
        schedulingUnitId: card.schedulingUnitId,
        name: 'Cell biology',
        now: Date.now(),
      }),
    ),
  );
  await db.cards.bulkAdd(cards);
  await db.courses.update('heavy-course-0', { name: 'Biology', learnFirst: false });
  await db.lessonCardExposures.clear();
  await db.lessonCardExposures.bulkAdd(
    cards.map((card) => ({
      lessonId: card.primaryLessonId!,
      cardId: card.id,
      taughtAt: card.createdAt,
      updatedAt: Date.now(),
    })),
  );
  db.close();
  return {
    cards: cards.length,
    imageCards: 105,
    occlusionCards: 105,
    imageBytes: bytes,
    reviews: 6440,
  };
}
