import { ModalBackdrop } from '../ui/ModalBackdrop';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { m as motion } from 'motion/react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { createCourse } from '../../db/courseRepository';
import { createLesson } from '../../db/lessonRepository';
import { cn } from '../ui/cn';
import { CloseIcon } from '../ui/icons';
import { CourseStudyTarget } from './CourseStudyTarget';
import { defaultExamDate, getLocalTimeZone } from '../../utils/datetime';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import type { CourseSchedulingMode } from '../../db/types';

interface NewCourseFormProps {
  onClose: () => void;
}

/** Create an empty course with an explicit study target. */
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
      void navigate(`/course/${course.id}`);
    } catch (err) {
      setSaving(false);
      notify(err instanceof Error ? err.message : 'Could not create the course.', 'negative');
    }
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
        } else if (e.key === 'Enter') {
          if ((e.target as Element).closest('[data-date-time-picker]')) return;
          e.preventDefault();
          void handleCreate();
        }
      }}
    >
      <ModalBackdrop shade={50} onClick={onClose} />

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

          <CourseStudyTarget
            schedulingMode={schedulingMode}
            setSchedulingMode={setSchedulingMode}
            targetError={targetError}
            setTargetError={setTargetError}
            saving={saving}
            targetRef={targetRef}
            datePickerRef={datePickerRef}
            examDate={examDate}
            setExamDate={setExamDate}
            setExamDateValid={setExamDateValid}
            timeZone={timeZone}
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
    </motion.div>,
    document.body,
  );
}
