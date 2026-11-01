import type {
  BackupAsset,
  BackupFile,
  Card,
  CourseAssessment,
  CoursePerformance,
  CourseRecord,
  Lesson,
  LessonCardExposure,
  LessonCardLink,
  LessonCompletion,
  LineageIdMapping,
  Note,
  Occlusion,
  PracticeMilestone,
  PracticeNode,
  PendingMergeReview,
  RevisionPlan,
  SchedulingPerformance,
  SchedulingUnitRecord,
  Sequence,
  SessionHistoryEntry,
  Tombstone,
  AgentMemory,
} from '../db/types';
import type { ReviewHistoryEntry } from '../db/reviewHistory';
import { normaliseQuestionBackup } from '../questions/backup';
import type { QuestionMergeCollections } from '../questions/merge';
import type {
  Concept,
  QuestionAttempt,
  QuestionConceptSet,
  QuestionDefinition,
} from '../questions/types';
import type { QuestionSetRecord } from '../questions/questionSetCodec';
import type { QuestionSetAttemptRecord } from '../questions/questionSetAttempts';
import { mergeQuestionSetAttemptPair } from '../questions/questionSetAttemptMerge';

export interface NormalisedSnapshot extends QuestionMergeCollections {
  exportedAt: number;
  cards: Card[];
  reviewHistory: ReviewHistoryEntry[];
  schedulingUnits: SchedulingUnitRecord[];
  coursePerformance: CoursePerformance[];
  schedulingPerformance: SchedulingPerformance[];
  assets: BackupAsset[];
  sessionHistory: SessionHistoryEntry[];
  courses: CourseRecord[];
  lessons: Lesson[];
  notes: Note[];
  lessonCards: LessonCardLink[];
  lessonCardExposures: LessonCardExposure[];
  lessonCompletions: LessonCompletion[];
  practiceNodes: PracticeNode[];
  practiceMilestones: PracticeMilestone[];
  courseAssessments: CourseAssessment[];
  revisionPlans: RevisionPlan[];
  sequences: Sequence[];
  occlusions: Occlusion[];
  tombstones: Tombstone[];
  lineageIdMappings: LineageIdMapping[];
  pendingMergeReviews: PendingMergeReview[];
  agentMemories: AgentMemory[];
  questionSets: QuestionSetRecord[];
  questionSetAttempts: QuestionSetAttemptRecord[];
}

