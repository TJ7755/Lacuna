import { useId, type ReactNode, type Ref } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CourseProgressReport } from '../../course/courseProgress';
import type { Course, CourseAssessment } from '../../db/types';
import { progressHeading } from '../../fsrs/objective';
import { MAINTENANCE_HORIZON_DAYS } from '../../fsrs/horizon';
import { formatDate } from '../../utils/datetime';
import { countOf } from '../../utils/plural';
import { useStudySheet } from '../learn/StudySheetContext';
import { cn } from '../ui/cn';
import {
  BookIcon,
  CalendarIcon,
  CardsIcon,
  CheckIcon,
  ClockIcon,
  FlagIcon,
  FlameIcon,
  PlayIcon,
  RestoreIcon,
  SparklesIcon,
} from '../ui/icons';
import { MiniRing } from '../ui/MiniRing';
import { SECTION_CARD_SURFACE_CLASS } from '../ui/SectionCard';
import { Select } from '../ui/Select';
import { InfoPopover } from './InfoPopover';

const percent = (value: number) => `${Math.round(value * 100)}%`;
const CARD = `${SECTION_CARD_SURFACE_CLASS} p-5`;

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

/** Chooses the whole course or one assessment; the page keeps the choice in its URL. */
export function ProgressScopeSelect({
  report,
  assessments,
  now,
  onScopeChange,
  selectRef,
}: {
  report: CourseProgressReport;
  /** Selectable assessments, in display order. */
  assessments: CourseAssessment[];
  now: number;
  onScopeChange: (assessmentId: string | undefined) => void;
  selectRef?: Ref<HTMLSelectElement>;
}) {
  const selectId = useId();
  if (assessments.length === 0) return null;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <label htmlFor={selectId} title="Show" className="text-ink-soft">
        <CalendarIcon width={18} height={18} aria-hidden="true" />
        <span className="sr-only">Show</span>
      </label>
      <Select
        ref={selectRef}
        id={selectId}
        value={report.assessment?.id ?? ''}
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
  );
}

/** One figure behind an icon; the label is its accessible name and tooltip. */
function Stat({
  icon,
  value,
  unit,
  label,
  tone,
}: {
  icon: ReactNode;
  value: number | string;
  unit?: string;
  label: string;
  tone?: 'warning';
}) {
  const name = `${label}: ${value}${unit ? ` ${unit}` : ''}`;
  return (
    <span role="img" aria-label={name} title={name} className="flex items-center gap-2">
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-full',
          tone === 'warning' ? 'bg-warning/15 text-warning' : 'bg-ink/5 text-ink-soft',
        )}
      >
        {icon}
      </span>
      <span className="font-display text-2xl font-semibold tabular-nums">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-ink-soft">{unit}</span>}
      </span>
    </span>
  );
}

