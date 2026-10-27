import { useMemo, useRef, useState } from 'react';
import { resolveAssessmentCoverage } from '../../course/assessmentCoverage';
import { resolveLessonOrder } from '../../course/lessonOrder';
import {
  createCourseAssessment,
  deleteCourseAssessment,
  updateCourseAssessment,
} from '../../db/assessmentRepository';
import type { Card, CourseAssessment, Lesson, LessonCardLink } from '../../db/types';
import { DateTimePicker } from '../ui/DateTimePicker';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { choiceChipClass } from '../ui/choiceChip';
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
import { defaultExamDate } from '../../utils/datetime';

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
  onSaved: (assessmentId?: string) => void;
}) {
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
  const savedAssessmentId = useRef<string | undefined>(undefined);
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
    () => resolveAssessmentCoverage(record, orderedLessons, cards, links, preferredLessonIds),
    [record, orderedLessons, cards, links, preferredLessonIds],
  );
  const candidates = useMemo(
    () =>
      resolveAssessmentCoverage(
        { ...record, excludedCardIds: [] },
        orderedLessons,
        cards,
        links,
        preferredLessonIds,
      ),
    [record, orderedLessons, cards, links, preferredLessonIds],
  );

  function changeCoverage(next: AssessmentDraft) {
    setError('');
    if (schoolTest && next.coverageMode === 'custom') {
      next = {
        ...next,
        afterLessonId:
          orderedLessons.findLast((lesson) => next.lessonIds.includes(lesson.id))?.id ?? null,
      };
    }
    const scope = resolveAssessmentCoverage(
      { ...record, ...assessmentChanges(next), excludedCardIds: [] } as CourseAssessment,
      orderedLessons,
      cards,
      links,
      preferredLessonIds,
    );
    const ids = new Set(scope.cards.map((card) => card.id));
    setDraft({ ...next, excludedCardIds: next.excludedCardIds.filter((id) => ids.has(id)) });
  }
  async function save() {
    if (!draft.name.trim()) {
      setError('Enter a name.');
      name.current?.focus();
      return false;
    }
    if (!dateValid && draft.schedulingMode === 'exam') {
      setError('Enter a valid date and time.');
      name.current
        ?.closest('[data-path-editor-surface]')
        ?.querySelector<HTMLElement>('[data-date-time-picker] button')
        ?.focus();
      return false;
    }
    if (!resolved.validation.valid || resolved.validation.needsAuthorConfirmation) {
      setError(
        schoolTest && draft.coverageMode === 'custom' && draft.lessonIds.length === 0
          ? 'Choose at least one lesson for this test.'
          : (resolved.validation.issues[0]?.message ?? 'Confirm the assessment’s scope.'),
      );
      coverage.current?.querySelector('button')?.focus();
      return false;
    }
    try {
      const changes = assessmentChanges(draft);
      if (assessment) {
        if (learnerOwnedOnly)
          await updateCourseAssessment(assessment.id, changes, { learnerOwnedOnly: true });
        else await updateCourseAssessment(assessment.id, changes);
        savedAssessmentId.current = assessment.id;
      } else {
        const { name, examDate, ...options } = changes;
        const created = await createCourseAssessment(
          courseId,
          name!,
          examDate ?? draft.examDate,
          options,
        );
        savedAssessmentId.current = created?.id;
      }
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the assessment.');
      return false;
    }
  }
  async function remove() {
    if (!assessment || kind === 'final') return false;
    try {
      if (learnerOwnedOnly) await deleteCourseAssessment(assessment.id, { learnerOwnedOnly: true });
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
        schoolTest
          ? assessment
            ? 'Edit test'
            : 'Add test'
          : assessment
            ? `Edit ${kind === 'final' ? 'final assessment' : 'checkpoint'}`
            : 'Add checkpoint'
      }
      onSave={save}
      onClosed={() => onSaved(savedAssessmentId.current)}
      cancellable={schoolTest}
      onDelete={assessment && kind !== 'final' ? remove : undefined}
      deleteNoun={schoolTest ? 'test' : 'checkpoint'}
    >
      <p className="path-editor-sentence">
        <input
          ref={name}
          aria-label="Name"
          aria-invalid={(!!error && !draft.name.trim()) || undefined}
          aria-describedby={error ? 'assessment-path-error' : undefined}
          data-path-editor-focus
          className="path-editor-name"
          value={draft.name}
          placeholder={
            kind === 'final'
              ? 'Final exam'
              : schoolTest
                ? 'e.g. Cells topic test'
                : 'Checkpoint name'
          }
          onChange={(event) => {
            setDraft({ ...draft, name: event.target.value });
            setError('');
          }}
        />{' '}
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
          <>for steady retention</>
        )}
        , covering{' '}
        <span ref={coverage}>
          <PathEditorPopover
            label={
              draft.coverageMode === 'prefix'
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
      </p>
      {error && (
        <p id="assessment-path-error" role="alert" className="mt-2 text-sm text-negative">
          {error}
        </p>
      )}
      {schoolTest && (
        <p className="mt-3 text-sm text-ink-soft">
          Choose the lessons in your test. Revision uses your existing cards and progress.
        </p>
      )}
      <AnimatedDisclosure open={draft.coverageMode === 'custom'}>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Covered lessons">
          {orderedLessons.map((lesson, index) => (
            <button
              key={lesson.id}
              type="button"
              aria-pressed={draft.lessonIds.includes(lesson.id)}
              disabled={!schoolTest && index > resolved.placementIndex}
              className={choiceChipClass(draft.lessonIds.includes(lesson.id))}
              onClick={() =>
                changeCoverage({
                  ...draft,
                  lessonIds: draft.lessonIds.includes(lesson.id)
                    ? draft.lessonIds.filter((id) => id !== lesson.id)
                    : [...draft.lessonIds, lesson.id],
                })
              }
            >
              {lesson.name}
            </button>
          ))}
        </div>
      </AnimatedDisclosure>
      <p className="mt-3 text-sm text-ink-faint">
        {resolved.coveredLessons.length} lesson{resolved.coveredLessons.length === 1 ? '' : 's'} ·{' '}
        {resolved.cards.length} card{resolved.cards.length === 1 ? '' : 's'}
      </p>
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
      {kind === 'final' && (
        <div>
          <PathEditorPopover quiet label="Study target">
            {(close) => (
              <>
                {(['exam', 'steady'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className="path-editor-option"
                    aria-pressed={draft.schedulingMode === mode}
                    onClick={() => {
                      setDraft({ ...draft, schedulingMode: mode });
                      close();
                    }}
                  >
                    {mode === 'exam' ? 'Exam date' : 'Steady retention'}
                  </button>
                ))}
              </>
            )}
          </PathEditorPopover>
        </div>
      )}
      {resolved.validation.needsAuthorConfirmation && (
        <button
          type="button"
          className="path-editor-quiet text-ink-soft"
          onClick={() => setDraft({ ...draft, needsAuthorConfirmation: false })}
        >
          I have checked this assessment’s placement and scope.
        </button>
      )}
    </PathEditorSurface>
  );
}
