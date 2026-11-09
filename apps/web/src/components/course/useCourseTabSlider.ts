import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { animate, useMotionValue } from 'motion/react';
import { scaledSpring } from '../ui/motion';

/** Keep the same indicator under the pointer and through the route change. */
export function useCourseTabSlider(
  activeIndex: number,
  locationKey: string,
  onSelect: (index: number) => void,
  multiplier: number,
) {
  const track = useRef<HTMLElement>(null);
  const [pressed, setPressed] = useState(false);
  const x = useMotionValue(0);
  const width = useMotionValue(0);
  const gesture = useRef<{
    id: number;
    startX: number;
    startCentre: number;
    dragged: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const target = useRef<{
    tab: HTMLElement;
    centre: number;
    width: number;
    multiplier: number;
  } | null>(null);

  const settle = useCallback(
    (tab: HTMLElement, immediate = false) => {
      const targetWidth = tab.offsetWidth;
      const centre = tab.offsetLeft + targetWidth / 2;
      const previous = target.current;
      if (
        previous?.tab === tab &&
        previous.centre === centre &&
        previous.width === targetWidth &&
        previous.multiplier === multiplier
      )
        return;
      target.current = { tab, centre, width: targetWidth, multiplier };
      const spring = scaledSpring(multiplier, 320, 36);
      if (immediate || spring.type !== 'spring') {
        x.jump(centre);
        width.jump(targetWidth);
        return;
      }
      // Carry the release speed towards the target, capped so the spring cannot overshoot it.
      const remaining = centre - x.get();
      const direction = Math.sign(remaining);
      const speed = Math.max(0, direction * x.getVelocity());
      const limit = Math.abs(remaining) * Math.sqrt(spring.stiffness);
      void animate(x, centre, { ...spring, velocity: direction * Math.min(speed, limit) });
      void animate(width, targetWidth, { ...spring, velocity: 0 });
    },
    [multiplier, width, x],
  );

  useLayoutEffect(() => {
    const nav = track.current;
    if (!nav) return;
    const tabs = nav.querySelectorAll('a');
    const tab = tabs[activeIndex];
    if (!tab) return;
    if (!gesture.current) settle(tab, width.get() === 0);

    const observer = new ResizeObserver(() => {
      if (!gesture.current && target.current) settle(target.current.tab, true);
    });
    observer.observe(nav);
    tabs.forEach((link) => observer.observe(link));
    return () => observer.disconnect();
  }, [activeIndex, locationKey, settle, width]);

  function settleCurrent(nav: HTMLElement) {
    const tab = nav.querySelectorAll('a')[activeIndex];
    if (tab) settle(tab);
  }

  function endGesture(event: PointerEvent<HTMLElement>) {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    gesture.current = null;
    setPressed(false);
    return active;
  }

  function cancel(event: PointerEvent<HTMLElement>) {
    if (endGesture(event)) settleCurrent(event.currentTarget);
  }

  return {
    track,
    x,
    width,
    pressed,
    handlers: {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (gesture.current || !event.isPrimary) return;
        suppressClick.current = false;
        if (
          activeIndex < 0 ||
          event.button !== 0 ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        x.stop();
        width.stop();
        target.current = null;
        setPressed(true);
        gesture.current = {
          id: event.pointerId,
          startX: event.clientX,
          startCentre: x.get(),
          dragged: false,
        };
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const active = gesture.current;
        if (!active || active.id !== event.pointerId) return;
        const delta = event.clientX - active.startX;
        const nav = event.currentTarget;
        if (!active.dragged) {
          if (Math.abs(delta) < 5) return;
          active.dragged = true;
          nav.setPointerCapture(event.pointerId);
        }
        const inset = 3 + width.get() / 2;
        const min = nav.scrollLeft + inset;
        const max = nav.scrollLeft + nav.clientWidth - inset;
        x.set(Math.max(min, Math.min(max, active.startCentre + delta)));
      },
      onPointerUp(event: PointerEvent<HTMLElement>) {
        const active = endGesture(event);
        if (!active) return;
        const nav = event.currentTarget;
        if (!active.dragged) {
          settleCurrent(nav);
          return;
        }

        suppressClick.current = true;
        const tabs = nav.querySelectorAll('a');
        let index = 0;
        let distance = Infinity;
        tabs.forEach((tab, tabIndex) => {
          const bounds = tab.getBoundingClientRect();
          const delta = Math.abs(event.clientX - bounds.left - bounds.width / 2);
          if (delta < distance) {
            distance = delta;
            index = tabIndex;
          }
        });
        // Start at the held position even when the next route is still loading.
        settle(tabs[index]);
        tabs[index].focus({ preventScroll: true });
        onSelect(index);
      },
      onPointerLeave(event: PointerEvent<HTMLElement>) {
        if (!gesture.current?.dragged) cancel(event);
      },
      onPointerCancel: cancel,
      onLostPointerCapture(event: PointerEvent<HTMLElement>) {
        if (event.target === event.currentTarget) cancel(event);
      },
      onClickCapture(event: React.MouseEvent<HTMLElement>) {
        if (suppressClick.current && event.detail > 0) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }
      },
    },
  };
}
