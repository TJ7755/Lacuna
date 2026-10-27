import { earlierLessonIds } from './courseEntry';
import { catchUpPracticePool } from './catchUpPractice';
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
  dueReviewPool,
  examPracticePool,
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
  studyStartLessonId?: string;
  catchUpEligibleCount?: number;
  archived: boolean;
  nodes: PathNode[];
  practiceByKey: ReadonlyMap<string, StudyFlowPracticeState>;
  activeManualNodeKeys: ReadonlySet<string>;
  completedManualNodeKeys: ReadonlySet<string>;
  recurringPracticeEligibleCount: number;
  examPracticeEligibleCount: number;
  cardCount: number;
  /** Cards behind recurringPracticeEligibleCount, for lesson-level due counts. */
  dueReviewCardIds: ReadonlySet<string>;
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

/** Course-wide mean across the distinct scheduling units owning its cards. */
export function courseMeanReviewSeconds(
  cards: readonly Card[],
  deckSeconds: ReadonlyMap<string, number>,
): number {
  let sum = 0;
  let count = 0;
  const seen = new Set<string>();
  for (const card of cards) {
    if (!card.schedulingUnitId || seen.has(card.schedulingUnitId)) continue;
    seen.add(card.schedulingUnitId);
    const seconds = deckSeconds.get(card.schedulingUnitId);
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
  const lessons = [...examDateContext.lessonsById.values()];
  const earlier = earlierLessonIds(
    course.studyStartLessonId,
    lessons,
    nodes.flatMap((node) => (node.nodeType === 'lesson' ? [node.id] : [])),
  );
  const curricularReachedLessonIds = new Set(
    [...reachedLessonIds].filter((id) => !earlier.has(id)),
  );
  const assessmentContext = {
    course,
    concepts: examDateContext.specificationContext?.concepts,
    assessments: examDateContext.courseAssessments,
    lessons,
    cards,
    links,
    exposures,
    reachedLessonIds,
    priorKnowledgeLessonIds: earlier,
    now,
  };
  const recurringScope = practiceCardScope(
    cards,
    links,
    exposures,
    { reachedLessonIds, requireExposure: course.learnFirst !== false },
    now,
    course.leechThreshold,
  );
  const recurringAssessmentOptions = assessmentPracticeOptions(assessmentContext, recurringScope);
  const curricularScope =
    earlier.size === 0
      ? recurringScope
      : practiceCardScope(
          cards,
          links,
          exposures,
          {
            reachedLessonIds: curricularReachedLessonIds,
            requireExposure: course.learnFirst !== false,
          },
          now,
          course.leechThreshold,
        );
  const provisional: Array<
    StudyFlowPracticeState & { manual: boolean; pathIndex: number; nearestAssessmentDate?: number }
  > = [];

  for (const [pathIndex, node] of nodes.entries()) {
    if (node.nodeType !== 'practice-auto' && node.nodeType !== 'practice-manual') continue;
    if (earlier.size > 0 && (!node.afterLessonId || earlier.has(node.afterLessonId))) continue;
    const scopeLessonIds = new Set(
      [...practicePrefixLessonIds(nodes, node.nodeKey)].filter((id) => !earlier.has(id)),
    );
    const scope = practiceCardScope(
      cards,
      links,
      exposures,
      {
        reachedLessonIds: scopeLessonIds,
        practiceNode: node.practiceNode,
        requireExposure: course.learnFirst !== false,
      },
      now,
      course.leechThreshold,
    );
    const scopeVersion = practiceScopeVersion(scope);
    const readiness = practiceReadiness(scope, course, examDateContext, now);
    const sessionScopeLessonIds = node.practiceNode?.lessonIds
      ? new Set(
          node.practiceNode.lessonIds.filter((lessonId) =>
            curricularReachedLessonIds.has(lessonId),
          ),
        )
      : curricularReachedLessonIds;
    const sessionScope =
      node.nodeType === 'practice-auto'
        ? curricularScope
        : practiceCardScope(
            cards,
            links,
            exposures,
            {
              reachedLessonIds: curricularReachedLessonIds,
              practiceNode: node.practiceNode,
              requireExposure: course.learnFirst !== false,
            },
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
      completed:
        milestone?.completedAt !== undefined &&
        (milestone.scopeVersion === scopeVersion ||
          // Milestones written before #358 carry the live session fingerprint. Honour one
          // only while that exact scope still holds, so it can never complete a checkpoint
          // it did not cover; otherwise the step is offered once and rewritten correctly.
          (sessionScope.length > 0 &&
            milestone.scopeVersion === practiceScopeVersion(sessionScope))),
      active: false,
      manual: node.nodeType === 'practice-manual',
      pathIndex,
      nearestAssessmentDate: assessmentOptions[0]?.examDate,
    });
  }

  const firstLockedLessonIndex = nodes.findIndex(
    (node) => node.nodeType === 'lesson' && node.status === 'locked' && !earlier.has(node.id),
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

  // Scheduled reviews cannot be gated by lesson membership or exposure.
  const dueReviewCardIds = new Set(dueReviewPool(cards, course, now).map((card) => card.id));
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
    studyStartLessonId: course.studyStartLessonId,
    catchUpEligibleCount: catchUpPracticePool(
      cards,
      course,
      lessons,
      links,
      examDateContext,
      reachedLessonIds,
      now,
      earlier,
    ).length,
    archived: course.archived === true,
    nodes,
    practiceByKey,
    activeManualNodeKeys,
    completedManualNodeKeys,
    recurringPracticeEligibleCount: dueReviewCardIds.size,
    examPracticeEligibleCount: examPracticePool(cards, course, examDateContext, now).length,
    cardCount: cards.length,
    dueReviewCardIds,
    assessmentOptions: recurringAssessmentOptions,
  };
}
