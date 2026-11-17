import type { Tombstone } from '@lacuna/core/db/types';
import type { QuestionSetRecord } from '@lacuna/core/questions/questionSetCodec';

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
    // A legacy writer still owns only its generated view. A newer timestamp
    // cannot transfer a fixed aggregate back from composer authoring.
    const sharedSource =
      existing.legacyQuestionId !== undefined &&
      existing.legacyQuestionId === incoming.legacyQuestionId;
    const existingComposer = !existing.contentRevisionId.startsWith('individual:');
    const incomingComposer = !incoming.contentRevisionId.startsWith('individual:');
    if (sharedSource && existingComposer !== incomingComposer) {
      if (incomingComposer) merged.set(incoming.id, incoming);
      continue;
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
