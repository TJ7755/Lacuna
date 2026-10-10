import { m as motion } from 'motion/react';
import { CardsIcon, FlameIcon } from '../ui/icons';
import { CountUp } from '../ui/Celebration';
import type { WeekSummary } from '../../state/weekSummary';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** The figures under the forecast: the streak, this week's volume, and which days had study. */
export function WeekPanel({
  week,
  streak,
  multiplier,
}: {
  week: WeekSummary;
  streak: number;
  multiplier: number;
}) {
  const studiedSoFar = week.studied.slice(0, week.todayIndex + 1);
  const missed = studiedSoFar
    .map((done, index) => (done ? null : DAY_NAMES[index]))
    .filter((day): day is string => day !== null && day !== DAY_NAMES[week.todayIndex]);
  const studiedLabel =
    `Studied on ${studiedSoFar.filter(Boolean).length} of ${studiedSoFar.length} days this week` +
    (missed.length > 0 ? `; missed ${missed.join(', ')}` : '');

  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-4 border-t border-line pt-4 sm:grid-cols-3 sm:gap-4 sm:pt-5">
      <div className="flex items-center gap-3 text-ink-soft">
        <motion.span
          className={streak > 0 ? 'text-hue-2' : undefined}
          initial={multiplier > 0 && streak > 0 ? { scale: 0.6, rotate: -12 } : false}
          animate={
            multiplier > 0 && streak > 0
              ? { scale: [0.6, 1.18, 1], rotate: [-12, 8, 0] }
              : { scale: 1, rotate: 0 }
          }
          transition={{ duration: 0.7 * multiplier, delay: 0.35 * multiplier }}
        >
          <FlameIcon width={20} height={20} aria-hidden="true" />
        </motion.span>
        <div className="flex flex-col-reverse leading-tight">
          <dt className="text-sm text-ink-faint">{streak === 1 ? 'day in a row' : 'days in a row'}</dt>
          <dd className="font-display text-2xl font-semibold tracking-tight text-ink tabular-nums">
            <CountUp value={streak} multiplier={multiplier} />
          </dd>
        </div>
      </div>
      <div className="flex items-center gap-3 text-ink-soft">
        <CardsIcon width={20} height={20} aria-hidden="true" className="text-hue-4" />
        <div className="flex flex-col-reverse leading-tight">
          <dt className="text-sm text-ink-faint">cards this week</dt>
          <dd className="font-display text-2xl font-semibold tracking-tight text-ink tabular-nums">
            <CountUp value={week.reviewed} multiplier={multiplier} />
          </dd>
        </div>
      </div>
      <div className="col-span-2 flex flex-col-reverse justify-center gap-2 leading-tight sm:col-span-1">
        <dt className="text-sm text-ink-faint">studied this week</dt>
        <dd aria-label={studiedLabel} className="flex justify-between gap-2 sm:justify-start">
          {week.studied.map((done, index) => {
            const isToday = index === week.todayIndex;
            const future = index > week.todayIndex;
            return (
              <span key={index} aria-hidden="true" className="flex flex-col items-center gap-1.5">
                <motion.span
                  className={
                    'block h-3 w-3 rounded-full border-[1.5px] ' +
                    (done ? 'border-pop bg-pop' : future ? 'border-line' : 'border-line-strong') +
                    (isToday ? ' ring-2 ring-accent ring-offset-2 ring-offset-surface' : '')
                  }
                  initial={multiplier > 0 && done ? { scale: 0 } : false}
                  animate={{ scale: 1 }}
                  transition={{
                    type: 'spring',
                    stiffness: 600,
                    damping: 16,
                    delay: (0.5 + index * 0.06) * multiplier,
                  }}
                />
                <span className="text-[11px] leading-none text-ink-faint">{DAY_LETTERS[index]}</span>
              </span>
            );
          })}
        </dd>
      </div>
    </dl>
  );
}
