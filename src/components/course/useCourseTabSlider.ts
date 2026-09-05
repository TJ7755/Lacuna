import { useRef, useState, type PointerEvent } from 'react';
import { animate, useMotionValue } from 'motion/react';
import { scaledSpring } from '../ui/motion';

/** Preview a section while dragging; only navigate when the pointer is released. */
export function useCourseTabSlider(onSelect: (index: number) => void, multiplier: number) {
  const [pressed, setPressed] = useState(false);
  const x = useMotionValue(0);
  const settle = () => animate(x, 0, scaledSpring(multiplier, 320, 28));
  const gesture = useRef<{
    id: number;
    x: number;
    min: number;
    max: number;
    dragged: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

  function nearest(event: PointerEvent<HTMLElement>) {
    const links = Array.from(event.currentTarget.querySelectorAll('a'));
    let nearestIndex = 0;
    let distance = Infinity;
    links.forEach((link, index) => {
      const bounds = link.getBoundingClientRect();
      const delta = Math.abs(event.clientX - bounds.left - bounds.width / 2);
      if (delta < distance) {
        distance = delta;
        nearestIndex = index;
      }
    });
    return nearestIndex;
  }

  return {
    x,
    pressed,
    handlers: {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        suppressClick.current = false;
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
          return;
        const selected = event.currentTarget.querySelector('[aria-current="page"]');
        if (!selected) return;
        const bounds = selected.getBoundingClientRect();
        const track = event.currentTarget.getBoundingClientRect();
        x.stop();
        setPressed(true);
        gesture.current = {
          id: event.pointerId,
          x: event.clientX - x.get(),
          min: track.left + 3 - bounds.left,
          max: track.right - 3 - bounds.right,
          dragged: false,
        };
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const active = gesture.current;
        if (!active || active.id !== event.pointerId) return;
        if (!active.dragged && Math.abs(event.clientX - active.x) < 5) return;
        active.dragged = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        x.set(Math.max(active.min, Math.min(active.max, event.clientX - active.x)));
      },
      onPointerUp(event: PointerEvent<HTMLElement>) {
        const active = gesture.current;
        if (!active || active.id !== event.pointerId) return;
        setPressed(false);
        gesture.current = null;
        settle();
        if (active.dragged) {
          suppressClick.current = true;
          const index = nearest(event);
          event.currentTarget.querySelectorAll('a')[index]?.focus();
          onSelect(index);
        }
      },
      onPointerLeave() {
        if (gesture.current?.dragged) return;
        setPressed(false);
        gesture.current = null;
      },
      onPointerCancel() {
        setPressed(false);
        gesture.current = null;
        settle();
      },
      onLostPointerCapture(event: PointerEvent<HTMLElement>) {
        if (event.target !== event.currentTarget) return;
        setPressed(false);
        gesture.current = null;
        settle();
      },
      onClickCapture(event: React.MouseEvent<HTMLElement>) {
        if (suppressClick.current) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }
      },
    },
  };
}
