import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { hydrateCardsWithHistory } from '../../db/reviewHistoryRead';
import { estimateRemainingWork } from '../../course/remainingWork';
import { resolveAssessmentCoverage } from '../../course/assessmentCoverage';
import { courseLessonOrderPreference } from '../../course/lessonOrder';
import { ASSESSMENT_TARGET_RECALL } from '../../fsrs/assessmentTiming';
import { simContext } from '../../fsrs/forwardSim';
import { makeEngine } from '../../fsrs/fsrs';
import { isUpcomingExamDate } from '../../fsrs/examDate';

export function RemainingWork({ courseId }: { courseId: string }) {
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
  const estimates = useLiveQuery(async () => {
    const [course, assessments, lessons, rawCards, links, concepts, plans] = await Promise.all([
      db.courses.get(courseId),
      db.courseAssessments.where('courseId').equals(courseId).toArray(),
      db.lessons.where('courseId').equals(courseId).toArray(),
      db.cards.where('courseId').equals(courseId).toArray(),
      db.lessonCards.toArray(),
      db.concepts.where('courseId').equals(courseId).toArray(),
      db.revisionPlans.where('courseId').equals(courseId).toArray(),
    ]);
    if (!course) return [];
    const cards = await hydrateCardsWithHistory(rawCards);
    const context = simContext(course, makeEngine(course.fsrsParameters));
    return assessments
      .filter((assessment) => isUpcomingExamDate(assessment.examDate, now))
      .sort((a, b) => a.examDate! - b.examDate!)
      .flatMap((assessment) => {
        const coverage = resolveAssessmentCoverage(
          assessment,
          lessons,
          cards,
          links,
          courseLessonOrderPreference(course),
          { course, concepts },
        );
        if (!coverage.validation.valid) return [];
        const estimate = estimateRemainingWork(
          coverage.cards,
          now,
          assessment.examDate!,
          plans.find((plan) => plan.assessmentId === assessment.id && plan.status === 'active'),
          context,
        );
        return estimate ? [{ assessment, estimate }] : [];
      });
  }, [courseId, now]);
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
