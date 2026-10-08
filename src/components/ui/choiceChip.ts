import { cn } from './cn';

/** Chip for choices that are too many or too wide for one segmented pill. */
export function choiceChipClass(active: boolean): string {
  return cn(
    'inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-[background-color,color,transform] duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
    active ? 'bg-ink text-paper' : 'bg-ink/[0.06] text-ink-soft hover:text-ink',
  );
}
