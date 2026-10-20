import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { createCourse } from './courseRepository';
import { createLesson } from './lessonRepository';
import { createCard } from './cardRepository';
import { cardsForSequence, createSequence, updateSequence } from './sequenceRepository';
import { cardsForOcclusion, createOcclusion, updateOcclusion } from './occlusionRepository';
import {
  buildCourseSharePayload,
  decodeShareDirect,
  encodeShareDirect,
  importSharePayload,
} from './share';
import { buildCourseFile, decodeCourseFile, withCourseFileAssets } from './courseFile';
import { storeImageBlob } from './assets';
import { LABEL_CARD_SUFFIX } from './sequenceGeneration';
import {
  answerQuestionAttempt,
  createFixedQuestion,
  setConceptSpecificationPoints,
  startQuestionAttempt,
} from '../questions/repository';

const links = ['uninstalled-spec:outside-current-selection'];
const schedule = { stability: 12, difficulty: 4, reps: 3, lapses: 1, lastReviewed: 100, due: 500 };
const items = [
  { id: 'item:1 /', value: 'Lithium', label: '3' },
  { id: 'item:2 /', value: 'Sodium', label: '11' },
];
const regions = items.map((item, index) => ({
  id: item.id,
  role: 'label' as const,
  shape: 'rectangle' as const,
  x: index * 0.4,
  y: 0.1,
  w: 0.2,
  h: 0.2,
  answerText: item.value,
}));

beforeEach(async () => {
  await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((table) => table.clear())));
});

