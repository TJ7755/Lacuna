import type { Tombstone } from '../db/types';
import type { QuestionSetRecord } from './questionSetCodec';
import type { Concept } from './types';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

export function assertQuestionSetReferences(
  records: readonly QuestionSetRecord[],
  courses: readonly { id: string }[],
  lessons: readonly { id: string; courseId: string }[],
  assessments: readonly { id: string; courseId: string }[],
  concepts: readonly Concept[],
): void {
  const courseIds = new Set(courses.map((row) => row.id));
  const lessonCourse = new Map(lessons.map((row) => [row.id, row.courseId]));
  const assessmentCourse = new Map(assessments.map((row) => [row.id, row.courseId]));
  const conceptCourse = new Map(concepts.map((row) => [row.id, row.courseId]));
  for (const record of records) {
    if (!courseIds.has(record.courseId))
      throw new Error('A Question Set refers to a missing Course.');
    if (record.lessonIds.some((id) => lessonCourse.get(id) !== record.courseId)) {
      throw new Error('A Question Set refers to a missing or cross-Course Lesson.');
    }
    if (record.assessmentIds.some((id) => assessmentCourse.get(id) !== record.courseId)) {
      throw new Error('A Question Set refers to a missing or cross-Course Assessment.');
    }
    const linkedConcepts = record.questions.flatMap((question) => [
      ...(question.answer ? conceptsInAnswer(question.answer) : []),
      ...question.parts.flatMap((part) => [
        ...(part.answer ? conceptsInAnswer(part.answer) : []),
        ...part.subparts.flatMap((subpart) =>
          subpart.answer ? conceptsInAnswer(subpart.answer) : [],
        ),
      ]),
    ]);
    if (linkedConcepts.some((id) => conceptCourse.get(id) !== record.courseId)) {
      throw new Error('A Question Set refers to a missing or cross-Course Concept.');
    }
  }
}

function conceptsInAnswer(answer: QuestionSetRecord['questions'][number]['answer'] & {}): string[] {
  return [
    ...answer.prerequisiteConceptIds,
    ...answer.allocations.flatMap((allocation) => allocation.targetConceptIds),
  ];
}

/** Merge mutable authored aggregates deterministically while honouring deletion receipts. */
export function mergeQuestionSetRecords(
  left: readonly QuestionSetRecord[],
  right: readonly QuestionSetRecord[],
  tombstones: readonly Tombstone[] = [],
): QuestionSetRecord[] {
  const deletedAt = new Map<string, number>();
  for (const row of tombstones) {
    if (row.table !== 'questionSets') continue;
    deletedAt.set(row.recordId, Math.max(deletedAt.get(row.recordId) ?? -Infinity, row.deletedAt));
  }
  const merged = new Map<string, QuestionSetRecord>();
  for (const incoming of [...left, ...right]) {
    const existing = merged.get(incoming.id);
    if (!existing) {
      merged.set(incoming.id, incoming);
      continue;
    }
    if (incoming.courseId !== existing.courseId) {
      throw new Error(`Question Set ${incoming.id} cannot move between Courses.`);
    }
    if (
      incoming.contentRevisionId === existing.contentRevisionId &&
      canonicalJson(authoredContent(incoming)) !== canonicalJson(authoredContent(existing))
    ) {
      throw new Error(
        `Question Set revision ${incoming.contentRevisionId} has conflicting content.`,
      );
    }
    if (
      incoming.updatedAt > existing.updatedAt ||
      (incoming.updatedAt === existing.updatedAt &&
        incoming.contentRevisionId > existing.contentRevisionId)
    ) {
      merged.set(incoming.id, incoming);
      continue;
    }
    if (
      incoming.updatedAt === existing.updatedAt &&
      incoming.contentRevisionId === existing.contentRevisionId &&
      canonicalJson(incoming) > canonicalJson(existing)
    ) {
      merged.set(incoming.id, incoming);
    }
  }
  return [...merged.values()]
    .filter((row) => row.updatedAt > (deletedAt.get(row.id) ?? -Infinity))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function authoredContent(
  record: QuestionSetRecord,
): Omit<QuestionSetRecord, 'createdAt' | 'updatedAt'> {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...content } = record;
  return content;
}
