import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import { animate } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { liquidSpring } from './motion';

export const PageArrivalReady = createContext(true);

/** Reveal reading surfaces in visual order, once their loading cover has released them. */
export function PageArrival({ children, className }: { children: ReactNode; className?: string }) {
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
    if (arrived.current || !root.current) return;
    arrived.current = true;
    return revealPageParts(root.current, multiplier);
  }, [ready, multiplier]);

  return (
    <div ref={root} className={className} data-page-arrival="">
      {children}
    </div>
  );
}

/** Shared reading-order reveal for ordinary pages and the study launch cover. */
export function revealPageParts(root: HTMLElement, multiplier: number) {
  if (multiplier === 0) return;
  const parts = [...root.querySelectorAll<HTMLElement>('[data-page-part]')].filter(
    (part) => part.closest('[data-page-arrival]') === root,
  );
  let content: HTMLElement = root;
  while (
    content.children.length === 1 &&
    content.firstElementChild instanceof HTMLDivElement &&
    !content.firstElementChild.hasAttribute('data-page-arrival')
  ) {
    content = content.firstElementChild;
  }
  const defaults = [...content.children].filter(
    (part): part is HTMLElement =>
      part instanceof HTMLElement &&
      part.getBoundingClientRect().height > 0 &&
      !part.hasAttribute('data-page-arrival'),
  );
  if (
    parts.length === 0 &&
    content.children.length === 1 &&
    content.firstElementChild?.hasAttribute('data-page-arrival')
  )
    return;
  const surfaces = (parts.length ? parts : defaults.length ? defaults : [content])
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
}
