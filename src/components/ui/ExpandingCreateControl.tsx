import { useEffect, useLayoutEffect, useState, useId, useRef, type ReactNode } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { PlusIcon } from './icons';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { expandingActionSpring } from './motion';

/** Creation expands from its trigger, retaining the surrounding page. */
export function ExpandingCreateControl({
  open,
  onOpenChange,
  label,
  closedWidth = 152,
  children,
  align = 'end',
  className = '',
}: {
  align?: 'start' | 'end';
  className?: string;
  label: string;
  closedWidth?: number;
  children: ReactNode | ((close: () => void) => ReactNode);
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [triggerHeight, setTriggerHeight] = useState(44);
  useLayoutEffect(() => {
    const button = trigger.current;
    if (!button) return;
    // The surface and form clearance follow wrapped or enlarged trigger text.
    const measure = () => {
      if (button.offsetHeight > 0) setTriggerHeight(button.offsetHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(button);
    return () => observer.disconnect();
  }, []);
  const formId = useId();
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  const transition = expandingActionSpring(multiplier);
  const anchor = align === 'start' ? 'left-0' : 'right-0';
  const root = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  // Clamp the surface without moving the trigger that it expands from.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const bounds = root.current?.getBoundingClientRect();
      if (!bounds) return;
      const width = Math.min(448, window.innerWidth - 36);
      const left = align === 'start' ? bounds.left : bounds.right - width;
      setOffset(Math.min(Math.max(18, left), window.innerWidth - 18 - width) - left);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, align]);

  const previouslyOpen = useRef(open);
  useEffect(() => {
    if (!open && previouslyOpen.current) trigger.current?.focus();
    if (open && !previouslyOpen.current)
      trigger.current?.parentElement?.querySelector<HTMLElement>('input, textarea')?.focus();
    previouslyOpen.current = open;
  }, [open]);

  function close() {
    onOpenChange(false);
    trigger.current?.focus();
  }

  return (
    <div
      ref={root}
      className={`relative ${open ? 'z-[7]' : 'z-[5]'} shrink-0 ${className}`}
      style={{ width: closedWidth, height: triggerHeight }}
    >
      <motion.div
        initial={false}
        animate={{
          x: open ? offset : 0,
          width: open ? 'min(448px, calc(100vw - 36px))' : closedWidth,
          height: open ? 'auto' : triggerHeight,
          borderRadius: open ? 24 : triggerHeight / 2,
        }}
        transition={transition}
        // The closed button uses an inset ring; the open form is a flat card.
        className={`absolute ${anchor} top-0 overflow-hidden bg-surface-raised ring-1 ring-inset ${open ? 'ring-transparent card-surface' : 'ring-line-strong'}`}
      >
        <motion.button
          ref={trigger}
          type="button"
          aria-expanded={open}
          aria-controls={formId}
          onClick={() => {
            if (open) close();
            else onOpenChange(true);
          }}
          animate={{ x: open ? -offset : 0 }}
          data-press="none"
          transition={transition}
          style={{ width: closedWidth }}
          className={`absolute ${anchor} top-0 flex min-h-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-ink`}
        >
          <motion.span
            aria-hidden="true"
            animate={{ rotate: open && multiplier > 0 ? 45 : 0 }}
            transition={transition}
          >
            <PlusIcon width={16} height={16} />
          </motion.span>
          <span>{label}</span>
        </motion.button>
        <div
          inert={!open}
          aria-hidden={!open || undefined}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !event.defaultPrevented) {
              event.preventDefault();
              close();
            }
          }}
        >
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                key="form"
                id={formId}
                style={{ paddingTop: triggerHeight }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 * multiplier }}
              >
                {typeof children === 'function' ? children(close) : children}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
