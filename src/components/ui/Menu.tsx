import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { Button } from './Button';
import { cn } from './cn';

export interface MenuItem {
  /** Visible label. Also the accessible name, so write it as the action it performs. */
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
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
  className?: string;
}

/**
 * A small popover menu for actions that would otherwise crowd a toolbar.
 *
 * Deliberately minimal: one trigger, a flat list, no submenus or checkable items.
 * If a menu here ever needs those, it has outgrown this component and wants its own.
 */
export function Menu({ children, label, items, align = 'end', className }: MenuProps) {
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
        size="sm"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={onTriggerKeyDown}
      >
        {children}
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className={cn(
              'absolute z-30 mt-2 min-w-56 overflow-hidden rounded-xl border border-line-strong',
              'bg-surface-raised p-1 shadow-lg shadow-black/10',
              align === 'end' ? 'right-0' : 'left-0',
            )}
          >
            {items.map((item, index) => (
              <button
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
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm',
                  'text-ink transition-colors duration-100 hover:bg-ink/5',
                  'focus-visible:bg-ink/5 focus-visible:outline-none',
                  'disabled:pointer-events-none disabled:opacity-40',
                )}
              >
                {item.icon && <span className="text-ink-faint">{item.icon}</span>}
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
