import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { m as motion, useIsPresent } from 'motion/react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { CloseIcon } from './icons';
import { ModalBackdrop } from './ModalBackdrop';
import { expandingActionSpring, MOTION_DURATION, MOTION_EASING } from './motion';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';

const MARGIN = 16;

type Bounds = { left: number; top: number; width: number; height: number };

function boundsOf(element: Element): Bounds {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
}

function panelWidth(maxWidth: number) {
  return Math.min(maxWidth, window.innerWidth - MARGIN * 2);
}

/**
 * A trigger grows into its full sheet, as Study grows from its button: the surface
 * animates its real bounds from the trigger's, so nothing is scaled, and shrinks back onto
 * the trigger when closed. The content is laid out at the final width from the first frame,
 * with the face at the top, so the trigger appears to open rather than be replaced.
 * Hide the trigger while the sheet is open; render inside AnimatePresence.
 */
export function ExpandingSheet({
  anchor,
  face,
  onClose,
  closeLabel,
  closeDisabled = false,
  maxWidth = 768,
  autoFocusSelector = 'h2',
  children,
}: {
  anchor: HTMLElement;
  /** The trigger's own face, repeated at the top of the sheet; its heading names the sheet. */
  face: (headingId: string) => ReactNode;
  onClose: () => void;
  closeLabel: string;
  /** Unsaved work keeps the sheet open; the close control stays visible but disabled. */
  closeDisabled?: boolean;
  maxWidth?: number;
  /** Initial focus; falls back to the first control when nothing matches. */
  autoFocusSelector?: string;
  children: ReactNode;
}) {
  const [speed] = useMotionSpeed();
  const m = speedMultiplier(speed);
  const present = useIsPresent();
  const headingId = useId();
  const surface = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState(() => boundsOf(anchor));
  const [bounds, setBounds] = useState<Bounds>(() => {
    const width = panelWidth(maxWidth);
    return { left: (window.innerWidth - width) / 2, top: origin.top, width, height: origin.height };
  });
  useFocusTrap(present, { autoFocusSelector, returnFocus: false }, surface);
  // The cover is hidden while open, so focus returns to it explicitly as it reappears.
  useLayoutEffect(() => {
    if (!present && anchor.isConnected) anchor.focus({ preventScroll: true });
  }, [present, anchor]);

  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    const measure = () => {
      // The exit returns to wherever the cover now sits.
      setOrigin(boundsOf(anchor));
      const width = panelWidth(maxWidth);
      const height = Math.min(element.scrollHeight, window.innerHeight - MARGIN * 2);
      setBounds({
        left: (window.innerWidth - width) / 2,
        top: Math.max(MARGIN, (window.innerHeight - height) / 2),
        width,
        height,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [anchor, maxWidth]);

  const fade = { duration: MOTION_DURATION.feedback * m, ease: MOTION_EASING.standard };

  return createPortal(
    <>
      <motion.div
        className="fixed inset-0 z-40"
        inert={!present}
        initial={m > 0 ? { opacity: 0 } : false}
        animate={m > 0 ? { opacity: 1 } : undefined}
        style={m === 0 ? { opacity: 1 } : undefined}
        exit={m > 0 ? { opacity: 0 } : undefined}
        transition={fade}
      >
        <ModalBackdrop shade={40} onClick={() => !closeDisabled && onClose()} />
      </motion.div>
      <motion.div
        ref={surface}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        inert={!present}
        aria-hidden={!present || undefined}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !event.defaultPrevented) {
            event.preventDefault();
            event.stopPropagation();
            if (!closeDisabled) onClose();
          }
        }}
        initial={m > 0 ? { ...origin, borderRadius: 24 } : false}
        animate={m > 0 ? { ...bounds, borderRadius: 24 } : undefined}
        style={m === 0 ? { ...bounds, borderRadius: 24 } : undefined}
        exit={m > 0 ? { ...origin, borderRadius: 24 } : undefined}
        transition={expandingActionSpring(m)}
        className="fixed z-50 overflow-hidden bg-surface-raised text-ink card-surface card-surface-control"
      >
        <motion.button
          type="button"
          onClick={onClose}
          disabled={closeDisabled}
          aria-label={closeLabel}
          title="Close (Esc)"
          data-dialog-close
          initial={m > 0 ? { opacity: 0 } : false}
          animate={m > 0 ? { opacity: present ? 1 : 0 } : undefined}
          style={m === 0 ? { opacity: present ? 1 : 0 } : undefined}
          transition={{ duration: 0.12 * m }}
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-40"
        >
          <CloseIcon width={18} height={18} />
        </motion.button>
        <div
          ref={content}
          style={{ width: bounds.width }}
          className="max-h-[calc(100dvh-32px)] overflow-y-auto overscroll-contain"
        >
          {face(headingId)}
          <motion.div
            initial={m > 0 ? { opacity: 0 } : false}
            animate={m > 0 ? { opacity: present ? 1 : 0 } : undefined}
            style={m === 0 ? { opacity: present ? 1 : 0 } : undefined}
            transition={{ duration: (present ? 0.12 : 0.09) * m }}
          >
            {children}
          </motion.div>
        </div>
      </motion.div>
    </>,
    document.body,
  );
}
