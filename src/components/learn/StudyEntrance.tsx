import { useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { releaseStudyCover } from '../layout/LandingTransition';
import { PageArrivalReady, revealPageParts } from '../ui/PageArrival';

/** Keep the launch cover until the reading surface is both ready and visible. */
export function StudyEntrance({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const arrived = useRef(false);
  const ready = useContext(PageArrivalReady);
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  useLayoutEffect(() => {
    if (!ready) {
      arrived.current = false;
      return;
    }
    const element = root.current;
    if (!element || arrived.current) return;
    let stop: (() => void) | undefined;
    const reveal = () => {
      if (!element.querySelector('main')) return false;
      arrived.current = true;
      stop = revealPageParts(element, multiplier);
      releaseStudyCover();
      return true;
    };
    const observer = new MutationObserver(() => {
      if (reveal()) observer.disconnect();
    });
    if (!reveal()) observer.observe(element, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      stop?.();
    };
  }, [ready, multiplier]);
  return (
    <div ref={root} className={className} data-study-entrance data-page-arrival="">
      {children}
    </div>
  );
}
