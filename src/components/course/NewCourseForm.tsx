import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { useIsPresent } from 'motion/react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { prefetchRoute } from '../../routes/prefetch';
import { dialogKeyDown } from '../../hooks/dialogKeys';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { cn } from '../ui/cn';
import { fieldLabelClassName } from '../ui/Field';
import { CourseStudyTarget } from './CourseStudyTarget';
import { defaultExamDate, getLocalTimeZone } from '../../utils/datetime';
import type { CourseSchedulingMode } from '../../db/types';
import { DialogHeader, DialogPanel } from '../ui/DialogPanel';
import { BookIcon, ChevronLeftIcon } from '../ui/icons';
import { Skeleton } from '../ui/Skeleton';
import { StepSwap } from '../ui/StepSwap';
import { MeasuredHeight } from '../ui/MeasuredHeight';
import type { LibraryBrowseState } from '../import/CourseLibraryPicker';
import { chosenStudyTarget, onboardingDestination } from '../../onboarding/onboardingState';

// Keep the importer lazy, warming it only when the learner points to or focuses its action.
const loadCourseLibrary = () =>
  import('../import/CourseLibraryImport').then((module) => ({
    default: module.CourseLibraryImport,
  }));
const CourseLibraryImport = lazy(loadCourseLibrary);

interface NewCourseFormProps {
  onClose: () => void;
  inline?: boolean;
  /** Offer the course library first; onboarding has already shown it. */
  library?: boolean;
}

