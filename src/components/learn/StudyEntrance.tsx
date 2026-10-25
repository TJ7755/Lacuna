import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { getMotionMultiplier } from '../../state/motionSpeed';
import { releaseStudyCover } from '../layout/LandingTransition';
import { motionDuration, MOTION_EASING } from '../ui/motion';

/** Reveal ready session content together, without a transform containing block. */
export function StudyEntrance({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    let animations: Animation[] = [];
    const reveal = () => {
      const main = element.querySelector('main');
      if (!main) return false;
      const multiplier = getMotionMultiplier();
      if (multiplier > 0) {
        const header = element.querySelector('header');
        animations = [header, main].flatMap((block) =>
          block
            ? [
                block.animate([{ opacity: 0 }, { opacity: 1 }], {
                  duration: motionDuration('feedback', multiplier) * 1000,
                  easing: `cubic-bezier(${MOTION_EASING.standard.join(',')})`,
                }),
              ]
            : [],
        );
      }
      animations.forEach((animation) => void animation.finished.catch(() => {}));
      releaseStudyCover();
      return true;
    };
    // Revision setup loads inside this boundary. Keep the launch cover until its
    // reading surface exists, rather than spending the entrance on a placeholder.
    const observer = new MutationObserver(() => {
      if (reveal()) observer.disconnect();
    });
    if (!reveal()) observer.observe(element, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      animations.forEach((animation) => animation.cancel());
    };
  }, []);
  return (
    <div ref={root} className={className} data-study-entrance>
      {children}
    </div>
  );
}
