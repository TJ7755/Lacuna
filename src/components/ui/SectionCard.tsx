import { createElement, type HTMLAttributes, type ReactNode, type Ref } from 'react';
import { cn } from './cn';

type SectionCardProps = Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'> & {
  ref?: Ref<HTMLElement>;
  /** The element to render; defaults to `section`. */
  as?: 'section' | 'div' | 'header';
  /** Use the denser `p-5` padding instead of `p-6`. */
  compact?: boolean;
  className?: string;
  children?: ReactNode;
};

/** The bordered surface card that groups a section of a page or settings screen. */
export function SectionCard({
  as = 'section',
  compact = false,
  className,
  children,
  ...props
}: SectionCardProps) {
  return createElement(
    as,
    {
      ...props,
      className: cn('rounded-2xl border border-line bg-surface', compact ? 'p-5' : 'p-6', className),
    },
    children,
  );
}
