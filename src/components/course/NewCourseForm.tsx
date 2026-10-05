import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { createCourse } from '../../db/courseRepository';
import { createLesson } from '../../db/lessonRepository';
import { cn } from '../ui/cn';
import { CourseStudyTarget } from './CourseStudyTarget';
import { defaultExamDate, getLocalTimeZone } from '../../utils/datetime';
import type { CourseSchedulingMode } from '../../db/types';
import { DialogHeader, DialogPanel } from '../ui/DialogPanel';

interface NewCourseFormProps {
  onClose: () => void;
}

/** Create an empty course with an explicit study target. */
export function NewCourseForm({ onClose }: NewCourseFormProps) {
  const { notify } = useToast();
  const navigate = useNavigate();
  const trapRef = useFocusTrap(true, { autoFocusSelector: 'input, textarea' });
  const nameInputRef = useRef<HTMLInputElement>(null);
  const nameInputId = useId();
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
    <DialogPanel
      label="New course"
      trapRef={trapRef}
      onBackdropClick={onClose}
      className="max-w-md"
      overlayClassName="will-change-transform-opacity"
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
      <DialogHeader title="New course" onClose={onClose} closeLabel="Close" />

      <div className="flex flex-col gap-5 px-6 py-6">
        <div className="flex flex-col gap-2">
          <label htmlFor={nameInputId} className="text-sm text-ink-faint">
            Course name
          </label>
          <input
            id={nameInputId}
            ref={nameInputRef}
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (e.target.value.trim()) setNameError(null);
            }}
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
    </DialogPanel>,
    document.body,
  );
}
