import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { Button } from './Button';
import { cn } from './cn';
import { ChevronDownIcon } from './icons';
import { MOTION_EASING } from './motion';

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
  children: ReactNode;
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
}: MenuProps) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

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
    <div ref={rootRef} className={cn('relative', className)}>
      <Button
        ref={triggerRef}
        variant="secondary"
        size={size}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          size === 'md' && 'min-h-12 px-5',
          open && 'border-ink bg-ink text-paper hover:border-ink',
        )}
      >
        {children}
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
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            initial={multiplier > 0 ? { opacity: 0, y: -6, scale: 0.94 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={multiplier > 0 ? { opacity: 0, y: -4, scale: 0.97 } : undefined}
            transition={{ duration: 0.22 * multiplier, ease: MOTION_EASING.standard }}
            className={cn(
              'absolute z-30 mt-2 min-w-56 overflow-hidden rounded-[18px] bg-surface-raised p-1.5',
              'shadow-[0_24px_48px_-16px_hsl(var(--ink)/0.35),0_0_0_1px_hsl(var(--ink)/0.05)]',
              align === 'end' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
            )}
          >
            {items.map((item, index) => (
              <motion.button
                initial={multiplier > 0 ? { opacity: 0, y: -3 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.18 * multiplier,
                  delay: (0.04 + index * 0.025) * multiplier,
                  ease: MOTION_EASING.standard,
                }}
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
                  'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm',
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
  );
}