export function normaliseSnapshot(input: BackupFile): NormalisedSnapshot {
  const normalised = normaliseQuestionBackup(input);
  return {
    exportedAt: normalised.exportedAt,
    cards: normalised.cards.map((row) =>
      withUpdatedAt(row, Math.max(numberOrZero(row.createdAt), numberOrZero(row.lastReviewed))),
    ),
    reviewHistory: normalised.reviewHistory ?? [],
    schedulingUnits: (normalised.schedulingUnits ?? []).map((row) =>
      withUpdatedAt(row, Math.max(numberOrZero(row.createdAt), numberOrZero(row.lastInteractedAt))),
    ),
    coursePerformance: (normalised.coursePerformance ?? []).map((row) => withUpdatedAt(row, 0)),
    schedulingPerformance: (normalised.schedulingPerformance ?? []).map((row) =>
      withUpdatedAt(row, 0),
    ),
    assets: normalised.assets,
    sessionHistory: normalised.sessionHistory,
    courses: (normalised.courses ?? []).map((row) =>
      withUpdatedAt(row, numberOrZero(row.createdAt)),
    ),
    lessons: (normalised.lessons ?? []).map((row) =>
      withUpdatedAt(row, numberOrZero(row.createdAt)),
    ),
    notes: (normalised.notes ?? []).map((row) => withUpdatedAt(row, numberOrZero(row.createdAt))),
    lessonCards: (normalised.lessonCards ?? []).map((row) =>
      withUpdatedAt(row, numberOrZero(row.createdAt)),
    ),
    lessonCardExposures: (normalised.lessonCardExposures ?? []).map((row) =>
      withUpdatedAt(row, numberOrZero(row.taughtAt)),
    ),
    lessonCompletions: (normalised.lessonCompletions ?? []).map((row) =>
      withUpdatedAt(row, numberOrZero(row.completedAt)),
    ),
    practiceNodes: (normalised.practiceNodes ?? []).map((row) =>
      withUpdatedAt(row, numberOrZero(row.createdAt)),
    ),
    practiceMilestones: (normalised.practiceMilestones ?? []).map((row) => withUpdatedAt(row, 0)),
    courseAssessments: (normalised.courseAssessments ?? []).map((row) =>
      withUpdatedAt(row, numberOrZero(row.createdAt)),
    ),
    revisionPlans: (normalised.revisionPlans ?? []).map((row) =>
      withUpdatedAt(row, numberOrZero(row.updatedAt)),
    ),
    sequences: (normalised.sequences ?? []).map((row) =>
      withUpdatedAt(row, numberOrZero(row.createdAt)),
    ),
    occlusions: (normalised.occlusions ?? []).map((row) =>
      withUpdatedAt(row, numberOrZero(row.createdAt)),
    ),
    tombstones: normalised.tombstones ?? [],
    concepts: normalised.concepts.map((row) => withUpdatedAt(row, numberOrZero(row.createdAt))),
    questions: normalised.questions,
    questionConcepts: normalised.questionConcepts,
    questionAttempts: normalised.questionAttempts,
    questionSets: normalised.questionSets,
    questionSetAttempts: normalised.questionSetAttempts ?? [],
    lineageIdMappings: normalised.lineageIdMappings ?? [],
    pendingMergeReviews: normalised.pendingMergeReviews ?? [],
    agentMemories: normalised.agentMemories ?? [],
  };
}

function withUpdatedAt<T extends { updatedAt?: number }>(row: T, fallback: number): T {
  return typeof row.updatedAt === 'number' ? row : { ...row, updatedAt: fallback };
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function idOf(row: { id: string }): string {
  return row.id;
}

export function exposureId(row: Pick<LessonCardExposure, 'lessonId' | 'cardId'>): string {
  return `${row.lessonId}:${row.cardId}`;
}

export function completionId(row: Pick<LessonCompletion, 'lessonId'>): string {
  return row.lessonId;
}

export function milestoneId(row: Pick<PracticeMilestone, 'nodeKey'>): string {
  return row.nodeKey;
}

export function coursePerfId(row: Pick<CoursePerformance, 'courseId'>): string {
  return row.courseId;
}

export function schedulingPerfId(row: Pick<SchedulingPerformance, 'schedulingUnitId'>): string {
  return row.schedulingUnitId;
}

export function updatedAtOf(row: { updatedAt: number }): number {
  return row.updatedAt;
}

export function tombstoneKey(table: string, recordId: string): string {
  return `${table}:${recordId}`;
}

export function unionTombstones(left: Tombstone[], right: Tombstone[]): Map<string, Tombstone> {
  const merged = new Map<string, Tombstone>();
  for (const row of [...left, ...right]) {
    const key = tombstoneKey(row.table, row.recordId);
    const existing = merged.get(key);
    if (!existing || row.deletedAt > existing.deletedAt) merged.set(key, row);
  }
  return merged;
}

export function newestWins<T>(
  left: T[],
  right: T[],
  identityOf: (row: T) => string,
  updatedAt: (row: T) => number,
): T[] {
  const merged = new Map<string, T>();
  for (const row of [...left, ...right]) {
    const key = identityOf(row);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, row);
      continue;
    }
    const incomingAt = updatedAt(row);
    const existingAt = updatedAt(existing);
    if (incomingAt > existingAt) {
      merged.set(key, row);
      continue;
    }
    if (incomingAt < existingAt) continue;
    // Same id, equal updatedAt: the plan's id-tiebreak is a no-op. The greater
    // canonical JSON wins so both devices still agree when the records differ.
    if (canonicalJson(row) > canonicalJson(existing)) merged.set(key, row);
  }
  return [...merged.values()];
}

