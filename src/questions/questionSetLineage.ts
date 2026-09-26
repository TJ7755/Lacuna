import { db } from '../db/schema';
import type { SharePayloadV4 } from '../db/share';
import type { LineageIdMapping } from '../db/types';
import { parseQuestionSetRecord } from './questionSetCodec';

type QuestionSetLineagePayload = SharePayloadV4 & { li: string; rv: number };

export async function applyLineageQuestionSets(
  payload: QuestionSetLineagePayload,
  courseId: string,
  mapping: LineageIdMapping,
): Promise<void> {
  if (payload.questionSets.some((set) => set.assessmentIds.length > 0)) {
    throw new Error(
      'Published-course updates cannot yet import Question Sets linked to assessments.',
    );
  }
  const lessonIds = new Set(payload.lessons.flatMap((lesson) => (lesson.i ? [lesson.i] : [])));
  const conceptIds = new Set(payload.concepts.map((concept) => concept.id));
  const previousIds = new Set(mapping.questionSetIds ?? []);
  const previousRevisions = mapping.questionSetRevisions ?? {};
  const previousTombstones = await db.tombstones.bulkGet(
    [...previousIds].map((id) => ['questionSets', id]),
  );
  if (previousTombstones.some(Boolean)) {
    throw new Error('A locally deleted Question Set conflicts with this published update.');
  }
  const incomingIds = new Set(payload.questionSets.map((set) => set.id));
  const removedIds = [...previousIds].filter((id) => !incomingIds.has(id));
  if (removedIds.length > 0) {
    const removed = await db.questionSets.bulkGet(removedIds);
    if (
      removed.some(
        (record, index) =>
          record && previousRevisions[removedIds[index]] !== record.contentRevisionId,
      )
    ) {
      throw new Error('A locally edited Question Set conflicts with this published update.');
    }
    await db.questionSets.bulkDelete(removedIds);
    await db.tombstones.bulkPut(
      removedIds.map((recordId) => ({ table: 'questionSets', recordId, deletedAt: payload.at })),
    );
  }
  for (const raw of payload.questionSets) {
    const record = parseQuestionSetRecord({ ...raw, courseId });
    if (record.lessonIds.some((id) => !lessonIds.has(id))) {
      throw new Error('A lineage Question Set references a missing Lesson.');
    }
    const referencedConceptIds = record.questions.flatMap((question) => [
      ...(question.answer
        ? [
            ...question.answer.prerequisiteConceptIds,
            ...question.answer.allocations.flatMap((allocation) => allocation.targetConceptIds),
          ]
        : []),
      ...question.parts.flatMap((part) => [
        ...(part.answer
          ? [
              ...part.answer.prerequisiteConceptIds,
              ...part.answer.allocations.flatMap((allocation) => allocation.targetConceptIds),
            ]
          : []),
        ...part.subparts.flatMap((subpart) =>
          subpart.answer
            ? [
                ...subpart.answer.prerequisiteConceptIds,
                ...subpart.answer.allocations.flatMap((allocation) => allocation.targetConceptIds),
              ]
            : [],
        ),
      ]),
    ]);
    if (referencedConceptIds.some((id) => !conceptIds.has(id))) {
      throw new Error('A lineage Question Set references a missing Concept.');
    }
    const existing = await db.questionSets.get(record.id);
    const tombstone = await db.tombstones.get(['questionSets', record.id]);
    if (existing && existing.courseId !== courseId) {
      throw new Error(`A shared Question Set id is already used by another Course: ${record.id}.`);
    }
    if (
      existing &&
      previousRevisions[record.id] !== undefined &&
      previousRevisions[record.id] !== existing.contentRevisionId
    ) {
      throw new Error('A locally edited Question Set conflicts with this published update.');
    }
    await db.questionSets.put({
      ...record,
      createdAt: existing?.createdAt ?? payload.at,
      updatedAt: Math.max(
        existing?.updatedAt ?? payload.at,
        payload.at,
        (tombstone?.deletedAt ?? -1) + 1,
      ),
    });
    if (tombstone) await db.tombstones.delete(['questionSets', record.id]);
  }
  mapping.questionSetIds = [...incomingIds];
  mapping.questionSetRevisions = Object.fromEntries(
    payload.questionSets.map((set) => [set.id, set.contentRevisionId]),
  );
}
