import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { getMotionMultiplier } from '../../state/motionSpeed';
import { releaseStudyCover } from '../layout/LandingTransition';

/** Reveal only ready session content, and leave no transform containing block afterwards. */
export function StudyEntrance({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    releaseStudyCover();
    const multiplier = getMotionMultiplier();
    if (!root.current || multiplier === 0) return;
    const header = root.current.querySelector('header');
    const blocks = [...(root.current.querySelector('main')?.children ?? [])].slice(0, 3);
    const animations = [
      header?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140 * multiplier }),
      ...blocks.map((block, index) =>
        block.animate(
          [
            { opacity: 0, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'none' },
          ],
          {
            duration: 220 * multiplier,
            delay: (20 + index * 40) * multiplier,
            fill: 'backwards',
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          },
        ),
      ),
    ];
    // Cancellation rejects finished in browsers and the DOM test environment.
    animations.forEach((animation) => void animation?.finished.catch(() => {}));
    return () => animations.forEach((animation) => animation?.cancel());
  }, []);
  return (
    <div ref={root} className={className} data-study-entrance>
      {children}
    </div>
  );
}
