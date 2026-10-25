import { useCallback, useEffect, useMemo, useState } from 'react';
import { revisionPlanDays } from '../../course/revisionPlan';
import { revisionProjection } from '../../course/revisionProjection';
import { db } from '../../db/schema';
import { getRevisionPlanForAssessment } from '../../db/read';
import {
  createOrResumeRevisionPlan,
  refreshRevisionPlan,
  removeRevisionDay,
  setRevisionDayBudget,
} from '../../db/revisionPlanRepository';
import type { CourseAssessment, RevisionPlan } from '../../db/types';
import { formatDateTime } from '../../utils/datetime';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { PageLoading, PageLoadingBoundary } from '../ui/PageLoadingBoundary';
import { Button } from '../ui/Button';
import { Field, Input, inputFrameClassName } from '../ui/Field';
import { Skeleton } from '../ui/Skeleton';
import { cn } from '../ui/cn';
import { SectionCard } from '../ui/SectionCard';
import { StudyEntrance } from './StudyEntrance';

const PRESETS = [10, 20, 30] as const;

function formatPlanDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

interface RevisionPlanSetupProps {
  assessmentId: string;
  onStart: (planId: string, windowId: string) => void;
  onExit: () => void;
}

export function RevisionPlanSetup(props: RevisionPlanSetupProps) {
  return (
    <PageLoadingBoundary fallback={<RevisionPlanSkeleton />} animateArrival={false}>
      <StudyEntrance>
        <RevisionPlanContent {...props} />
      </StudyEntrance>
    </PageLoadingBoundary>
  );
}

