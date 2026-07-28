import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { m as motion } from 'motion/react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { createCourse, createLesson } from '../../db/repository';
import { cn } from '../ui/cn';
import { CloseIcon } from '../ui/icons';

const ShareCodeImportPanel = lazy(() =>
  import('../import/UnifiedImportPanel').then((module) => ({
    default: module.ShareCodeImportPanel,
  })),
);

interface NewCourseFormProps {
  onClose: () => void;
}

/**
 * A focused overlay for starting a new course. Mirrors CardEditOverlay's modal
 * chrome (backdrop, centred card, Escape to cancel). The default path creates a
 * named course with an initial lesson; the alternate path imports a pasted share
 * code through the existing unified import workflow.
 */
export function NewCourseForm({ onClose }: NewCourseFormProps) {
  const { notify } = useToast();
  const navigate = useNavigate();
  const trapRef = useFocusTrap(true, { autoFocusSelector: 'input, textarea' });
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'create' | 'import'>('create');

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

  async function handleShareImport(courses: number, cards: number, courseIds: string[]) {
    notify(
      `Added ${courses} course${courses === 1 ? '' : 's'} and ${cards} card${cards === 1 ? '' : 's'}.`,
      'positive',
    );
    onClose();
    const courseId = courseIds[0];
    if (courseId) navigate(`/course/${courseId}`);
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
        } else if (mode === 'create' && e.key === 'Enter') {
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

        <div className="flex gap-2 px-6 pt-5">
          <button
            type="button"
            onClick={() => setMode('create')}
            aria-pressed={mode === 'create'}
            className={cn(
              'flex-1 rounded-full border px-4 py-2 text-sm font-medium transition-all',
              mode === 'create'
                ? 'border-accent/60 bg-accent-soft text-accent shadow-sm shadow-accent/10'
                : 'border-line text-ink-soft hover:border-line-strong hover:bg-ink/5',
            )}
          >
            Create new
          </button>
          <button
            type="button"
            onClick={() => setMode('import')}
            aria-pressed={mode === 'import'}
            className={cn(
              'flex-1 rounded-full border px-4 py-2 text-sm font-medium transition-all',
              mode === 'import'
                ? 'border-accent/60 bg-accent-soft text-accent shadow-sm shadow-accent/10'
                : 'border-line text-ink-soft hover:border-line-strong hover:bg-ink/5',
            )}
          >
            Import share code
          </button>
        </div>

        {mode === 'create' ? (
          <>
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
          </>
        ) : (
          <div className="max-h-[65vh] overflow-y-auto px-6 py-6">
            <p className="mb-4 text-sm leading-relaxed text-ink-soft">
              Paste a Lacuna share code to add a copy without changing existing courses.
              LAC0–LAC3 codes are supported.
            </p>
            <Suspense fallback={<p className="text-sm text-ink-faint">Loading importer…</p>}>
              <ShareCodeImportPanel onCancel={onClose} onShareImport={handleShareImport} />
            </Suspense>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
