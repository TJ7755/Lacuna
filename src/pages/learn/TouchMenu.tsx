import { ModalBackdrop } from '../../components/ui/ModalBackdrop';
import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { animate, m as motion, useMotionValue, usePresence } from 'motion/react';
import { expandingActionSpring } from '../../components/ui/motion';
import { hapticLight } from '../../utils/haptic';
import type { Card } from '../../db/types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import {
  ClockIcon,
  EditIcon,
  FlagIcon,
  FocusIcon,
  KeyboardIcon,
  PauseIcon,
} from '../../components/ui/icons';

export function TouchMenuSheet({
  current,
  forecast,
  onEdit,
  onToggleFlag,
  onBury,
  onSuspend,
  onShowShortcuts,
  onToggleFocus,
  focusMode,
  onClose,
  m,
}: {
  current: Card;
  forecast?: string;
  onEdit: () => void;
  onToggleFlag: () => void;
  onBury: () => void;
  onSuspend: () => void;
  onShowShortcuts: () => void;
  onToggleFocus: () => void;
  focusMode: boolean;
  onClose: () => void;
  m: number;
}) {
  const [present, safeToRemove] = usePresence();
  const trapRef = useFocusTrap(present);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragY = useMotionValue(m > 0 ? 120 : 0);
  useEffect(() => {
    const target = present ? 0 : Math.max(120, dragY.get() + 120);
    if (m === 0) {
      dragY.jump(target);
      if (!present) safeToRemove?.();
      return;
    }
    const animation = animate(dragY, target, expandingActionSpring(m));
    if (!present) void animation.then(() => safeToRemove?.());
    return () => animation.stop();
  }, [present, safeToRemove, m, dragY]);
  const dragStartY = useRef(0);
  const dragStartTime = useRef(0);
  const dragStartOffset = useRef(0);
  const isDragging = useRef(false);

  const handleDragHandleDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragY.stop();
      dragStartOffset.current = dragY.get();
      isDragging.current = true;
      dragStartY.current = e.clientY;
      dragStartTime.current = performance.now();
      sheetRef.current?.setPointerCapture(e.pointerId);
    },
    [dragY],
  );

  const handleDragHandleMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      dragY.set(Math.max(0, dragStartOffset.current + e.clientY - dragStartY.current));
    },
    [dragY],
  );

  const handleDragHandleUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      isDragging.current = false;
      sheetRef.current?.releasePointerCapture(e.pointerId);
      const dy = dragY.get() - dragStartOffset.current;
      const elapsed = performance.now() - dragStartTime.current;
      // Flick or drag past threshold closes the sheet.
      if (dy > 80 || (dy > 20 && elapsed < 200)) {
        onClose();
      } else {
        if (m === 0) dragY.jump(0);
        else void animate(dragY, 0, expandingActionSpring(m));
      }
    },
    [dragY, onClose, m],
  );

  return createPortal(
    <motion.div
      ref={trapRef}
      inert={!present}
      aria-hidden={!present || undefined}
      className="fixed inset-0 z-40"
      role="dialog"
      aria-modal="true"
      aria-label="Card actions"
      onClick={onClose}
    >
      <motion.div
        className="absolute inset-0"
        initial={m > 0 ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        exit={m > 0 ? { opacity: 0 } : undefined}
        transition={{ duration: 0.15 * m }}
      >
        <ModalBackdrop shade={30} />
      </motion.div>
      <motion.div
        ref={sheetRef}
        style={{ y: dragY }}
        initial={m > 0 ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        exit={m > 0 ? { opacity: 0 } : undefined}
        transition={{ duration: 0.28 * m, ease: [0.16, 1, 0.3, 1] }}
        className="absolute bottom-0 left-0 right-0 rounded-t-3xl border-t border-line-strong bg-surface pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] card-surface"
        onClick={(e) => e.stopPropagation()}
        onPointerMove={handleDragHandleMove}
        onPointerUp={handleDragHandleUp}
        onPointerCancel={handleDragHandleUp}
      >
        {/* Drag handle — wide touch target, springy drag-to-close. */}
        <div className="mb-5 flex justify-center">
          <div
            className="flex h-8 w-20 cursor-grab items-center justify-center active:cursor-grabbing"
            onPointerDown={handleDragHandleDown}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                hapticLight();
                onClose();
              }
            }}
            role="button"
            aria-label="Drag to close"
            tabIndex={0}
          >
            <div className="h-1.5 w-12 rounded-full bg-ink/15 transition-colors active:bg-ink/25" />
          </div>
        </div>
        <div className="mx-auto flex max-w-3xl flex-col gap-1">
          {forecast && <p className="px-4 py-2 text-sm text-ink-soft">{forecast}</p>}
          {current.sequenceItemId === undefined && current.occlusionRegionId === undefined && (
            <TouchMenuButton
              icon={<EditIcon width={22} height={22} />}
              label="Edit card"
              onClick={() => {
                hapticLight();
                onEdit();
              }}
            />
          )}
          <TouchMenuButton
            icon={<FlagIcon width={22} height={22} />}
            label={current.flagged ? 'Remove flag' : 'Flag card'}
            onClick={() => {
              hapticLight();
              onToggleFlag();
            }}
          />
          <TouchMenuButton
            icon={<ClockIcon width={22} height={22} />}
            label="Bury until tomorrow"
            onClick={() => {
              hapticLight();
              onBury();
            }}
          />
          <TouchMenuButton
            icon={<FocusIcon width={22} height={22} />}
            label={focusMode ? 'Leave focus mode' : 'Focus mode'}
            onClick={() => {
              hapticLight();
              onToggleFocus();
            }}
          />
          <TouchMenuButton
            icon={<PauseIcon width={22} height={22} />}
            label="Suspend card"
            onClick={() => {
              hapticLight();
              onSuspend();
            }}
          />
          <div className="my-2 border-t border-line" />
          <TouchMenuButton
            icon={<KeyboardIcon width={22} height={22} />}
            label="Keyboard shortcuts"
            onClick={() => {
              hapticLight();
              onShowShortcuts();
            }}
          />
          <button
            type="button"
            onClick={() => {
              hapticLight();
              onClose();
            }}
            className="mt-2 flex h-14 w-full items-center justify-center rounded-xl bg-ink/5 text-sm font-medium text-ink-soft transition-colors active:bg-ink/10"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function TouchMenuButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-14 w-full items-center gap-4 rounded-xl px-4 text-left text-base text-ink transition-colors hover:bg-ink/5 active:bg-ink/10"
    >
      <span className="shrink-0 text-ink-faint">{icon}</span>
      {label}
    </button>
  );
}
