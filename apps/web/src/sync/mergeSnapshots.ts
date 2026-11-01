import { assertSpecificationAssessmentReferences } from '../specifications/assessment';
import { referencedQuestionSetConceptIds } from '../questions/questionSets';
// Pure peer-merge of two BackupFile snapshots. No Dexie, no I/O, no knowledge
// of which device produced either side. After this, the two-device dance is
// mergeSnapshots(local, remote) then importBackup(merged, 'replace') — that
// caller is P5, not this module.

import { assertLessonPrerequisites } from '../db/lessonPrerequisites';
import type {
  BackupFile,
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
  Tombstone,
  AgentMemory,
} from '../db/types';
import { projectCardsForStorage, type ReviewHistoryEntry } from '../db/reviewHistory';
import { mergeQuestionCollections } from '../questions/merge';
import type {
  Concept,
  QuestionAttempt,
  QuestionConceptSet,
  QuestionDefinition,
} from '../questions/types';
import type { QuestionSetRecord } from '../questions/questionSetCodec';
import type { QuestionSetAttemptRecord } from '../questions/questionSetAttempts';
import {
  assertQuestionSetReferences,
  mergeQuestionSetRecords,
} from '../questions/questionSetMerge';
import { assertQuestionSetPracticeNodeReferences } from '../db/questionSetPracticeNode';

import {
  normaliseSnapshot,
  idOf,
  exposureId,
  completionId,
  milestoneId,
  coursePerfId,
  schedulingPerfId,
  updatedAtOf,
  tombstoneKey,
  unionTombstones,
  newestWins,
  mergeAgentMemories,
  mergeLineageMappings,
  applyTombstones,
  collectLiveKeys,
  mergeQuestionSetAttempts,
  sortById,
  sortBy,
  compareTombstones,
} from './snapshotRecords';
import {
  unionReviews,
  replayCards,
  withUnionedScheduleEdits,
  unionSessionHistory,
  sortSessionHistory,
} from './snapshotReviews';
import { mergeAssets } from './snapshotAssets';

/** A current snapshot with every table merge always emits present. */
export type MergedBackupFile = BackupFile & {
  version: 15;
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
  questionSets: QuestionSetRecord[];
  questionSetAttempts: QuestionSetAttemptRecord[];
  lineageIdMappings: LineageIdMapping[];
  pendingMergeReviews: PendingMergeReview[];
  agentMemories: AgentMemory[];
};

/** Compare wire state without reordering arrays or coercing non-JSON values. */
export function snapshotStateUnchanged(left: BackupFile, right: BackupFile): boolean {
  return sameSnapshotValue({ ...left, exportedAt: 0 }, { ...right, exportedAt: 0 });
}

