import { useCallback, useRef } from 'react';
import { m as motion, useMotionValue, useSpring } from 'motion/react';
import { hapticLight } from '../../utils/haptic';
import type { Card } from '../../db/types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { ClockIcon, EditIcon, FlagIcon, KeyboardIcon, PauseIcon } from '../../components/ui/icons';

export function TouchMenuSheet({
  current,
  onEdit,
  onToggleFlag,
  onBury,
  onSuspend,
  onShowShortcuts,
  onClose,
  m,
}: {
  current: Card;
  onEdit: () => void;
  onToggleFlag: () => void;
  onBury: () => void;
  onSuspend: () => void;
  onShowShortcuts: () => void;
  onClose: () => void;
  m: number;
}) {
  const trapRef = useFocusTrap(true);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragY = useMotionValue(0);
  const springY = useSpring(dragY, { stiffness: 400, damping: 30 });
  const dragStartY = useRef(0);
  const dragStartTime = useRef(0);
  const isDragging = useRef(false);

  const handleDragHandleDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartTime.current = performance.now();
    sheetRef.current?.setPointerCapture(e.pointerId);
  }, []);

  const handleDragHandleMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      const dy = e.clientY - dragStartY.current;
      if (dy > 0) dragY.set(dy);
    },
    [dragY],
  );

  const handleDragHandleUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      isDragging.current = false;
      sheetRef.current?.releasePointerCapture(e.pointerId);
      const dy = dragY.get();
      const elapsed = performance.now() - dragStartTime.current;
      // Flick or drag past threshold closes the sheet.
      if (dy > 80 || (dy > 20 && elapsed < 200)) {
        dragY.set(0);
        onClose();
      } else {
        dragY.set(0);
      }
    },
    [dragY, onClose],
  );

  return (
    <motion.div
      ref={trapRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 * m }}
      className="fixed inset-0 z-40"
      role="dialog"
      aria-modal="true"
      aria-label="Card actions"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <motion.div
        ref={sheetRef}
        style={{ y: springY }}
        initial={{ y: 120, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 120, opacity: 0 }}
        transition={{ duration: 0.28 * m, ease: [0.16, 1, 0.3, 1] }}
        className="absolute bottom-0 left-0 right-0 rounded-t-3xl border-t border-line-strong bg-surface px-6 py-6 shadow-2xl shadow-black/20"
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
          {current.sequenceItemId === undefined && (
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
    </motion.div>
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
