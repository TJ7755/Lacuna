import { currentAssessmentPracticeContext } from '../course/assessmentPractice';
import {
  appendCompletedSession,
  applyPendingRevisionPlanInput,
  applyRevisionPlanInput,
  buildRevisionWindows,
  planIsComplete,
  revisionPlanDays,
  resolveRevisionPlanInput,
} from '../course/revisionPlan';
import { finalAssessmentForCourse, hydrateCourse } from './assessmentMigration';
import { friendlyDbError } from './dbErrors';
import { stampUpdatedAt } from './mutationStamp';
import { hydrateCardsWithHistory } from './reviewHistoryRead';
import { db, makeId } from './schema';
import type {
  CourseAssessment,
  RevisionPlan,
  RevisionPlanSession,
  RevisionProjection,
} from './types';

const revisionPlanInputTables = [
  db.revisionPlans,
  db.courseAssessments,
  db.courses,
  db.lessons,
  db.cards,
  db.lessonCards,
  db.lessonCardExposures,
  db.lessonCompletions,
  db.reviewHistory,
];

async function resolveCurrentRevisionInput(
  assessmentId: string,
  projection: RevisionProjection,
  now: number,
) {
  const assessment = await db.courseAssessments.get(assessmentId);
  if (!assessment) throw new Error('The assessment could not be found.');
  if (assessment.examDate === undefined) {
    throw new Error('Steady retention does not have an assessment deadline.');
  }
  const datedAssessment = assessment as CourseAssessment & { examDate: number };
  const [courseRecord, assessments, lessons, cards, links, exposures, completions] =
    await Promise.all([
      db.courses.get(assessment.courseId),
      db.courseAssessments.where('courseId').equals(assessment.courseId).toArray(),
      db.lessons.where('courseId').equals(assessment.courseId).sortBy('orderIndex'),
      db.cards.where('courseId').equals(assessment.courseId).toArray(),
      db.lessonCards.toArray(),
      db.lessonCardExposures.toArray(),
      db.lessonCompletions.toArray(),
    ]);
  if (!courseRecord) throw new Error('The course could not be found.');
  const hydratedCards = await hydrateCardsWithHistory(cards);
  const course = hydrateCourse(
    courseRecord,
    finalAssessmentForCourse(assessment.courseId, assessments),
  );
  const reachedLessonIds = currentAssessmentPracticeContext({
    course,
    assessments,
    lessons,
    cards: hydratedCards,
    links,
    exposures,
    now,
  }).reachedLessonIds;
  return {
    assessment: datedAssessment,
    resolved: resolveRevisionPlanInput({
      assessment: datedAssessment,
      lessons,
      cards: hydratedCards,
      links,
      exposures,
      completions,
      reachedLessonIds,
      projection,
      now,
    }),
  };
}

async function refreshPlanInput(
  plan: RevisionPlan,
  projection: RevisionProjection,
  now: number,
): Promise<RevisionPlan> {
  const { assessment, resolved } = await resolveCurrentRevisionInput(
    plan.assessmentId,
    projection,
    now,
  );
  const refreshed = applyRevisionPlanInput(plan, resolved, now);
  if (assessment.examDate <= now && refreshed.status !== 'completed') {
    return stampUpdatedAt({ ...refreshed, status: 'completed' as const }, now);
  }
  return refreshed === plan ? plan : stampUpdatedAt(refreshed, now);
}

