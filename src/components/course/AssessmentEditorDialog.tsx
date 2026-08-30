import { useEffect, useRef, useState } from 'react';
import { m as motion } from 'motion/react';
import {
  AssessmentEditor,
  assessmentChanges,
  assessmentDraftIsSaveable,
  draftFromAssessment,
  emptyAssessmentDraft,
  type AssessmentDraft,
} from './AssessmentEditor';
import {
  createCourseAssessment,
  deleteCourseAssessment,
  updateCourseAssessment,
} from '../../db/repository';
import type { Card, CourseAssessment, Lesson, LessonCardLink } from '../../db/types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { Button } from '../ui/Button';
import { ConfirmInline } from '../ui/ConfirmInline';
import { useToast } from '../ui/Toast';
import { CloseIcon } from '../ui/icons';

interface AssessmentEditorDialogProps {
  courseId: string;
  assessment?: CourseAssessment;
  defaultAfterLessonId?: string | null;
  lessons: Lesson[];
  cards: Card[];
  links: LessonCardLink[];
  timeZone?: string;
  onSaved: () => void;
  onCancel: () => void;
}

/** Path-native checkpoint editor. The form remains shared with Course Settings. */
export function AssessmentEditorDialog({
  courseId,
  assessment,
  defaultAfterLessonId,
  lessons,
  cards,
  links,
  timeZone,
  onSaved,
  onCancel,
}: AssessmentEditorDialogProps) {
  const { notify } = useToast();
  const trapRef = useFocusTrap(true, { autoFocusSelector: '[data-assessment-name]' });
  const [motionSpeed] = useMotionSpeed();
  const motionMultiplier = speedMultiplier(motionSpeed);
  const kind = assessment?.kind ?? 'checkpoint';
  const [draft, setDraft] = useState<AssessmentDraft>(() => {
    if (assessment) return draftFromAssessment(assessment);
    const empty = emptyAssessmentDraft(lessons, timeZone);
    return defaultAfterLessonId === undefined
      ? empty
      : { ...empty, afterLessonId: defaultAfterLessonId };
  });
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const wasConfirmingDeleteRef = useRef(false);
  const noun = kind === 'final' ? 'final assessment' : 'checkpoint';

  useEffect(() => {
    if (wasConfirmingDeleteRef.current && !confirmingDelete) {
      deleteTriggerRef.current?.focus();
    }
    wasConfirmingDeleteRef.current = confirmingDelete;
  }, [confirmingDelete]);

  async function save() {
    setSaving(true);
    const changes = assessmentChanges(draft);
    try {
      if (assessment) {
        await updateCourseAssessment(assessment.id, changes);
      } else {
        const { name, examDate, ...options } = changes;
        await createCourseAssessment(
          courseId,
          name ?? 'Untitled assessment',
          examDate ?? draft.examDate,
          options,
        );
      }
      onSaved();
    } catch (error) {
      setSaving(false);
      notify(error instanceof Error ? error.message : 'Could not save the assessment.', 'negative');
    }
  }

  async function remove() {
    if (!assessment || assessment.kind === 'final') return;
    try {
      await deleteCourseAssessment(assessment.id);
      onSaved();
    } catch (error) {
      setConfirmingDelete(false);
      notify(
        error instanceof Error ? error.message : 'Could not delete the assessment.',
        'negative',
      );
    }
  }

  return (
    <motion.div
      ref={trapRef}
      className="fixed inset-0 z-50 flex flex-col"
      initial={motionMultiplier > 0 ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={motionMultiplier > 0 ? { opacity: 0 } : undefined}
      transition={{ duration: 0.16 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
      onKeyDown={(event) => {
        if (event.key === 'Tab') return;
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={assessment ? `Edit ${noun}` : 'Add checkpoint'}
        initial={motionMultiplier > 0 ? { opacity: 0, y: 16, scale: 0.98 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={motionMultiplier > 0 ? { opacity: 0, y: 16, scale: 0.98 } : undefined}
        transition={
          motionMultiplier > 0 ? { type: 'spring', stiffness: 320, damping: 30 } : { duration: 0 }
        }
        className="relative z-10 m-auto flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-line-strong bg-paper shadow-2xl shadow-black/20"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-dot-grid opacity-20"
          aria-hidden="true"
        />
        <header className="relative flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="font-display text-xl">
              {assessment ? `Edit ${noun}` : 'Add checkpoint'}
            </h2>
            <p className="mt-0.5 text-xs text-ink-faint">
              Place it on the course path and set its scope.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close editor"
            title="Close (Esc)"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <CloseIcon width={18} height={18} />
          </button>
        </header>
        <div className="relative flex-1 overflow-y-auto px-6 py-6">
          <AssessmentEditor
            courseId={courseId}
            kind={kind}
            draft={draft}
            onChange={setDraft}
            lessons={lessons}
            cards={cards}
            links={links}
            timeZone={timeZone}
            initialNameFocusTarget
          />
        </div>
        <footer className="relative flex items-center justify-between gap-3 border-t border-line px-6 py-4">
          {assessment?.kind === 'checkpoint' ? (
            confirmingDelete ? (
              <ConfirmInline
                message="Delete checkpoint?"
                cancelLabel="Keep checkpoint"
                announce
                focusOnMount="cancel"
                onConfirm={() => void remove()}
                onCancel={() => setConfirmingDelete(false)}
              />
            ) : (
              <Button
                ref={deleteTriggerRef}
                variant="danger"
                size="sm"
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </Button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void save()}
              disabled={
                saving || !assessmentDraftIsSaveable(courseId, kind, draft, lessons, cards, links)
              }
            >
              Save {noun}
            </Button>
          </div>
        </footer>
      </motion.div>
    </motion.div>
  );
}
