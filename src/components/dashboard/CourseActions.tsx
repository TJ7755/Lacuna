// The Today queue's course actions: a pointer-positioned context menu and the
// archive confirmation. Loaded on demand from the dashboard.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { m as motion } from 'motion/react';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import { Button } from '../ui/Button';
import { updateCourse } from '../../db/courseRepository';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import type { Course } from '../../db/types';

export interface CourseMenuState {
  course: Course;
  position: { x: number; y: number };
  trigger: HTMLButtonElement;
}

export interface ArchiveTarget {
  course: Course;
  trigger: HTMLButtonElement;
}

export function CourseContextMenu({
  course,
  position,
  trigger: _trigger,
  onClose,
  onArchive,
}: CourseMenuState & { onClose: (restoreFocus?: boolean) => void; onArchive: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [clampedPosition, setClampedPosition] = useState(position);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const gutter = 8;
    setClampedPosition({
      x: Math.max(gutter, Math.min(position.x, window.innerWidth - menu.offsetWidth - gutter)),
      y: Math.max(gutter, Math.min(position.y, window.innerHeight - menu.offsetHeight - gutter)),
    });
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [position]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose(false);
    };
    window.addEventListener('pointerdown', closeOutside);
    return () => window.removeEventListener('pointerdown', closeOutside);
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      id="dashboard-course-actions"
      role="menu"
      aria-label={`Actions for ${course.name}`}
      className="fixed z-[70] min-w-40 rounded-xl border border-line-strong bg-surface-raised p-1.5 shadow-xl shadow-black/15"
      style={{ left: clampedPosition.x, top: clampedPosition.y }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
        if (event.key === 'Tab') onClose();
      }}
    >
      <button
        type="button"
        role="menuitem"
        className="flex min-h-11 w-full items-center rounded-lg px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-ink/5 focus-visible:bg-ink/5 focus-visible:outline-none"
        onClick={onArchive}
      >
        Archive
      </button>
    </div>,
    document.body,
  );
}

export function ArchiveCourseDialog({
  course,
  onClose,
  onArchived,
}: {
  course: Course;
  onClose: () => void;
  onArchived: () => void;
}) {
  const trapRef = useFocusTrap(true, {
    autoFocusSelector: '[data-confirm-archive]',
    returnFocus: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  async function confirmArchive() {
    setBusy(true);
    setError(null);
    try {
      await updateCourse(course.id, { archived: true });
      onArchived();
    } catch {
      setError('The course could not be archived. Nothing was changed.');
      setBusy(false);
    }
  }

  return createPortal(
    <motion.div
      ref={trapRef}
      data-course-archive-dialog
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      initial={m > 0 ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={m > 0 ? { opacity: 0 } : undefined}
      transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape' && !busy) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <ModalBackdrop onClick={() => !busy && onClose()} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-course-title"
        aria-describedby="archive-course-description"
        initial={m > 0 ? { opacity: 0, y: 12, scale: 0.98 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={m > 0 ? { opacity: 0, y: 12, scale: 0.98 } : undefined}
        transition={m > 0 ? { type: 'spring', stiffness: 320, damping: 30 } : { duration: 0 }}
        className="relative z-10 w-full max-w-md rounded-2xl border border-line-strong bg-paper p-6 shadow-2xl shadow-black/20"
      >
        <h2 id="archive-course-title" className="font-display text-2xl">
          Archive {course.name}?
        </h2>
        <p id="archive-course-description" className="mt-2 text-sm leading-relaxed text-ink-soft">
          This removes the course from active study and Today. Its lessons, cards and review history
          are preserved.
        </p>
        {error && (
          <p role="alert" className="mt-4 text-sm text-negative">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            data-confirm-archive
            onClick={() => void confirmArchive()}
            disabled={busy}
          >
            {busy ? 'Archiving…' : 'Archive course'}
          </Button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
