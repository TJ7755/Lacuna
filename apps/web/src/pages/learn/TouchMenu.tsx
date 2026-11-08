import { ModalBackdrop } from '../../components/ui/ModalBackdrop';
import { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { animate, m as motion, useMotionValue, usePresence } from 'motion/react';
import { expandingActionSpring } from '../../components/ui/motion';
import { hapticLight } from '../../utils/haptic';
import type { Card } from '@lacuna/core/db/types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '../../components/ui/Button';
import {
  ClockIcon,
  CloseIcon,
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
        className="card-surface absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] mx-auto flex max-h-[calc(100%-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-w-lg flex-col rounded-3xl border border-line bg-surface p-3"
        onClick={(e) => e.stopPropagation()}
        onPointerMove={handleDragHandleMove}
        onPointerUp={handleDragHandleUp}
        onPointerCancel={handleDragHandleUp}
      >
        {/* Drag handle — wide touch target, springy drag-to-close. */}
        <div className="relative mb-2 flex shrink-0 justify-center">
          <div
            className="flex h-11 w-20 cursor-grab touch-none items-center justify-center rounded-full active:cursor-grabbing"
            data-dialog-close
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
            <div className="h-1 w-9 rounded-full bg-ink/20" />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 px-0!"
            aria-label="Close card actions"
            title="Close card actions"
            data-dialog-close
            onClick={() => {
              hapticLight();
              onClose();
            }}
          >
            <CloseIcon width={18} height={18} />
          </Button>
        </div>
        <div className="grid min-h-0 gap-1 overflow-y-auto overscroll-contain p-1 sm:grid-cols-2">
          {forecast && <p className="px-3 pb-2 text-sm text-ink-soft sm:col-span-2">{forecast}</p>}
          {current.sequenceItemId === undefined && current.occlusionRegionId === undefined && (
            <TouchMenuButton
              icon={<EditIcon width={20} height={20} />}
              label="Edit card"
              onClick={() => {
                hapticLight();
                onEdit();
              }}
            />
          )}
          <TouchMenuButton
            icon={<FlagIcon width={20} height={20} />}
            label={current.flagged ? 'Remove flag' : 'Flag card'}
            description={current.flagged ? undefined : 'Find it later; its schedule is unchanged.'}
            onClick={() => {
              hapticLight();
              onToggleFlag();
            }}
          />
          <TouchMenuButton
            icon={<ClockIcon width={20} height={20} />}
            label="Bury until tomorrow"
            description="Back tomorrow."
            onClick={() => {
              hapticLight();
              onBury();
            }}
          />
          <TouchMenuButton
            icon={<PauseIcon width={20} height={20} />}
            label="Suspend card"
            description="Out of study until you resume it."
            onClick={() => {
              hapticLight();
              onSuspend();
            }}
          />
          <TouchMenuButton
            icon={<FocusIcon width={20} height={20} />}
            label={focusMode ? 'Leave focus mode' : 'Focus mode'}
            onClick={() => {
              hapticLight();
              onToggleFocus();
            }}
          />
          <TouchMenuButton
            icon={<KeyboardIcon width={20} height={20} />}
            label="Keyboard shortcuts"
            onClick={() => {
              hapticLight();
              onShowShortcuts();
            }}
          />
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function TouchMenuButton({
  icon,
  label,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  onClick: () => void;
}) {
  const descriptionId = useId();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-describedby={description ? descriptionId : undefined}
      className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-ink/5 active:bg-ink/10"
    >
      <span aria-hidden="true" className="shrink-0 text-ink-faint">
        {icon}
      </span>
      {label}
      {description && (
        <span id={descriptionId} hidden>
          {description}
        </span>
      )}
    </button>
  );
}
