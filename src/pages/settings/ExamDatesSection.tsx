import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import {
  AssessmentEditor,
  assessmentChanges,
  assessmentDraftIsSaveable,
  draftFromAssessment,
  emptyAssessmentDraft,
  type AssessmentDraft,
} from '../../components/course/AssessmentEditor';
import { Button } from '../../components/ui/Button';
import { ConfirmInline } from '../../components/ui/ConfirmInline';
import { EditIcon, PlusIcon, TrashIcon } from '../../components/ui/icons';
import { motionTransition } from '../../components/ui/motion';
import { StepSwap } from '../../components/ui/StepSwap';
import { useToast } from '../../components/ui/Toast';
import { resolveAssessmentCoverage } from '../../course/assessmentCoverage';
import {
  createCourseAssessment,
  deleteCourseAssessment,
  updateCourseAssessment,
} from '../../db/repository';
import { db } from '../../db/schema';
import type { CourseAssessment } from '../../db/types';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { useCourseAssessments, useCourseCards, useLessons } from '../../state/useCourseData';
import { formatDateTime } from '../../utils/datetime';

export interface ExamDatesSectionProps {
  courseId: string;
  timeZone?: string;
  editFinalOnMount?: boolean;
}

function focusCurrentAssessmentEditor(
  panels: ReadonlyMap<string, HTMLElement>,
  editingId: string,
): void {
  panels
    .get(editingId)
    ?.querySelector<HTMLElement>('[data-assessment-name]')
    ?.focus();
}

