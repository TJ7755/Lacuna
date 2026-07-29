import type {
  Card,
  Course,
  LessonCardExposure,
  LessonCardLink,
  PracticeMilestone,
} from '../db/types';
import type { ExamDateContext } from '../fsrs/examDate';
import { DEFAULT_REVIEW_SECONDS } from '../fsrs/stats';
import { daysUntil } from '../utils/datetime';
import type { PathNode, PracticePathNode } from './path';
import {
  eligiblePracticePool,
  practiceCardScope,
  practiceReadiness,
  practiceScopeVersion,
} from './studyPools';

export interface StudyFlowPracticeState {
  nodeKey: string;
  nodeType: PracticePathNode['nodeType'];
  label: string;
  scopeLessonIds: ReadonlySet<string>;
  scopeVersion: string;
  totalCount: number;
  securedCount: number;
  eligibleCount: number;
  completed: boolean;
  active: boolean;
}

export interface CourseStudyFlowSnapshot {
  courseId: string;
  archived: boolean;
  nodes: PathNode[];
  practiceByKey: ReadonlyMap<string, StudyFlowPracticeState>;
  activeManualNodeKeys: ReadonlySet<string>;
  completedManualNodeKeys: ReadonlySet<string>;
  recurringPracticeEligibleCount: number;
}

export interface BuildCourseStudyFlowSnapshotInput {
  course: Course;
  nodes: PathNode[];
  cards: Card[];
  links: LessonCardLink[];
  exposures: LessonCardExposure[];
  examDateContext: ExamDateContext;
  meanReviewSeconds: number;
  practiceMilestones?: PracticeMilestone[];
  /** Nearest relevant course/checkpoint date, used only for urgency. */
  nearestExamDate: number;
  now?: number;
}

/** Course-wide mean across the distinct decks backing its cards. */
export function courseMeanReviewSeconds(
  cards: readonly Card[],
  deckSeconds: ReadonlyMap<string, number>,
): number {
  let sum = 0;
  let count = 0;
  const seen = new Set<string>();
  for (const card of cards) {
    if (seen.has(card.deckId)) continue;
    seen.add(card.deckId);
    const seconds = deckSeconds.get(card.deckId);
    if (seconds === undefined) continue;
    sum += seconds;
    count += 1;
  }
  return count > 0 ? sum / count : DEFAULT_REVIEW_SECONDS;
}

/** Lesson prefix represented by a curricular Practice node. */
export function practicePrefixLessonIds(
  nodes: readonly PathNode[],
  practiceNodeKey: string,
): ReadonlySet<string> {
  const result = new Set<string>();
  for (const node of nodes) {
    if (
      (node.nodeType === 'practice-auto' || node.nodeType === 'practice-manual') &&
      node.nodeKey === practiceNodeKey
    ) {
      break;
    }
    if (node.nodeType === 'lesson') result.add(node.id);
  }
  return result;
}

function thresholdMinutes(course: Course, nearestExamDate: number, now: number): number {
  return daysUntil(nearestExamDate, now) <= course.practiceUrgentWindowDays
    ? course.practiceThresholdMinutesNear
    : course.practiceThresholdMinutesFar;
}

/**
 * Builds every fact the conductor and course path need from one immutable
 * course snapshot. Curricular Practice is scoped to its fixed path prefix;
 * later lessons therefore cannot revive an earlier milestone.
 */