/** Create an empty course; steady retention is the default study target. */
export function NewCourseForm({ onClose, inline = false, library = true }: NewCourseFormProps) {
  const { notify } = useToast();
  const navigate = useNavigate();
  const present = useIsPresent();
  const trapRef = useFocusTrap(present && !inline, { autoFocusSelector: 'input, textarea' });
  const nameInputRef = useRef<HTMLInputElement>(null);
  const nameInputId = useId();
  const datePickerRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [timeZone] = useState(getLocalTimeZone);
  const [examDate, setExamDate] = useState(
    () => chosenStudyTarget()?.examDate ?? defaultExamDate(),
  );
  const [examDateValid, setExamDateValid] = useState(true);
  const [schedulingMode, setSchedulingMode] = useState<CourseSchedulingMode>(
    () => chosenStudyTarget()?.mode ?? 'steady',
  );
  // Onboarding has just asked about the exam, so the course takes that answer as it is.
  const [targetChosen] = useState(() => chosenStudyTarget() !== null);
  const [saving, setSaving] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [libraryBrowse, setLibraryBrowse] = useState<LibraryBrowseState>({
    query: '',
    subject: null,
  });
  // A library course being written must finish here, or its lineage confirmation is skipped.
  const [libraryBusy, setLibraryBusy] = useState(false);
  const close = () => {
    if (!saving && !libraryBusy) onClose();
  };
  const libraryButtonRef = useRef<HTMLButtonElement>(null);
  const returnToLibraryButton = useRef(false);
  useEffect(() => {
    if (!present || browsing) return;
    if (returnToLibraryButton.current) {
      returnToLibraryButton.current = false;
      libraryButtonRef.current?.focus();
    } else if (inline) nameInputRef.current?.focus();
  }, [present, inline, browsing]);

  useEffect(() => {
    // Fetch both route modules while the user names the course, without delaying creation.
    prefetchRoute('/course/new');
    prefetchRoute('/course/new/lesson/new');
  }, []);

  const canCreate = !saving;

  async function handleCreate() {
    if (saving) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Enter a course name before creating the course.');
      nameInputRef.current?.focus();
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
      const [{ createCourse }, { createLesson }] = await Promise.all([
        import('../../db/courseRepository'),
        import('../../db/lessonRepository'),
      ]);
      const course = await createCourse(
        trimmedName,
        schedulingMode === 'exam' ? { schedulingMode, examDate, timeZone } : { schedulingMode },
      );
      await createLesson(course.id, 'Lesson 1');
      onClose();
      void navigate(onboardingDestination(`/course/${course.id}`), {
        state: { focusNewCard: true },
      });
    } catch (err) {
      setSaving(false);
      notify(err instanceof Error ? err.message : 'Could not create the course.', 'negative');
    }
  }

  const onKeyDown = dialogKeyDown({
    onCancel: close,
    // The library has no course name to submit, so Ctrl+Enter there never creates one.
    onSubmit: () => {
      if (!browsing) void handleCreate();
    },
    enterSubmits: true,
    ignore: (target, key) =>
      key === 'Escape'
        ? !!target.closest('[data-date-time-picker-popover]')
        : !!target.closest('[data-date-time-picker]'),
  });
  const fields = (
    <>
      <div className="flex flex-col gap-5 px-6 py-6">
        {library && (
          <Button
            ref={libraryButtonRef}
            type="button"
            variant="secondary"
            className="w-full justify-start py-3"
            style={{ borderRadius: '1rem', paddingInline: '0.875rem', borderWidth: '1.5px' }}
            hoverScale={false}
            disabled={saving}
            onPointerEnter={() => void loadCourseLibrary().catch(() => {})}
            onFocus={() => void loadCourseLibrary().catch(() => {})}
            onClick={() => setBrowsing(true)}
          >
            <BookIcon width={18} height={18} aria-hidden="true" />
            Course library
          </Button>
        )}
        <div className="flex flex-col gap-2">
          <label htmlFor={nameInputId} className={fieldLabelClassName}>
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
              'w-full rounded-2xl border-[1.5px] bg-surface px-3.5 py-2.5 text-ink',
              nameError ? 'border-negative' : 'border-line focus:border-accent',
              'placeholder:text-ink-faint focus:outline-none focus-visible:shadow-[inset_0_0_0_1px_hsl(var(--accent-ink))]',
              'disabled:opacity-40',
            )}
          />
          {nameError && (
            <p id="new-course-name-error" role="alert" className="text-sm text-negative">
              {nameError}
            </p>
          )}
        </div>

        {!targetChosen && (
          <CourseStudyTarget
            schedulingMode={schedulingMode}
            setSchedulingMode={setSchedulingMode}
            saving={saving}
            datePickerRef={datePickerRef}
            examDate={examDate}
            setExamDate={setExamDate}
            setExamDateValid={setExamDateValid}
            timeZone={timeZone}
          />
        )}
      </div>

      <footer className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
        <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => void handleCreate()}
          disabled={!canCreate}
        >
          {saving ? 'Creating…' : 'Create'}
        </Button>
      </footer>
    </>
  );

  const backToForm = () => {
    returnToLibraryButton.current = true;
    setBrowsing(false);
  };

  // Outside the form, so Enter in the library search never submits it.
  const libraryView = (
    <Suspense
      fallback={
        <div
          className="px-6 pb-6 pt-2"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            backToForm();
          }}
        >
          <header className="mb-3 flex items-center justify-start">
            <Button
              type="button"
              variant="ghost"
              hoverScale={false}
              style={{ paddingInline: 12, gap: 6 }}
              autoFocus
              aria-label="Back to New course"
              onClick={backToForm}
            >
              <ChevronLeftIcon width={16} height={16} aria-hidden="true" />
              New course
            </Button>
          </header>
          <div
            aria-busy="true"
            aria-label="Loading the course library"
            className="flex flex-col gap-3"
          >
            <Skeleton className="h-[46px] rounded-2xl" />
            <div className="grid gap-1.5">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-14 rounded-2xl" />
              ))}
            </div>
          </div>
        </div>
      }
    >
      <CourseLibraryImport
        backLabel="New course"
        browse={libraryBrowse}
        onBrowseChange={setLibraryBrowse}
        onBack={backToForm}
        onBusyChange={setLibraryBusy}
        onOpenCourse={(courseId) => {
          onClose();
          void navigate(onboardingDestination(`/course/${courseId}`));
        }}
      />
    </Suspense>
  );

  const form = (
    <form
      aria-label="New course"
      onKeyDown={onKeyDown}
      onSubmit={(event) => {
        event.preventDefault();
        void handleCreate();
      }}
    >
      {fields}
    </form>
  );
  const content = (
    <MeasuredHeight>
      <StepSwap stepKey={browsing ? 'library' : 'form'} direction={browsing ? 1 : -1}>
        {browsing ? libraryView : form}
      </StepSwap>
    </MeasuredHeight>
  );

  if (inline) return content;

  return createPortal(
    <DialogPanel
      label="New course"
      trapRef={trapRef}
      onBackdropClick={close}
      className="max-w-md"
      overlayClassName="will-change-transform-opacity"
      onKeyDown={onKeyDown}
    >
      <DialogHeader title="New course" onClose={close} closeLabel="Close" />
      {content}
    </DialogPanel>,
    document.body,
  );
}