export function mergeAgentMemories(left: AgentMemory[], right: AgentMemory[]): AgentMemory[] {
  const scopeById = new Map<string, string | null>();
  for (const memory of [...left, ...right]) {
    if (scopeById.has(memory.id) && scopeById.get(memory.id) !== memory.courseId) {
      throw new Error('A learner memory cannot move between global and Course scope.');
    }
    scopeById.set(memory.id, memory.courseId);
  }
  return newestWins(left, right, idOf, updatedAtOf);
}

export function mergeLineageMappings(
  left: LineageIdMapping[],
  right: LineageIdMapping[],
): LineageIdMapping[] {
  const mappings = new Map<string, LineageIdMapping>();
  const union = (a: readonly string[], b: readonly string[]): string[] =>
    [...new Set([...a, ...b])].sort();
  const records = <T>(a: Record<string, T>, b: Record<string, T>): Record<string, T> => {
    const merged: Record<string, T> = { ...a };
    for (const [id, value] of Object.entries(b)) {
      const existing = merged[id];
      if (existing === undefined || canonicalJson(value) > canonicalJson(existing)) {
        merged[id] = value;
      }
    }
    return merged;
  };
  for (const incoming of [...left, ...right]) {
    const existing = mappings.get(incoming.id);
    if (!existing) {
      mappings.set(incoming.id, incoming);
      continue;
    }
    if (existing.courseId !== incoming.courseId) {
      throw new Error(`Lineage ${incoming.id} belongs to conflicting Courses.`);
    }
    mappings.set(incoming.id, {
      ...existing,
      lessonIds: union(existing.lessonIds, incoming.lessonIds),
      noteIds: union(existing.noteIds, incoming.noteIds),
      cardIds: union(existing.cardIds, incoming.cardIds),
      conceptIds: union(existing.conceptIds ?? [], incoming.conceptIds ?? []),
      questionIds: union(existing.questionIds ?? [], incoming.questionIds ?? []),
      questionSetIds: union(existing.questionSetIds ?? [], incoming.questionSetIds ?? []),
      questionSetRevisions: records(
        existing.questionSetRevisions ?? {},
        incoming.questionSetRevisions ?? {},
      ),
      assessmentIds: union(existing.assessmentIds ?? [], incoming.assessmentIds ?? []),
      assessmentSnapshots: records(
        existing.assessmentSnapshots ?? {},
        incoming.assessmentSnapshots ?? {},
      ),
      questionSetPracticeNodeIds: union(
        existing.questionSetPracticeNodeIds ?? [],
        incoming.questionSetPracticeNodeIds ?? [],
      ),
      questionSetPracticeNodeSnapshots: records(
        existing.questionSetPracticeNodeSnapshots ?? {},
        incoming.questionSetPracticeNodeSnapshots ?? {},
      ),
      sequenceIds: union(existing.sequenceIds, incoming.sequenceIds),
      occlusionIds: union(existing.occlusionIds ?? [], incoming.occlusionIds ?? []),
      lessonSnapshots: records(existing.lessonSnapshots, incoming.lessonSnapshots),
      noteSnapshots: records(existing.noteSnapshots, incoming.noteSnapshots),
      cardSnapshots: records(existing.cardSnapshots, incoming.cardSnapshots),
    });
  }
  return [...mappings.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function applyTombstones<T>(
  table: string,
  rows: T[],
  identityOf: (row: T) => string,
  updatedAt: (row: T) => number,
  tombstones: Map<string, Tombstone>,
): T[] {
  return rows.filter((row) => {
    const tombstone = tombstones.get(tombstoneKey(table, identityOf(row)));
    return !tombstone || updatedAt(row) > tombstone.deletedAt;
  });
}

export function collectLiveKeys(tables: {
  cards: Card[];
  courses: CourseRecord[];
  lessons: Lesson[];
  notes: Note[];
  lessonCards: LessonCardLink[];
  lessonCardExposures: LessonCardExposure[];
  lessonCompletions: LessonCompletion[];
  practiceNodes: PracticeNode[];
  practiceMilestones: PracticeMilestone[];
  courseAssessments: CourseAssessment[];
  sequences: Sequence[];
  revisionPlans: RevisionPlan[];
  occlusions: Occlusion[];
  schedulingUnits: SchedulingUnitRecord[];
  coursePerformance: CoursePerformance[];
  schedulingPerformance: SchedulingPerformance[];
  concepts: Concept[];
  questions: QuestionDefinition[];
  questionConcepts: QuestionConceptSet[];
  questionAttempts: QuestionAttempt[];
  questionSets: QuestionSetRecord[];
  questionSetAttempts: QuestionSetAttemptRecord[];
  agentMemories: AgentMemory[];
}): Set<string> {
  const keys = new Set<string>();
  const add = (table: string, recordId: string) => keys.add(tombstoneKey(table, recordId));
  for (const row of tables.cards) add('cards', row.id);
  for (const row of tables.courses) add('courses', row.id);
  for (const row of tables.lessons) add('lessons', row.id);
  for (const row of tables.notes) add('notes', row.id);
  for (const row of tables.lessonCards) add('lessonCards', row.id);
  for (const row of tables.lessonCardExposures) add('lessonCardExposures', exposureId(row));
  for (const row of tables.lessonCompletions) add('lessonCompletions', completionId(row));
  for (const row of tables.practiceNodes) add('practiceNodes', row.id);
  for (const row of tables.practiceMilestones) add('practiceMilestones', milestoneId(row));
  for (const row of tables.courseAssessments) add('courseAssessments', row.id);
  for (const row of tables.sequences) add('sequences', row.id);
  for (const row of tables.revisionPlans) add('revisionPlans', row.id);
  for (const row of tables.occlusions) add('occlusions', row.id);
  for (const row of tables.schedulingUnits) add('schedulingUnits', row.id);
  for (const row of tables.coursePerformance) add('coursePerformance', coursePerfId(row));
  for (const row of tables.schedulingPerformance)
    add('schedulingPerformance', schedulingPerfId(row));
  for (const row of tables.concepts) add('concepts', row.id);
  for (const row of tables.questions) add('questions', row.id);
  for (const row of tables.questionConcepts) add('questionConcepts', row.questionId);
  for (const row of tables.questionAttempts) add('questionAttempts', row.id);
  for (const row of tables.questionSets) add('questionSets', row.id);
  for (const row of tables.questionSetAttempts) add('questionSetAttempts', row.id);
  for (const row of tables.agentMemories) add('agentMemories', row.id);
  return keys;
}

export function mergeQuestionSetAttempts(
  attempts: QuestionSetAttemptRecord[],
): QuestionSetAttemptRecord[] {
  const merged = new Map<string, QuestionSetAttemptRecord>();
  for (const incoming of attempts) {
    const existing = merged.get(incoming.id);
    if (!existing) {
      merged.set(incoming.id, incoming);
      continue;
    }
    merged.set(incoming.id, mergeQuestionSetAttemptPair(existing, incoming));
  }
  return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const entry = record[key];
    if (entry !== undefined) sorted[key] = sortKeys(entry);
  }
  return sorted;
}

export function sortById<T extends { id: string }>(rows: T[]): T[] {
  return sortBy(rows, (row) => row.id);
}

export function sortBy<T>(rows: T[], keyOf: (row: T) => string): T[] {
  return [...rows].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}

export function compareTombstones(a: Tombstone, b: Tombstone): number {
  const table = a.table.localeCompare(b.table);
  return table !== 0 ? table : a.recordId.localeCompare(b.recordId);
}