function RevisionPlanContent({ assessmentId, onStart, onExit }: RevisionPlanSetupProps) {
  const [assessment, setAssessment] = useState<CourseAssessment | null>(null);
  const [plan, setPlan] = useState<RevisionPlan | null>(null);
  const [budget, setBudget] = useState(20);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const target = await db.courseAssessments.get(assessmentId);
      if (!target) throw new Error('The assessment could not be found.');
      setAssessment(target);
      if (target.examDate === undefined) {
        setPlan(null);
        setError(null);
        return;
      }
      const existing = await getRevisionPlanForAssessment(assessmentId);
      const refreshed = existing
        ? await refreshRevisionPlan(existing.id, revisionProjection)
        : null;
      setPlan(refreshed);
      const firstBudget = refreshed?.windows.find(
        (window) => window.status !== 'completed',
      )?.budgetMinutes;
      if (firstBudget) setBudget(firstBudget);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the revision plan.');
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const today = useMemo(
    () =>
      assessment?.examDate !== undefined
        ? revisionPlanDays(Date.now(), assessment.examDate, assessment.timeZone)[0]
        : undefined,
    [assessment],
  );
  const activeWindow = plan?.windows.find((window) => window.status === 'active');
  const todayWindow = plan?.windows.find((window) => window.day === today);
  const nextWindow = plan?.windows.find(
    (window) => window.status === 'scheduled' && (!today || window.day >= today),
  );

  const start = async () => {
    if (!assessment) return;
    try {
      const current =
        plan ?? (await createOrResumeRevisionPlan(assessment.id, budget, revisionProjection));
      const window =
        current.windows.find((candidate) => candidate.status === 'active') ??
        current.windows.find(
          (candidate) => candidate.day === today && candidate.status === 'scheduled',
        );
      setPlan(current);
      if (!window) throw new Error('The next revision window is scheduled for another day.');
      onStart(current.id, window.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start revision.');
    }
  };

  const updateBudget = async (day: string, value: number) => {
    if (!plan || !Number.isFinite(value) || value <= 0) return;
    try {
      setPlan(await setRevisionDayBudget(plan.id, day, value));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the revision day.');
    }
  };

  const prepareSchedule = async () => {
    if (!assessment) return;
    try {
      const created = await createOrResumeRevisionPlan(assessment.id, budget, revisionProjection);
      setPlan(created);
      setEditingSchedule(true);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the revision plan.');
    }
  };

  if (loading) return <PageLoading />;
  if (!assessment) {
    return (
      <PlanShell title="Revision unavailable" onExit={onExit}>
        <p className="text-sm text-negative">{error ?? 'The assessment could not be found.'}</p>
      </PlanShell>
    );
  }

  if (assessment.examDate === undefined) {
    return (
      <PlanShell title={assessment.name} onExit={onExit}>
        <p className="text-sm text-ink-soft">
          Steady retention has no deadline, so it does not use a revision plan.
        </p>
      </PlanShell>
    );
  }

  const readOnly = plan?.status === 'completed';
  const expired = assessment.examDate <= Date.now();
  return (
    <PlanShell title={assessment.name} onExit={onExit}>
      <p className="text-sm text-ink-soft">
        {formatDateTime(assessment.examDate, assessment.timeZone)}
      </p>

      {plan && plan.replans.length > 0 && (
        <p className="mt-5 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-ink-soft">
          Plan updated: {plan.replans[plan.replans.length - 1].explanation}.
        </p>
      )}

      {readOnly ? (
        <SectionCard as="div" compact className="mt-8">
          <h2 className="font-display text-xl">{expired ? 'Plan archived' : 'Plan complete'}</h2>
          <p className="mt-2 text-sm text-ink-soft">
            {expired
              ? 'This assessment has passed. The revision record is read-only.'
              : 'Every scheduled revision window is complete.'}
          </p>
          <p className="mt-4 text-sm text-ink-soft">
            {plan.completedSessions.length} window{plan.completedSessions.length === 1 ? '' : 's'}{' '}
            completed
          </p>
        </SectionCard>
      ) : (
        <>
          {activeWindow ? (
            <SectionCard compact className="mt-8">
              <h2 className="font-display text-2xl">Today’s window</h2>
              <p className="mt-2 text-sm text-ink-soft">
                {activeWindow.budgetMinutes} minutes · started earlier
              </p>
            </SectionCard>
          ) : (
            <section className="mt-8">
              <h2 className="font-display text-2xl">Time available today</h2>
              <p className="mt-2 text-sm text-ink-soft">
                Builds a daily plan for the cards this assessment covers.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {PRESETS.map((minutes) => (
                  <Button
                    key={minutes}
                    variant={budget === minutes ? 'primary' : 'secondary'}
                    onClick={() => {
                      setBudget(minutes);
                      if (plan && todayWindow?.status === 'scheduled')
                        void updateBudget(todayWindow.day, minutes);
                    }}
                  >
                    {minutes} min
                  </Button>
                ))}
              </div>
              <Field label="Custom minutes" className="mt-4">
                <Input
                  type="number"
                  min={1}
                  max={480}
                  value={budget}
                  onChange={(event) => setBudget(Number(event.target.value))}
                  onBlur={() => {
                    if (plan && todayWindow?.status === 'scheduled')
                      void updateBudget(todayWindow.day, budget);
                  }}
                />
              </Field>
            </section>
          )}

          {!plan && (
            <button
              type="button"
              className="mt-6 text-sm font-medium text-accent-ink"
              onClick={() => void prepareSchedule()}
            >
              Edit future days
            </button>
          )}

          {plan &&
            plan.windows.some(
              (window) => window.day !== today && window.status === 'scheduled',
            ) && (
              <section className="mt-6">
                <button
                  type="button"
                  className="text-sm font-medium text-accent-ink"
                  onClick={() => setEditingSchedule((value) => !value)}
                >
                  {editingSchedule ? 'Hide future days' : 'Edit future days'}
                </button>
                <AnimatedDisclosure open={editingSchedule}>
                  <div className="mt-3 space-y-2">
                    {plan.windows
                      .filter((window) => window.day !== today && window.status === 'scheduled')
                      .map((window) => (
                        <div
                          key={window.id}
                          className="flex items-center gap-3 rounded-2xl bg-ink/[0.04] px-4 py-3"
                        >
                          <span className="min-w-0 flex-1 text-sm text-ink">
                            {formatPlanDay(window.day)}
                          </span>
                          <input
                            aria-label={`${window.day} minutes`}
                            type="number"
                            min={1}
                            defaultValue={window.budgetMinutes}
                            onBlur={(event) =>
                              void updateBudget(window.day, Number(event.target.value))
                            }
                            className={cn(inputFrameClassName, 'min-h-11 w-20 text-sm')}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () =>
                              setPlan(await removeRevisionDay(plan.id, window.day))
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                  </div>
                </AnimatedDisclosure>
              </section>
            )}

          <p className="mt-6 text-sm text-ink-faint">
            {revisionProjection.projectionMode === 'memory-model'
              ? 'Cards are prioritised by predicted assessment-day value when the model supports their history.'
              : 'The memory model is unavailable. Cards use ordinary practice ordering.'}
          </p>
          {error && <p className="mt-3 text-sm text-negative">{error}</p>}
          <Button variant="primary" size="lg" className="mt-6 w-full" onClick={() => void start()}>
            {activeWindow ? 'Resume revision' : plan ? 'Start today’s window' : 'Create plan'}
          </Button>
          {plan && !activeWindow && !todayWindow && nextWindow && (
            <p className="mt-3 text-center text-sm text-ink-faint">
              Next window: {formatPlanDay(nextWindow.day)}
            </p>
          )}
        </>
      )}
    </PlanShell>
  );
}

function RevisionPlanSkeleton() {
  return (
    <div
      aria-busy="true"
      className="flex min-h-screen items-center justify-center bg-paper pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      aria-label="Loading revision plan"
    >
      <div className="w-full max-w-xl space-y-4">
        <Skeleton className="h-4 w-32 bg-ink/5" />
        <Skeleton className="h-12 w-3/4 rounded-xl bg-ink/5" />
        <Skeleton className="h-5 w-full bg-ink/5" />
        <div className="mt-8 flex gap-3">
          <Skeleton as="span" className="h-11 w-32 rounded-xl bg-ink/5" />
          <Skeleton as="span" className="h-11 w-24 rounded-xl bg-ink/5" />
        </div>
      </div>
    </div>
  );
}

function PlanShell({
  title,
  onExit,
  children,
}: {
  title: string;
  onExit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-paper pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] pt-[max(2.5rem,calc(env(safe-area-inset-top)+1.5rem))] pb-[max(2.5rem,calc(env(safe-area-inset-bottom)+1.5rem))]">
      <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center">
        <h1 className="font-display text-4xl tracking-tight md:text-5xl">{title}</h1>
        {children}
        <Button variant="ghost" size="lg" className="mt-4 w-full" onClick={onExit}>
          Back
        </Button>
      </main>
    </div>
  );
}
