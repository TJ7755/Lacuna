// Floating bar for acting on selected cards: springs up from the bottom centre when
// selection starts and slides away when it ends. Choosers (tag, reschedule, assign) open
// as a card above the bar, so they float without reflowing the page. Every animation is
// scaled by the motion multiplier and switches off at 0.

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { cn } from '../ui/cn';
import { scaledSpring } from '../ui/motion';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';

export function CardBulkBar({
  open,
  panel,
  children,
}: {
  open: boolean;
  /** Chooser card shown above the bar while an action needs more input. */
  panel?: ReactNode;
  children: ReactNode;
}) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={m > 0 ? { opacity: 0, y: 48 } : false}
          animate={{ opacity: 1, y: 0 }}
          exit={m > 0 ? { opacity: 0, y: 48 } : undefined}
          transition={scaledSpring(m, 420, 32)}
          className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex flex-col items-center gap-3 px-4"
        >
          {panel && (
            <div className="pointer-events-auto w-full max-w-md rounded-3xl bg-surface p-5 shadow-[0_1px_2px_hsl(var(--ink)/0.05),0_24px_48px_-16px_hsl(var(--ink)/0.35)]">
              {panel}
            </div>
          )}
          <div
            role="toolbar"
            aria-label="Selected cards"
            className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-[28px] bg-ink p-2 pl-5 text-paper shadow-[0_24px_48px_-16px_hsl(var(--ink)/0.5)]"
          >
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Pill button for the dark bar; `active` marks the action whose chooser is open. */
export function BulkBarButton({
  active,
  danger,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-[background-color,opacity,transform] duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-40',
        danger
          ? 'bg-negative text-white hover:opacity-90'
          : active
            ? 'bg-paper text-ink'
            : 'bg-paper/10 text-paper hover:bg-paper/20',
        className,
      )}
    />
  );
}
