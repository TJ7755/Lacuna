import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from './cn';

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

const base =
  'min-h-11 rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink ' +
  'outline-none transition-colors focus:border-accent disabled:cursor-not-allowed disabled:opacity-60';

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, ...rest },
  ref,
) {
  return <select ref={ref} className={cn(base, className)} {...rest} />;
});
