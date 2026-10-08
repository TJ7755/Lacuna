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
    { value: `${recallPct}%`, label: 'Exam-day recall', tone: STATUS_TEXT[status] },
    { value: cards, label: cards === 1 ? 'Card' : 'Cards', tone: 'text-ink' },
    { value: lessons, label: lessons === 1 ? 'Lesson' : 'Lessons', tone: 'text-ink' },
  ];
  // One plain layer: each figure at its natural width, so no label is cut or wrapped.
  return (
    <section
      aria-label="Course summary"
      className={cn(className, 'flex gap-8 px-5 py-5 md:gap-12 md:px-7')}
    >
      {figures.map((figure) => (
        <div key={figure.label} className="flex flex-none flex-col gap-1">
          <span
            className={cn(
              'font-display text-[26px] font-semibold leading-none tabular-nums',
              figure.tone,
            )}
          >
            {figure.value}
          </span>
          <span className="whitespace-nowrap text-sm text-ink-soft">{figure.label}</span>
        </div>
      ))}
    </section>
  );
}
