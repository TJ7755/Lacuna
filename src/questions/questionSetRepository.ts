import { clearTombstone, recordTombstone } from '../db/mutationStamp';
import { scheduleAssetGc } from '../db/assets';
import { db, makeId } from '../db/schema';
import { parseQuestionSetRecord, type QuestionSetRecord } from './questionSetCodec';
import { validateQuestionSet, type QuestionAnswer, type QuestionSet } from './questionSets';

export class QuestionSetRevisionConflictError extends Error {
  constructor() {
    super('The Question Set changed since it was opened.');
    this.name = 'QuestionSetRevisionConflictError';
  }
}

function requireValidContent(content: QuestionSet): void {
  const issues = validateQuestionSet(content);
  if (issues.length > 0) {
    throw new Error(`Invalid question set: ${issues[0].code} at ${issues[0].path}.`);
  }
}

function conceptIdsIn(answer: QuestionAnswer | undefined, target: Set<string>): void {
  if (!answer) return;
  answer.prerequisiteConceptIds.forEach((id) => target.add(id));
  answer.allocations.forEach((allocation) =>
    allocation.targetConceptIds.forEach((id) => target.add(id)),
  );
}

export function referencedQuestionSetConceptIds(content: QuestionSet): string[] {
  const ids = new Set<string>();
  for (const question of content.questions) {
    conceptIdsIn(question.answer, ids);
    for (const part of question.parts) {
      conceptIdsIn(part.answer, ids);
      for (const subpart of part.subparts) conceptIdsIn(subpart.answer, ids);
    }
  }
  return [...ids];
}

async function validateReferences(content: QuestionSet): Promise<void> {
  if (!(await db.courses.get(content.courseId))) throw new Error('Course not found.');
  const [lessons, assessments, concepts] = await Promise.all([
    db.lessons.bulkGet(content.lessonIds),
    db.courseAssessments.bulkGet(content.assessmentIds),
    db.concepts.bulkGet(referencedQuestionSetConceptIds(content)),
  ]);
  if (lessons.some((lesson) => !lesson || lesson.courseId !== content.courseId)) {
    throw new Error('Every linked Lesson must belong to the Question Set Course.');
  }
  if (assessments.some((assessment) => !assessment || assessment.courseId !== content.courseId)) {
    throw new Error('Every linked Assessment must belong to the Question Set Course.');
  }
  if (concepts.some((concept) => !concept || concept.courseId !== content.courseId)) {
    throw new Error('Every linked Concept must belong to the Question Set Course.');
  }
}

function authoredContent(record: QuestionSetRecord): QuestionSet {
  const {
    contentVersion: _contentVersion,
    contentRevisionId: _contentRevisionId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...content
  } = record;
  return content;
}

function sameContent(left: QuestionSet, right: QuestionSet): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row)
    .sort()
    .filter((key) => row[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(row[key])}`)
    .join(',')}}`;
}

export async function createQuestionSet(
  input: QuestionSet,
  now = Date.now(),
): Promise<QuestionSetRecord> {
  requireValidContent(input);
  return db.transaction(
    'rw',
    [db.courses, db.lessons, db.courseAssessments, db.concepts, db.questionSets, db.tombstones],
    async (tx) => {
      const tombstone = await db.tombstones.get(['questionSets', input.id]);
      const createdAt = Math.max(now, (tombstone?.deletedAt ?? -1) + 1);
      const record = parseQuestionSetRecord({
        ...structuredClone(input),
        contentVersion: 1,
        contentRevisionId: makeId(),
        createdAt,
        updatedAt: createdAt,
      });
      await validateReferences(record);
      await db.questionSets.add(record);
      await clearTombstone(tx, 'questionSets', record.id);
      return record;
    },
  );
}

export async function getQuestionSet(id: string): Promise<QuestionSetRecord | null> {
  const record = await db.questionSets.get(id);
  return record ? parseQuestionSetRecord(record) : null;
}

