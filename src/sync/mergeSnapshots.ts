// Pure peer-merge of two BackupFile snapshots. No Dexie, no I/O, no knowledge
// of which device produced either side. After this, the two-device dance is
// mergeSnapshots(local, remote) then importBackup(merged, 'replace') — that
// caller is P5, not this module.

import type {
  BackupAsset,
  BackupFile,
  Card,
  CourseAssessment,
  CoursePerformance,
  CourseRecord,
  FsrsParameters,
  Grade,
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
import {
  cardsWithReviewHistory,
  mergeReviewHistoryEntries,
  type ReviewHistoryEntry,
} from '../db/reviewHistory';
import { applyReview, makeEngine } from '../fsrs/fsrs';
import { defaultFsrsParameters } from '../fsrs/params';
import { normaliseQuestionBackup } from '../questions/backup';
import { mergeQuestionCollections, type QuestionMergeCollections } from '../questions/merge';
import type {
  Concept,
  QuestionAttempt,
  QuestionConceptSet,
  QuestionDefinition,
} from '../questions/types';

const ASSET_RE = /lacuna-asset:\/\/([a-f0-9]{64})/gi;

const NEVER_REVIEWED = {
  stability: null,
  difficulty: null,
  lastReviewed: null,
  reps: 0,
  lapses: 0,
  state: 0 as const,
  due: null,
  scheduledDays: 0,
  learningSteps: 0,
  history: [] as Card['history'],
};

/** A v11 snapshot with every table merge always emits present. */
export type MergedBackupFile = BackupFile & {
  version: 11;
  reviewHistory: ReviewHistoryEntry[];
  schedulingUnits: SchedulingUnitRecord[];
  coursePerformance: CoursePerformance[];
  schedulingPerformance: SchedulingPerformance[];
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
  concepts: Concept[];
  questions: QuestionDefinition[];
  questionConcepts: QuestionConceptSet[];
  questionAttempts: QuestionAttempt[];
  lineageIdMappings: LineageIdMapping[];
  pendingMergeReviews: PendingMergeReview[];
  agentMemories: AgentMemory[];
};

export function mergeSnapshots(a: BackupFile, b: BackupFile): MergedBackupFile {
  const left = normaliseSnapshot(a);
  const right = normaliseSnapshot(b);

  const tombstones = unionTombstones(left.tombstones, right.tombstones);

  const courses = applyTombstones(
    'courses',
    newestWins(left.courses, right.courses, idOf, updatedAtOf),
    idOf,
    updatedAtOf,
    tombstones,
  );
  const lessons = applyTombstones(
    'lessons',
    newestWins(left.lessons, right.lessons, idOf, updatedAtOf),
    idOf,
    updatedAtOf,
    tombstones,
  );
  const notes = applyTombstones(
    'notes',
    newestWins(left.notes, right.notes, idOf, updatedAtOf),
    idOf,
    updatedAtOf,
    tombstones,
  );
  const lessonCards = applyTombstones(
    'lessonCards',
    newestWins(left.lessonCards, right.lessonCards, idOf, updatedAtOf),
    idOf,
    updatedAtOf,
    tombstones,
  );
  const lessonCardExposures = applyTombstones(
    'lessonCardExposures',
    newestWins(left.lessonCardExposures, right.lessonCardExposures, exposureId, updatedAtOf),
    exposureId,
    updatedAtOf,
    tombstones,
  );
  const lessonCompletions = applyTombstones(
    'lessonCompletions',
    newestWins(left.lessonCompletions, right.lessonCompletions, completionId, updatedAtOf),
    completionId,
    updatedAtOf,
    tombstones,
  );
  const practiceNodes = applyTombstones(
    'practiceNodes',
    newestWins(left.practiceNodes, right.practiceNodes, idOf, updatedAtOf),
    idOf,
    updatedAtOf,
    tombstones,
  );
  const practiceMilestones = applyTombstones(
    'practiceMilestones',
    newestWins(left.practiceMilestones, right.practiceMilestones, milestoneId, updatedAtOf),
    milestoneId,
    updatedAtOf,
    tombstones,
  );
  const courseAssessments = applyTombstones(
    'courseAssessments',
    newestWins(left.courseAssessments, right.courseAssessments, idOf, updatedAtOf),
    idOf,
    updatedAtOf,
    tombstones,
  );
  const sequences = applyTombstones(
    'sequences',
    newestWins(left.sequences, right.sequences, idOf, updatedAtOf),
    idOf,
    updatedAtOf,
    tombstones,
  );
  const revisionPlans = applyTombstones(
    'revisionPlans',
    newestWins(left.revisionPlans, right.revisionPlans, idOf, updatedAtOf),
    idOf,
    updatedAtOf,
    tombstones,
  );
  const occlusions = applyTombstones(
    'occlusions',
    newestWins(left.occlusions, right.occlusions, idOf, updatedAtOf),
    idOf,
    updatedAtOf,
    tombstones,
  );
  const schedulingUnits = applyTombstones(
    'schedulingUnits',
    newestWins(left.schedulingUnits, right.schedulingUnits, idOf, updatedAtOf),
    idOf,
    updatedAtOf,
    tombstones,
  );
  // Newest-wins is lossy when both devices studied offline: the losing Welford
  // summary is discarded. Combining them would double-count reviews that exist
  // on both sides. Pacing rebuilds as study continues.
  const coursePerformance = applyTombstones(
    'coursePerformance',
    newestWins(left.coursePerformance, right.coursePerformance, coursePerfId, updatedAtOf),
    coursePerfId,
    updatedAtOf,
    tombstones,
  );
  const schedulingPerformance = applyTombstones(
    'schedulingPerformance',
    newestWins(
      left.schedulingPerformance,
      right.schedulingPerformance,
      schedulingPerfId,
      updatedAtOf,
    ),
    schedulingPerfId,
    updatedAtOf,
    tombstones,
  );
  const cards = applyTombstones(
    'cards',
    newestWins(left.cards, right.cards, idOf, updatedAtOf),
    idOf,
    updatedAtOf,
    tombstones,
  );
  const agentMemories = applyTombstones(
    'agentMemories',
    mergeAgentMemories(left.agentMemories, right.agentMemories),
    idOf,
    updatedAtOf,
    tombstones,
  ).filter(
    (memory) => memory.courseId === null || courses.some((course) => course.id === memory.courseId),
  );
  const questionState = mergeQuestionCollections(left, right, courses, [...tombstones.values()]);
  const lineageIdMappings = mergeLineageMappings(left.lineageIdMappings, right.lineageIdMappings);
  const pendingMergeReviews = newestWins(
    left.pendingMergeReviews,
    right.pendingMergeReviews,
    (row) => row.courseId,
    (row) => row.createdAt,
  );

  const liveCardIds = new Set(cards.map((card) => card.id));
  const unionedReviews = unionReviews(left, right);
  const reviewHistory = unionedReviews.filter((entry) => liveCardIds.has(entry.cardId));
  const replayedCards = replayCards(cards, reviewHistory, schedulingUnits, courses);
  const deadEventIds = new Set(
    unionedReviews.flatMap((entry) =>
      !liveCardIds.has(entry.cardId) && entry.eventId ? [entry.eventId] : [],
    ),
  );
  const sessionHistory = unionSessionHistory(left.sessionHistory, right.sessionHistory).filter(
    (entry) => !entry.eventId || !deadEventIds.has(entry.eventId),
  );

  const liveKeys = collectLiveKeys({
    cards: replayedCards,
    courses,
    lessons,
    notes,
    lessonCards,
    lessonCardExposures,
    lessonCompletions,
    practiceNodes,
    practiceMilestones,
    courseAssessments,
    sequences,
    revisionPlans,
    occlusions,
    schedulingUnits,
    coursePerformance,
    schedulingPerformance,
    concepts: questionState.concepts,
    questions: questionState.questions,
    questionConcepts: questionState.questionConcepts,
    questionAttempts: questionState.questionAttempts,
    agentMemories,
  });
  const keptTombstones = [...tombstones.values()]
    .filter((row) => !liveKeys.has(tombstoneKey(row.table, row.recordId)))
    .sort(compareTombstones);

  return {
    app: 'lacuna',
    version: 11,
    exportedAt: Math.max(left.exportedAt, right.exportedAt),
    cards: sortById(replayedCards),
    reviewHistory: sortById(reviewHistory),
    schedulingUnits: sortById(schedulingUnits),
    coursePerformance: sortBy(coursePerformance, coursePerfId),
    schedulingPerformance: sortBy(schedulingPerformance, schedulingPerfId),
    assets: mergeAssets(
      left.assets,
      right.assets,
      replayedCards,
      notes,
      occlusions,
      questionState.questions,
      questionState.questionAttempts,
    ),
    sessionHistory: sortSessionHistory(sessionHistory),
    userPerformance: [],
    courses: sortById(courses),
    lessons: sortById(lessons),
    notes: sortById(notes),
    lessonCards: sortById(lessonCards),
    lessonCardExposures: sortBy(lessonCardExposures, exposureId),
    lessonCompletions: sortBy(lessonCompletions, completionId),
    practiceNodes: sortById(practiceNodes),
    practiceMilestones: sortBy(practiceMilestones, milestoneId),
    courseAssessments: sortById(courseAssessments),
    revisionPlans: sortById(revisionPlans),
    sequences: sortById(sequences),
    occlusions: sortById(occlusions),
    tombstones: keptTombstones,
    concepts: questionState.concepts,
    questions: questionState.questions,
    questionConcepts: questionState.questionConcepts,
    questionAttempts: questionState.questionAttempts,
    lineageIdMappings,
    pendingMergeReviews,
    agentMemories: sortById(agentMemories),
  };
}

interface NormalisedSnapshot extends QuestionMergeCollections {
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
}

function normaliseSnapshot(input: BackupFile): NormalisedSnapshot {
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

function idOf(row: { id: string }): string {
  return row.id;
}

function exposureId(row: Pick<LessonCardExposure, 'lessonId' | 'cardId'>): string {
  return `${row.lessonId}:${row.cardId}`;
}

function completionId(row: Pick<LessonCompletion, 'lessonId'>): string {
  return row.lessonId;
}

function milestoneId(row: Pick<PracticeMilestone, 'nodeKey'>): string {
  return row.nodeKey;
}

function coursePerfId(row: Pick<CoursePerformance, 'courseId'>): string {
  return row.courseId;
}

function schedulingPerfId(row: Pick<SchedulingPerformance, 'schedulingUnitId'>): string {
  return row.schedulingUnitId;
}

function updatedAtOf(row: { updatedAt: number }): number {
  return row.updatedAt;
}

function tombstoneKey(table: string, recordId: string): string {
  return `${table}:${recordId}`;
}

function unionTombstones(left: Tombstone[], right: Tombstone[]): Map<string, Tombstone> {
  const merged = new Map<string, Tombstone>();
  for (const row of [...left, ...right]) {
    const key = tombstoneKey(row.table, row.recordId);
    const existing = merged.get(key);
    if (!existing || row.deletedAt > existing.deletedAt) merged.set(key, row);
  }
  return merged;
}

function newestWins<T>(
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

function mergeAgentMemories(left: AgentMemory[], right: AgentMemory[]): AgentMemory[] {
  const scopeById = new Map<string, string | null>();
  for (const memory of [...left, ...right]) {
    if (scopeById.has(memory.id) && scopeById.get(memory.id) !== memory.courseId) {
      throw new Error('A learner memory cannot move between global and Course scope.');
    }
    scopeById.set(memory.id, memory.courseId);
  }
  return newestWins(left, right, idOf, updatedAtOf);
}

function mergeLineageMappings(
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
      sequenceIds: union(existing.sequenceIds, incoming.sequenceIds),
      occlusionIds: union(existing.occlusionIds ?? [], incoming.occlusionIds ?? []),
      lessonSnapshots: records(existing.lessonSnapshots, incoming.lessonSnapshots),
      noteSnapshots: records(existing.noteSnapshots, incoming.noteSnapshots),
      cardSnapshots: records(existing.cardSnapshots, incoming.cardSnapshots),
    });
  }
  return [...mappings.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function applyTombstones<T>(
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

function collectLiveKeys(tables: {
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
  for (const row of tables.agentMemories) add('agentMemories', row.id);
  return keys;
}

function unionReviews(left: NormalisedSnapshot, right: NormalisedSnapshot): ReviewHistoryEntry[] {
  // Sort both arguments so merge(a, b) and merge(b, a) feed the helper the
  // same sequence. The helper already prefers canonical rows over card
  // projections; we only have to make that preference order-independent.
  const canonical = sortReviews([...left.reviewHistory, ...right.reviewHistory]);
  const cards = sortById([...left.cards, ...right.cards]);
  return mergeReviewHistoryEntries(canonical, cards);
}

function sortReviews(entries: ReviewHistoryEntry[]): ReviewHistoryEntry[] {
  return [...entries].sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    const event = (a.eventId ?? '').localeCompare(b.eventId ?? '');
    if (event !== 0) return event;
    const id = a.id.localeCompare(b.id);
    if (id !== 0) return id;
    return a.cardId.localeCompare(b.cardId);
  });
}

function replayCards(
  cards: Card[],
  reviewHistory: ReviewHistoryEntry[],
  units: SchedulingUnitRecord[],
  courses: CourseRecord[],
): Card[] {
  const byCard = new Map<string, ReviewHistoryEntry[]>();
  for (const entry of reviewHistory) {
    const list = byCard.get(entry.cardId) ?? [];
    list.push(entry);
    byCard.set(entry.cardId, list);
  }
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const reset = cards.map((card) => {
    const events = (byCard.get(card.id) ?? [])
      .filter((entry) => isGrade(entry.grade))
      .sort((a, b) => {
        if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
        return reviewEventKey(a).localeCompare(reviewEventKey(b));
      });
    let current: Card = { ...card, ...NEVER_REVIEWED };
    if (events.length === 0) return current;
    const params = parametersForCard(card, unitById, courseById);
    // Fuzz is non-deterministic. Commutativity depends on this being false.
    const engine = makeEngine({ ...params, enable_fuzz: false });
    for (const event of events) {
      const { memory } = applyReview(engine, current, event.grade, event.timestamp);
      current = { ...current, ...memory };
    }
    return current;
  });
  return cardsWithReviewHistory(reset, reviewHistory);
}

function parametersForCard(
  card: Card,
  unitById: Map<string, SchedulingUnitRecord>,
  courseById: Map<string, CourseRecord>,
): FsrsParameters {
  const unit = unitById.get(card.schedulingUnitId);
  if (unit) return unit.fsrsParameters;
  if (card.courseId) {
    const course = courseById.get(card.courseId);
    if (course) return course.fsrsParameters;
  }
  return defaultFsrsParameters();
}

function isGrade(value: unknown): value is Grade {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function reviewEventKey(entry: ReviewHistoryEntry): string {
  return entry.eventId ?? entry.id;
}

function unionSessionHistory(
  left: SessionHistoryEntry[],
  right: SessionHistoryEntry[],
): SessionHistoryEntry[] {
  const merged = new Map<string, SessionHistoryEntry>();
  for (const row of [...left, ...right]) {
    const key = sessionHistoryKey(row);
    const stripped = stripSessionId(row);
    const existing = merged.get(key);
    if (!existing || canonicalJson(stripped) > canonicalJson(existing)) {
      merged.set(key, stripped);
    }
  }
  return [...merged.values()];
}

function sessionHistoryKey(entry: SessionHistoryEntry): string {
  return entry.eventId ? `event:${entry.eventId}` : `legacy:${entry.timestamp}:${entry.deckId}`;
}

function stripSessionId(entry: SessionHistoryEntry): SessionHistoryEntry {
  const { id: _id, ...rest } = entry;
  return rest;
}

function mergeAssets(
  left: BackupAsset[],
  right: BackupAsset[],
  cards: Card[],
  notes: Note[],
  occlusions: Occlusion[],
  questions: QuestionDefinition[],
  attempts: QuestionAttempt[],
): BackupAsset[] {
  const byHash = new Map<string, BackupAsset>();
  for (const asset of [...left, ...right]) {
    const hash = asset.hash.toLowerCase();
    const normalised = { ...asset, hash };
    const existing = byHash.get(hash);
    if (!existing || canonicalJson(normalised) > canonicalJson(existing)) {
      byHash.set(hash, normalised);
    }
  }
  const referenced = referencedHashes(cards, notes, occlusions, questions, attempts);
  return [...byHash.values()]
    .filter((asset) => referenced.has(asset.hash))
    .sort((a, b) => a.hash.localeCompare(b.hash));
}

function referencedHashes(
  cards: Card[],
  notes: Note[],
  occlusions: Occlusion[],
  questions: QuestionDefinition[],
  attempts: QuestionAttempt[],
): Set<string> {
  const hashes = new Set<string>();
  const scan = (markdown: string) => {
    ASSET_RE.lastIndex = 0;
    for (const match of markdown.matchAll(ASSET_RE)) hashes.add(match[1].toLowerCase());
  };
  for (const card of cards) scan(`${card.front}\n${card.back}`);
  for (const note of notes) scan(note.content);
  for (const occlusion of occlusions) hashes.add(occlusion.assetHash.toLowerCase());
  const scanValue = (value: unknown): void => {
    if (typeof value === 'string') {
      scan(value);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) value.forEach(scanValue);
    else Object.values(value as Record<string, unknown>).forEach(scanValue);
  };
  questions.forEach(scanValue);
  attempts.forEach(scanValue);
  return hashes;
}

function canonicalJson(value: unknown): string {
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

function sortById<T extends { id: string }>(rows: T[]): T[] {
  return sortBy(rows, (row) => row.id);
}

function sortBy<T>(rows: T[], keyOf: (row: T) => string): T[] {
  return [...rows].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}

function sortSessionHistory(rows: SessionHistoryEntry[]): SessionHistoryEntry[] {
  return [...rows].sort((a, b) => sessionHistoryKey(a).localeCompare(sessionHistoryKey(b)));
}

function compareTombstones(a: Tombstone, b: Tombstone): number {
  const table = a.table.localeCompare(b.table);
  return table !== 0 ? table : a.recordId.localeCompare(b.recordId);
}