export function ExamDatesSection({ courseId, timeZone, editFinalOnMount }: ExamDatesSectionProps) {
  const assessments = useCourseAssessments(courseId);
  const lessons = useLessons(courseId);
  const cards = useCourseCards(courseId);
  const lessonIds = (lessons ?? []).map((lesson) => lesson.id);
  const links = useLiveQuery(
    () => (lessonIds.length ? db.lessonCards.where('lessonId').anyOf(lessonIds).toArray() : []),
    [lessonIds.join(',')],
  );
  const { notify } = useToast();
  const [motionSpeed] = useMotionSpeed();
  const motionMultiplier = speedMultiplier(motionSpeed);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<AssessmentDraft>();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const loaded = assessments && lessons && cards && links;
  const openedRequestedFinal = useRef(false);
  const editorPanels = useRef(new Map<string, HTMLDivElement>());
  const addButton = useRef<HTMLButtonElement>(null);
  const editButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusReturn = useRef<string | 'add' | null>(null);

  function startAdd() {
    if (!lessons) return;
    setDraft(emptyAssessmentDraft(lessons, timeZone));
    setEditingId('new');
  }

  function startEdit(assessment: CourseAssessment) {
    setDraft(draftFromAssessment(assessment));
    setEditingId(assessment.id);
  }

  function cancel() {
    setEditingId(null);
    setDraft(undefined);
  }

  useLayoutEffect(() => {
    if (editingId) {
      focusCurrentAssessmentEditor(editorPanels.current, editingId);
      return;
    }
    const target = focusReturn.current;
    if (!target) return;
    focusReturn.current = null;
    if (target === 'add') addButton.current?.focus();
    else editButtons.current.get(target)?.focus();
  }, [editingId]);

  useEffect(() => {
    if (!editFinalOnMount || !loaded || openedRequestedFinal.current) return;
    const final = assessments.find((assessment) => assessment.kind === 'final');
    if (!final) return;
    openedRequestedFinal.current = true;
    startEdit(final);
  }, [assessments, editFinalOnMount, loaded]);

  async function save() {
    if (!draft || !loaded) return;
    const changes = assessmentChanges(draft);
    try {
      if (editingId === 'new') {
        const { name, examDate, ...options } = changes;
        await createCourseAssessment(
          courseId,
          name ?? 'Untitled assessment',
          examDate ?? draft.examDate,
          options,
        );
      } else if (editingId) {
        await updateCourseAssessment(editingId, changes);
      }
      cancel();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not save the assessment.', 'negative');
    }
  }

  async function remove(id: string) {
    try {
      await deleteCourseAssessment(id);
      if (editingId === id) {
        focusReturn.current = 'add';
        cancel();
      }
      setConfirmDeleteId(null);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Could not delete the assessment.',
        'negative',
      );
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-faint">
        Place assessments on the path, then choose everything taught so far or an explicit set of
        lessons. Assessments never lock later lessons.
      </p>

      <AnimatePresence initial={false} mode="popLayout">
        {loaded &&
          assessments.map((assessment) => {
            const resolved = resolveAssessmentCoverage(assessment, lessons, cards, links);
            return (
              <motion.div
                key={assessment.id}
                layout={motionMultiplier > 0 ? 'position' : undefined}
                initial={motionMultiplier > 0 ? { opacity: 0, y: -4 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={motionMultiplier > 0 ? { opacity: 0, y: -4 } : undefined}
                transition={motionTransition('feedback', motionMultiplier)}
                className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm text-ink">
                    <span>{assessment.name}</span>
                    {assessment.kind === 'final' && (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] text-accent">
                        Final
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-faint">
                    {assessment.examDate === undefined
                      ? 'Steady retention'
                      : formatDateTime(assessment.examDate, assessment.timeZone ?? timeZone)}{' '}
                    · {resolved.coveredLessons.length} lesson
                    {resolved.coveredLessons.length === 1 ? '' : 's'} · {resolved.cards.length} card
                    {resolved.cards.length === 1 ? '' : 's'}
                  </div>
                  {resolved.validation.needsAuthorConfirmation && (
                    <div className="mt-1 text-xs text-negative">Needs author review</div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  {confirmDeleteId === assessment.id ? (
                    <ConfirmInline
                      message="Delete?"
                      onConfirm={() => void remove(assessment.id)}
                      onCancel={() => setConfirmDeleteId(null)}
                    />
                  ) : (
                    <>
                      <Button
                        ref={(button) => {
                          if (button) editButtons.current.set(assessment.id, button);
                          else editButtons.current.delete(assessment.id);
                        }}
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          focusReturn.current = assessment.id;
                          startEdit(assessment);
                        }}
                        aria-label={`Edit ${assessment.name}`}
                      >
                        <EditIcon width={16} height={16} />
                      </Button>
                      {assessment.kind === 'checkpoint' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDeleteId(assessment.id)}
                          aria-label={`Delete ${assessment.name}`}
                        >
                          <TrashIcon width={16} height={16} />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            );
          })}
      </AnimatePresence>

      <div>
        <StepSwap stepKey={editingId ? `editor-${editingId}` : 'add'}>
          {editingId && draft && loaded ? (
            <div
              ref={(panel) => {
                if (panel) editorPanels.current.set(editingId, panel);
                else editorPanels.current.delete(editingId);
              }}
              className="flex flex-col gap-4 rounded-lg border border-line-strong bg-surface px-4 py-4"
            >
              <AssessmentEditor
                courseId={courseId}
                kind={
                  editingId === 'new'
                    ? 'checkpoint'
                    : (assessments.find((assessment) => assessment.id === editingId)?.kind ??
                      'checkpoint')
                }
                draft={draft}
                onChange={setDraft}
                lessons={lessons}
                cards={cards}
                links={links}
                timeZone={timeZone}
                initialNameFocusTarget
              />
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void save()}
                  disabled={
                    !assessmentDraftIsSaveable(
                      courseId,
                      editingId === 'new'
                        ? 'checkpoint'
                        : (assessments.find((assessment) => assessment.id === editingId)?.kind ??
                            'checkpoint'),
                      draft,
                      lessons,
                      cards,
                      links,
                    )
                  }
                >
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={cancel}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              ref={addButton}
              variant="secondary"
              size="sm"
              onClick={() => {
                focusReturn.current = 'add';
                startAdd();
              }}
              className="self-start"
            >
              <PlusIcon width={16} height={16} />
              Add checkpoint
            </Button>
          )}
        </StepSwap>
      </div>
    </div>
  );
}
