import { MorphContent } from './MorphContent';
import { useEffect, useLayoutEffect, useState, useId, useRef, type ReactNode } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { PlusIcon } from './icons';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { expandingActionSpring } from './motion';
import { useInlineMorph } from './useMorphReveal';

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

  const morph = useInlineMorph(open, closedWidth, multiplier, align, offset);

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
      className={`relative ${open ? 'z-[7]' : 'z-[5]'} h-11 shrink-0 ${className}`}
      style={{ width: closedWidth }}
    >
      <div
        ref={morph.depth}
        aria-hidden="true"
        className={`pointer-events-none absolute ${anchor} top-0 rounded-3xl`}
        style={{
          width: Math.min(448, window.innerWidth - 36),
          height: morph.height,
          transform: `translateX(${offset}px)`,
          opacity: 0,
          boxShadow: '0 18px 48px -12px rgb(0 0 0 / 0.28)',
        }}
      />
      <div
        ref={morph.surface}
        data-morph-surface=""
        style={{
          width: Math.min(448, window.innerWidth - 36),
          height: morph.height,
          transform: `translateX(${offset}px)`,
        }}
        // The ring follows the revealed edge rather than the invisible final bounds.
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
          data-press=""
          whileTap={multiplier > 0 ? { scale: 0.97 } : undefined}
          transition={transition}
          // Share the reveal's origin so viewport clamping cannot move the header independently.
          style={{ width: closedWidth, left: morph.origin.left }}
          className={`absolute top-0 ${open ? '' : 'rounded-full ring-1 ring-inset ring-line-strong'} flex min-h-11 items-center justify-center gap-2 px-3 text-sm font-semibold text-ink focus-visible:outline-offset-[-3px]`}
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
              <MorphContent
                multiplier={multiplier}
                key="form"
                ref={morph.content}
                id={formId}
                className="pt-11"
              >
                {typeof children === 'function' ? children(close) : children}
              </MorphContent>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
