import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from './cn';
import { inputFrameClassName } from './Field';

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

// The same frame as a text input, at the compact text size.
const base = `min-h-11 ${inputFrameClassName} text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60`;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, ...rest },
  ref,
) {
  return <select ref={ref} className={cn(base, className)} {...rest} />;
});
