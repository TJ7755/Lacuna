// The connecting segment drawn between two adjacent path nodes.
//
// Purely CSS-based so it adds no layout cost. The `completed` flag tints the
// segment with the accent for the portion of the path the student has cleared;
// upcoming segments stay neutral.
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
  return (
    <div
      aria-hidden="true"
      className={cn(
        'rounded-full transition-colors duration-150',
        orientation === 'vertical' ? 'h-8 w-1' : 'h-1 w-8',
        completed ? 'bg-accent/60' : 'bg-line',
        className,
      )}
    />
  );
}