function sameSnapshotValue(left: unknown, right: unknown): boolean {
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return Object.is(left, right);
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    if (Object.keys(left).length !== left.length || Object.keys(right).length !== right.length) {
      return false;
    }
    return left.every((entry, index) => sameSnapshotValue(entry, right[index]));
  }
  if (
    Object.getPrototypeOf(left) !== Object.prototype ||
    Object.getPrototypeOf(right) !== Object.prototype
  ) {
    return false;
  }
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  // JSON omits undefined object fields, including optional card payload/answer mode.
  const keys = Object.keys(a).filter((key) => a[key] !== undefined);
  const otherKeys = Object.keys(b).filter((key) => b[key] !== undefined);
  return (
    keys.length === otherKeys.length &&
    keys.every((key) => Object.hasOwn(b, key) && sameSnapshotValue(a[key], b[key]))
  );
}

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
  const cards = withUnionedScheduleEdits(
    applyTombstones(
      'cards',
      newestWins(left.cards, right.cards, idOf, updatedAtOf),
      idOf,
      updatedAtOf,
      tombstones,
    ),
    left.cards,
    right.cards,
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
  const questionSets = mergeQuestionSetRecords(left.questionSets, right.questionSets, [
    ...tombstones.values(),
  ]).filter((set) => courses.some((course) => course.id === set.courseId));
  const requiredConceptCourses = new Map<string, Set<string>>();
  for (const set of questionSets) {
    for (const id of referencedQuestionSetConceptIds(set)) {
      const owners = requiredConceptCourses.get(id) ?? new Set<string>();
      owners.add(set.courseId);
      requiredConceptCourses.set(id, owners);
    }
  }
  const retainedConceptIds = new Set<string>();
  // A surviving set wins a concurrent Concept deletion only when an original,
  // correctly scoped record still exists. Missing records remain validation errors.
  for (const concept of newestWins(left.concepts, right.concepts, idOf, updatedAtOf)) {
    const owners = requiredConceptCourses.get(concept.id);
    if (concept.courseId !== null && owners?.size === 1 && owners.has(concept.courseId)) {
      retainedConceptIds.add(concept.id);
    }
  }
  const questionState = mergeQuestionCollections(
    left,
    right,
    courses,
    [...tombstones.values()].filter(
      (row) => row.table !== 'concepts' || !retainedConceptIds.has(row.recordId),
    ),
  );
  const questionSetAttempts = mergeQuestionSetAttempts(
    applyTombstones(
      'questionSetAttempts',
      [...left.questionSetAttempts, ...right.questionSetAttempts],
      idOf,
      updatedAtOf,
      tombstones,
    ),
  ).filter((attempt) => courses.some((course) => course.id === attempt.courseId));
  assertSpecificationAssessmentReferences(courses, courseAssessments);
  assertLessonPrerequisites(lessons);
  assertQuestionSetReferences(
    questionSets,
    courses,
    lessons,
    courseAssessments,
    questionState.concepts,
  );
  assertQuestionSetPracticeNodeReferences(
    practiceNodes,
    courses,
    lessons,
    questionSets,
    practiceMilestones,
  );
  // Detached lineage state carries deletion receipts (see detachCourse): honour them here
  // so a peer snapshot cannot resurrect a severed registry or its queued review.
  // Lineage mappings carry no updatedAt, so any tombstone for the id wins outright.
  const detachedLineageIds = new Set(
    [...tombstones.values()]
      .filter((row) => row.table === 'lineageIdMappings')
      .map((row) => row.recordId),
  );
  const detachedReviewDeletedAt = new Map(
    [...tombstones.values()]
      .filter((row) => row.table === 'pendingMergeReviews')
      .map((row) => [row.recordId, row.deletedAt]),
  );
  const lineageIdMappings = mergeLineageMappings(
    left.lineageIdMappings,
    right.lineageIdMappings,
  ).filter((mapping) => !detachedLineageIds.has(mapping.id));
  const pendingMergeReviews = newestWins(
    left.pendingMergeReviews,
    right.pendingMergeReviews,
    (row) => row.courseId,
    (row) => row.createdAt,
  ).filter((review) => {
    const deletedAt = detachedReviewDeletedAt.get(review.id);
    return deletedAt === undefined || review.createdAt > deletedAt;
  });

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
    questionSets,
    questionSetAttempts,
    agentMemories,
  });
  const keptTombstones = [...tombstones.values()]
    // Attempt merging unions evidence from older revisions. Keep its deletion
    // boundary even after resurrection so later peers cannot restore discarded evidence.
    // Retain deferred Concept deletions too: removing the final referencing set
    // must honour the original deletion regardless of the order peers synchronise.
    .filter(
      (row) =>
        row.table === 'questionSetAttempts' ||
        (row.table === 'concepts' && retainedConceptIds.has(row.recordId)) ||
        !liveKeys.has(tombstoneKey(row.table, row.recordId)),
    )
    .sort(compareTombstones);

  return {
    app: 'lacuna-v15',
    version: 15,
    exportedAt: Math.max(left.exportedAt, right.exportedAt),
    cards: sortById(projectCardsForStorage(replayedCards)),
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
      questionSets,
      questionSetAttempts,
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
    questionSets,
    questionSetAttempts,
    lineageIdMappings,
    pendingMergeReviews,
    agentMemories: sortById(agentMemories),
  };
}
