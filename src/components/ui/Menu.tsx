import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { cn } from './cn';
import { ChevronDownIcon } from './icons';
import { expandingActionSpring, MOTION_EASING } from './motion';

export interface MenuItem {
  /** Visible label. Also the accessible name, so write it as the action it performs. */
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  /** A short second line under the label. */
  description?: string;
  disabled?: boolean;
}

interface MenuProps {
  /** Trigger contents. Keep it short; the accessible name comes from `label`. */
  children: ReactNode | ((open: boolean) => ReactNode);
  /** Accessible name for the trigger, e.g. "More ways to add cards". */
  label: string;
  items: MenuItem[];
  /** Which edge of the trigger the panel aligns to. */
  align?: 'start' | 'end';
  /** Show a chevron after the trigger contents that turns as the menu opens. */
  chevron?: boolean;
  /** Trigger height and weight: the compact toolbar size, or a full-size control. */
  size?: 'sm' | 'md';
  className?: string;
  /** Optional fixed trigger width for compact icon-and-label controls. */
  triggerWidth?: number;
}

/**
 * A small popover menu for actions that would otherwise crowd a toolbar.
 *
 * Deliberately minimal: one trigger, a flat list, no submenus or checkable items.
 * If a menu here ever needs those, it has outgrown this component and wants its own.
 */
export function Menu({
  children,
  label,
  items,
  align = 'end',
  chevron = false,
  size = 'sm',
  className,
  triggerWidth,
}: MenuProps) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const [measuredWidth, setMeasuredWidth] = useState(triggerWidth ?? 120);
  const [panelHeight, setPanelHeight] = useState(
    12 + items.reduce((height, item) => height + (item.description ? 64 : 44), 0),
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerHeight = size === 'md' ? 48 : 44;
  const transition = expandingActionSpring(multiplier);

  // Only the surface changes dimensions; its text never inherits a layout scale.
  useEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger || triggerWidth) return;
    const measure = () => {
      const width = trigger.getBoundingClientRect().width;
      if (width > 0) setMeasuredWidth(width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(trigger);
    return () => observer.disconnect();
  }, [triggerWidth, items.length, size]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    const measure = () => {
      if (panel.scrollHeight > 0) setPanelHeight(panel.scrollHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [open, items.length]);

  const enabled = items.filter((item) => !item.disabled);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    setActiveIndex(-1);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Pointer-down rather than click, so the menu closes before the click lands on
  // whatever is underneath it.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close]);

  useEffect(() => {
    if (open && activeIndex >= 0) itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  function openAt(index: number) {
    if (items[index]?.disabled) {
      index =
        index === items.length - 1
          ? items.length - 1 - [...items].reverse().findIndex((item) => !item.disabled)
          : items.findIndex((item) => !item.disabled);
    }
    setOpen(true);
    setActiveIndex(index);
  }

  function onTriggerKeyDown(event: React.KeyboardEvent) {
    // A pointer open leaves focus on the trigger, so Escape and Tab have to close from
    // here too. Handling them only on the menu node means a clicked-open menu cannot be
    // dismissed from the keyboard, and Tab walks focus away leaving it hanging open.
    if (open && event.key === 'Escape') {
      event.preventDefault();
      close(false);
      return;
    }
    if (open && event.key === 'Tab') {
      close(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openAt(0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(items.length - 1);
    }
  }

  function onMenuKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      close(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((prev) => {
        const count = items.length;
        let next = prev;
        // Skip disabled entries rather than letting focus land on them.
        for (let i = 0; i < count; i += 1) {
          next = (next + step + count) % count;
          if (!items[next]?.disabled) return next;
        }
        return prev;
      });
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(items.findIndex((item) => !item.disabled));
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(items.length - 1 - [...items].reverse().findIndex((item) => !item.disabled));
    }
  }

  if (enabled.length === 0) return null;

  return (
    <div
      ref={rootRef}
      className={cn('relative shrink-0', open && 'z-30', className)}
      style={{ width: triggerWidth ?? measuredWidth, height: triggerHeight }}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          close(false);
      }}
    >
      <motion.div
        data-expanding-action=""
        initial={false}
        animate={{
          width: open ? Math.max(216, measuredWidth) : measuredWidth,
          height: open ? triggerHeight + panelHeight + 2 : triggerHeight,
          borderRadius: open ? 18 : triggerHeight / 2,
        }}
        transition={transition}
        className={cn(
          'absolute top-0 overflow-hidden border bg-surface-raised',
          align === 'end' ? 'right-0' : 'left-0',
          open
            ? 'border-transparent shadow-[0_24px_48px_-16px_hsl(var(--ink)/0.35),0_0_0_1px_hsl(var(--ink)/0.05)]'
            : 'border-line-strong',
        )}
      >
        <motion.button
          ref={triggerRef}
          type="button"
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => (open ? close(false) : setOpen(true))}
          onKeyDown={onTriggerKeyDown}
          data-press=""
          whileTap={multiplier > 0 ? { scale: 0.97 } : undefined}
          transition={transition}
          className={cn(
            'absolute top-0 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold text-ink focus-visible:outline-offset-[-3px]',
            size === 'md' ? 'min-h-12 px-5' : 'min-h-11 px-4',
            align === 'end' ? 'right-0' : 'left-0',
          )}
          style={triggerWidth ? { width: triggerWidth } : undefined}
        >
          {typeof children === 'function' ? children(open) : children}
          {chevron && (
            <motion.span
              aria-hidden="true"
              className="inline-flex"
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.28 * multiplier, ease: MOTION_EASING.standard }}
            >
              <ChevronDownIcon width={16} height={16} />
            </motion.span>
          )}
        </motion.button>

        <div inert={!open} aria-hidden={!open || undefined}>
          <AnimatePresence>
            {open && (
              <motion.div
                ref={panelRef}
                id={menuId}
                role="menu"
                aria-label={label}
                onKeyDown={onMenuKeyDown}
                initial={multiplier > 0 ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                exit={multiplier > 0 ? { opacity: 0 } : undefined}
                transition={{ duration: 0.12 * multiplier }}
                style={{ top: triggerHeight }}
                className={cn('absolute w-[214px] p-1.5', align === 'end' ? 'right-0' : 'left-0')}
              >
                {items.map((item, index) => (
                  <motion.button
                    key={item.label}
                    ref={(node) => {
                      itemRefs.current[index] = node;
                    }}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    tabIndex={index === activeIndex ? 0 : -1}
                    onClick={() => {
                      close(true);
                      item.onSelect();
                    }}
                    style={{ transitionDuration: `${100 * multiplier}ms` }}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm',
                      'text-ink transition-colors duration-100 hover:bg-ink/5',
                      'focus-visible:bg-ink/5 focus-visible:outline-none',
                      'disabled:pointer-events-none disabled:opacity-40',
                    )}
                  >
                    {item.icon && <span className="text-ink-faint">{item.icon}</span>}
                    {item.description ? (
                      <span className="flex flex-col">
                        <strong className="font-bold">{item.label}</strong>
                        <span className="text-[13px] text-ink-faint">{item.description}</span>
                      </span>
                    ) : (
                      item.label
                    )}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
