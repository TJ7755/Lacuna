import type {
  Card,
  Course,
  LessonCardExposure,
  LessonCardLink,
  PracticeMilestone,
} from '../db/types';
import type { ExamDateContext } from '../fsrs/examDate';
import { DEFAULT_REVIEW_SECONDS } from '../fsrs/stats';
import type { PathNode, PracticePathNode } from './path';
import { assessmentPracticeOptions, type AssessmentPracticeOption } from './assessmentPractice';
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
  sessionScopeLessonIds: ReadonlySet<string>;
  assessmentOptions: AssessmentPracticeOption[];
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
  assessmentOptions: AssessmentPracticeOption[];
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

function thresholdMinutes(course: Course, nearestAssessmentDate?: number): number {
  return nearestAssessmentDate !== undefined
    ? course.practiceThresholdMinutesNear
    : course.practiceThresholdMinutesFar;
}

/**
 * Builds every fact the conductor and course path need from one immutable
 * course snapshot. A curricular milestone keeps its fixed path prefix, while
 * its live session uses the current reached scope; later lessons cannot rewrite
 * or revive the earlier milestone.
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
  now = Date.now(),
}: BuildCourseStudyFlowSnapshotInput): CourseStudyFlowSnapshot {
  const milestoneByKey = new Map(
    practiceMilestones.map((milestone) => [milestone.nodeKey, milestone]),
  );
  const reachedLessonIds = new Set(
    nodes
      .filter((node) => node.nodeType === 'lesson' && node.status !== 'locked')
      .map((node) => node.id),
  );
  const assessmentContext = {
    course,
    assessments: examDateContext.courseAssessments,
    lessons: [...examDateContext.lessonsById.values()],
    cards,
    links,
    exposures,
    reachedLessonIds,
    now,
  };
  const recurringScope = practiceCardScope(
    cards,
    links,
    exposures,
    { reachedLessonIds },
    now,
    course.leechThreshold,
  );
  const recurringAssessmentOptions = assessmentPracticeOptions(assessmentContext, recurringScope);
  const provisional: Array<
    StudyFlowPracticeState & { manual: boolean; pathIndex: number; nearestAssessmentDate?: number }
  > = [];

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
    const sessionScopeLessonIds = node.practiceNode?.lessonIds
      ? new Set(node.practiceNode.lessonIds.filter((lessonId) => reachedLessonIds.has(lessonId)))
      : reachedLessonIds;
    const sessionScope =
      node.nodeType === 'practice-auto'
        ? recurringScope
        : practiceCardScope(
            cards,
            links,
            exposures,
            { reachedLessonIds, practiceNode: node.practiceNode },
            now,
            course.leechThreshold,
          );
    const assessmentOptions = assessmentPracticeOptions(assessmentContext, sessionScope);
    const sessionEligibleCount = eligiblePracticePool(
      sessionScope,
      course,
      examDateContext,
      now,
    ).length;
    const milestone = milestoneByKey.get(node.nodeKey) ?? node.milestone;
    provisional.push({
      nodeKey: node.nodeKey,
      nodeType: node.nodeType,
      label: node.practiceNode?.name ?? 'Practice',
      scopeLessonIds,
      sessionScopeLessonIds,
      assessmentOptions,
      scopeVersion,
      totalCount: readiness.totalCardCount,
      securedCount: readiness.securedCardCount,
      eligibleCount: sessionEligibleCount,
      completed: milestone?.scopeVersion === scopeVersion && milestone.completedAt !== undefined,
      active: false,
      manual: node.nodeType === 'practice-manual',
      pathIndex,
      nearestAssessmentDate: assessmentOptions[0]?.examDate,
    });
  }

  const firstLockedLessonIndex = nodes.findIndex(
    (node) => node.nodeType === 'lesson' && node.status === 'locked',
  );
  const lastRelevantUrgentManual = [...provisional]
    .reverse()
    .find(
      (practice) =>
        practice.manual &&
        !practice.completed &&
        practice.eligibleCount > 0 &&
        practice.nearestAssessmentDate !== undefined &&
        (firstLockedLessonIndex < 0 || practice.pathIndex < firstLockedLessonIndex),
    )?.nodeKey;

  const practiceByKey = new Map<string, StudyFlowPracticeState>();
  for (const practice of provisional) {
    const workloadMinutes = (practice.eligibleCount * meanReviewSeconds) / 60;
    const workloadThreshold = thresholdMinutes(course, practice.nearestAssessmentDate);
    const active = practice.manual
      ? !practice.completed &&
        practice.eligibleCount > 0 &&
        (workloadMinutes >= workloadThreshold || practice.nodeKey === lastRelevantUrgentManual)
      : !practice.completed && practice.eligibleCount > 0;
    const state: StudyFlowPracticeState = {
      nodeKey: practice.nodeKey,
      nodeType: practice.nodeType,
      label: practice.label,
      scopeLessonIds: practice.scopeLessonIds,
      sessionScopeLessonIds: practice.sessionScopeLessonIds,
      assessmentOptions: practice.assessmentOptions,
      scopeVersion: practice.scopeVersion,
      totalCount: practice.totalCount,
      securedCount: practice.securedCount,
      eligibleCount: practice.eligibleCount,
      completed: practice.completed,
      active,
    };
    practiceByKey.set(practice.nodeKey, state);
  }

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
    assessmentOptions: recurringAssessmentOptions,
  };
}
