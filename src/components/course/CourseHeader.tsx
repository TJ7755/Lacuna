// Shared "course cockpit" header: exam eyebrow, display title, and caller
// content beneath — typically the HeaderStats pill row. Used by CoursePath
// (full course) and, in a leaner form, LessonView.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { cn } from '../ui/cn';
import { EditIcon } from '../ui/icons';
import { motionTransition } from '../ui/motion';

interface CourseHeaderProps {
  /** e.g. "Exam 12 July 2026". */
  eyebrow: string;
  /** Pulses a small accent dot beside the eyebrow — reserve for an imminent exam. */
  examUrgent?: boolean;
  title: string;
  /** Enables inline title editing. Omit for read-only/shared content. */
  onRename?: (name: string) => void | Promise<void>;
  /** Entity noun used by the rename control and input label. */
  renameLabel?: 'course' | 'lesson';
  /** Content under the title — typically the HeaderStats pill row. */
  children?: ReactNode;
  className?: string;
}

/**
 * Frame for a course/lesson header: eyebrow row, display title, and
 * caller-supplied content beneath (the HeaderStats row), so the same frame serves
 * both the CoursePath header and LessonView's leaner adoption.
 */
export function CourseHeader({
  eyebrow,
  examUrgent = false,
  title,
  onRename,
  renameLabel = 'course',
  children,
  className,
}: CourseHeaderProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [savingTitle, setSavingTitle] = useState(false);
  const [motionSpeed] = useMotionSpeed();
  const motionMultiplier = speedMultiplier(motionSpeed);
  const titleInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editingTitle) setTitleDraft(title);
  }, [editingTitle, title]);

  function startRename() {
    if (!onRename || savingTitle) return;
    setTitleDraft(title);
    setEditingTitle(true);
  }

  function cancelRename() {
    setTitleDraft(title);
    setEditingTitle(false);
  }

  async function commitRename() {
    if (!onRename || savingTitle) return;
    const name = titleDraft.trim();
    if (!name || name === title) {
      cancelRename();
      return;
    }
    setSavingTitle(true);
    try {
      await onRename(name);
      setEditingTitle(false);
    } catch {
      requestAnimationFrame(() => titleInput.current?.focus());
    } finally {
      setSavingTitle(false);
    }
  }

  return (
    <header
      className={cn(
        'relative py-6 md:py-8',
        className,
      )}
    >
      <div className="relative">
        <div className="mb-1 flex items-center gap-2 text-sm uppercase tracking-[0.16em] text-ink-faint">
          {examUrgent && (
            <span
              className="exam-pulse inline-block h-1.5 w-1.5 rounded-full bg-accent"
              aria-hidden="true"
            />
          )}
          {eyebrow}
        </div>
        <div className="mb-5 flex min-w-0 items-center gap-2">
          <AnimatePresence initial={false} mode="popLayout">
            {editingTitle ? (
              <motion.input
                key="title-input"
                autoFocus
                onFocus={(event) => event.currentTarget.select()}
                ref={titleInput}
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={() => void commitRename()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void commitRename();
                  if (event.key === 'Escape') cancelRename();
                }}
                aria-label={`${renameLabel} name`}
                disabled={savingTitle}
                layout={motionMultiplier > 0 ? 'size' : undefined}
                initial={motionMultiplier > 0 ? { opacity: 0, y: 3 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={motionMultiplier > 0 ? { opacity: 0, y: -3 } : undefined}
                transition={motionTransition('feedback', motionMultiplier)}
                className="min-w-0 flex-1 rounded-lg border border-accent bg-paper/70 px-2 py-1 font-display text-4xl tracking-tight text-ink outline-none md:text-5xl"
              />
            ) : (
              <motion.h1
                key="display-title"
                onDoubleClick={startRename}
                title={onRename ? `Double-click to rename ${renameLabel}` : undefined}
                layout={motionMultiplier > 0 ? 'size' : undefined}
                initial={motionMultiplier > 0 ? { opacity: 0, y: 3 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={motionMultiplier > 0 ? { opacity: 0, y: -3 } : undefined}
                transition={motionTransition('feedback', motionMultiplier)}
                className={cn(
                  'min-w-0 break-words font-display text-4xl tracking-tight md:text-5xl',
                  onRename && 'cursor-text',
                )}
              >
                {title}
              </motion.h1>
            )}
          </AnimatePresence>
          {onRename && !editingTitle && (
            <button
              type="button"
              onClick={startRename}
              aria-label={`Rename ${renameLabel}`}
              title={`Rename ${renameLabel}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <EditIcon width={17} height={17} />
            </button>
          )}
        </div>
        {children && <div className="flex flex-wrap gap-x-8 gap-y-4">{children}</div>}
      </div>
    </header>
  );
}
