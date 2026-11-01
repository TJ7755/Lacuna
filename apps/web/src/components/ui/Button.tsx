import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { cn } from './cn';
import { buttonClassName, type ButtonSize, type ButtonVariant } from './buttonStyles';

export { buttonClassName } from './buttonStyles';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  hoverScale?: boolean;
  pressScale?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    hoverScale = true,
    pressScale = true,
    className,
    style,
    ...rest
  },
  ref,
) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);

  return (
    <button
      ref={ref}
      data-press={hoverScale || pressScale ? undefined : 'none'}
      data-flow-feedback={
        hoverScale && pressScale ? 'all' : hoverScale ? 'hover' : pressScale ? 'press' : undefined
      }
      style={{ ...style, transitionDuration: `${150 * multiplier}ms` }}
      className={cn(buttonClassName(variant, size), className)}
      {...rest}
    />
  );
});
