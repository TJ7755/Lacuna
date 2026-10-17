import { forwardRef, useLayoutEffect, useRef, type HTMLAttributes } from 'react';
import { usePresence } from 'motion/react';
import { animationFinished } from './morphReveal';

/** Retain the draft during dismissal; the reveal owner handles its entrance. */
export const MorphContent = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { multiplier: number }
>(function MorphContent({ multiplier, ...props }, ref) {
  const local = useRef<HTMLDivElement>(null);
  const [present, remove] = usePresence();
  useLayoutEffect(() => {
    if (present || !remove) return;
    if (multiplier === 0) {
      remove();
      return;
    }
    const element = local.current;
    if (!element?.animate) {
      const timer = setTimeout(remove, 80 * multiplier);
      return () => clearTimeout(timer);
    }
    const animation = element.animate(
      [{ opacity: getComputedStyle(element).opacity }, { opacity: 0 }],
      { duration: 80 * multiplier, fill: 'forwards' },
    );
    animationFinished(animation, remove);
    return () => animation.cancel();
  }, [present, multiplier, remove]);
  return (
    <div
      {...props}
      ref={(element) => {
        local.current = element;
        if (typeof ref === 'function') ref(element);
        else if (ref) ref.current = element;
      }}
    />
  );
});
