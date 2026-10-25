import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import { animate } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { liquidSpring } from './motion';

export const PageArrivalReady = createContext(true);

/** Reveal reading surfaces in visual order, once their loading cover has released them. */
export function PageArrival({ children, className }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const ready = useContext(PageArrivalReady);
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);

  useLayoutEffect(() => {
    if (!ready || multiplier === 0 || !root.current) return;
    const parts = [...root.current.querySelectorAll<HTMLElement>('[data-page-part]')];
    const surfaces = (parts.length ? parts : [root.current])
      .map((element) => ({ element, top: element.getBoundingClientRect().top }))
      .sort((a, b) => a.top - b.top);
    const rows = [...new Set(surfaces.map(({ top }) => Math.round(top)))];
    const previous = surfaces.map(({ element }) => element.style.opacity);
    const restorePart = (element: HTMLElement, index: number) => {
      if (previous[index]) element.style.opacity = previous[index];
      else element.style.removeProperty('opacity');
    };
    const controls = surfaces.map(({ element, top }, index) => {
      element.style.opacity = '0';
      return animate(0, 1, {
        ...liquidSpring(multiplier),
        delay: Math.min(rows.indexOf(Math.round(top)) * 0.04, 0.12) * multiplier,
        onUpdate: (opacity) => {
          element.style.opacity = String(opacity);
        },
        onComplete: () => restorePart(element, index),
      });
    });
    return () => {
      controls.forEach((control) => control.stop());
      surfaces.forEach(({ element }, index) => restorePart(element, index));
    };
  }, [ready, multiplier]);

  return (
    <div ref={root} className={className} data-page-arrival="">
      {children}
    </div>
  );
}
