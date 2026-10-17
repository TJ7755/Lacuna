import { useLayoutEffect, useRef } from 'react';
import { animate } from 'motion';
import { createPortal } from 'react-dom';

type TitleFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: string;
  lineHeight: string;
  letterSpacing: string;
  fontFamily: string;
  fontWeight: string;
  color: string;
};

function measure(element: HTMLElement): TitleFrame {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const page = element.closest<HTMLElement>('[data-route-content]');
  const transform = page ? getComputedStyle(page).transform : 'none';
  const offset = transform !== 'none' ? new DOMMatrixReadOnly(transform) : null;
  return {
    left: rect.left - (offset?.m41 ?? 0), top: rect.top - (offset?.m42 ?? 0), width: rect.width, height: rect.height,
    fontSize: style.fontSize, lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing, fontFamily: style.fontFamily,
    fontWeight: style.fontWeight, color: style.color,
  };
}

type Endpoint = { frame: TitleFrame; heading: boolean; name: string; pathname: string };

/**
 * A single visual identity travels outside the fading, clipped route pages. It moves only
 * when a section change within this course swaps the Path heading and the bar's identity.
 * Entering the course (a reload, Today, another course) shows the title where it rests,
 * however late the Path heading loads.
 */
export function CourseTitleTransition({
  courseId, pathname, multiplier,
}: { courseId: string; pathname: string; multiplier: number }) {
  const overlay = useRef<HTMLSpanElement>(null);
  // Where the title last rested, and on which route. Empty until this course is entered.
  const settled = useRef<Endpoint | null>(null);
  const stop = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const layer = overlay.current;
    if (!layer) return;
    // Only a title seen on an earlier route of this course can travel. It waits until
    // this route's page has rendered its heading, then is spent.
    let source = settled.current && settled.current.pathname !== pathname ? settled.current : null;
    let target: HTMLElement | null = null;
    let hidden: HTMLElement[] = [];
    let disposed = false;
    let generation = 0;
    const restore = () => {
      hidden.forEach((element) => element.style.removeProperty('clip-path'));
      hidden = [];
    };
    const finish = () => {
      restore();
      layer.style.visibility = 'hidden';
    };
    const rest = (element: HTMLElement, heading: boolean) => {
      settled.current = { frame: measure(element), heading, name: element.textContent ?? '', pathname };
    };
    const update = () => {
      if (disposed) return;
      const navigation = document.querySelector<HTMLElement>('[data-course-nav-title]');
      const page = document.querySelector(`[data-route-content="${CSS.escape(pathname)}"]`);
      if (page?.querySelector('input[aria-label="Course name"]')) return;
      const title = page?.querySelector<HTMLElement>('[data-course-title-text]') ?? null;
      const titleRect = title?.getBoundingClientRect();
      const navRect = navigation?.getBoundingClientRect();
      const heading = !!titleRect && !!navRect && titleRect.bottom > navRect.bottom && titleRect.top < window.innerHeight;
      const next = heading ? title : navigation;
      if (!next || next.getBoundingClientRect().width === 0) return;
      if (next === target) {
        if (layer.style.visibility !== 'visible') rest(next, heading);
        return;
      }
      target = next;
      const name = next.textContent ?? '';
      // A title already in flight continues from where it is shown.
      const moving = layer.style.visibility === 'visible';
      const from = source;
      // A page's first heading shows its title has loaded, or that it has none.
      if (from && (from.heading !== heading || page?.querySelector('h1'))) source = null;
      const travels = multiplier > 0 && (moving || (!!from && from.heading !== heading && from.name === name));
      if (!travels) {
        stop.current?.();
        finish();
        rest(next, heading);
        return;
      }
      const frame = measure(next);
      settled.current = { frame, heading, name, pathname };
      const currentGeneration = ++generation;
      const presented = moving || !from ? measure(layer) : from.frame;
      stop.current?.();
      restore();
      layer.textContent = name;
      Object.assign(layer.style, presented, {
        left: `${presented.left}px`, top: `${presented.top}px`,
        width: `${presented.width}px`, height: `${presented.height}px`, visibility: 'visible',
        // Interpolated width and font metrics need not fit at every frame. Keep a
        // one-line title together, while allowing genuinely multiline headings to wrap.
        whiteSpace: presented.height <= parseFloat(presented.lineHeight) * 1.5 &&
          frame.height <= parseFloat(frame.lineHeight) * 1.5 ? 'nowrap' : 'normal',
      });
      // The outgoing Path can still be fading when the destination first renders.
      hidden = [navigation, ...document.querySelectorAll<HTMLElement>('[data-course-title-text]')]
        .filter((element): element is HTMLElement => !!element);
      // Clipping rather than opacity: the heading's own Motion entrance writes opacity on
      // its first frame, and the endpoints must stay readable to assistive technology.
      hidden.forEach((element) => { element.style.clipPath = 'inset(50%)'; });
      const animation = animate(layer, {
        left: [presented.left, frame.left], top: [presented.top, frame.top],
        width: [presented.width, frame.width], height: [presented.height, frame.height],
        fontSize: [presented.fontSize, frame.fontSize],
        lineHeight: [presented.lineHeight, frame.lineHeight],
        letterSpacing: [presented.letterSpacing, frame.letterSpacing],
        fontWeight: [presented.fontWeight, frame.fontWeight],
      }, { type: 'spring', duration: 0.45 * multiplier, bounce: 0 });
      stop.current = () => animation.stop();
      void animation.then(() => {
        if (!disposed && generation === currentGeneration && target === next) finish();
      });
    };
    const remember = () => {
      if (layer.style.visibility === 'visible') {
        stop.current?.();
        generation++;
        finish();
      }
      update();
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    window.addEventListener('scroll', remember, true);
    window.addEventListener('resize', remember);
    update();
    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener('scroll', remember, true);
      window.removeEventListener('resize', remember);
      restore();
    };
  }, [courseId, pathname, multiplier]);

  useLayoutEffect(() => () => { stop.current?.(); }, []);

  return createPortal(
    <span ref={overlay} aria-hidden="true" data-course-title-transition=""
      style={{ position: 'fixed', zIndex: 50, pointerEvents: 'none', visibility: 'hidden',
        overflow: 'visible', overflowWrap: 'break-word', display: 'block', margin: 0 }} />,
    document.body,
  );
}
