import { cn } from './cn';

interface SkeletonProps {
  /** Size, spacing and, where it differs from the default, shape or tone. */
  className?: string;
  as?: 'div' | 'span';
}

/**
 * A pulsing placeholder block for content that is still loading. It defaults to
 * `rounded` and `bg-ink/10`; a `rounded-*` or `bg-*` class in `className`
 * replaces the default rather than competing with it.
 */
export function Skeleton({ className = '', as: Element = 'div' }: SkeletonProps) {
  return (
    <Element
      aria-hidden="true"
      className={cn(
        className,
        'animate-pulse',
        !/(^|\s)rounded(-|\s|$)/.test(className) && 'rounded',
        !/(^|\s)bg-/.test(className) && 'bg-ink/10',
      )}
    />
  );
}
