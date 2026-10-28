import type { CSSProperties } from 'react';
import type { StudyProgress } from '../../course/studyProgress';
import { CountUp } from '../ui/Celebration';
import { formatShortDate } from '../../utils/datetime';

const GAUGE_VIEW = 148;
const GAUGE_STROKE = 11;
const VISIBLE_TOPICS = 5;

/** The current course evidence, refreshed at the activity boundary rather than while answering. */
export function StudyProgressPanel({
  progress,
  nextConceptId,
  motion,
}: {
  progress: StudyProgress;
  /** The topic the next step practises, drawn in the accent colour. */
  nextConceptId?: string;
  motion: number;
}) {
  const { exam, fsrs } = progress;
  const recall = exam ? exam.value : fsrs.recallNow;
  const topics = progress.priorities.slice(0, VISIBLE_TOPICS);
  const most = Math.max(1, ...topics.map((topic) => topic.dueCards));

  return (
    <section aria-label="Progress and priorities" className="study-progress-panel">
      <div className="flex items-center gap-6 sm:gap-7">
        {recall !== null && (
          <RecallGauge
            value={recall}
            label={exam ? `${exam.label} on exam day` : 'Recall now'}
            caption={exam ? 'on exam day' : 'recall now'}
            motion={motion}
          />
        )}
        <div className="min-w-0">
          {exam && (
            <>
              <h3 className="text-lg font-semibold leading-snug">{exam.name}</h3>
              <p className="text-base text-ink-soft">{formatShortDate(exam.date, exam.timeZone)}</p>
            </>
          )}
          <p className={`study-progress-figure ${exam ? 'mt-4' : ''}`}>
            {exam ? (exam.daysRemaining === 0 ? 'Today' : exam.daysRemaining) : fsrs.dueCards}
          </p>
          {(!exam || exam.daysRemaining > 0) && (
            <p className="mt-1 text-base text-ink-soft">
              {exam
                ? exam.daysRemaining === 1
                  ? 'day to go'
                  : 'days to go'
                : fsrs.dueCards === 1
                  ? 'card due'
                  : 'cards due'}
            </p>
          )}
        </div>
      </div>

      {topics.length > 0 && (
        <ol className="mt-8 space-y-5 border-t border-line pt-6">
          {topics.map((topic, index) => {
            const next = topic.conceptId === nextConceptId;
            return (
              <li
                key={topic.conceptId}
                className="study-progress-topic"
                style={{ '--topic-index': index } as CSSProperties}
              >
                <div className="flex items-baseline justify-between gap-4 text-base">
                  <span className={`truncate ${next ? 'font-semibold' : 'text-ink-soft'}`}>
                    {topic.name}
                  </span>
                  {topic.dueCards > 0 && (
                    <span className="shrink-0 tabular-nums text-ink-soft">
                      {topic.dueCards} due
                    </span>
                  )}
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
                  <div
                    className={`study-progress-bar h-full rounded-full ${next ? 'bg-accent' : 'bg-ink-faint'}`}
                    style={{ width: `${(topic.dueCards / most) * 100}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function RecallGauge({
  value,
  label,
  caption,
  motion,
}: {
  value: number;
  label: string;
  caption: string;
  motion: number;
}) {
  const radius = (GAUGE_VIEW - GAUGE_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  const offset = circumference * (1 - percent / 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="study-progress-gauge"
    >
      <svg viewBox={`0 0 ${GAUGE_VIEW} ${GAUGE_VIEW}`} aria-hidden="true">
        <circle
          cx={GAUGE_VIEW / 2}
          cy={GAUGE_VIEW / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--line))"
          strokeWidth={GAUGE_STROKE}
        />
        <circle
          className="study-progress-ring"
          cx={GAUGE_VIEW / 2}
          cy={GAUGE_VIEW / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--accent))"
          strokeWidth={GAUGE_STROKE}
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={
            {
              '--ring-empty': circumference,
              '--ring-filled': offset,
              strokeDashoffset: offset,
            } as CSSProperties
          }
        />
      </svg>
      <div className="relative text-center" aria-hidden="true">
        <p className="font-display text-[28px] font-semibold leading-none tabular-nums tracking-[-0.03em] sm:text-[34px]">
          <CountUp value={percent} multiplier={motion} duration={1.1} delay={0.56} suffix="%" />
        </p>
        <p className="mt-1.5 text-sm text-ink-soft">{caption}</p>
      </div>
    </div>
  );
}
