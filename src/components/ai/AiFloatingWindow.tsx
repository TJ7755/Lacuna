import { useState, type HTMLAttributes, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m as motion, useIsPresent } from 'motion/react';
import { scaledSpring } from '../ui/motion';
import { useDraggableWindow } from './useDraggableWindow';

function FloatingWindowSurface({
  windowRef,
  inert,
  ...props
}: HTMLAttributes<HTMLDivElement> & { windowRef: RefObject<HTMLDivElement | null> }) {
  const present = useIsPresent();
  return (
    <div {...props} ref={windowRef} inert={inert || !present} aria-hidden={!present || undefined} />
  );
}

/** What the panel's header needs to behave as the window's title bar. */
export interface AiWindowControls {
  minimised: boolean;
  onToggleMinimise: () => void;
  dragging: boolean;
  /** Motion multiplier, so the header's own animation follows the user's setting. */
  multiplier: number;
  handleProps: Pick<
    HTMLAttributes<HTMLElement>,
    'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'
  >;
}

/**
 * Floats the assistant above the page: fixed, bottom-right until dragged, never taking
 * layout width. It is portalled to the body so no ancestor transform can re-anchor it.
 */
export function AiFloatingWindow({
  open,
  multiplier,
  inert,
  children,
}: {
  open: boolean;
  multiplier: number;
  inert?: boolean;
  children: (controls: AiWindowControls) => ReactNode;
}) {
  const [minimised, setMinimised] = useState(false);
  const { windowRef, position, dragging, handleProps } = useDraggableWindow(open, minimised);
  const animated = multiplier > 0;

  return createPortal(
    <AnimatePresence>
      {open && (
        <FloatingWindowSurface
          windowRef={windowRef}
          inert={inert}
          className="fixed z-40 w-[420px] max-w-[calc(100vw-1rem)]"
          style={position ? { left: position.left, top: position.top } : { right: 24, bottom: 24 }}
        >
          <motion.div
            initial={animated ? { opacity: 0, scale: 0.92, y: 18 } : false}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={animated ? { opacity: 0, scale: 0.94, y: 12 } : undefined}
            transition={
              animated
                ? { ...scaledSpring(multiplier, 380, 30), opacity: { duration: 0.16 * multiplier } }
                : { duration: 0 }
            }
            style={{ transformOrigin: 'bottom right' }}
            className={minimised ? undefined : 'h-[min(640px,calc(100dvh-4rem))]'}
          >
            {children({
              minimised,
              onToggleMinimise: () => setMinimised((value) => !value),
              dragging,
              multiplier,
              handleProps,
            })}
          </motion.div>
        </FloatingWindowSurface>
      )}
    </AnimatePresence>,
    document.body,
  );
}
