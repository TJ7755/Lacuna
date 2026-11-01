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
    let cancelled = false;
    const calculation = records
      ? calculateRemainingWork(input, now, false)
      : calculateRemainingWorkOffThread(input, now);
    void calculation.then(
      (next) => {
        if (!cancelled) setEstimates(next);
      },
      (cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause : new Error(String(cause)));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [input, now, records]);
  if (error) throw error;
  if (!estimates?.length) return null;
  return (
    <div className="flex flex-col gap-2" aria-label="Estimated assessment workload">
      {estimates.map(({ assessment, estimate }) => (
        <section
          key={assessment.id}
          className="rounded-2xl bg-surface px-4 py-3 text-sm text-ink-soft"
        >
          <p className="font-semibold text-ink">{assessment.name}: estimated remaining work</p>
          <p>
            {estimate.overdue} overdue cards, {estimate.dueBeforeAssessment} other reviews due
            before the assessment and {estimate.unstarted} unstarted cards.
          </p>
          <p>
            Allow around {estimate.minutes} minutes in total, or {estimate.dailyMinutes} minutes a
            day.
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
              Your current pace may leave some work unfinished. Consider setting aside more time.
            </p>
          )}
          {estimate.recall && (
            <p>
              Mean predicted exam recall: {Math.round(estimate.recall.mean * 100)}%. Allows one
              review only when already due before the assessment, assuming a Good answer. With
              current memory, {estimate.recall.belowTarget} of {estimate.recall.cards} cards below
              the {Math.round(ASSESSMENT_TARGET_RECALL * 100)}% reference target.
            </p>
          )}
          <p className="text-ink-faint">
            An estimate, not a guarantee of recall. Counts one attempt per card; further reviews and
            lesson reading need extra time.
            {estimate.usesDefaultTiming
              ? ' Uses 30 seconds per card until review timings are available.'
              : ' Uses your recorded review times.'}
          </p>
        </section>
      ))}
    </div>
  );
}
