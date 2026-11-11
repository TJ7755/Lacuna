import { useMemo, useRef, useState } from 'react';
import { resolveAssessmentCoverage } from '../../course/assessmentCoverage';
import { resolveLessonOrder } from '../../course/lessonOrder';
import {
  createCourseAssessment,
  deleteCourseAssessment,
  updateCourseAssessment,
} from '../../db/assessmentRepository';
import type { Card, CourseAssessment, Lesson, LessonCardLink } from '@lacuna/core/db/types';
import { DateTimePicker } from '../ui/DateTimePicker';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { AssessmentLessonPicker } from './AssessmentLessonPicker';
import { useToast } from '../ui/Toast';
import {
  assessmentChanges,
  draftFromAssessment,
  emptyAssessmentDraft,
  type AssessmentDraft,
} from './AssessmentEditor';
import { PathEditorSurface } from './PathEditorSurface';
import { PathEditorPopover } from './PathEditorPopover';
import { AssessmentExclusions } from './AssessmentExclusions';
import { useAssessmentSpecification } from '../../state/useAssessmentSpecification';
import { defaultExamDate } from '../../utils/datetime';
import { AssessmentCoverageDetails } from './AssessmentCoverageDetails';

export function AssessmentPathEditor({
  courseId,
  assessment,
  defaultAfterLessonId,
  lessons,
  cards,
  links,
  timeZone,
  preferredLessonIds,
  learnerOwnedOnly = false,
  schoolTest = false,
  schedulingOnly = false,
  onSaved,
}: {
  courseId: string;
  assessment?: CourseAssessment;
  defaultAfterLessonId?: string | null;
  lessons: Lesson[];
  cards: Card[];
  links: LessonCardLink[];
  timeZone?: string;
  preferredLessonIds?: readonly string[];
  learnerOwnedOnly?: boolean;
  schoolTest?: boolean;
  schedulingOnly?: boolean;
  onSaved: () => void;
}) {
  const specificationContext = useAssessmentSpecification(courseId);
  const orderedLessons = useMemo(
    () => resolveLessonOrder(lessons, preferredLessonIds),
    [lessons, preferredLessonIds],
  );
  const kind = assessment?.kind ?? 'checkpoint';
  const [draft, setDraft] = useState<AssessmentDraft>(() =>
    assessment
      ? draftFromAssessment(assessment)
      : {
          ...emptyAssessmentDraft(orderedLessons, timeZone),
          ...(defaultAfterLessonId !== undefined ? { afterLessonId: defaultAfterLessonId } : {}),
          ...(schoolTest
            ? { coverageMode: 'custom', lessonIds: [], examDate: defaultExamDate() }
            : {}),
        },
  );
  const [error, setError] = useState('');
  const [exclusionOpen, setExclusionOpen] = useState(false);
  const exclusionTrigger = useRef<HTMLButtonElement>(null);
  const [dateValid, setDateValid] = useState(true);
  const name = useRef<HTMLInputElement>(null);
  const coverage = useRef<HTMLSpanElement>(null);
  const { notify } = useToast();
  const record = useMemo(
    () =>
      ({
        id: 'draft',
        courseId,
        kind,
        createdAt: 0,
        updatedAt: 0,
        ...assessmentChanges(draft),
      }) as CourseAssessment,
    [courseId, draft, kind],
  );
  const resolved = useMemo(
    () =>
      resolveAssessmentCoverage(
        record,
        orderedLessons,
        cards,
        links,
        preferredLessonIds,
        specificationContext,
      ),
    [record, orderedLessons, cards, links, preferredLessonIds, specificationContext],
  );
  const candidates = useMemo(
    () =>
      resolveAssessmentCoverage(
        { ...record, excludedCardIds: [] },
        orderedLessons,
        cards,
        links,
        preferredLessonIds,
        specificationContext,
      ),
    [record, orderedLessons, cards, links, preferredLessonIds, specificationContext],
  );

  function changeCoverage(next: AssessmentDraft) {
    const scope = resolveAssessmentCoverage(
      { ...record, ...assessmentChanges(next), excludedCardIds: [] } as CourseAssessment,
      orderedLessons,
      cards,
      links,
      preferredLessonIds,
      specificationContext,
    );
    const ids = new Set(scope.cards.map((card) => card.id));
    setDraft({ ...next, excludedCardIds: next.excludedCardIds.filter((id) => ids.has(id)) });
  }
  async function save(nextDraft = draft) {
    if (
      schedulingOnly &&
      assessment &&
      nextDraft.examDate === (assessment.examDate ?? nextDraft.examDate) &&
      nextDraft.schedulingMode === (assessment.schedulingMode ?? 'exam')
    )
      return true;
    if (!nextDraft.name.trim()) {
      setError('Enter a name.');
      name.current?.focus();
      return false;
    }
    if (!dateValid && nextDraft.schedulingMode === 'exam') {
      setError('Enter a valid date and time.');
      name.current
        ?.closest('[data-path-editor-surface]')
        ?.querySelector<HTMLElement>('[data-date-time-picker] button')
        ?.focus();
      return false;
    }
    if (
      !resolved.validation.valid ||
      (!schedulingOnly && resolved.validation.needsAuthorConfirmation) ||
      (schoolTest && resolved.coveredLessons.length === 0)
    ) {
      setError(
        resolved.validation.issues[0]?.message ??
          (schoolTest && resolved.coveredLessons.length === 0
            ? 'Choose at least one lesson for this test.'
            : 'Confirm the assessment’s scope.'),
      );
      coverage.current?.querySelector('button')?.focus();
      return false;
    }
    try {
      const changes = schedulingOnly
        ? {
            examDate: nextDraft.schedulingMode === 'exam' ? nextDraft.examDate : undefined,
            timeZone:
              nextDraft.schedulingMode === 'exam' ? (nextDraft.timeZone ?? timeZone) : undefined,
            schedulingMode: nextDraft.schedulingMode === 'steady' ? ('steady' as const) : undefined,
          }
        : assessmentChanges(nextDraft);
      if (schoolTest && nextDraft.coverageMode === 'prefix') {
        changes.coverageMode = 'custom';
        changes.lessonIds = resolved.coveredLessons.map((lesson) => lesson.id);
      }
      if (assessment) {
        if (learnerOwnedOnly)
          await updateCourseAssessment(assessment.id, changes, { learnerOwnedOnly: true });
        else await updateCourseAssessment(assessment.id, changes);
      } else {
        const { name, examDate, ...options } = changes;
        await createCourseAssessment(courseId, name!, examDate ?? nextDraft.examDate, options);
      }
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the assessment.');
      return false;
    }
  }
  async function remove() {
    if (!assessment) return false;
    try {
      if (kind === 'final') return save({ ...draft, schedulingMode: 'steady' });
      else if (schedulingOnly) return false;
      else if (learnerOwnedOnly)
        await deleteCourseAssessment(assessment.id, { learnerOwnedOnly: true });
      else await deleteCourseAssessment(assessment.id);
      return true;
    } catch (cause) {
      notify(
        cause instanceof Error ? cause.message : 'Could not delete the assessment.',
        'negative',
      );
      return false;
    }
  }
  const exclusionButton = (quiet = false) => (
    <button
      ref={exclusionTrigger}
      type="button"
      aria-expanded={exclusionOpen}
      aria-haspopup="dialog"
      aria-controls="assessment-exclusions"
      className={quiet ? 'path-editor-quiet text-ink-soft' : 'path-editor-chip'}
      onClick={() => setExclusionOpen(!exclusionOpen)}
    >
      {quiet
        ? 'Leave some cards out'
        : `${draft.excludedCardIds.length} card${draft.excludedCardIds.length === 1 ? '' : 's'}`}
    </button>
  );
  return (
    <PathEditorSurface
      label={
        assessment
          ? schedulingOnly
            ? `${assessment.name} details`
            : `Edit ${kind === 'final' ? 'final assessment' : 'checkpoint'}`
          : schoolTest
            ? 'Add test'
            : 'Add checkpoint'
      }
      onSave={() => save()}
      onClosed={onSaved}
      onDelete={
        assessment && (kind === 'final' ? assessment.examDate !== undefined : !schedulingOnly)
          ? remove
          : undefined
      }
      deleteLabel={kind === 'final' ? 'Remove exam date' : undefined}
      deleteNoun={kind === 'final' ? 'exam date' : 'checkpoint'}
      wide={!schedulingOnly && draft.coverageMode === 'custom'}
    >
      <p className="path-editor-sentence">
        {schedulingOnly ? (
          <strong className="text-ink">{draft.name}</strong>
        ) : (
          <input
            ref={name}
            aria-label="Name"
            aria-invalid={(!!error && !draft.name.trim()) || undefined}
            aria-describedby={error ? 'assessment-path-error' : undefined}
            data-path-editor-focus
            className="path-editor-name"
            value={draft.name}
            placeholder={
              kind === 'final' ? 'Final exam' : schoolTest ? 'Test name' : 'Checkpoint name'
            }
            onChange={(event) => {
              setDraft({ ...draft, name: event.target.value });
              setError('');
            }}
          />
        )}{' '}
        {draft.schedulingMode === 'exam' ? (
          <>
            on{' '}
            <DateTimePicker
              value={draft.examDate}
              onChange={(examDate) => setDraft({ ...draft, examDate })}
              onValidityChange={setDateValid}
              timeZone={draft.timeZone ?? timeZone}
              appearance="chip"
            />
          </>
        ) : (
          <button
            type="button"
            className="path-editor-chip"
            onClick={() => setDraft({ ...draft, schedulingMode: 'exam' })}
          >
            Add exam date
          </button>
        )}
        {!schedulingOnly && (
          <>
            , covering{' '}
            <span ref={coverage}>
              <PathEditorPopover
                label={
                  draft.coverageMode === 'specification'
                    ? (draft.specificationPaperId ??
                      `${draft.specificationPointIds?.length ?? 0} specification points`)
                    : draft.coverageMode === 'prefix'
                      ? 'everything so far'
                      : `${draft.lessonIds.length} chosen lesson${draft.lessonIds.length === 1 ? '' : 's'}`
                }
              >
                {(close) => (
                  <>
                    {(['prefix', 'custom'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className="path-editor-option"
                        aria-pressed={draft.coverageMode === mode}
                        onClick={() => {
                          changeCoverage({
                            ...draft,
                            coverageMode: mode,
                            lessonIds:
                              mode === 'custom' && !draft.lessonIds.length
                                ? resolved.coveredLessons.map((lesson) => lesson.id)
                                : draft.lessonIds,
                          });
                          close();
                        }}
                      >
                        {mode === 'prefix' ? 'Everything so far' : 'Chosen lessons'}
                      </button>
                    ))}
                  </>
                )}
              </PathEditorPopover>
            </span>
            {draft.excludedCardIds.length > 0 && <>, except {exclusionButton()}</>}.
          </>
        )}
      </p>
      {error && (
        <p id="assessment-path-error" role="alert" className="mt-2 text-sm text-negative">
          {error}
        </p>
      )}
      {schedulingOnly && assessment ? (
        <AssessmentCoverageDetails assessment={assessment} cards={cards} resolved={resolved} />
      ) : (
        <>
          <AnimatedDisclosure open={draft.coverageMode === 'custom'}>
            <AssessmentLessonPicker
              lessons={orderedLessons}
              lessonIds={draft.lessonIds}
              onChange={(lessonIds) => changeCoverage({ ...draft, lessonIds })}
            />
          </AnimatedDisclosure>
          {draft.coverageMode !== 'custom' && (
            <p className="mt-3 text-sm text-ink-faint">
              {resolved.coveredLessons.length} lesson
              {resolved.coveredLessons.length === 1 ? '' : 's'}, {resolved.cards.length} card
              {resolved.cards.length === 1 ? '' : 's'}
            </p>
          )}
          {draft.excludedCardIds.length === 0 && candidates.cards.length > 0 && (
            <div>{exclusionButton(true)}</div>
          )}
          <AssessmentExclusions
            open={exclusionOpen}
            trigger={exclusionTrigger}
            close={() => {
              setExclusionOpen(false);
              exclusionTrigger.current?.focus();
            }}
            lessons={candidates.coveredLessons}
            cards={candidates.cards}
            links={links}
            excluded={draft.excludedCardIds}
            onChange={(excludedCardIds) => setDraft({ ...draft, excludedCardIds })}
          />
          {resolved.validation.needsAuthorConfirmation && (
            <button
              type="button"
              className="path-editor-quiet text-ink-soft"
              onClick={() => setDraft({ ...draft, needsAuthorConfirmation: false })}
            >
              I have checked this assessment’s placement and scope.
            </button>
          )}
        </>
      )}
    </PathEditorSurface>
  );
}
