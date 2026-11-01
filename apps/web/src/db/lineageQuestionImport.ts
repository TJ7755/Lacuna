import { referencedQuestionSetConceptIds } from '@lacuna/core/questions/questionSets';
import { questionGeneratorRegistry } from '../questions/generators';
import { emptyQuestionSchedule } from '../questions/scheduler';
import type {
  Concept,
  QuestionConceptSet,
  QuestionDefinition,
  QuestionScheduleState,
} from '@lacuna/core/questions/types';
import { db } from './schema';
import { jsonValuesEqual } from '@lacuna/core/db/lineageDiff';
import type { LineagePayload } from './lineageImportModel';
import type { SharePayloadV6 } from './share';
import type { LineageIdMapping } from '@lacuna/core/db/types';

export async function upsertLineageConcepts(
  payload: LineagePayload,
  courseId: string,
  mapping: LineageIdMapping,
): Promise<string[]> {
  const previousIds = [...(mapping.conceptIds ?? [])];
  const conceptIds = new Set(payload.concepts.map((concept) => concept.id));
  if (conceptIds.size !== payload.concepts.length) {
    throw new Error('A shared course contains duplicate Concept ids.');
  }
  const cardConceptIds = [
    ...payload.lessons.flatMap((lesson) => lesson.cards.map((card) => card.co)),
    ...(payload.bankCards ?? []).map((card) => card.co),
  ];
  if (cardConceptIds.some((id) => !id || !conceptIds.has(id))) {
    throw new Error('A shared Card references a missing Concept.');
  }
  const questionIds = new Set(payload.questions.map((question) => question.id));
  if (questionIds.size !== payload.questions.length) {
    throw new Error('A shared course contains duplicate Question ids.');
  }
  if (
    payload.questions.some(
      (question) =>
        !conceptIds.has(question.t) || question.pr.some((conceptId) => !conceptIds.has(conceptId)),
    )
  ) {
    throw new Error('A shared Question references a missing Concept.');
  }
  const existing = await db.concepts.bulkGet(payload.concepts.map((concept) => concept.id));
  for (const concept of existing) {
    if (concept && (concept.scope !== 'course' || concept.courseId !== courseId)) {
      throw new Error(`A shared Concept id is already used by another Course: ${concept.id}.`);
    }
  }
  const concepts: Concept[] = payload.concepts.map((concept) => ({
    id: concept.id,
    scope: 'course',
    scopeKey: `course:${courseId}`,
    courseId,
    name: concept.n,
    provisional: concept.p === 1,
    ...(concept.specificationPointIds === undefined
      ? {}
      : { specificationPointIds: concept.specificationPointIds }),
    createdAt: payload.at,
    updatedAt: payload.at,
  }));
  if (concepts.length > 0) await db.concepts.bulkPut(concepts);
  mapping.conceptIds = concepts.map((concept) => concept.id);
  return previousIds;
}

function lessonIdFromShareIndex(payload: LineagePayload, index: number | undefined): string | null {
  if (index === undefined) return null;
  const id = payload.lessons[index]?.i;
  if (!id) throw new Error('A lineage Question references a Lesson without an originating id.');
  return id;
}

function questionSemanticChanged(
  existing: QuestionDefinition,
  incoming: SharePayloadV6['questions'][number],
  existingSet: QuestionConceptSet | undefined,
): boolean {
  if (existingSet?.targetConceptIds[0] !== incoming.t) return true;
  if (!jsonValuesEqual(existingSet?.prerequisiteConceptIds ?? [], incoming.pr)) return true;
  if (existing.kind === 'fixed' && incoming.k === 0) {
    return existing.prompt !== incoming.f || !jsonValuesEqual(existing.payload, incoming.p);
  }
  if (existing.kind === 'generated' && incoming.k === 1) {
    return (
      existing.generatorKey !== incoming.gk ||
      existing.generatorVersion !== incoming.gv ||
      !jsonValuesEqual(existing.generatorConfig, incoming.gc)
    );
  }
  return true;
}

function questionSchedule(question: QuestionDefinition): QuestionScheduleState {
  return {
    stability: question.stability,
    difficulty: question.difficulty,
    lastReviewed: question.lastReviewed,
    reps: question.reps,
    lapses: question.lapses,
    state: question.state,
    due: question.due,
    scheduledDays: question.scheduledDays,
    learningSteps: question.learningSteps,
  };
}

