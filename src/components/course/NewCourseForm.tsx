import { lazy, Suspense, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { m as motion } from 'motion/react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '../ui/Button';
import { StepSwap } from '../ui/StepSwap';
import { useToast } from '../ui/Toast';
import { createCourse, createLesson } from '../../db/repository';
import { cn } from '../ui/cn';
import { CloseIcon } from '../ui/icons';
import { DateTimePicker } from '../ui/DateTimePicker';
import { defaultExamDate, getLocalTimeZone } from '../../utils/datetime';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import type { CourseSchedulingMode } from '../../db/types';

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
  const nameInputRef = useRef<HTMLInputElement>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLFieldSetElement>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [timeZone] = useState(getLocalTimeZone);
  const [examDate, setExamDate] = useState(defaultExamDate);
  const [examDateValid, setExamDateValid] = useState(true);
  const [schedulingMode, setSchedulingMode] = useState<CourseSchedulingMode | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'create' | 'import'>('create');
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  const canCreate = !saving;

  async function handleCreate() {
    if (saving) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Enter a course name before creating the course.');
      nameInputRef.current?.focus();
      return;
    }
    if (schedulingMode === null) {
      setTargetError('Choose an exam date or steady retention.');
      targetRef.current?.querySelector<HTMLInputElement>('input')?.focus();
      return;
    }
    if (schedulingMode === 'exam' && (!examDateValid || !Number.isFinite(examDate))) {
      const invalidControl =
        datePickerRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      const trigger = datePickerRef.current?.querySelector<HTMLElement>('button');
      (invalidControl ?? trigger)?.focus();
      return;
    }
    setNameError(null);
    setSaving(true);
    try {
      const course = await createCourse(
        trimmedName,
        schedulingMode === 'exam' ? { schedulingMode, examDate, timeZone } : { schedulingMode },
      );
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

  return createPortal(
    <motion.div
      ref={trapRef}
      className="fixed inset-0 z-50 flex flex-col will-change-transform-opacity"
      initial={m > 0 ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={m > 0 ? { opacity: 0 } : undefined}
      transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
      onKeyDown={(e) => {
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        if (e.key === 'Escape') {
          if ((e.target as Element).closest('[data-date-time-picker-popover]')) return;
          e.preventDefault();
          onClose();
        } else if (mode === 'create' && e.key === 'Enter') {
          if ((e.target as Element).closest('[data-date-time-picker]')) return;
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
        initial={m > 0 ? { opacity: 0, y: 16, scale: 0.98 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={m > 0 ? { opacity: 0, y: 16, scale: 0.98 } : undefined}
        transition={m > 0 ? { type: 'spring', stiffness: 320, damping: 30 } : { duration: 0 }}
        className="relative z-10 m-auto flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-line-strong bg-paper shadow-2xl shadow-black/20"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-dot-grid opacity-20"
          aria-hidden="true"
        />
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
              'flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-all',
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
              'flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-all',
              mode === 'import'
                ? 'border-accent/60 bg-accent-soft text-accent shadow-sm shadow-accent/10'
                : 'border-line text-ink-soft hover:border-line-strong hover:bg-ink/5',
            )}
          >
            Import share code
          </button>
        </div>

        <StepSwap stepKey={mode} direction={mode === 'import' ? 1 : -1} moveFocus>
          {mode === 'create' ? (
            <>
              <div className="flex flex-col gap-5 px-6 py-6">
                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-[0.14em] text-ink-faint">
                    Course name
                  </label>
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (e.target.value.trim()) setNameError(null);
                    }}
                    placeholder="Course name"
                    autoFocus
                    disabled={saving}
                    aria-invalid={nameError ? 'true' : undefined}
                    aria-describedby={nameError ? 'new-course-name-error' : undefined}
                    className={cn(
                      'w-full rounded-xl border bg-surface px-4 py-2.5 text-sm text-ink',
                      nameError ? 'border-negative' : 'border-line',
                      'placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/60',
                      'disabled:opacity-40',
                    )}
                  />
                  {nameError && (
                    <p id="new-course-name-error" role="alert" className="text-sm text-negative">
                      {nameError}
                    </p>
                  )}
                </div>

                <fieldset
                  ref={targetRef}
                  aria-describedby={targetError ? 'course-target-error' : undefined}
                >
                  <legend className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-faint">
                    Study target
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ['exam', 'Exam date', 'Schedule towards a deadline.'],
                        ['steady', 'Steady retention', 'Keep knowledge available long term.'],
                      ] as const
                    ).map(([value, label, description]) => (
                      <label
                        key={value}
                        className={cn(
                          'cursor-pointer rounded-xl border px-3 py-3 transition-colors',
                          schedulingMode === value
                            ? 'border-accent bg-accent-soft'
                            : 'border-line hover:border-line-strong',
                        )}
                      >
                        <span className="flex items-center gap-2 text-sm font-medium text-ink">
                          <input
                            type="radio"
                            name="course-scheduling-mode"
                            value={value}
                            checked={schedulingMode === value}
                            onChange={() => {
                              setSchedulingMode(value);
                              setTargetError(null);
                            }}
                            disabled={saving}
                          />
                          {label}
                        </span>
                        <span className="mt-1 block pl-6 text-xs leading-relaxed text-ink-faint">
                          {description}
                        </span>
                      </label>
                    ))}
                  </div>
                  {targetError && (
                    <p id="course-target-error" role="alert" className="mt-2 text-sm text-negative">
                      {targetError}
                    </p>
                  )}
                </fieldset>

                {schedulingMode === 'exam' && (
                  <div ref={datePickerRef}>
                    <DateTimePicker
                      value={examDate}
                      onChange={setExamDate}
                      onValidityChange={setExamDateValid}
                      timeZone={timeZone}
                      label="Exam date and time"
                    />
                  </div>
                )}
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
                Paste a Lacuna share code to add a copy without changing existing courses. LAC0–LAC3
                codes are supported.
              </p>
              <Suspense fallback={<p className="text-sm text-ink-faint">Loading importer…</p>}>
                <ShareCodeImportPanel onCancel={onClose} onShareImport={handleShareImport} />
              </Suspense>
            </div>
          )}
        </StepSwap>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
