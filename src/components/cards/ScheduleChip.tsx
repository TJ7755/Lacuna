import { cn } from '../ui/cn';
import type { CardScheduleTone } from './lessonCardRow';

const SCHEDULE_CHIP_CLASS: Record<CardScheduleTone, string> = {
  new: 'bg-accent-soft text-accent-ink',
  due: 'bg-warning/15 text-ink',
  scheduled: 'bg-positive/10 text-ink-soft',
  paused: 'bg-ink/5 text-ink-faint',
};

/** When a card next comes up, as a small pill shared by every card list. */
export function ScheduleChip({ schedule }: { schedule: { label: string; tone: CardScheduleTone } }) {
  return (
    <span
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
        SCHEDULE_CHIP_CLASS[schedule.tone],
      )}
    >
      {schedule.label}
    </span>
  );
}
