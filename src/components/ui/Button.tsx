import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { cn } from './cn';
import { scaledSpring } from './motion';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse';
type Size = 'sm' | 'md' | 'lg';

// Framer's motion.button defines its own gesture/animation handlers, so drop the DOM
// versions that would otherwise clash with the typed props.
interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onAnimationStart' | 'onAnimationEnd' | 'onDrag' | 'onDragStart' | 'onDragEnd'
> {
  variant?: Variant;
  size?: Size;
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors ' +
  'duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-40 ' +
  'disabled:pointer-events-none select-none';

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-fg hover:brightness-105',
  secondary:
    'bg-surface-raised text-ink border border-line-strong hover:border-ink/40',
  ghost: 'text-ink-soft hover:text-ink hover:bg-ink/5',
  danger:
    'bg-transparent text-negative border border-negative/40 hover:bg-negative/10 hover:shadow-sm hover:shadow-negative/10',
  /** A pressed or open state of a secondary control. */
  inverse: 'bg-ink text-paper border border-ink',
};

const sizes: Record<Size, string> = {
  sm: 'min-h-11 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-11 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className, style, ...rest },
  ref,
) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);

  return (
    <motion.button
      ref={ref}
      data-press=""
      whileTap={multiplier > 0 ? { scale: 0.96 } : undefined}
      whileHover={multiplier > 0 ? { scale: 1.02 } : undefined}
      transition={scaledSpring(multiplier, 600, 28)}
      style={{ ...style, transitionDuration: `${150 * multiplier}ms` }}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    />
  );
});
