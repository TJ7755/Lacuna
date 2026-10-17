import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { animationFinished } from '../ui/morphReveal';
import { getMotionMultiplier } from '../../state/motionSpeed';
import { STUDY_REVEALED_EVENT } from '../layout/StudyLaunchCover';
import { hasLandingArrival, releaseStudyCover } from '../layout/LandingTransition';

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
    const covered = hasLandingArrival();
    const multiplier = getMotionMultiplier();
    if (!root.current || multiplier === 0) {
      releaseStudyCover();
      return;
    }
    const element = root.current;
    const start = () => {
      element.style.opacity = '';
      const header = element.querySelector('header');
      const blocks = [...(element.querySelector('main')?.children ?? [])].slice(0, 3);
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
      animations.forEach((animation) => {
        if (animation) animationFinished(animation);
      });
      return () => animations.forEach((animation) => animation?.cancel());
    };
    let stop: (() => void) | undefined;
    const reveal = () => {
      stop = start();
    };
    if (covered) {
      element.style.opacity = '0';
      window.addEventListener(STUDY_REVEALED_EVENT, reveal, { once: true });
      releaseStudyCover();
    } else {
      reveal();
      releaseStudyCover();
    }
    return () => {
      window.removeEventListener(STUDY_REVEALED_EVENT, reveal);
      element.style.opacity = '';
      stop?.();
    };
  }, []);
  return (
    <div ref={root} className={className} data-study-entrance>
      {children}
    </div>
  );
}
