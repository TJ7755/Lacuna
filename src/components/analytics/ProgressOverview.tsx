import { useId } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CourseProgressReport } from '../../course/courseProgress';
import type { Course, CourseAssessment } from '../../db/types';
import { progressHeading } from '../../fsrs/objective';
import { MAINTENANCE_HORIZON_DAYS } from '../../fsrs/horizon';
import { formatDate } from '../../utils/datetime';
import { countOf } from '../../utils/plural';
import { useStudySheet } from '../learn/StudySheetContext';
import { Button } from '../ui/Button';
import { ArrowRightIcon } from '../ui/icons';
import { SECTION_CARD_SURFACE_CLASS } from '../ui/SectionCard';
import { Select } from '../ui/Select';

const percent = (value: number) => `${Math.round(value * 100)}%`;

// The report's calendar-day count, phrased as `relativeExam` would. Importing that helper
// here moves it into a shared first-load chunk.
const daysPhrase = (days: number) =>
  days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;

function assessmentOption(assessment: CourseAssessment, now: number): string {
  if (assessment.examDate === undefined) return `${assessment.name} (no date)`;
  // Passed by the same test as the forecast, so a paper earlier today is labelled passed too.
  return `${assessment.name}, ${formatDate(assessment.examDate, assessment.timeZone)}${
    assessment.examDate < now ? ' (passed)' : ''
  }`;
}

/**
 * The default Progress answers: what this scope covers and how much is studied, what
 * recall is predicted for its date, and where to go next. Every figure reads one report,
 * so they share its card pool and date.
 */
export function ProgressOverview({
  course,
  report,
  assessments,
  onScopeChange,
  now,
}: {
  course: Course;
  report: CourseProgressReport;
  /** Selectable assessments, in display order. */
  assessments: CourseAssessment[];
  onScopeChange: (assessmentId: string | undefined) => void;
  now: number;
}) {
  const titleId = useId();
  const selectId = useId();
  const navigate = useNavigate();
  const { openStudySheet } = useStudySheet();
  const { assessment, forecast, study, cardCount, excluded } = report;
  const notReviewed = study.taughtNotReviewed + study.notStarted;

  const excludedNote = [
    excluded.extension > 0 && countOf(excluded.extension, 'extension card'),
    excluded.unavailable > 0 && `${excluded.unavailable} suspended or buried`,
  ].filter(Boolean);

  let recall: { figure: string | null; detail: string };
  switch (forecast.kind) {
    case 'assessment':
      recall = {
        figure: percent(forecast.value),
        detail: `On ${formatDate(forecast.date, report.timeZone)} (${daysPhrase(
          forecast.daysRemaining,
        )}) if you stop reviewing now. ${forecast.securedCards} of ${countOf(
          cardCount,
          'card',
        )} at 90% or above.`,
      };
      break;
    case 'applicable':
      recall = {
        figure: percent(forecast.value),
        detail:
          forecast.sharedDate !== undefined
            ? `On ${formatDate(forecast.sharedDate, report.timeZone)} if you stop reviewing now.`
            : forecast.undatedCards === cardCount
              ? `No upcoming test or paper, so cards are measured ${MAINTENANCE_HORIZON_DAYS} days ahead.`
              : `Each card is measured at its next test or paper${
                  forecast.undatedCards > 0
                    ? `; ${countOf(forecast.undatedCards, 'card')} with no upcoming date ${
                        forecast.undatedCards === 1 ? 'is' : 'are'
                      } measured ${MAINTENANCE_HORIZON_DAYS} days ahead`
                    : ''
                }.`,
      };
      break;
    case 'past':
      recall = {
        figure: null,
        detail: `This assessment was on ${formatDate(forecast.date, report.timeZone)}. Choose an upcoming one to see a forecast.`,
      };
      break;
    case 'undated':
      recall = { figure: null, detail: 'Add a date to this assessment to see a forecast.' };
      break;
    case 'empty':
      recall = { figure: null, detail: 'There are no cards to forecast yet.' };
      break;
  }

  const next =
    cardCount === 0
      ? 'No cards to review here yet.'
      : report.dueCards === 0 && notReviewed === 0
        ? course.archived
          ? 'Nothing is due.'
          : 'Nothing is due. Study can still offer exam questions or the next lesson.'
        : [
            report.dueCards > 0 && `${report.dueCards} due for review`,
            notReviewed > 0 && `${notReviewed} not yet reviewed`,
          ]
            .filter(Boolean)
            .join(', ') + '.';

  return (
    <section
      aria-labelledby={titleId}
      className={`${SECTION_CARD_SURFACE_CLASS} flex flex-col gap-5 p-5 md:p-6`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id={titleId} className="font-display text-2xl">
          {assessment?.name ?? 'Whole course'}
        </h2>
        {assessments.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor={selectId} className="text-sm text-ink-soft">
              Show
            </label>
            <Select
              id={selectId}
              value={assessment?.id ?? ''}
              onChange={(event) => onScopeChange(event.target.value || undefined)}
              className="min-w-0 sm:w-72"
            >
              <option value="">Whole course</option>
              {assessments.map((option) => (
                <option key={option.id} value={option.id}>
                  {assessmentOption(option, now)}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <div className="grid gap-5 md:grid-cols-3 md:gap-6">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm text-ink-soft">Studied</h3>
          <p className="font-display text-[34px] font-semibold leading-none tracking-tight tabular-nums">
            {study.reviewed}{' '}
            <span className="text-lg font-semibold text-ink-soft">of {cardCount}</span>
          </p>
          <p className="text-sm text-ink-soft">cards reviewed at least once</p>
          {cardCount > 0 && (
            <div aria-hidden="true" className="flex h-2 overflow-hidden rounded-full bg-ink/10">
              <span
                className="bg-positive"
                style={{ width: `${(study.reviewed / cardCount) * 100}%` }}
              />
              <span
                className="bg-positive/40"
                style={{ width: `${(study.taughtNotReviewed / cardCount) * 100}%` }}
              />
            </div>
          )}
          <ul className="text-sm text-ink-soft">
            <li>Taught or introduced, not yet reviewed: {study.taughtNotReviewed}</li>
            <li>Not started: {study.notStarted}</li>
          </ul>
          {excludedNote.length > 0 && (
            <p className="text-xs text-ink-faint">Not counted: {excludedNote.join(', ')}.</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm text-ink-soft">{progressHeading(course)}</h3>
          <p className="font-display text-[34px] font-semibold leading-none tracking-tight tabular-nums">
            {recall.figure ?? '–'}
          </p>
          <p className="text-sm text-ink-soft">{recall.detail}</p>
          {recall.figure !== null && (
            <p className="text-xs text-ink-faint">
              Cards not yet reviewed count as forgotten. This is predicted recall, not a mark or
              grade.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm text-ink-soft">Next</h3>
          <p className="text-sm text-ink">{next}</p>
          {!course.archived && (
            <div className="flex flex-wrap gap-2 pt-1">
              {forecast.kind === 'assessment' && assessment && cardCount > 0 && (
                <Button
                  variant="primary"
                  onClick={() =>
                    void navigate(
                      `/course/${course.id}/study?assessmentId=${encodeURIComponent(assessment.id)}`,
                    )
                  }
                >
                  Revise for {assessment.name}
                  <ArrowRightIcon />
                </Button>
              )}
              <Button
                variant={forecast.kind === 'assessment' && cardCount > 0 ? 'secondary' : 'primary'}
                onClick={(event) => openStudySheet(course.id, { anchor: event.currentTarget })}
              >
                Study
                {!(forecast.kind === 'assessment' && cardCount > 0) && <ArrowRightIcon />}
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