export async function listQuestionSets(courseId: string): Promise<QuestionSetRecord[]> {
  const records = await db.questionSets.where('courseId').equals(courseId).toArray();
  return records
    .map(parseQuestionSetRecord)
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
}

function sortQuestionSets(records: QuestionSetRecord[]): QuestionSetRecord[] {
  return records.sort(
    (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
  );
}

/** Current authored sets linked directly to one Lesson. */
export async function listQuestionSetsForLesson(
  courseId: string,
  lessonId: string,
): Promise<QuestionSetRecord[]> {
  const records = await db.questionSets.where('lessonIds').equals(lessonId).toArray();
  return sortQuestionSets(
    records.filter((record) => record.courseId === courseId).map(parseQuestionSetRecord),
  );
}

/** Current authored sets linked directly to one Assessment. */
export async function listQuestionSetsForAssessment(
  courseId: string,
  assessmentId: string,
): Promise<QuestionSetRecord[]> {
  const records = await db.questionSets.where('assessmentIds').equals(assessmentId).toArray();
  return sortQuestionSets(
    records.filter((record) => record.courseId === courseId).map(parseQuestionSetRecord),
  );
}

export type QuestionSetConceptRole = 'target' | 'prerequisite' | 'either';

function questionSetHasConcept(
  set: QuestionSet,
  conceptId: string,
  role: QuestionSetConceptRole,
): boolean {
  const answers: QuestionAnswer[] = [];
  for (const question of set.questions) {
    if (question.answer) answers.push(question.answer);
    for (const part of question.parts) {
      if (part.answer) answers.push(part.answer);
      for (const subpart of part.subparts) if (subpart.answer) answers.push(subpart.answer);
    }
  }
  return answers.some(
    (answer) =>
      (role !== 'target' && answer.prerequisiteConceptIds.includes(conceptId)) ||
      (role !== 'prerequisite' &&
        answer.allocations.some((allocation) => allocation.targetConceptIds.includes(conceptId))),
  );
}

/** Current authored sets which assess or require one existing Concept. */
export async function listQuestionSetsForConcept(
  courseId: string,
  conceptId: string,
  role: QuestionSetConceptRole = 'either',
): Promise<QuestionSetRecord[]> {
  const records = await db.questionSets.where('courseId').equals(courseId).toArray();
  return sortQuestionSets(
    records
      .map(parseQuestionSetRecord)
      .filter((record) => questionSetHasConcept(record, conceptId, role)),
  );
}

/** Follow a Card's existing Concept link to related authored sets. */
export async function listQuestionSetsForCard(
  courseId: string,
  cardId: string,
  role: QuestionSetConceptRole = 'either',
): Promise<QuestionSetRecord[]> {
  return db.transaction('r', [db.cards, db.questionSets], async () => {
    const card = await db.cards.get(cardId);
    if (!card || card.courseId !== courseId || !card.conceptId) return [];
    return listQuestionSetsForConcept(courseId, card.conceptId, role);
  });
}

export interface UpdateQuestionSetOptions {
  /** Reject an autosave based on an older aggregate revision. */
  expectedContentRevisionId: string;
  now?: number;
}

export async function updateQuestionSet(
  id: string,
  content: QuestionSet,
  options: UpdateQuestionSetOptions,
): Promise<QuestionSetRecord> {
  requireValidContent(content);
  const result = await db.transaction(
    'rw',
    [db.courses, db.lessons, db.courseAssessments, db.concepts, db.questionSets],
    async () => {
      const existingRaw = await db.questionSets.get(id);
      if (!existingRaw) throw new Error('Question Set not found.');
      const existing = parseQuestionSetRecord(existingRaw);
      if (content.id !== id || content.courseId !== existing.courseId) {
        throw new Error('A Question Set cannot change identity or Course.');
      }
      if (options.expectedContentRevisionId !== existing.contentRevisionId) {
        throw new QuestionSetRevisionConflictError();
      }
      if (sameContent(content, authoredContent(existing)))
        return { record: existing, changed: false };
      await validateReferences(content);
      const next = parseQuestionSetRecord({
        ...structuredClone(content),
        contentVersion: existing.contentVersion + 1,
        contentRevisionId: makeId(),
        createdAt: existing.createdAt,
        updatedAt: Math.max(options.now ?? Date.now(), existing.updatedAt + 1),
      });
      await db.questionSets.put(next);
      return { record: next, changed: true };
    },
  );
  if (result.changed) scheduleAssetGc();
  return result.record;
}

export async function deleteQuestionSet(id: string, now = Date.now()): Promise<void> {
  const deleted = await db.transaction('rw', [db.questionSets, db.tombstones], async (tx) => {
    const existing = await db.questionSets.get(id);
    if (!existing) return false;
    await db.questionSets.delete(id);
    await recordTombstone(tx, 'questionSets', id, Math.max(now, existing.updatedAt + 1));
    return true;
  });
  if (deleted) scheduleAssetGc();
}

async function removeReferenceFromQuestionSets(
  courseId: string,
  field: 'lessonIds' | 'assessmentIds',
  referenceId: string,
  now: number,
): Promise<void> {
  const rows = await db.questionSets.where(field).equals(referenceId).toArray();
  for (const raw of rows) {
    const record = parseQuestionSetRecord(raw);
    if (record.courseId !== courseId) continue;
    const next = parseQuestionSetRecord({
      ...record,
      [field]: record[field].filter((id) => id !== referenceId),
      contentVersion: record.contentVersion + 1,
      contentRevisionId: makeId(),
      updatedAt: Math.max(now, record.updatedAt + 1),
    });
    await db.questionSets.put(next);
  }
}

/** Internal cascade seam; the caller owns the surrounding deletion transaction. */
export async function removeQuestionSetLessonReference(
  courseId: string,
  lessonId: string,
  now: number,
): Promise<void> {
  await removeReferenceFromQuestionSets(courseId, 'lessonIds', lessonId, now);
}

/** Internal cascade seam; the caller owns the surrounding deletion transaction. */
export async function removeQuestionSetAssessmentReference(
  courseId: string,
  assessmentId: string,
  now: number,
): Promise<void> {
  await removeReferenceFromQuestionSets(courseId, 'assessmentIds', assessmentId, now);
}

/** Internal undo seam; restore only the removed Lesson link on still-live aggregates. */
export async function restoreQuestionSetLessonReferences(
  snapshots: readonly QuestionSetRecord[],
  lessonId: string,
  now: number,
): Promise<void> {
  for (const snapshot of snapshots) {
    const raw = await db.questionSets.get(snapshot.id);
    if (!raw) continue;
    const current = parseQuestionSetRecord(raw);
    if (current.lessonIds.includes(lessonId)) continue;
    const retained = new Set(current.lessonIds);
    retained.add(lessonId);
    const lessonIds = [
      ...snapshot.lessonIds.filter((id) => retained.delete(id)),
      ...current.lessonIds.filter((id) => retained.delete(id)),
      ...retained,
    ];
    await db.questionSets.put(
      parseQuestionSetRecord({
        ...current,
        lessonIds,
        contentVersion: current.contentVersion + 1,
        contentRevisionId: makeId(),
        updatedAt: Math.max(now, current.updatedAt + 1),
      }),
    );
  }
}

/** Internal Course-undo seam; resurrect deleted aggregates later than their tombstones. */
export async function restoreDeletedQuestionSets(
  snapshots: readonly QuestionSetRecord[],
  now: number,
): Promise<void> {
  for (const snapshot of snapshots) {
    const tombstone = await db.tombstones.get(['questionSets', snapshot.id]);
    const restored = parseQuestionSetRecord({
      ...snapshot,
      contentVersion: snapshot.contentVersion + 1,
      contentRevisionId: makeId(),
      updatedAt: Math.max(now, snapshot.updatedAt + 1, (tombstone?.deletedAt ?? -1) + 1),
    });
    await db.questionSets.put(restored);
    await db.tombstones.delete(['questionSets', snapshot.id]);
  }
}
