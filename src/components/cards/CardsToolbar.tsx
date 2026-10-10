// Search pill, filter chips and the shown count for the course Cards page. The filters
// are the structured ones the app already supports (see CardFilter in src/db/search.ts);
// chips combine with AND, as everywhere else those filters are used. Chips spring
// when pressed, scaled by the motion multiplier.

import type { Ref } from 'react';
import { m as motion } from 'motion/react';
import { SearchIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { scaledSpring } from '../ui/motion';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import type { CardFilter } from '../../db/search';

export const CARD_FILTER_CHIPS: readonly { value: CardFilter; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'due', label: 'Due' },
  { value: 'leech', label: 'Leech' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'suspended', label: 'Suspended' },
];

export function CardsToolbar({
  search,
  searchRef,
  onSearch,
  filters,
  onToggleFilter,
  counts,
  shown,
}: {
  search: string;
  searchRef?: Ref<HTMLInputElement>;
  onSearch: (value: string) => void;
  filters: ReadonlySet<CardFilter>;
  onToggleFilter: (filter: CardFilter) => void;
  /** How many of the course's cards each chip would show on its own. */
  counts: Record<CardFilter, number>;
  shown: number;
}) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="relative min-w-0 flex-1 basis-64 md:max-w-sm">
        <SearchIcon
          width={18}
          height={18}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint"
        />
        <input
          ref={searchRef}
          type="search"
          aria-label="Search all cards"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search this course"
          className="h-12 w-full rounded-full bg-surface pl-11 pr-4 text-ink shadow-card outline-none placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-accent/60"
        />
      </label>
      <div role="group" aria-label="Filter cards" className="flex flex-wrap gap-1.5">
        {CARD_FILTER_CHIPS.map((chip) => {
          const active = filters.has(chip.value);
          return (
            <motion.button
              key={chip.value}
              type="button"
              aria-pressed={active}
              onClick={() => onToggleFilter(chip.value)}
              data-press=""
              whileTap={multiplier > 0 ? { scale: 0.94 } : undefined}
              transition={scaledSpring(multiplier, 520, 24)}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                active ? 'bg-ink text-paper' : 'bg-ink/[0.06] text-ink-soft hover:text-ink',
              )}
            >
              {chip.label}
              <span className="font-normal tabular-nums opacity-70">{counts[chip.value]}</span>
            </motion.button>
          );
        })}
      </div>
      <span aria-live="polite" className="ml-auto text-sm font-semibold text-ink-soft tabular-nums">
        {shown} {shown === 1 ? 'card' : 'cards'}
      </span>
    </div>
  );
}
