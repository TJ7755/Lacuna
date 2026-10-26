import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import { animate } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { liquidSpring } from './motion';

export const PageArrivalReady = createContext(true);

/** Reveal reading surfaces in visual order, once their dependencies are ready. */
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
    // Existing Motion/CSS entrances retain ownership of their opacity.
    .filter(
      (element) =>
        element.style.opacity === '' && getComputedStyle(element).animationName === 'none',
    )
    .map((element) => ({
      element,
      top: element.getBoundingClientRect().top,
      opacity: Number(getComputedStyle(element).opacity),
      willChange: element.style.willChange,
    }))
    .sort((a, b) => a.top - b.top);
  const rows = [...new Set(surfaces.map(({ top }) => Math.round(top)))];
  const restore = ({ element, willChange }: (typeof surfaces)[number]) => {
    element.style.removeProperty('opacity');
    if (willChange) element.style.willChange = willChange;
    else element.style.removeProperty('will-change');
  };
  const controls = surfaces.map((surface) => {
    const { element, top, opacity: target, willChange } = surface;
    element.style.willChange =
      willChange && willChange !== 'auto' ? `${willChange}, opacity` : 'opacity';
    element.style.opacity = '0';
    return animate(0, target, {
      ...liquidSpring(multiplier),
      visualDuration: 0.18 * multiplier,
      delay: Math.min(rows.indexOf(Math.round(top)) * 0.025, 0.075) * multiplier,
      onUpdate: (opacity) => {
        element.style.opacity = String(opacity);
      },
      onComplete: () => restore(surface),
    });
  });
  return () => {
    controls.forEach((control) => control.stop());
    surfaces.forEach(restore);
  };
}
