import { stripAssetMedia } from '../db/assets';
import { parseQuestionSetRecord, type QuestionSetRecord } from './questionSetCodec';
import type { QuestionAnswer } from './questionSets';

export function packQuestionSetMedia(
  record: QuestionSetRecord,
  includeMedia: boolean,
): QuestionSetRecord {
  if (includeMedia) return record;
  const visit = (value: unknown): unknown => {
    if (typeof value === 'string') return stripAssetMedia(value).markdown;
    if (Array.isArray(value)) return value.map(visit);
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, visit(entry)]),
    );
  };
  return parseQuestionSetRecord(visit(record));
}

function remapAnswer(
  answer: QuestionAnswer,
  freshId: (id: string) => string,
  mapConceptIds: (ids: string[]) => string[],
): QuestionAnswer {
  return {
    ...answer,
    response:
      answer.response.kind === 'multiple-choice'
        ? {
            ...answer.response,
            options: answer.response.options.map((option) => ({
              ...option,
              id: freshId(option.id),
            })),
            correctOptionIds: answer.response.correctOptionIds.map(freshId),
          }
        : answer.response,
    allocations: answer.allocations.map((allocation) => ({
      ...allocation,
      id: freshId(allocation.id),
      targetConceptIds: mapConceptIds(allocation.targetConceptIds),
    })),
    prerequisiteConceptIds: mapConceptIds(answer.prerequisiteConceptIds),
  };
}

export function importSharedQuestionSets(input: {
  records: readonly QuestionSetRecord[];
  sharedLessons: readonly { i?: string }[];
  lessonIds: readonly string[];
  courseId: string;
  conceptIdMap: ReadonlyMap<string, string>;
  assessmentIdMap: ReadonlyMap<string, string>;
  importedAt: number;
  makeId: () => string;
}): QuestionSetRecord[] {
  const remapId = new Map<string, string>();
  const freshId = (id: string): string => {
    const existing = remapId.get(id);
    if (existing) return existing;
    const created = input.makeId();
    remapId.set(id, created);
    return created;
  };
  const mapConceptIds = (ids: string[]): string[] =>
    ids.map((id) => {
      const mapped = input.conceptIdMap.get(id);
      if (!mapped) throw new Error('A shared Question Set references a missing Concept.');
      return mapped;
    });
  return input.records.map((record, index) =>
    parseQuestionSetRecord({
      ...record,
      id: freshId(record.id),
      courseId: input.courseId,
      lessonIds: record.lessonIds.map((id) => {
        const sharedIndex = input.sharedLessons.findIndex((lesson) => lesson.i === id);
        if (sharedIndex < 0 || !input.lessonIds[sharedIndex]) {
          throw new Error('A shared Question Set references a missing Lesson.');
        }
        return input.lessonIds[sharedIndex];
      }),
      assessmentIds: record.assessmentIds.map((id) => {
        const mapped = input.assessmentIdMap.get(id);
        if (!mapped) throw new Error('A shared Question Set references a missing Assessment.');
        return mapped;
      }),
      questions: record.questions.map((question) => ({
        ...question,
        id: freshId(question.id),
        ...(question.answer
          ? { answer: remapAnswer(question.answer, freshId, mapConceptIds) }
          : {}),
        parts: question.parts.map((part) => ({
          ...part,
          id: freshId(part.id),
          ...(part.answer ? { answer: remapAnswer(part.answer, freshId, mapConceptIds) } : {}),
          subparts: part.subparts.map((subpart) => ({
            ...subpart,
            id: freshId(subpart.id),
            ...(subpart.answer
              ? { answer: remapAnswer(subpart.answer, freshId, mapConceptIds) }
              : {}),
          })),
        })),
      })),
      contentRevisionId: input.makeId(),
      createdAt: input.importedAt + index,
      updatedAt: input.importedAt + index,
    }),
  );
}
