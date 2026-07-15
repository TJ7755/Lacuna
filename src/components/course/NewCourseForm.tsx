import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { m as motion } from 'motion/react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { createCourse, createLesson } from '../../db/repository';
import { cn } from '../ui/cn';
import { CloseIcon } from '../ui/icons';

interface NewCourseFormProps {
  onClose: () => void;
}

/**
 * A focused overlay for starting a new course. Mirrors CardEditOverlay's modal
 * chrome (backdrop, centred card, Escape to cancel) but with a single field —
 * creating a course is a lightweight action, not a full editor. Also creates an
 * initial lesson so the course view isn't a dead end, then navigates there.
 */
export function NewCourseForm({ onClose }: NewCourseFormProps) {
  const { notify } = useToast();
  const navigate = useNavigate();
  const trapRef = useFocusTrap(true, { autoFocusSelector: 'input' });
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const canCreate = name.trim().length > 0 && !saving;

  async function handleCreate() {
    if (!canCreate) return;
    setSaving(true);
    try {
      const course = await createCourse(name.trim());
      await createLesson(course.id, 'Lesson 1');
      onClose();
      navigate(`/course/${course.id}`);
    } catch (err) {
      setSaving(false);
      notify(err instanceof Error ? err.message : 'Could not create the course.', 'negative');
    }
  }

  return (
    <motion.div
      ref={trapRef}
      className="fixed inset-0 z-50 flex flex-col will-change-transform-opacity"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onKeyDown={(e) => {
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          void handleCreate();
        }
      }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="New course"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        className="relative z-10 m-auto flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-line-strong bg-paper shadow-2xl shadow-black/20"
      >
        <div className="pointer-events-none absolute inset-0 bg-dot-grid opacity-20" aria-hidden="true" />
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="font-display text-xl">New course</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <CloseIcon width={18} height={18} />
          </button>
        </header>

        <div className="flex flex-col gap-2 px-6 py-6">
          <label className="text-xs uppercase tracking-[0.14em] text-ink-faint">
            Course name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Course name"
            autoFocus
            disabled={saving}
            className={cn(
              'w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink',
              'placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/60',
              'disabled:opacity-40',
            )}
          />
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void handleCreate()} disabled={!canCreate}>
            {saving ? 'Creating…' : 'Create'}
          </Button>
        </footer>
      </motion.div>
    </motion.div>
  );
}
