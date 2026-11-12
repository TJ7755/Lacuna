import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { m as motion, useIsPresent } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { FlowExpansionSurface } from './FlowExpansionSurface';
import { expandingActionSpring } from './motion';

/** An anchored action shares New course's measured shell and continuous Flow contour. */
export function ExpandingActionPanel({
  anchor,
  label,
  align = 'end',
  width,
  multiplier: motionMultiplier,
  trapRef,
  describedBy,
  onKeyDown,
  className,
  children,
}: {
  anchor: HTMLElement;
  label: string;
  align?: 'start' | 'end';
  width: number;
  multiplier?: number;
  trapRef?: RefObject<HTMLDivElement | null>;
  describedBy?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  className?: string;
  children: ReactNode;
}) {
  const present = useIsPresent();
  const [speed] = useMotionSpeed();
  const multiplier = motionMultiplier ?? speedMultiplier(speed);
  const body = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState(() => ({
    width: anchor.offsetWidth,
    height: anchor.offsetHeight,
  }));
  const [bounds, setBounds] = useState({
    width: Math.min(width, window.innerWidth - 32),
    height: origin.height,
    x: 0,
    y: 0,
  });

  useLayoutEffect(() => {
    const element = body.current;
    if (!element) return;
    const measure = () => {
      const rect = anchor.getBoundingClientRect();
      const panelWidth = Math.min(width, window.innerWidth - 32);
      const height = Math.min(anchor.offsetHeight + element.offsetHeight, window.innerHeight - 32);
      const left = align === 'end' ? rect.right - panelWidth : rect.left;
      setOrigin({ width: anchor.offsetWidth, height: anchor.offsetHeight });
      setBounds({
        width: panelWidth,
        height,
        x: Math.max(16, Math.min(left, window.innerWidth - panelWidth - 16)) - left,
        y: Math.max(16, Math.min(rect.top, window.innerHeight - height - 16)) - rect.top,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(anchor);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [anchor, align, width]);

  useLayoutEffect(() => {
    anchor.setAttribute('data-flow-expanded-trigger', '');
    return () => anchor.removeAttribute('data-flow-expanded-trigger');
  }, [anchor]);

  const closed = { ...origin, x: 0, y: 0 };
  return (
    <motion.div
      ref={trapRef}
      role="dialog"
      aria-label={label}
      aria-describedby={describedBy}
      inert={!present}
      aria-hidden={!present || undefined}
      onKeyDown={(event) => {
        // Tab belongs to the focus trap's window listener, as in DialogPanel.
        if (event.key !== 'Tab') onKeyDown?.(event);
      }}
      initial={multiplier > 0 ? closed : false}
      animate={bounds}
      exit={closed}
      transition={expandingActionSpring(multiplier)}
      className={`flow-expansion absolute top-0 z-0 bg-surface-raised text-ink card-surface ${align === 'end' ? 'right-0' : 'left-0'}`}
    >
      <FlowExpansionSurface triggerWidth={origin.width} triggerHeight={origin.height} />
      <div data-flow-expansion-content className="absolute inset-0 overflow-clip">
        <motion.div
          className={`absolute ${align === 'end' ? 'right-0' : 'left-0'}`}
          style={{ top: origin.height, width: bounds.width }}
          initial={multiplier > 0 ? { opacity: 0 } : false}
          animate={{ opacity: present ? 1 : 0 }}
          transition={{ duration: 0.12 * multiplier }}
        >
          <div
            className="scroll-edge-fade overflow-y-auto overscroll-contain"
            style={{ maxHeight: `calc(100dvh - ${32 + origin.height}px)` }}
          >
            <div ref={body} className={className}>
              {children}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
