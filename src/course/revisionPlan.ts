import type {
  Card,
  CourseAssessment,
  Lesson,
  LessonCardExposure,
  LessonCardLink,
  LessonCompletion,
  RevisionPlan,
  RevisionPlanCardState,
  RevisionPlanInputSnapshot,
  RevisionPlanReplan,
  RevisionPlanScopeSnapshot,
  RevisionPlanSession,
  RevisionPlanWindow,
  RevisionProjection,
  RevisionReplanReason,
} from '../db/types';
import { isAvailable } from '../fsrs/eligibility';
import { getComponentsInZone } from '../utils/datetime';
import { resolveAssessmentCoverage } from './assessmentCoverage';
import { lessonCardMembership } from './studyPools';
import { lessonTaught } from './unlock';

export interface RevisionPlanContext {
  assessment: CourseAssessment;
  lessons: Lesson[];
  cards: Card[];
  links: LessonCardLink[];
  exposures: LessonCardExposure[];
  completions: LessonCompletion[];
  reachedLessonIds: ReadonlySet<string>;
  projection: RevisionProjection;
  now: number;
}

export interface ResolvedRevisionPlanInput {
  input: RevisionPlanInputSnapshot;
  scope: RevisionPlanScopeSnapshot;
  cardStates: RevisionPlanCardState[];
}

const REPLAN_ORDER: readonly RevisionReplanReason[] = [
  'assessment-coverage-changed',
  'assessment-deadline-changed',
  'assessment-time-zone-changed',
  'memory-model-changed',
  'reached-lessons-changed',
  'card-exposure-changed',
  'card-availability-changed',
  'review-evidence-changed',
];

function hash(value: string): string {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(36);
}

function fingerprint(values: readonly string[]): string {
  const stable = [...new Set(values)].sort();
  return `v1-${stable.length}-${hash(stable.map((value) => `${value.length}:${value}`).join('|'))}`;
}

function projectionKey(projection: RevisionProjection): string {
  return `${projection.projectionMode}:${projection.memoryModelVersion}:${
    projection.projectionMode === 'fsrs-6-practice-fallback' ? projection.fallbackReason : ''
  }`;
}

/** Resolve the frozen scope and compact change-detection inputs without producing predictions. */
export function resolveRevisionPlanInput(context: RevisionPlanContext): ResolvedRevisionPlanInput {
  const resolved = resolveAssessmentCoverage(
    context.assessment,
    context.lessons,
    context.cards,
    context.links,
  );
  if (!resolved.validation.valid) {
    throw new Error(resolved.validation.issues[0]?.message ?? 'Assessment coverage is invalid.');
  }

  const reachedCoveredLessons = resolved.coveredLessons.filter((lesson) =>
    context.reachedLessonIds.has(lesson.id),
  );
  const reachedLessonIds = reachedCoveredLessons.map((lesson) => lesson.id).sort();
  const exposedCardIds = new Set(context.exposures.map((exposure) => exposure.cardId));
  const eligibleOrUnavailable = resolved.cards.filter((card) => {
    if (!exposedCardIds.has(card.id)) return false;
    return reachedCoveredLessons.some((lesson) =>
      lessonCardMembership(lesson.id, context.cards, context.links).some(
        (member) => member.id === card.id,
      ),
    );
  });
  const eligibleCardIds = eligibleOrUnavailable
    .filter((card) => isAvailable(card, context.now))
    .map((card) => card.id)
    .sort();
  const unavailableCardIds = eligibleOrUnavailable
    .filter((card) => !isAvailable(card, context.now))
    .map((card) => card.id)
    .sort();
  const untaughtLessonIds = reachedCoveredLessons
    .filter(
      (lesson) =>
        !lessonTaught(
          lesson.id,
          lessonCardMembership(lesson.id, context.cards, context.links),
          context.exposures,
          context.completions,
        ),
    )
    .map((lesson) => lesson.id)
    .sort();
  const coveredLessonIds = resolved.coveredLessons.map((lesson) => lesson.id);
  const excludedCardIds = [...context.assessment.excludedCardIds].sort();
  const coverageVersion = fingerprint([
    context.assessment.coverageMode,
    ...coveredLessonIds.map((id) => `lesson:${id}`),
    ...resolved.cards.map((card) => `card:${card.id}`).sort(),
    ...excludedCardIds.map((id) => `excluded:${id}`),
  ]);
  const exposureVersion = fingerprint([
    ...eligibleOrUnavailable.map((card) => `exposed:${card.id}`),
    ...untaughtLessonIds.map((id) => `untaught:${id}`),
  ]);
  const availabilityVersion = fingerprint([
    ...eligibleCardIds.map((id) => `eligible:${id}`),
    ...unavailableCardIds.map((id) => `unavailable:${id}`),
  ]);
  const reviewEvidenceVersion = fingerprint(
    eligibleOrUnavailable.flatMap((card) =>
      card.history.map(
        (review) =>
          `${card.id}:${review.eventId ?? ''}:${review.timestamp}:${review.grade}:${review.correct ?? ''}`,
      ),
    ),
  );
  const input: RevisionPlanInputSnapshot = {
    coverageVersion,
    deadlineAt: context.assessment.examDate,
    ...(context.assessment.timeZone ? { timeZone: context.assessment.timeZone } : {}),
    reachedLessonIds,
    exposureVersion,
    availabilityVersion,
    reviewEvidenceVersion,
    projection: context.projection,
  };
  return {
    input,
    scope: {
      coveredLessonIds,
      excludedCardIds,
      eligibleCardIds,
      unavailableCardIds,
      unreachedLessonIds: coveredLessonIds
        .filter((id) => !context.reachedLessonIds.has(id))
        .sort(),
      untaughtLessonIds,
    },
    cardStates: [
      ...eligibleCardIds.map((cardId) => ({ cardId, status: 'eligible' as const })),
      ...unavailableCardIds.map((cardId) => ({ cardId, status: 'unavailable' as const })),
    ],
  };
}

