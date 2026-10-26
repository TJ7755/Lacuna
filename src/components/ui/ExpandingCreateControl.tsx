import { useEffect, useLayoutEffect, useState, useId, useRef, type ReactNode } from 'react';
import { m as motion } from 'motion/react';
import { FlowExpansionSurface } from './FlowExpansionSurface';
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
  prominent = false,
}: {
  align?: 'start' | 'centre' | 'end';
  className?: string;
  prominent?: boolean;
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
  const anchor = align === 'end' ? 'right-0' : 'left-0';
  const root = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [verticalOffset, setVerticalOffset] = useState(0);
  const [availableHeight, setAvailableHeight] = useState<number>();
  const [formWidth, setFormWidth] = useState<number>();
  const [retainForm, setRetainForm] = useState(open);
  const form = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [formHeight, setFormHeight] = useState<number>();
  useLayoutEffect(() => {
    const element = form.current;
    if (!element || !open) return;
    setRetainForm(true);
    const measure = (height = element.offsetHeight) => {
      const shell = surface.current;
      const borderHeight = shell ? shell.offsetHeight - shell.clientHeight : 0;
      setFormHeight(triggerHeight + height + borderHeight);
    };
    measure();
    const observer = new ResizeObserver((entries) => {
      measure(entries?.[0]?.borderBoxSize?.[0]?.blockSize ?? element.offsetHeight);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [open, triggerHeight]);
  // Keep a useful form area in short windows, allowing the header to rise with its surface.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const bounds = root.current?.getBoundingClientRect();
      if (!bounds) return;
      const width = Math.min(448, window.innerWidth - 36);
      const shell = surface.current;
      const borderWidth = shell ? shell.offsetWidth - shell.clientWidth : 0;
      setFormWidth(width - borderWidth);
      const originLeft = align === 'end' ? bounds.right - width : bounds.left;
      const left = align === 'centre' ? bounds.left + (bounds.width - width) / 2 : originLeft;
      setOffset(Math.min(Math.max(18, left), window.innerWidth - 18 - width) - originLeft);
      const top = Math.max(18, Math.min(bounds.top, window.innerHeight - 18 - triggerHeight - 240));
      setVerticalOffset(top - bounds.top);
      setAvailableHeight(Math.max(triggerHeight, window.innerHeight - top - 18));
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, align, triggerHeight]);

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
        ref={surface}
        initial={false}
        animate={{
          x: open ? offset : 0,
          y: open ? verticalOffset : 0,
          width: open ? 'min(448px, calc(100vw - 36px))' : closedWidth,
          height: open ? (formHeight ?? 'auto') : triggerHeight,
          borderRadius: open ? 24 : triggerHeight / 2,
        }}
        transition={transition}
        // Keep drafts and selection alive until the shape has actually closed.
        onAnimationComplete={() => {
          if (!open) setRetainForm(false);
        }}
        // The closed button uses an inset ring; the open form is a flat card.
        // Only the inner form scrolls: autofocus must not scroll the growing shell and its label.
        className={`absolute ${anchor} top-0 flow-expansion overflow-clip ring-1 ring-inset ${open ? 'bg-surface-raised ring-transparent card-surface' : prominent ? 'bg-accent ring-transparent' : 'bg-surface-raised ring-line-strong'}`}
      >
        <FlowExpansionSurface
          open={open}
          triggerWidth={closedWidth}
          triggerHeight={triggerHeight}
          multiplier={multiplier}
          prominent={prominent}
          align={align === 'end' ? 'end' : 'start'}
        />
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
          data-flow-feedback
          data-flow-trigger
          transition={transition}
          style={{ width: closedWidth }}
          className={`absolute ${anchor} top-0 flex min-h-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold ${prominent && !open ? 'text-accent-fg' : 'text-ink'} focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-ink`}
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
          {(open || retainForm) && (
            <motion.div
              key="form"
              ref={form}
              id={formId}
              // Measure and reveal the resting layout rather than reflowing it with the shell.
              className={`absolute ${anchor}`}
              style={{ top: triggerHeight, width: formWidth }}
              initial={{ opacity: 0 }}
              animate={{ opacity: open ? 1 : 0 }}
              transition={{ duration: 0.12 * multiplier }}
            >
              <div
                className="overflow-y-auto overscroll-contain text-left"
                style={{
                  maxHeight:
                    availableHeight === undefined ? undefined : availableHeight - triggerHeight,
                }}
              >
                {typeof children === 'function' ? children(close) : children}
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