export async function createOrResumeRevisionPlan(
  assessmentId: string,
  todayBudgetMinutes: number,
  projection: RevisionProjection,
  now: number = Date.now(),
): Promise<RevisionPlan> {
  try {
    return await db.transaction('rw', revisionPlanInputTables, async () => {
      const existing = await db.revisionPlans.where('assessmentId').equals(assessmentId).first();
      if (existing) {
        const updated = await refreshPlanInput(existing, projection, now);
        if (updated !== existing) await db.revisionPlans.put(updated);
        return updated;
      }
      const { assessment, resolved } = await resolveCurrentRevisionInput(
        assessmentId,
        projection,
        now,
      );
      if (assessment.examDate <= now) {
        throw new Error('A revision plan cannot be created after its assessment deadline.');
      }
      const id = makeId();
      const plan = stampUpdatedAt(
        {
          id,
          assessmentId,
          courseId: assessment.courseId,
          status: 'active' as const,
          revision: 1,
          input: resolved.input,
          scope: resolved.scope,
          cardStates: resolved.cardStates,
          windows: buildRevisionWindows(
            id,
            todayBudgetMinutes,
            now,
            assessment.examDate,
            assessment.timeZone,
          ),
          completedSessions: [],
          replans: [],
          createdAt: now,
        },
        now,
      );
      await db.revisionPlans.add(plan);
      return plan;
    });
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function refreshRevisionPlan(
  planId: string,
  projection: RevisionProjection,
  now: number = Date.now(),
): Promise<RevisionPlan> {
  try {
    return await db.transaction('rw', revisionPlanInputTables, async () => {
      const plan = await db.revisionPlans.get(planId);
      if (!plan) throw new Error('The revision plan could not be found.');
      const updated = await refreshPlanInput(plan, projection, now);
      if (updated !== plan) await db.revisionPlans.put(updated);
      return updated;
    });
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function setRevisionDayBudget(
  planId: string,
  day: string,
  budgetMinutes: number,
  now: number = Date.now(),
): Promise<RevisionPlan> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Revision day must use YYYY-MM-DD.');
  if (!Number.isFinite(budgetMinutes) || budgetMinutes <= 0) {
    throw new Error('The daily revision budget must be greater than zero.');
  }
  return db.transaction('rw', db.revisionPlans, async () => {
    const plan = await db.revisionPlans.get(planId);
    if (!plan) throw new Error('The revision plan could not be found.');
    if (plan.status === 'completed') throw new Error('A completed revision plan is read-only.');
    if (!revisionPlanDays(now, plan.input.deadlineAt, plan.input.timeZone).includes(day)) {
      throw new Error('The revision day must be between today and the assessment deadline.');
    }
    const existing = plan.windows.find((window) => window.day === day);
    if (existing && existing.status !== 'scheduled') {
      throw new Error('An active or completed revision window cannot be edited.');
    }
    if (existing?.budgetMinutes === budgetMinutes) return plan;
    const windows = existing
      ? plan.windows.map((window) =>
          window.id === existing.id ? { ...window, budgetMinutes } : window,
        )
      : [
          ...plan.windows,
          {
            id: `${plan.id}:${day}`,
            day,
            budgetMinutes,
            status: 'scheduled' as const,
            planRevision: plan.revision,
          },
        ];
    const updated = stampUpdatedAt({ ...plan, windows, status: 'active' as const }, now);
    await db.revisionPlans.put(updated);
    return updated;
  });
}

export async function removeRevisionDay(
  planId: string,
  day: string,
  now: number = Date.now(),
): Promise<RevisionPlan> {
  return db.transaction('rw', db.revisionPlans, async () => {
    const plan = await db.revisionPlans.get(planId);
    if (!plan) throw new Error('The revision plan could not be found.');
    if (plan.status === 'completed') throw new Error('A completed revision plan is read-only.');
    const window = plan.windows.find((candidate) => candidate.day === day);
    if (!window) return plan;
    if (window.status !== 'scheduled') {
      throw new Error('An active or completed revision window cannot be removed.');
    }
    const updated = stampUpdatedAt(
      {
        ...plan,
        windows: plan.windows.filter((candidate) => candidate.id !== window.id),
      },
      now,
    );
    updated.status = planIsComplete(updated, now) ? 'completed' : 'active';
    await db.revisionPlans.put(updated);
    return updated;
  });
}

export async function startRevisionWindow(
  planId: string,
  windowId: string,
  startedAt: number = Date.now(),
): Promise<RevisionPlan> {
  return db.transaction('rw', db.revisionPlans, async () => {
    const plan = await db.revisionPlans.get(planId);
    if (!plan) throw new Error('The revision plan could not be found.');
    if (plan.status === 'completed' || startedAt >= plan.input.deadlineAt) {
      throw new Error('A completed revision plan is read-only.');
    }
    const target = plan.windows.find((window) => window.id === windowId);
    if (!target) throw new Error('The revision window could not be found.');
    if (target.status === 'active') return plan;
    if (target.status === 'completed') {
      throw new Error('A completed revision window cannot restart.');
    }
    if (plan.windows.some((window) => window.status === 'active')) {
      throw new Error('Another revision window is already active.');
    }
    const updated = stampUpdatedAt(
      {
        ...plan,
        windows: plan.windows.map((window) =>
          window.id === windowId ? { ...window, status: 'active' as const, startedAt } : window,
        ),
      },
      startedAt,
    );
    await db.revisionPlans.put(updated);
    return updated;
  });
}

export async function completeRevisionWindow(
  planId: string,
  windowId: string,
  session: RevisionPlanSession,
  now: number = Date.now(),
): Promise<RevisionPlan> {
  return db.transaction('rw', db.revisionPlans, async () => {
    const plan = await db.revisionPlans.get(planId);
    if (!plan) throw new Error('The revision plan could not be found.');
    if (session.windowId !== windowId) throw new Error('The session belongs to another window.');
    const window = plan.windows.find((candidate) => candidate.id === windowId);
    if (!window) throw new Error('The revision window could not be found.');
    if (window.status === 'completed') {
      if (plan.completedSessions.some((existing) => existing.id === session.id)) return plan;
      throw new Error('A completed revision window cannot accept another session.');
    }
    let updated = stampUpdatedAt(
      {
        ...plan,
        windows: plan.windows.map((candidate) =>
          candidate.id === windowId
            ? { ...candidate, status: 'completed' as const, completedAt: session.completedAt }
            : candidate,
        ),
        completedSessions: appendCompletedSession(plan.completedSessions, session),
      },
      now,
    );
    updated = stampUpdatedAt(applyPendingRevisionPlanInput(updated, now), now);
    updated.status = planIsComplete(updated, now) ? 'completed' : 'active';
    await db.revisionPlans.put(updated);
    return updated;
  });
}
