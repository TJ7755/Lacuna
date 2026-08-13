// The connecting segment drawn between two adjacent path nodes.
//
// The `completed` flag tints the segment with the accent for the portion of
// the path the student has cleared; upcoming segments stay neutral. The
// colour change is a plain CSS transition (see `transition-colors` below) so
// a lesson completing while the page is mounted eases into its filled state
// rather than snapping.
//
// British English throughout.

import { cn } from '../ui/cn';

interface PathLineProps {
  /** When true the segment leads into already-cleared content and is accent-tinted. */
  completed?: boolean;
  /** Orientation of the segment; defaults to vertical for a scrolling path. */
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}

export function PathLine({
  completed = false,
  orientation = 'vertical',
  className,
}: PathLineProps) {
  const vertical = orientation === 'vertical';

  return (
    <div
      aria-hidden="true"
      className={cn(
        'rounded-full transition-colors duration-150',
        vertical ? 'h-8 w-1' : 'h-1 w-8',
        completed ? 'bg-accent/60' : 'bg-line',
        className,
      )}
    />
  );
}
