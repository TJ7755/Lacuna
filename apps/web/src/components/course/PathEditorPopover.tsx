import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m as motion, useIsPresent } from 'motion/react';
import { useAnchoredPopoverPosition } from '../../hooks/useAnchoredPopoverPosition';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { scaledSpring } from '../ui/motion';

export function PathEditorPopover({
  label,
  children,
  quiet = false,
  negative = false,
  disabled = false,
  initialFocus = false,
}: {
  label: string;
  children: ReactNode | ((close: () => void) => ReactNode);
  quiet?: boolean;
  negative?: boolean;
  disabled?: boolean;
  initialFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <>
      <button
        ref={trigger}
        data-path-editor-focus={initialFocus || undefined}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
        className={
          quiet
            ? `path-editor-quiet ${negative ? 'text-negative' : 'text-ink-soft'}`
            : 'path-editor-chip'
        }
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      <PathEditorPopoverContent id={id} label={label} open={open} trigger={trigger} close={close}>
        {typeof children === 'function' ? children(close) : children}
      </PathEditorPopoverContent>
    </>
  );
}

export function PathEditorPopoverContent({
  id,
  label,
  open,
  trigger,
  close,
  children,
  anchorKey = '',
}: {
  id: string;
  label: string;
  open: boolean;
  trigger: React.RefObject<HTMLButtonElement | null>;
  close: () => void;
  children: ReactNode;
  anchorKey?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const anchor = useMemo(
    () => ({
      get current() {
        return trigger.current;
      },
      key: anchorKey,
    }),
    [trigger, anchorKey],
  );
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  const { position, placement } = useAnchoredPopoverPosition(open, anchor, panel);
  useFocusTrap(open, { returnFocus: false }, panel);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !panel.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        close();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, trigger, close]);
  const host = trigger.current?.closest('[data-path-editor-host]');
  return (
    host &&
    createPortal(
      <AnimatePresence>
        {open && (
          <PopoverBody
            id={id}
            label={label}
            panel={panel}
            position={position}
            placement={placement}
            multiplier={multiplier}
            close={close}
          >
            {children}
          </PopoverBody>
        )}
      </AnimatePresence>,
      host,
    )
  );
}

function PopoverBody({
  id,
  label,
  panel,
  position,
  placement,
  multiplier,
  close,
  children,
}: {
  id: string;
  label: string;
  panel: React.RefObject<HTMLDivElement | null>;
  position: { left: number; top: number } | null;
  placement: 'top' | 'bottom';
  multiplier: number;
  close: () => void;
  children: ReactNode;
}) {
  const present = useIsPresent();
  return (
    <motion.div
      ref={panel}
      id={id}
      role="dialog"
      aria-label={label}
      inert={!present}
      aria-hidden={!present || undefined}
      className="path-editor-popover fixed z-10 rounded-2xl bg-surface p-2 path-editor-shadow"
      style={{
        left: position?.left ?? 16,
        top: position?.top ?? 16,
        visibility: position ? 'visible' : 'hidden',
        transformOrigin: placement === 'bottom' ? 'top left' : 'bottom left',
      }}
      initial={multiplier ? { opacity: 0, scale: 0.94 } : false}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={scaledSpring(multiplier, 520, 34)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      {children}
    </motion.div>
  );
}
