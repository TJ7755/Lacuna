import { cn } from '../ui/cn';
import type { ForecastStatus } from '../dashboard/ForecastChart';

const STATUS_TEXT: Record<ForecastStatus, string> = {
  ahead: 'text-positive',
  behind: 'text-warning-fg',
  steady: 'text-ink',
};

/**
 * The course's standing figures in one row beneath its lessons: exam-day recall if study
 * stopped now, then its size. What is due today sits with Study instead.
 */
export function CourseSummaryCard({
  className,
  recallPct,
  status,
  cards,
  lessons,
}: {
  className: string;
  recallPct: number;
  status: ForecastStatus;
  cards: number;
  lessons: number;
}) {
  const figures = [
    { value: recallPct, unit: '%', label: 'Exam-day recall', tone: STATUS_TEXT[status] },
    { value: cards, label: cards === 1 ? 'Card' : 'Cards', tone: 'text-ink' },
    { value: lessons, label: lessons === 1 ? 'Lesson' : 'Lessons', tone: 'text-ink' },
  ];
  return (
    <section aria-label="Course summary" className={cn(className, 'flex px-5 py-5 md:px-7')}>
      {figures.map((figure, index) => (
        <div
          key={figure.label}
          className={cn(
            'flex min-w-0 flex-1 flex-col gap-1',
            index > 0 && 'border-l border-line pl-5 md:pl-7',
          )}
        >
          <span
            className={cn(
              'font-display text-[26px] font-semibold leading-none tabular-nums',
              figure.tone,
            )}
          >
            {figure.value}
            {figure.unit && (
              <span className="ml-0.5 text-base font-medium text-ink-soft">{figure.unit}</span>
            )}
          </span>
          <span className="truncate text-sm text-ink-soft">{figure.label}</span>
        </div>
      ))}
    </section>
  );
}
