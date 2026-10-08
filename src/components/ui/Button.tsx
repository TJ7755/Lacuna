import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { cn } from './cn';
import { buttonClassName, type ButtonSize, type ButtonVariant } from './buttonStyles';
import { scaledSpring } from './motion';

export { buttonClassName } from './buttonStyles';

// Framer's motion.button defines its own gesture/animation handlers, so drop the DOM
// versions that would otherwise clash with the typed props.
interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onAnimationStart' | 'onAnimationEnd' | 'onDrag' | 'onDragStart' | 'onDragEnd'
> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

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
      className={cn(buttonClassName(variant, size), className)}
      {...rest}
    />
  );
});