export async function applyLineageQuestions(
  payload: LineagePayload,
  courseId: string,
  mapping: LineageIdMapping,
): Promise<void> {
  const previousIds = new Set(mapping.questionIds ?? []);
  const incomingIds = new Set(payload.questions.map((question) => question.id));
  const removedIds = [...previousIds].filter((id) => !incomingIds.has(id));
  if (removedIds.length > 0) {
    await db.questions.bulkDelete(removedIds);
    await db.questionConcepts.bulkDelete(removedIds);
    await db.tombstones.bulkPut([
      ...removedIds.map((recordId) => ({
        table: 'questions' as const,
        recordId,
        deletedAt: payload.at,
      })),
      ...removedIds.map((recordId) => ({
        table: 'questionConcepts' as const,
        recordId,
        deletedAt: payload.at,
      })),
    ]);
  }

  for (const incoming of payload.questions) {
    const [existing, existingSet] = await Promise.all([
      db.questions.get(incoming.id),
      db.questionConcepts.get(incoming.id),
    ]);
    if (existing && existing.courseId !== courseId) {
      throw new Error(`A shared Question id is already used by another Course: ${incoming.id}.`);
    }
    if (existingSet && existingSet.courseId !== courseId) {
      throw new Error(
        `A shared Question Concept set is already used by another Course: ${incoming.id}.`,
      );
    }
    const referencedConceptIds = [incoming.t, ...incoming.pr];
    const referencedConcepts = await db.concepts.bulkGet(referencedConceptIds);
    if (
      referencedConcepts.some(
        (concept) => !concept || concept.scope !== 'course' || concept.courseId !== courseId,
      )
    ) {
      throw new Error(`A shared Question references a missing Concept: ${incoming.id}.`);
    }
    const semantic = existing ? questionSemanticChanged(existing, incoming, existingSet) : true;
    const authoringRevisionId = `question-authoring:lineage:${encodeURIComponent(payload.li)}:${payload.rv}:${encodeURIComponent(incoming.id)}`;
    const contentRevisionId =
      existing && !semantic
        ? existing.contentRevisionId
        : `question-content:lineage:${encodeURIComponent(payload.li)}:${payload.rv}:${encodeURIComponent(incoming.id)}`;
    const scheduleEpoch =
      existing && !semantic
        ? existing.scheduleEpoch
        : {
            id: `question-epoch:lineage:${encodeURIComponent(payload.li)}:${payload.rv}:${encodeURIComponent(incoming.id)}`,
            startedAt: payload.at,
            reason: existing ? ('semantic-edit' as const) : ('created' as const),
            baseline: { kind: 'new' as const },
          };
    const schedule = existing && !semantic ? questionSchedule(existing) : emptyQuestionSchedule();
    const common = {
      id: incoming.id,
      courseId,
      primaryLessonId: lessonIdFromShareIndex(payload, incoming.pl),
      additionalLessonIds: (incoming.al ?? []).map((index) => {
        const lessonId = lessonIdFromShareIndex(payload, index);
        if (!lessonId) throw new Error('A Question additional Lesson is missing.');
        return lessonId;
      }),
      name: incoming.n,
      tags: incoming.g ?? [],
      contentVersion: existing ? existing.contentVersion + (semantic ? 1 : 0) : 1,
      contentRevisionId,
      authoringRevisionId,
      authoringUpdatedAt: payload.at,
      ...schedule,
      scheduleEpoch,
      scheduleUpdatedAt: existing && !semantic ? existing.scheduleUpdatedAt : payload.at,
      createdAt: existing?.createdAt ?? payload.at,
      updatedAt: Math.max(existing?.updatedAt ?? payload.at, payload.at),
    };
    const definition: QuestionDefinition =
      incoming.k === 0
        ? {
            ...common,
            kind: 'fixed',
            suspended: incoming.s === 1,
            prompt: incoming.f,
            payload: incoming.p,
            explanation: incoming.e,
            explanationStatus: incoming.ld === 1 ? 'legacy-derived' : 'authored',
          }
        : {
            ...common,
            kind: 'generated',
            suspended:
              incoming.s === 1 ||
              questionGeneratorRegistry.describe(incoming.gk, incoming.gv) === undefined,
            generatorKey: incoming.gk,
            generatorVersion: incoming.gv,
            generatorConfig: incoming.gc,
          };
    const set: QuestionConceptSet = {
      questionId: incoming.id,
      courseId,
      targetConceptIds: [incoming.t],
      prerequisiteConceptIds: [...incoming.pr],
      authoringRevisionId,
      authoringUpdatedAt: payload.at,
      createdAt: existingSet?.createdAt ?? payload.at,
      updatedAt: payload.at,
    };
    await db.questions.put(definition);
    await db.questionConcepts.put(set);
  }
  mapping.questionIds = [...incomingIds];
}

export async function pruneRemovedLineageConcepts(
  previousIds: readonly string[],
  mapping: LineageIdMapping,
  deletedAt: number,
): Promise<void> {
  const incoming = new Set(mapping.conceptIds ?? []);
  const candidates = previousIds.filter((id) => !incoming.has(id));
  const referenced = new Set([
    ...(await db.questionSets.toArray()).flatMap(referencedQuestionSetConceptIds),
    ...(await db.occlusions.toArray()).flatMap((occlusion) =>
      Object.values(occlusion.regionConceptIds ?? {}),
    ),
  ]);
  const removed: string[] = [];
  for (const id of candidates) {
    const [card, set] = await Promise.all([
      db.cards.where('conceptId').equals(id).first(),
      db.questionConcepts
        .filter(
          (links) =>
            links.targetConceptIds.includes(id) || links.prerequisiteConceptIds.includes(id),
        )
        .first(),
    ]);
    if (!card && !set && !referenced.has(id)) removed.push(id);
  }
  if (removed.length > 0) {
    await db.concepts.bulkDelete(removed);
    await db.tombstones.bulkPut(
      removed.map((recordId) => ({ table: 'concepts' as const, recordId, deletedAt })),
    );
  }
}
