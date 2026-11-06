import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { ASSESSMENT_TARGET_RECALL } from '../../fsrs/assessmentTiming';
import {
  calculateRemainingWork,
  type RemainingWorkRecords,
  type RemainingWorkResults,
} from '../../course/remainingWorkData';
import { calculateRemainingWorkOffThread } from '../../course/remainingWorkWorker';
import { AppLink } from '../ui/AppLink';
import { ArrowRightIcon, ChevronDownIcon, ClockIcon } from '../ui/icons';

async function readRemainingWorkRecords(courseId: string): Promise<RemainingWorkRecords> {
  const [course, assessments, lessons, rawCards, links, concepts] = await Promise.all([
    db.courses.get(courseId),
    db.courseAssessments.where('courseId').equals(courseId).toArray(),
    db.lessons.where('courseId').equals(courseId).toArray(),
    db.cards.where('courseId').equals(courseId).toArray(),
    db.lessonCards.toArray(),
    db.concepts.where('courseId').equals(courseId).toArray(),
  ]);
  return {
    course: course ?? null,
    assessments,
    lessons,
    cards: rawCards,
    links,
    concepts,
  };
}

export function RemainingWork({
  courseId,
  records,
}: {
  courseId: string;
  records?: RemainingWorkRecords;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  const input = useLiveQuery(async () => {
    const [source, plans] = await Promise.all([
      records ?? readRemainingWorkRecords(courseId),
      db.revisionPlans.where('courseId').equals(courseId).toArray(),
    ]);
    // Observe the course range without registering every historical event as a dependency.
    if (!records) await db.reviewHistory.where('courseId').equals(courseId).count();
    return { source, plans };
  }, [courseId, records]);
  const [estimates, setEstimates] = useState<RemainingWorkResults>();
  const [error, setError] = useState<Error>();
  useEffect(() => {
    if (!input) return;
    const controller = new AbortController();
    const { signal } = controller;
    void Promise.resolve()
      .then(() =>
        signal.aborted ? undefined : calculateRemainingWorkOffThread(input, now, signal),
      )
      // A cached course can open offline before its optional worker chunk was
      // fetched. Keep its estimates available through the same calculation.
      .catch(() => (signal.aborted ? undefined : calculateRemainingWork(input, now, true)))
      .then(
        (next) => {
          if (!signal.aborted) setEstimates(next);
        },
        (cause: unknown) => {
          if (!signal.aborted) setError(cause instanceof Error ? cause : new Error(String(cause)));
        },
      );
    return () => {
      controller.abort();
    };
  }, [input, now]);
  if (error) throw error;
  if (!estimates?.length) return null;
  return (
    <div className="flex flex-col gap-2" aria-label="Estimated assessment workload">
      {estimates.map(({ assessment, estimate }) => (
        <section
          key={assessment.id}
          className="rounded-2xl bg-surface px-4 py-3 text-sm text-ink-soft"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ClockIcon width={20} height={20} aria-hidden="true" />
              <div>
                <p className="font-semibold text-ink">{assessment.name}</p>
                <p>
                  ~{estimate.minutes} min remaining · ~{estimate.dailyMinutes} min/day
                </p>
              </div>
            </div>
            <AppLink
              to={`/course/${courseId}/study?assessmentId=${encodeURIComponent(assessment.id)}`}
              aria-label={`Study for ${assessment.name}`}
              className="flex items-center gap-2 rounded-full bg-ink/5 px-4 py-2 font-semibold text-ink hover:bg-ink/10"
            >
              Study <ArrowRightIcon width={16} height={16} />
            </AppLink>
          </div>
          <details className="group mt-2">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-full py-1 text-xs hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
              Details <ChevronDownIcon width={14} height={14} className="group-open:rotate-180" />
            </summary>
            <div className="mt-2 space-y-2">
              <p>
                {estimate.overdue} overdue cards, {estimate.dueBeforeAssessment} other reviews due
                before the assessment and {estimate.unstarted} unstarted cards.
              </p>
              {estimate.coverage !== null && (
                <p>
                  Estimated workload coverage: {Math.round(estimate.coverage * 100)}% at your{' '}
                  {estimate.budgetSource === 'plan'
                    ? 'remaining revision-plan budget'
                    : 'observed average over the last 14 days'}
                  .
                </p>
              )}
              {estimate.coverage !== null && estimate.coverage < 1 && (
                <p>
                  Your current pace may leave some work unfinished. Consider setting aside more
                  time.
                </p>
              )}
              {estimate.recall && (
                <p>
                  Mean predicted exam recall: {Math.round(estimate.recall.mean * 100)}%. Allows one
                  review only when already due before the assessment, assuming a Good answer. With
                  current memory, {estimate.recall.belowTarget} of {estimate.recall.cards} cards
                  below the {Math.round(ASSESSMENT_TARGET_RECALL * 100)}% reference target.
                </p>
              )}
              <p className="text-ink-faint">
                An estimate, not a guarantee of recall. Counts one attempt per card; further reviews
                and lesson reading need extra time.
                {estimate.usesDefaultTiming
                  ? ' Uses 30 seconds per card until review timings are available.'
                  : ' Uses your recorded review times.'}
              </p>
            </div>
          </details>
        </section>
      ))}
    </div>
  );
}
