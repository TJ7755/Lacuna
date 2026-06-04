import { motion } from 'motion/react';
import type { StudyStats } from '../../fsrs/stats';
import { FlameIcon } from '../ui/icons';
import { cn } from '../ui/cn';

/** Round minutes to a friendly label: "—", "<1 min", "12 min". */
function minutesLabel(minutes: number): string {
  if (minutes <= 0) return '—';
  if (minutes < 1) return '<1 min';
  return `${Math.round(minutes)} min`;
}

/** Short weekday for a day, with today and tomorrow named. */
function dayLabel(dayStart: number, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tom';
  return new Date(dayStart).toLocaleDateString('en-GB', { weekday: 'short' });
}

/**
 * The dashboard's motivation strip: a study streak, today's review count, and a seven-day
 * forecast of how many *minutes* of study lie ahead (estimated from each deck's measured
 * pace). All values are read-only aggregates over data already stored.
 */
export function StudySignals({ stats }: { stats: StudyStats }) {
  const { streak, reviewedToday, forecast } = stats;
  const totalMinutes = forecast.reduce((sum, d) => sum + d.minutes, 0);
  const maxMinutes = Math.max(1, ...forecast.map((d) => d.minutes));
  const lit = streak > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-6 grid gap-4 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-[auto_auto_1fr] sm:items-stretch"
    >
      {/* Streak */}
      <div className="flex items-center gap-3 sm:pr-5">
        <motion.span
          className={cn(
            'grid h-11 w-11 shrink-0 place-items-center rounded-full',
            lit ? 'bg-accent-soft text-accent' : 'bg-ink/5 text-ink-faint',
          )}
          animate={
            lit
              ? { scale: [1, 1.08, 1], rotate: [0, -3, 3, 0] }
              : { scale: 1, rotate: 0 }
          }
          transition={lit ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } : undefined}
        >
          <FlameIcon width={22} height={22} />
        </motion.span>
        <div>
          <div className="flex items-baseline gap-1">
            <motion.span
              key={streak}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              className="font-display text-2xl tabular leading-none"
            >
              {streak}
            </motion.span>
            <span className="text-sm text-ink-soft">day{streak === 1 ? '' : 's'}</span>
          </div>
          <div className="text-xs text-ink-faint">study streak</div>
        </div>
      </div>

      {/* Reviewed today */}
      <div className="flex items-center gap-3 sm:border-l sm:border-line sm:pl-5 sm:pr-5">
        <div>
          <div className="flex items-baseline gap-1">
            <span className="font-display text-2xl tabular leading-none">{reviewedToday}</span>
          </div>
          <div className="text-xs text-ink-faint">reviewed today</div>
        </div>
      </div>

      {/* Seven-day time forecast */}
      <div className="sm:border-l sm:border-line sm:pl-5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-[0.14em] text-ink-faint">
            Next 7 days
          </span>
          <span className="text-xs text-ink-soft">
            {totalMinutes >= 1 ? `${Math.round(totalMinutes)} min to clear` : 'all clear'}
          </span>
        </div>
        <div className="flex h-16 items-end gap-1.5">
          {forecast.map((day, i) => {
            const heightPct = Math.max(day.minutes > 0 ? 8 : 2, (day.minutes / maxMinutes) * 100);
            return (
              <div key={day.dayStart} className="group flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end" title={`${minutesLabel(day.minutes)} · ${day.dueCount} due`}>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${heightPct}%` }}
                    transition={{
                      duration: 0.5,
                      delay: 0.1 + i * 0.05,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className={cn(
                      'w-full rounded-md',
                      day.minutes > 0
                        ? i === 0
                          ? 'bg-accent'
                          : 'bg-accent/45 group-hover:bg-accent/70'
                        : 'bg-ink/10',
                    )}
                  />
                </div>
                <span className={cn('text-[10px]', i === 0 ? 'text-accent' : 'text-ink-faint')}>
                  {dayLabel(day.dayStart, i)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