/** Reviewed, taught-not-reviewed and not-started as one segmented bar with icon counts. */
function StudyBar({ study, cardCount }: Pick<CourseProgressReport, 'study' | 'cardCount'>) {
  const parts = [
    {
      count: study.reviewed,
      label: 'Reviewed at least once',
      bar: 'bg-accent',
      badge: 'bg-accent text-accent-fg',
      icon: <CheckIcon width={12} height={12} strokeWidth={2.4} />,
    },
    {
      count: study.taughtNotReviewed,
      label: 'Taught or introduced, not yet reviewed',
      bar: 'bg-accent/40',
      badge: 'bg-ink/5 text-ink-soft',
      icon: <BookIcon width={12} height={12} />,
    },
    {
      count: study.notStarted,
      label: 'Not started',
      bar: '',
      badge: 'bg-ink/5 text-ink-soft',
      icon: <SparklesIcon width={12} height={12} />,
    },
  ];
  return (
    <div className="flex flex-col gap-2">
      {cardCount > 0 && (
        <div aria-hidden="true" className="flex h-2 overflow-hidden rounded-full bg-ink/10">
          {parts.map((part) => (
            <span
              key={part.label}
              className={part.bar}
              style={{ width: `${(part.count / cardCount) * 100}%` }}
            />
          ))}
        </div>
      )}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums text-ink-soft">
        {parts.map((part) => (
          <li key={part.label} title={part.label} className="flex items-center gap-1.5">
            <span className={cn('grid size-5 place-items-center rounded-full', part.badge)}>
              {part.icon}
            </span>
            <span className="sr-only">{part.label}:</span>
            {part.count}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The default Progress answers: predicted recall for this scope's date, what is due, how much
 * is studied and where to go next. Every figure reads one report, so they share its card pool
 * and date. Explanations sit behind the info button rather than on the face.
 */
export function ProgressOverview({
  course,
  report,
  activity,
}: {
  course: Course;
  report: CourseProgressReport;
  /** Reviews and minutes over the last 30 days, once review history has loaded. */
  activity: { reviews: number; minutes: number } | null;
}) {
  const titleId = useId();
  const navigate = useNavigate();
  const { openStudySheet } = useStudySheet();
  const { assessment, forecast, study, cardCount, excluded } = report;
  const notReviewed = study.taughtNotReviewed + study.notStarted;

  const excludedNote = [
    excluded.extension > 0 && countOf(excluded.extension, 'extension card'),
    excluded.unavailable > 0 && `${excluded.unavailable} suspended or buried`,
  ].filter(Boolean);

  let recall: { figure: number | null; detail: string; days?: number };
  switch (forecast.kind) {
    case 'assessment':
      recall = {
        figure: forecast.value,
        days: forecast.daysRemaining,
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
        figure: forecast.value,
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

  const recallName = `${progressHeading(course)}: ${
    recall.figure === null ? 'no forecast' : percent(recall.figure)
  }`;
  const revise = forecast.kind === 'assessment' && assessment && cardCount > 0;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 sm:flex-row">
      <h2 id={titleId} className="sr-only">
        {assessment?.name ?? 'Whole course'}
      </h2>

      <div className={cn(CARD, 'flex items-center gap-5')}>
        <span role="img" aria-label={recallName} title={recallName} className="relative grid">
          <MiniRing value={recall.figure ?? 0} size={132} strokeWidth={12} />
          <span className="absolute inset-0 grid place-items-center font-display text-3xl font-semibold tabular-nums">
            {recall.figure === null ? '–' : percent(recall.figure)}
          </span>
        </span>
        <div className="flex flex-col gap-3">
          {recall.days !== undefined && (
            <Stat
              icon={<CalendarIcon width={18} height={18} />}
              value={recall.days}
              unit="d"
              label={`Days until ${assessment?.name ?? 'the assessment'}`}
            />
          )}
          <Stat
            icon={<RestoreIcon width={18} height={18} />}
            value={report.dueCards}
            label="Due for review"
            tone={report.dueCards > 0 ? 'warning' : undefined}
          />
        </div>
      </div>

      <div className={cn(CARD, 'flex flex-col justify-between gap-4 sm:flex-1')}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Stat icon={<CardsIcon width={18} height={18} />} value={cardCount} label="Cards" />
            {activity && (
              <>
                <Stat
                  icon={<FlameIcon width={18} height={18} />}
                  value={activity.reviews}
                  label="Reviews, 30 days"
                />
                <Stat
                  icon={<ClockIcon width={18} height={18} />}
                  value={activity.minutes}
                  unit="min"
                  label="Study time, 30 days"
                />
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!course.archived && revise && (
              <button
                type="button"
                aria-label={`Revise for ${assessment.name}`}
                title={`Revise for ${assessment.name}`}
                onClick={() =>
                  void navigate(
                    `/course/${course.id}/study?assessmentId=${encodeURIComponent(assessment.id)}`,
                  )
                }
                className="grid size-12 place-items-center rounded-full bg-ink/5 text-ink hover:bg-ink/10"
              >
                <FlagIcon width={20} height={20} />
              </button>
            )}
            {!course.archived && (
              <button
                type="button"
                aria-label="Study"
                title="Study"
                onClick={(event) => openStudySheet(course.id, { anchor: event.currentTarget })}
                className="relative grid size-12 place-items-center rounded-full bg-accent text-accent-fg shadow-lg"
              >
                <PlayIcon width={20} height={20} />
                {report.dueCards > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-2 -top-2 rounded-full bg-warning px-2 text-xs font-semibold leading-6 text-white tabular-nums"
                  >
                    {report.dueCards}
                  </span>
                )}
              </button>
            )}
            <InfoPopover label="About recall">
              <p className="text-sm text-ink">{recall.detail}</p>
              {recall.figure !== null && (
                <p>
                  Cards not yet reviewed count as forgotten. This is predicted recall, not a mark or
                  grade.
                </p>
              )}
              <p>{next}</p>
              {excludedNote.length > 0 && <p>Not counted: {excludedNote.join(', ')}.</p>}
            </InfoPopover>
          </div>
        </div>
        <StudyBar study={study} cardCount={cardCount} />
      </div>
    </section>
  );
}
