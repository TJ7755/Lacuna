import { db } from '../db/schema';
import type { SharePayloadV4, SharePayloadV5 } from '../db/share';
import type { LineageIdMapping } from '../db/types';
import { parseQuestionSetRecord } from './questionSetCodec';
import { parseQuestionSetPracticeNode } from '../db/questionSetPracticeNode';

type QuestionSetLineagePayload = (SharePayloadV4 | SharePayloadV5) & { li: string; rv: number };

export async function applyLineageQuestionSets(
  payload: QuestionSetLineagePayload,
  courseId: string,
  mapping: LineageIdMapping,
): Promise<void> {
  const lessonIds = new Set(payload.lessons.flatMap((lesson) => (lesson.i ? [lesson.i] : [])));
  const assessmentIds = new Set((await db.courseAssessments.where('courseId').equals(courseId).toArray()).map((assessment) => assessment.id));
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
    if (record.assessmentIds.some((id) => !assessmentIds.has(id))) {
      throw new Error('A lineage Question Set references a missing Assessment.');
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
  const currentSets = await db.questionSets.where('courseId').equals(courseId).toArray();
  for (const set of currentSets) {
    if (set.assessmentIds.some((id) => !assessmentIds.has(id))) {
      throw new Error('A local Question Set still links to a removed Assessment.');
    }
  }
  mapping.questionSetIds = [...incomingIds];
  mapping.questionSetRevisions = Object.fromEntries(
    payload.questionSets.map((set) => [set.id, set.contentRevisionId]),
  );
}

/** Apply authored path placement with the same adopted IDs and local-edit guard as sets. */
export async function applyLineageQuestionSetPracticeNodes(
  payload: SharePayloadV5 & { li: string; rv: number },
  courseId: string,
  mapping: LineageIdMapping,
): Promise<void> {
  const incoming = payload.questionSetPracticeNodes;
  const lessonIds = new Set(payload.lessons.flatMap((lesson) => lesson.i ? [lesson.i] : []));
  const setIds = new Set(payload.questionSets.map((set) => set.id));
  const previousIds = new Set(mapping.questionSetPracticeNodeIds ?? []);
  const previousSnapshots = mapping.questionSetPracticeNodeSnapshots ?? {};
  const snapshotOf = (node: { questionSetId: string; afterLessonId: string; name: string }) => ({
    questionSetId: node.questionSetId,
    afterLessonId: node.afterLessonId,
    name: node.name,
  });
  const unchanged = (node: { questionSetId?: string; afterLessonId?: string; name: string }, id: string) =>
    JSON.stringify(snapshotOf({
      questionSetId: node.questionSetId ?? '',
      afterLessonId: node.afterLessonId ?? '',
      name: node.name,
    })) === JSON.stringify(previousSnapshots[id]);
  const incomingIds = new Set(incoming.map((node) => node.id));
  for (const id of previousIds) {
    if (incomingIds.has(id)) continue;
    const existing = await db.practiceNodes.get(id);
    if (existing && !unchanged(existing, id)) {
      throw new Error('A locally edited Question Set activity conflicts with this published update.');
    }
    if (existing) {
      await db.practiceNodes.delete(id);
      await db.tombstones.put({
        table: 'practiceNodes', recordId: id,
        deletedAt: Math.max(payload.at, existing.updatedAt + 1),
      });
    }
  }
  for (const raw of incoming) {
    const node = parseQuestionSetPracticeNode({ ...raw, courseId });
    if (!lessonIds.has(node.afterLessonId) || !setIds.has(node.questionSetId)) {
      throw new Error('A shared Question Set activity has a missing Set or Lesson.');
    }
    const existing = await db.practiceNodes.get(node.id);
    const tombstone = await db.tombstones.get(['practiceNodes', node.id]);
    if (previousIds.has(node.id) && !existing && tombstone) {
      throw new Error('A locally deleted Question Set activity conflicts with this published update.');
    }
    if (existing && existing.courseId !== courseId) {
      throw new Error('A shared Question Set activity ID belongs to another Course.');
    }
    if (existing && (!previousIds.has(node.id) || !unchanged(existing, node.id))) {
      throw new Error('A locally edited Question Set activity conflicts with this published update.');
    }
    await db.practiceNodes.put({
      ...node,
      createdAt: existing?.createdAt ?? payload.at,
      updatedAt: Math.max(payload.at, existing?.updatedAt ?? 0, (tombstone?.deletedAt ?? -1) + 1),
    });
    if (tombstone) await db.tombstones.delete(['practiceNodes', node.id]);
  }
  mapping.questionSetPracticeNodeIds = [...incomingIds];
  mapping.questionSetPracticeNodeSnapshots = Object.fromEntries(
    incoming.map((node) => [node.id, snapshotOf(node)]),
  );
}