export function buildCourseStudyFlowSnapshot({
  course,
  nodes,
  cards,
  links,
  exposures,
  examDateContext,
  meanReviewSeconds,
  practiceMilestones = [],
  nearestExamDate,
  now = Date.now(),
}: BuildCourseStudyFlowSnapshotInput): CourseStudyFlowSnapshot {
  const milestoneByKey = new Map(
    practiceMilestones.map((milestone) => [milestone.nodeKey, milestone]),
  );
  const provisional: Array<StudyFlowPracticeState & { manual: boolean; pathIndex: number }> = [];

  for (const [pathIndex, node] of nodes.entries()) {
    if (node.nodeType !== 'practice-auto' && node.nodeType !== 'practice-manual') continue;
    const scopeLessonIds = practicePrefixLessonIds(nodes, node.nodeKey);
    const scope = practiceCardScope(
      cards,
      links,
      exposures,
      { reachedLessonIds: scopeLessonIds, practiceNode: node.practiceNode },
      now,
      course.leechThreshold,
    );
    const scopeVersion = practiceScopeVersion(scope);
    const readiness = practiceReadiness(scope, course, examDateContext, now);
    const eligibleCount = eligiblePracticePool(scope, course, examDateContext, now).length;
    const milestone = milestoneByKey.get(node.nodeKey) ?? node.milestone;
    provisional.push({
      nodeKey: node.nodeKey,
      nodeType: node.nodeType,
      label: node.practiceNode?.name ?? 'Practice',
      scopeLessonIds,
      scopeVersion,
      totalCount: readiness.totalCardCount,
      securedCount: readiness.securedCardCount,
      eligibleCount,
      completed: milestone?.scopeVersion === scopeVersion && milestone.completedAt !== undefined,
      active: false,
      manual: node.nodeType === 'practice-manual',
      pathIndex,
    });
  }

  const urgent = daysUntil(nearestExamDate, now) <= course.practiceUrgentWindowDays;
  const firstLockedLessonIndex = nodes.findIndex(
    (node) => node.nodeType === 'lesson' && node.status === 'locked',
  );
  const lastRelevantManual = [...provisional]
    .reverse()
    .find(
      (practice) =>
        practice.manual &&
        !practice.completed &&
        practice.eligibleCount > 0 &&
        (firstLockedLessonIndex < 0 || practice.pathIndex < firstLockedLessonIndex),
    )?.nodeKey;
  const workloadThreshold = thresholdMinutes(course, nearestExamDate, now);

  const practiceByKey = new Map<string, StudyFlowPracticeState>();
  for (const practice of provisional) {
    const workloadMinutes = (practice.eligibleCount * meanReviewSeconds) / 60;
    const active = practice.manual
      ? !practice.completed &&
        practice.eligibleCount > 0 &&
        (workloadMinutes >= workloadThreshold ||
          (urgent && practice.nodeKey === lastRelevantManual))
      : !practice.completed && practice.eligibleCount > 0;
    const state: StudyFlowPracticeState = {
      nodeKey: practice.nodeKey,
      nodeType: practice.nodeType,
      label: practice.label,
      scopeLessonIds: practice.scopeLessonIds,
      scopeVersion: practice.scopeVersion,
      totalCount: practice.totalCount,
      securedCount: practice.securedCount,
      eligibleCount: practice.eligibleCount,
      completed: practice.completed,
      active,
    };
    practiceByKey.set(practice.nodeKey, state);
  }

  const allLessonIds = new Set(
    nodes.filter((node) => node.nodeType === 'lesson').map((node) => node.id),
  );
  const recurringScope = practiceCardScope(
    cards,
    links,
    exposures,
    { reachedLessonIds: allLessonIds },
    now,
    course.leechThreshold,
  );
  const recurringPracticeEligibleCount = eligiblePracticePool(
    recurringScope,
    course,
    examDateContext,
    now,
  ).length;
  const activeManualNodeKeys = new Set(
    [...practiceByKey.values()]
      .filter((practice) => practice.nodeType === 'practice-manual' && practice.active)
      .map((practice) => practice.nodeKey),
  );
  const completedManualNodeKeys = new Set(
    [...practiceByKey.values()]
      .filter((practice) => practice.nodeType === 'practice-manual' && practice.completed)
      .map((practice) => practice.nodeKey),
  );

  return {
    courseId: course.id,
    archived: course.archived === true,
    nodes,
    practiceByKey,
    activeManualNodeKeys,
    completedManualNodeKeys,
    recurringPracticeEligibleCount,
  };
}
