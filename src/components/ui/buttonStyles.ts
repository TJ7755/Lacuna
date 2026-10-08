// The Button's classes, kept free of motion so eagerly loaded screens can share them.

import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors ' +
  'duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-40 ' +
  'disabled:pointer-events-none select-none';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-105',
  secondary: 'bg-surface-raised text-ink border border-line-strong hover:border-ink/40',
  ghost: 'text-ink-soft hover:text-ink hover:bg-ink/5',
  danger:
    'bg-transparent text-negative border border-negative/40 hover:bg-negative/10 hover:shadow-sm hover:shadow-negative/10',
  /** A pressed or open state of a secondary control. */
  inverse: 'bg-ink text-paper border border-ink',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-11 min-w-11 px-3 text-sm',
  md: 'min-h-11 min-w-11 px-4 text-sm',
  // A page's main action: the height of a full-size Menu trigger beside it.
  lg: 'min-h-12 min-w-12 px-6 text-base',
};

/**
 * The Button's look as a class string, for a link or other element that must read as a
 * button. Use the component itself wherever a <button> will do.
 */
export function buttonClassName(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
): string {
  return cn(base, variants[variant], sizes[size]);
}