describe('ordinary imported generated Concept links', () => {
  it.each([
    ['sequence', 'share code'],
    ['sequence', 'course file'],
    ['occlusion', 'share code'],
    ['occlusion', 'course file'],
  ] as const)(
    'retains %s identity, shared relationships and evidence through %s regeneration',
    async (kind, format) => {
      const course = await createCourse('Chemistry');
      const lesson = await createLesson(course.id, 'Elements');
      const source =
        kind === 'sequence'
          ? await createSequence(course.id, lesson.id, 'Elements', items)
          : await createOcclusion(
              course.id,
              lesson.id,
              'Elements',
              (
                await storeImageBlob(
                  new Blob(['diagram'], { type: 'image/png' }),
                  'image/png',
                  10,
                  10,
                )
              ).hash,
              regions,
            );
      const sourceCards = await db.cards.where('courseId').equals(course.id).sortBy('createdAt');
      const [target, other] = sourceCards;
      await setConceptSpecificationPoints(target.conceptId, links);
      await createCard(
        target.schedulingUnitId,
        'front_back',
        'Alternate presentation',
        'Lithium',
        [],
        {
          conceptId: target.conceptId,
        },
      );
      await createFixedQuestion({
        courseId: course.id,
        primaryLessonId: lesson.id,
        name: 'Element count',
        targetConceptId: target.conceptId,
        prerequisiteConceptIds: [other.conceptId],
        prompt: 'How many elements?',
        payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '2' } },
        explanation: 'There are two elements.',
      });
      const file =
        format === 'course file' ? await decodeCourseFile(await buildCourseFile(course.id)) : null;
      const payload =
        file?.payload ??
        (await decodeShareDirect(
          await encodeShareDirect(await buildCourseSharePayload(course.id)),
        ));
      const imported = await (file
        ? withCourseFileAssets(file, () => importSharePayload(payload))
        : importSharePayload(payload));
      const courseId = imported.courseIds[0];
      const [ordinary] = await db.cards
        .where('courseId')
        .equals(courseId)
        .filter((card) => card.front === 'Alternate presentation')
        .toArray();
      const conceptId = ordinary.conceptId;
      expect(conceptId).not.toBe(target.conceptId);
      expect((await db.concepts.get(conceptId))?.specificationPointIds).toEqual(links);
      await db.concepts.update(conceptId, {
        name: 'Shared imported element',
        provisional: true,
        createdAt: 123,
        updatedAt: 456,
      });
      const sharedConcept = await db.concepts.get(conceptId);
      const [question] = await db.questions.where('courseId').equals(courseId).toArray();
      const relationship = (await db.questionConcepts.get(question.id))!;
      expect(relationship.targetConceptIds).toEqual([conceptId]);
      expect(relationship.prerequisiteConceptIds).not.toContain(other.conceptId);
      expect(relationship.prerequisiteConceptIds).toHaveLength(1);
      const attempt = await startQuestionAttempt({
        questionId: question.id,
        sessionId: 'study',
        now: 3_000,
      });
      await answerQuestionAttempt({
        attemptId: attempt.id,
        submittedAnswer: '2',
        marksEarned: 1,
        marksAvailable: 1,
        now: 4_000,
      });
      const evidence = await db.questionAttempts.get(attempt.id);
      const studiedQuestion = await db.questions.get(question.id);

      if (kind === 'sequence') {
        const [sequence] = await db.sequences.where('courseId').equals(courseId).toArray();
        expect(sequence.id).not.toBe(source.id);
        expect(sequence.items.map((item) => item.id)).not.toEqual(items.map((item) => item.id));
        const [studied] = (await cardsForSequence(sequence)).filter(
          (card) => card.conceptId === conceptId,
        );
        await db.cards.update(studied.id, schedule);
        for (let repeat = 0; repeat < 2; repeat++) {
          await updateSequence({ ...sequence, generateLabelCards: true });
          const cards = await cardsForSequence(sequence);
          expect(cards).toHaveLength(4);
          expect(cards.filter((card) => card.conceptId === conceptId)).toHaveLength(2);
          expect(
            cards.filter((card) => card.conceptId === relationship.prerequisiteConceptIds[0]),
          ).toHaveLength(2);
          expect(await db.cards.get(studied.id)).toMatchObject(schedule);
          await updateSequence({ ...sequence, generateLabelCards: false });
        }
      } else {
        const [occlusion] = await db.occlusions.where('courseId').equals(courseId).toArray();
        expect(occlusion.id).not.toBe(source.id);
        expect(occlusion.regions.map((region) => region.id)).not.toEqual(
          regions.map((region) => region.id),
        );
        const cards = await cardsForOcclusion(occlusion);
        const studied = cards.find((card) => card.conceptId !== conceptId)!;
        const removed = cards.find((card) => card.conceptId === conceptId)!;
        await db.cards.update(studied.id, schedule);
        for (let repeat = 0; repeat < 2; repeat++) {
          await updateOcclusion({
            ...occlusion,
            regions: occlusion.regions.filter((region) => region.id !== removed.occlusionRegionId),
          });
          await updateOcclusion(occlusion);
          const restored = await cardsForOcclusion(occlusion);
          expect(restored).toHaveLength(2);
          expect(
            restored.find((card) => card.occlusionRegionId === removed.occlusionRegionId)
              ?.conceptId,
          ).toBe(conceptId);
          expect(await db.cards.get(studied.id)).toMatchObject(schedule);
        }
      }
      expect(await db.concepts.where('courseId').equals(courseId).count()).toBe(2);
      expect(await db.concepts.get(conceptId)).toEqual(sharedConcept);
      expect((await db.concepts.get(conceptId))?.specificationPointIds).toEqual(links);
      expect(
        (await db.concepts.get(relationship.prerequisiteConceptIds[0]))?.specificationPointIds,
      ).toBeUndefined();
      expect(await db.questionConcepts.get(question.id)).toEqual(relationship);
      expect(await db.questionAttempts.get(attempt.id)).toEqual(evidence);
      expect(await db.questions.get(question.id)).toEqual(studiedQuestion);
      expect((await db.concepts.get(target.conceptId))?.specificationPointIds).toEqual(links);

      // Re-export the imported source to exercise the newly remapped identities again.
      const second = await importSharePayload(await buildCourseSharePayload(courseId));
      const secondId = second.courseIds[0];
      const concepts = await db.concepts.where('courseId').equals(secondId).toArray();
      expect(concepts).toHaveLength(2);
      expect(concepts.every((concept) => concept.id !== conceptId)).toBe(true);
      if (kind === 'sequence') {
        const [sequence] = await db.sequences.where('courseId').equals(secondId).toArray();
        await updateSequence({ ...sequence, generateLabelCards: true });
        expect(
          (await cardsForSequence(sequence)).filter((card) =>
            concepts.some((concept) => concept.id === card.conceptId),
          ),
        ).toHaveLength(4);
      } else {
        const [occlusion] = await db.occlusions.where('courseId').equals(secondId).toArray();
        await updateOcclusion({ ...occlusion, regions: [] });
        await updateOcclusion(occlusion);
        expect(
          (await cardsForOcclusion(occlusion)).every((card) =>
            concepts.some((concept) => concept.id === card.conceptId),
          ),
        ).toBe(true);
      }
      expect(await db.concepts.where('courseId').equals(secondId).count()).toBe(2);
    },
  );

  it.each(['positional', 'label'] as const)(
    'retains a non-deterministic imported Concept while its %s sibling survives',
    async (survivor) => {
      const course = await createCourse('Chemistry');
      const lesson = await createLesson(course.id, 'Elements');
      const sequence = await createSequence(course.id, lesson.id, 'Elements', items, {
        generateLabelCards: true,
      });
      const sourceCard = (await cardsForSequence(sequence)).find(
        (card) => card.sequenceItemId === items[0].id,
      )!;
      await setConceptSpecificationPoints(sourceCard.conceptId, links);
      await createCard(
        sourceCard.schedulingUnitId,
        'front_back',
        'Alternate presentation',
        'Lithium',
        [],
        {
          conceptId: sourceCard.conceptId,
        },
      );
      await createFixedQuestion({
        courseId: course.id,
        name: 'Element count',
        targetConceptId: sourceCard.conceptId,
        prompt: 'How many elements?',
        payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '2' } },
        explanation: 'There are two elements.',
      });
      const payload = await buildCourseSharePayload(course.id);
      // Model an older ordinary import or external payload with arbitrary Concept IDs.
      const sourceConcept = payload.concepts.find(
        (concept) => concept.id === sourceCard.conceptId,
      )!;
      sourceConcept.id = 'arbitrary-concept';
      for (const card of payload.lessons[0].cards) {
        if (card.co === sourceCard.conceptId) card.co = sourceConcept.id;
      }
      payload.questions[0].t = sourceConcept.id;
      // A different Concept may legitimately occupy the deterministic identity.
      payload.concepts.push({
        id: sourceCard.conceptId,
        n: 'Unrelated',
        specificationPointIds: ['other-spec:point'],
      });
      const imported = await importSharePayload(payload);
      const courseId = imported.courseIds[0];
      const [local] = await db.sequences.where('courseId').equals(courseId).toArray();
      const [question] = await db.questions.where('courseId').equals(courseId).toArray();
      const relationship = (await db.questionConcepts.get(question.id))!;
      const [conceptId] = relationship.targetConceptIds;
      const concept = await db.concepts.get(conceptId);
      expect(conceptId).not.toBe(sourceConcept.id);
      const siblingId =
        survivor === 'positional' ? local.items[0].id : `${local.items[0].id}${LABEL_CARD_SUFFIX}`;
      const otherId =
        survivor === 'label' ? local.items[0].id : `${local.items[0].id}${LABEL_CARD_SUFFIX}`;
      const studied = (await cardsForSequence(local)).find(
        (card) => card.sequenceItemId === siblingId,
      )!;
      await db.cards.update(studied.id, schedule);

      for (let repeat = 0; repeat < 2; repeat++) {
        const removed = (await cardsForSequence(local)).find(
          (card) => card.sequenceItemId === otherId,
        )!;
        await db.cards.delete(removed.id);
        await updateSequence(local);
        const cards = await cardsForSequence(local);
        expect(cards.filter((card) => card.conceptId === conceptId)).toHaveLength(2);
        expect(await db.cards.get(studied.id)).toMatchObject(schedule);
      }
      expect(await db.concepts.get(conceptId)).toEqual(concept);
      expect(await db.concepts.where('courseId').equals(courseId).count()).toBe(3);
      expect(await db.questionConcepts.get(question.id)).toEqual(relationship);
      expect(
        (
          await db.cards
            .where('courseId')
            .equals(courseId)
            .filter((card) => card.front === 'Alternate presentation')
            .first()
        )?.conceptId,
      ).toBe(conceptId);
      expect(
        (
          await db.concepts
            .where('courseId')
            .equals(courseId)
            .filter((candidate) => candidate.name === 'Unrelated')
            .first()
        )?.specificationPointIds,
      ).toEqual(['other-spec:point']);
    },
  );
});
