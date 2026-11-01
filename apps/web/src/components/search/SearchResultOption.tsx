import { m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { motionTransition, scaledSpring } from '../ui/motion';
import { SearchResultContent } from './SearchResultContent';
import type { SearchHit } from './searchPresentation';

/** Shared selection and pointer feedback for full-page and quick-search results. */
export function SearchResultOption({
  hit,
  query,
  id,
  selected,
  index,
  onSelect,
  onOpen,
}: {
  hit: SearchHit;
  query: string;
  id: string;
  selected: boolean;
  index: number;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  const delay = Math.min(index * 0.018, 0.09) * multiplier;
  return (
    <motion.button
      initial={multiplier > 0 ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        y: { ...scaledSpring(multiplier, 420, 36), delay },
        opacity: { ...motionTransition('local', multiplier), delay },
      }}
      type="button"
      role="option"
      id={id}
      aria-selected={selected}
      onMouseEnter={onSelect}
      onFocus={onSelect}
      onClick={onOpen}
      className={
        'flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition-colors duration-150 active:bg-accent-soft ' +
        (selected ? 'bg-accent-soft' : 'hover:bg-ink/5')
      }
    >
      <SearchResultContent hit={hit} query={query} compact />
    </motion.button>
  );
}
