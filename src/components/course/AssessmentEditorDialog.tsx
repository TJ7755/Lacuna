import { useEffect, useRef, useState } from 'react';
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
} from '../../db/assessmentRepository';
import type { Card, CourseAssessment, Lesson, LessonCardLink } from '../../db/types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '../ui/Button';
import { ConfirmInline } from '../ui/ConfirmInline';
import { useToast } from '../ui/Toast';
import { DialogHeader, DialogPanel } from '../ui/DialogPanel';

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
    <DialogPanel
      label={assessment ? `Edit ${noun}` : 'Add checkpoint'}
      trapRef={trapRef}
      onBackdropClick={onCancel}
      className="max-h-[90vh] max-w-lg"
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
      <DialogHeader
        title={assessment ? `Edit ${noun}` : 'Add checkpoint'}
        description="Place it on the course path and set its scope."
        onClose={onCancel}
        closeLabel="Close editor"
      />
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
    </DialogPanel>
  );
}