export function revisionReplanReasons(
  previous: RevisionPlanInputSnapshot,
  next: RevisionPlanInputSnapshot,
): RevisionReplanReason[] {
  const reasons = new Set<RevisionReplanReason>();
  if (previous.coverageVersion !== next.coverageVersion) reasons.add('assessment-coverage-changed');
  if (previous.deadlineAt !== next.deadlineAt) reasons.add('assessment-deadline-changed');
  if (previous.timeZone !== next.timeZone) reasons.add('assessment-time-zone-changed');
  if (projectionKey(previous.projection) !== projectionKey(next.projection)) {
    reasons.add('memory-model-changed');
  }
  if (fingerprint(previous.reachedLessonIds) !== fingerprint(next.reachedLessonIds)) {
    reasons.add('reached-lessons-changed');
  }
  if (previous.exposureVersion !== next.exposureVersion) reasons.add('card-exposure-changed');
  if (previous.availabilityVersion !== next.availabilityVersion) {
    reasons.add('card-availability-changed');
  }
  if (previous.reviewEvidenceVersion !== next.reviewEvidenceVersion) {
    reasons.add('review-evidence-changed');
  }
  return REPLAN_ORDER.filter((reason) => reasons.has(reason));
}

export function explainRevisionReplan(reasons: readonly RevisionReplanReason[]): string {
  const labels: Record<RevisionReplanReason, string> = {
    'assessment-coverage-changed': 'assessment coverage changed',
    'assessment-deadline-changed': 'the assessment deadline moved',
    'assessment-time-zone-changed': 'the assessment time zone changed',
    'memory-model-changed': 'the memory model changed',
    'reached-lessons-changed': 'the reached lesson scope changed',
    'card-exposure-changed': 'card exposure changed',
    'card-availability-changed': 'card availability changed',
    'review-evidence-changed': 'new review evidence was recorded',
  };
  return reasons.map((reason) => labels[reason]).join('; ');
}

