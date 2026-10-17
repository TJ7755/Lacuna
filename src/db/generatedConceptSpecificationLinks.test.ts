import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { createCourse } from './courseRepository';
import { createLesson } from './lessonRepository';
import { cardsForSequence, createSequence, updateSequence } from './sequenceRepository';
import { cardsForOcclusion, createOcclusion, updateOcclusion } from './occlusionRepository';
import { importLineageFirstTime, mergeLineageUpdate } from './mergeImport';
import type { SharePayloadV5 } from './share';
import { setConceptSpecificationPoints } from '../questions/repository.concepts';
import { LABEL_CARD_SUFFIX } from './sequenceGeneration';

const links = ['science:point-1'];
const correctedLinks = ['science:corrected-point'];
const schedule = { stability: 12, difficulty: 4, reps: 3, lapses: 1, lastReviewed: 100, due: 500 };

beforeEach(async () => {
  await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((table) => table.clear())));
});

function publishedPayload(kind: 'sequence' | 'occlusion'): SharePayloadV5 {
  const conceptId =
    kind === 'sequence'
      ? 'concept:sequence:sequence-1:item-1'
      : 'concept:occlusion:occlusion-1:region-1';
  return {
    v: 5,
    by: 'Teacher',
    at: 1_000,
    li: `generated-${kind}`,
    rv: 1,
    course: { n: 'Science', o: 0, c: 1_000, e: 2_000_000, um: 'open' },
    lessons: [],
    concepts: [{ id: conceptId, n: 'Published concept', specificationPointIds: links }],
    questions: [],
    questionSets: [],
    questionSetPracticeNodes: [],
    ...(kind === 'sequence'
      ? {
          sequences: [
            {
              id: 'sequence-1',
              n: 'Elements',
              items: [{ id: 'item-1', v: 'Lithium', l: '3' }],
              cw: 2,
            },
          ],
        }
      : {
          occlusions: [
            {
              id: 'occlusion-1',
              n: 'Cell',
              ah: 'diagram',
              regions: [{ id: 'region-1', r: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.2, a: 'Nucleus' }],
            },
          ],
        }),
  };
}

describe('generated Concept specification links', () => {
  it.each(['sequence', 'occlusion'] as const)(
    'preserves published %s links on first import and replacement or removal on update',
    async (kind) => {
      const first = publishedPayload(kind);
      const { course } = await importLineageFirstTime(first);
      const conceptId = first.concepts[0].id;
      expect((await db.concepts.get(conceptId))?.specificationPointIds).toEqual(links);
      const [studiedCard] = await db.cards.where('courseId').equals(course.id).toArray();
      await db.cards.update(studiedCard.id, schedule);

      // Add a missing generated Card while preserving the studied Card. Both generation
      // paths now recreate a Concept already supplied by the teacher's payload.
      const second = structuredClone(first);
      second.at = 2_000;
      second.rv = 2;
      second.concepts[0].specificationPointIds = correctedLinks;
      if (kind === 'sequence') {
        second.sequences![0].lc = 1;
      } else {
        second.occlusions![0].regions.push({
          id: 'region-2',
          r: 0,
          x: 0.4,
          y: 0.1,
          w: 0.2,
          h: 0.2,
          a: 'Cell wall',
        });
        second.concepts.push({
          id: 'concept:occlusion:occlusion-1:region-2',
          n: 'Cell wall',
          specificationPointIds: correctedLinks,
        });
      }
      await mergeLineageUpdate(course.id, second);
      for (const concept of second.concepts) {
        expect((await db.concepts.get(concept.id))?.specificationPointIds).toEqual(correctedLinks);
      }
      expect(await db.cards.get(studiedCard.id)).toMatchObject(schedule);

      const third = structuredClone(second);
      third.at = 3_000;
      third.rv = 3;
      for (const concept of third.concepts) delete concept.specificationPointIds;
      // Regenerate again so a removed field cannot resurrect links from an older copy.
      if (kind === 'sequence') {
        await db.cards.where('sequenceItemId').equals(`item-1${LABEL_CARD_SUFFIX}`).delete();
      } else {
        await db.cards.where('occlusionRegionId').equals('region-2').delete();
      }
      await mergeLineageUpdate(course.id, third);
      for (const concept of third.concepts) {
        expect((await db.concepts.get(concept.id))?.specificationPointIds).toBeUndefined();
      }
      expect(await db.cards.get(studiedCard.id)).toMatchObject(schedule);
    },
  );

  it('keeps local Sequence links and learner progress when label Cards are enabled', async () => {
    const course = await createCourse('Chemistry');
    const lesson = await createLesson(course.id, 'Elements');
    const sequence = await createSequence(course.id, lesson.id, 'Elements', [
      { id: 'item-1', value: 'Lithium', label: '3' },
      { id: 'item-2', value: 'Sodium', label: '11' },
    ]);
    const cards = await cardsForSequence(sequence);
    const target = cards.find((card) => card.sequenceItemId === 'item-1')!;
    await setConceptSpecificationPoints(target.conceptId, links);
    await db.cards.update(target.id, schedule);
    await updateSequence({ ...sequence, generateLabelCards: true });
    expect((await db.concepts.get(target.conceptId))?.specificationPointIds).toEqual(links);
    expect(await db.cards.get(target.id)).toMatchObject(schedule);
    expect(await cardsForSequence(sequence)).toHaveLength(4);
    const other = cards.find((card) => card.sequenceItemId === 'item-2')!;
    expect((await db.concepts.get(other.conceptId))?.specificationPointIds).toBeUndefined();
  });

  it('keeps local Occlusion links when a removed region is restored', async () => {
    const course = await createCourse('Biology');
    const regions = [
      {
        id: 'region-1',
        role: 'label' as const,
        shape: 'rectangle' as const,
        x: 0.1,
        y: 0.1,
        w: 0.2,
        h: 0.2,
        answerText: 'Nucleus',
      },
      {
        id: 'region-2',
        role: 'label' as const,
        shape: 'rectangle' as const,
        x: 0.4,
        y: 0.1,
        w: 0.2,
        h: 0.2,
        answerText: 'Cell wall',
      },
    ];
    const occlusion = await createOcclusion(course.id, null, 'Cell', 'diagram', regions);
    const cards = await cardsForOcclusion(occlusion);
    const target = cards.find((card) => card.occlusionRegionId === 'region-1')!;
    const studied = cards.find((card) => card.occlusionRegionId === 'region-2')!;
    await setConceptSpecificationPoints(target.conceptId, links);
    await db.cards.update(studied.id, schedule);
    await updateOcclusion({ ...occlusion, regions: [regions[1]] });
    await updateOcclusion(occlusion);
    expect((await db.concepts.get(target.conceptId))?.specificationPointIds).toEqual(links);
    expect(await db.cards.get(studied.id)).toMatchObject(schedule);
    expect(await cardsForOcclusion(occlusion)).toHaveLength(2);
    expect((await db.concepts.get(studied.conceptId))?.specificationPointIds).toBeUndefined();
  });
});
