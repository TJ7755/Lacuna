import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all ' +
  'duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-40 ' +
  'disabled:pointer-events-none select-none active:scale-[0.98]';

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-[hsl(28_60%_14%)] hover:brightness-105 shadow-sm shadow-accent/20',
  secondary:
    'bg-surface-raised text-ink border border-line-strong hover:border-accent/60 hover:text-accent',
  ghost: 'text-ink-soft hover:text-ink hover:bg-ink/5',
  danger:
    'bg-transparent text-negative border border-negative/40 hover:bg-negative/10',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    />
  );
});