function dayKey(ms: number, timeZone?: string): string {
  const value = getComponentsInZone(ms, timeZone);
  return `${value.year}-${String(value.month + 1).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
}

export function revisionPlanDays(now: number, deadlineAt: number, timeZone?: string): string[] {
  const start = getComponentsInZone(now, timeZone);
  const end = getComponentsInZone(deadlineAt, timeZone);
  const cursor = new Date(Date.UTC(start.year, start.month, start.day));
  const last = Date.UTC(end.year, end.month, end.day);
  const days: string[] = [];
  while (cursor.getTime() <= last) {
    days.push(
      `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(
        cursor.getUTCDate(),
      ).padStart(2, '0')}`,
    );
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return deadlineAt > now ? days : [];
}

export function buildRevisionWindows(
  planId: string,
  todayBudgetMinutes: number,
  now: number,
  deadlineAt: number,
  timeZone?: string,
): RevisionPlanWindow[] {
  if (!Number.isFinite(todayBudgetMinutes) || todayBudgetMinutes <= 0) {
    throw new Error('The daily revision budget must be greater than zero.');
  }
  return revisionPlanDays(now, deadlineAt, timeZone).map((day) => ({
    id: `${planId}:${day}`,
    day,
    budgetMinutes: todayBudgetMinutes,
    status: 'scheduled',
    planRevision: 1,
  }));
}

export function planIsComplete(plan: RevisionPlan, now: number): boolean {
  const today = dayKey(now, plan.input.timeZone);
  return !plan.windows.some(
    (window) => window.status !== 'completed' && window.day >= today && now < plan.input.deadlineAt,
  );
}

function reconcileWindows(
  plan: RevisionPlan,
  input: RevisionPlanInputSnapshot,
  now: number,
): RevisionPlanWindow[] {
  const retained = plan.windows.filter((window) => window.status !== 'scheduled');
  const currentScheduled = new Map(
    plan.windows
      .filter((window) => window.status === 'scheduled')
      .map((window) => [window.day, window]),
  );
  const inheritedBudget =
    plan.windows.find((window) => window.status === 'scheduled')?.budgetMinutes ??
    plan.windows[plan.windows.length - 1]?.budgetMinutes ??
    1;
  const scheduled = revisionPlanDays(now, input.deadlineAt, input.timeZone).map((day) => {
    const existing = currentScheduled.get(day);
    return (
      existing ?? {
        id: `${plan.id}:${day}`,
        day,
        budgetMinutes: inheritedBudget,
        status: 'scheduled' as const,
        planRevision: plan.revision + 1,
      }
    );
  });
  return [...retained, ...scheduled].sort(
    (left, right) => left.day.localeCompare(right.day) || left.id.localeCompare(right.id),
  );
}

function preserveCardStateExtensions(
  current: RevisionPlanCardState[],
  next: RevisionPlanCardState[],
): RevisionPlanCardState[] {
  const currentById = new Map(current.map((state) => [state.cardId, state]));
  return next.map((state) => ({ ...currentById.get(state.cardId), ...state }));
}

export function applyRevisionPlanInput(
  plan: RevisionPlan,
  resolved: ResolvedRevisionPlanInput,
  now: number,
): RevisionPlan {
  const reasons = revisionReplanReasons(plan.input, resolved.input);
  if (reasons.length === 0) return plan;
  if (plan.windows.some((window) => window.status === 'active')) {
    const pendingReasons = REPLAN_ORDER.filter(
      (reason) => reasons.includes(reason) || plan.pendingReplan?.reasons.includes(reason),
    );
    return {
      ...plan,
      pendingReplan: {
        reasons: pendingReasons,
        requestedAt: now,
        ...resolved,
      },
      updatedAt: now,
    };
  }
  const revision = plan.revision + 1;
  const updated: RevisionPlan = {
    ...plan,
    revision,
    input: resolved.input,
    scope: resolved.scope,
    cardStates: preserveCardStateExtensions(plan.cardStates, resolved.cardStates),
    replans: [...plan.replans, makeReplan(revision, reasons, now)],
    pendingReplan: undefined,
    updatedAt: now,
  };
  updated.windows = reconcileWindows(updated, resolved.input, now);
  updated.status = planIsComplete(updated, now) ? 'completed' : 'active';
  return updated;
}

export function applyPendingRevisionPlanInput(plan: RevisionPlan, now: number): RevisionPlan {
  if (!plan.pendingReplan || plan.windows.some((window) => window.status === 'active')) return plan;
  const revision = plan.revision + 1;
  const pending = plan.pendingReplan;
  const updated: RevisionPlan = {
    ...plan,
    revision,
    input: pending.input,
    scope: pending.scope,
    cardStates: preserveCardStateExtensions(plan.cardStates, pending.cardStates),
    replans: [...plan.replans, makeReplan(revision, pending.reasons, now)],
    pendingReplan: undefined,
    updatedAt: now,
  };
  updated.windows = reconcileWindows(updated, pending.input, now);
  updated.status = planIsComplete(updated, now) ? 'completed' : 'active';
  return updated;
}

export function mergeRevisionPlans(local: RevisionPlan, incoming: RevisionPlan): RevisionPlan {
  const newer = incoming.updatedAt > local.updatedAt ? incoming : local;
  const mergeById = <T extends { id: string }>(left: T[], right: T[]): T[] =>
    [...new Map([...left, ...right].map((entry) => [entry.id, entry])).values()];
  const activeLocal = local.windows.find((window) => window.status === 'active');
  const localWindows = new Map(local.windows.map((window) => [window.id, window]));
  const windows = mergeById(local.windows, incoming.windows).map((window) => {
    const localWindow = localWindows.get(window.id);
    if (activeLocal?.id === window.id) return activeLocal;
    if (localWindow?.status === 'completed' && window.status !== 'completed') return localWindow;
    return window;
  });
  const pendingReasons = REPLAN_ORDER.filter(
    (reason) =>
      local.pendingReplan?.reasons.includes(reason) || incoming.pendingReplan?.reasons.includes(reason),
  );
  const pendingBase =
    incoming.pendingReplan &&
    (!local.pendingReplan || incoming.pendingReplan.requestedAt > local.pendingReplan.requestedAt)
      ? incoming.pendingReplan
      : local.pendingReplan;
  return {
    ...newer,
    id: local.id,
    windows,
    completedSessions: mergeById(local.completedSessions, incoming.completedSessions),
    replans: mergeById(local.replans, incoming.replans),
    ...(pendingBase
      ? { pendingReplan: { ...pendingBase, reasons: pendingReasons } }
      : { pendingReplan: undefined }),
  };
}

export function appendCompletedSession(
  sessions: RevisionPlanSession[],
  session: RevisionPlanSession,
): RevisionPlanSession[] {
  return sessions.some((existing) => existing.id === session.id) ? sessions : [...sessions, session];
}

export function makeReplan(
  revision: number,
  reasons: RevisionReplanReason[],
  appliedAt: number,
): RevisionPlanReplan {
  return {
    id: `replan:${revision}:${fingerprint(reasons)}`,
    revision,
    reasons,
    explanation: explainRevisionReplan(reasons),
    appliedAt,
  };
}
