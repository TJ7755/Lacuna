import { useMemo, useState } from 'react';
import { resolveAssessmentCoverage } from '../../course/assessmentCoverage';
import type {
  Card,
  CourseAssessment,
  CourseSchedulingMode,
  Lesson,
  LessonCardLink,
} from '../../db/types';
import { defaultExamDate } from '../../utils/datetime';
import { DateTimePicker } from '../ui/DateTimePicker';
import { StudyTargetTiles } from './CourseStudyTarget';
import {
  Field,
  Input,
  inputClassName,
  fieldLabelClassName,
  inputFrameClassName,
} from '../ui/Field';
import { choiceChipClass } from '../ui/choiceChip';
import { plainFront } from '../cards/lessonCardRow';
import { useAssessmentSpecification } from '../../state/useAssessmentSpecification';
import type { AssessmentSpecificationContext } from '../../course/assessmentCoverage';
import { papersForSelection, pointsForSelection } from '../../specifications/selection';

export interface AssessmentDraft {
  name: string;
  schedulingMode: CourseSchedulingMode;
  examDate: number;
  timeZone?: string;
  afterLessonId: string | null;
  coverageMode: CourseAssessment['coverageMode'];
  lessonIds: string[];
  excludedCardIds: string[];
  needsAuthorConfirmation?: boolean;
  specificationPaperId?: string;
  specificationPointIds?: string[];
}

export function draftFromAssessment(assessment: CourseAssessment): AssessmentDraft {
  return {
    name: assessment.name,
    schedulingMode: assessment.schedulingMode ?? 'exam',
    examDate: assessment.examDate ?? defaultExamDate(),
    timeZone: assessment.timeZone,
    afterLessonId: assessment.afterLessonId,
    coverageMode: assessment.coverageMode,
    lessonIds: assessment.coverageMode === 'custom' ? [...assessment.lessonIds] : [],
    excludedCardIds: [...assessment.excludedCardIds],
    needsAuthorConfirmation: assessment.needsAuthorConfirmation,
    specificationPaperId: assessment.specificationPaperId,
    specificationPointIds: assessment.specificationPointIds,
  };
}

export function emptyAssessmentDraft(lessons: Lesson[], timeZone?: string): AssessmentDraft {
  return {
    name: '',
    schedulingMode: 'exam',
    examDate: Date.now(),
    timeZone,
    afterLessonId: lessons[lessons.length - 1]?.id ?? null,
    coverageMode: 'prefix',
    lessonIds: [],
    excludedCardIds: [],
  };
}

export function assessmentChanges(draft: AssessmentDraft): Partial<CourseAssessment> {
  const common = {
    name: draft.name.trim() || 'Untitled assessment',
    schedulingMode: draft.schedulingMode === 'steady' ? ('steady' as const) : undefined,
    examDate: draft.schedulingMode === 'exam' ? draft.examDate : undefined,
    timeZone: draft.schedulingMode === 'exam' ? draft.timeZone : undefined,
    afterLessonId: draft.afterLessonId,
    excludedCardIds: draft.excludedCardIds,
    needsAuthorConfirmation: draft.needsAuthorConfirmation,
  };
  if (draft.coverageMode === 'specification') {
    return draft.specificationPaperId
      ? {
          ...common,
          coverageMode: 'specification',
          specificationPaperId: draft.specificationPaperId,
          specificationPointIds: undefined,
          lessonIds: undefined,
        }
      : {
          ...common,
          coverageMode: 'specification',
          specificationPaperId: undefined,
          specificationPointIds: draft.specificationPointIds ?? [],
          lessonIds: undefined,
        };
  }
  const lessonCoverage = {
    ...common,
    specificationPaperId: undefined,
    specificationPointIds: undefined,
  };
  return draft.coverageMode === 'custom'
    ? { ...lessonCoverage, coverageMode: 'custom', lessonIds: draft.lessonIds }
    : { ...lessonCoverage, coverageMode: 'prefix', lessonIds: undefined };
}

interface AssessmentEditorProps {
  courseId: string;
  kind: CourseAssessment['kind'];
  draft: AssessmentDraft;
  onChange: (draft: AssessmentDraft) => void;
  lessons: Lesson[];
  cards: Card[];
  links: LessonCardLink[];
  timeZone?: string;
  initialNameFocusTarget?: boolean;
}

export function AssessmentEditor({
  courseId,
  kind,
  draft,
  onChange,
  lessons,
  cards,
  links,
  timeZone,
  initialNameFocusTarget = false,
}: AssessmentEditorProps) {
  const [query, setQuery] = useState('');
  const specificationContext = useAssessmentSpecification(courseId);
  const { course } = specificationContext;
  const spec = course?.specificationData;
  const selection = course?.specificationRef;
  const papers = spec && selection ? papersForSelection(spec, selection) : [];
  const points = spec && selection ? pointsForSelection(spec, selection) : [];
  const assessment = useMemo(
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
      resolveAssessmentCoverage(assessment, lessons, cards, links, undefined, specificationContext),
    [assessment, cards, lessons, links, specificationContext],
  );
  const candidates = useMemo(
    () =>
      resolveAssessmentCoverage(
        { ...assessment, excludedCardIds: [] },
        lessons,
        cards,
        links,
        undefined,
        specificationContext,
      ).cards,
    [assessment, cards, lessons, links, specificationContext],
  );
  const coveredLessonIds = new Set(resolved.coveredLessons.map((lesson) => lesson.id));
  const normalisedQuery = query.trim().toLocaleLowerCase();
  const cardLessonIds = useMemo(() => {
    const result = new Map<string, string[]>();
    for (const card of candidates) {
      const ids = new Set<string>();
      if (card.primaryLessonId) ids.add(card.primaryLessonId);
      for (const link of links) if (link.cardId === card.id) ids.add(link.lessonId);
      result.set(card.id, [...ids]);
    }
    return result;
  }, [candidates, links]);

  function toggleLesson(lessonId: string) {
    onChange({
      ...draft,
      lessonIds: draft.lessonIds.includes(lessonId)
        ? draft.lessonIds.filter((id) => id !== lessonId)
        : [...draft.lessonIds, lessonId],
    });
  }

  function toggleExcludedCard(cardId: string) {
    onChange({
      ...draft,
      excludedCardIds: draft.excludedCardIds.includes(cardId)
        ? draft.excludedCardIds.filter((id) => id !== cardId)
        : [...draft.excludedCardIds, cardId],
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Name">
        <Input
          data-assessment-name={initialNameFocusTarget ? '' : undefined}
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          placeholder={kind === 'final' ? 'Final exam' : 'e.g. Mock exam'}
        />
      </Field>

      {kind === 'final' && (
        <fieldset>
          <legend className={`mb-2 ${fieldLabelClassName}`}>Study target</legend>
          <StudyTargetTiles
            name="assessment-scheduling-mode"
            value={draft.schedulingMode}
            onChange={(mode) => onChange({ ...draft, schedulingMode: mode })}
          />
        </fieldset>
      )}

      {(kind === 'checkpoint' || draft.schedulingMode === 'exam') && (
        <DateTimePicker
          value={draft.examDate}
          onChange={(examDate) => onChange({ ...draft, examDate })}
          timeZone={draft.timeZone ?? timeZone}
          label="Date and time"
        />
      )}

      {kind === 'checkpoint' && (
        <p className="text-sm text-ink-soft">Checkpoints never block progress along the course.</p>
      )}

      <label className={fieldLabelClassName}>
        Path position
        <select
          value={draft.afterLessonId ?? ''}
          onChange={(event) => onChange({ ...draft, afterLessonId: event.target.value || null })}
          className={inputClassName}
        >
          <option value="">Before the first lesson</option>
          {lessons.map((lesson) => (
            <option key={lesson.id} value={lesson.id}>
              After {lesson.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend className={`mb-2 ${fieldLabelClassName}`}>Coverage</legend>
        <div className="flex flex-wrap gap-2">
          {(
            ['prefix', 'custom', ...(papers.length ? ['specification' as const] : [])] as const
          ).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={draft.coverageMode === mode}
              onClick={() => onChange({ ...draft, coverageMode: mode })}
              className={choiceChipClass(draft.coverageMode === mode)}
            >
              {mode === 'prefix'
                ? 'Everything so far'
                : mode === 'custom'
                  ? 'Choose lessons'
                  : 'Specification'}
            </button>
          ))}
        </div>
      </fieldset>

      {draft.coverageMode === 'specification' && spec && (
        <fieldset className="flex flex-col gap-3">
          <legend className={`mb-2 ${fieldLabelClassName}`}>Specification coverage</legend>
          <label className={fieldLabelClassName}>
            Paper
            <select
              className={inputClassName}
              value={draft.specificationPaperId ?? ''}
              onChange={(event) =>
                onChange({
                  ...draft,
                  specificationPaperId: event.target.value || undefined,
                  specificationPointIds: event.target.value ? undefined : [],
                })
              }
            >
              <option value="">Choose specification points</option>
              {papers.map((paper) => (
                <option key={paper.id} value={paper.id}>
                  {paper.ref}: {paper.title}
                </option>
              ))}
            </select>
          </label>
          {!draft.specificationPaperId && (
            <div className="flex flex-wrap gap-2" aria-label="Covered specification points">
              {points.map((point) => {
                const id = `${spec.id}:${point.id}`;
                const selected = draft.specificationPointIds?.includes(id) ?? false;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selected}
                    className={choiceChipClass(selected)}
                    onClick={() =>
                      onChange({
                        ...draft,
                        specificationPointIds: selected
                          ? draft.specificationPointIds!.filter((value) => value !== id)
                          : [...(draft.specificationPointIds ?? []), id],
                      })
                    }
                  >
                    {point.ref}: {point.title}
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>
      )}

      {draft.coverageMode === 'custom' && (
        <fieldset>
          <legend className={`mb-2 ${fieldLabelClassName}`}>Covered lessons</legend>
          <div className="flex flex-wrap gap-2">
            {lessons.map((lesson) => {
              const active = draft.lessonIds.includes(lesson.id);
              return (
                <button
                  key={lesson.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleLesson(lesson.id)}
                  className={choiceChipClass(active)}
                >
                  {lesson.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="rounded-2xl bg-ink/[0.04] px-3 py-2 text-xs text-ink-soft">
        {resolved.coveredLessons.length} lesson{resolved.coveredLessons.length === 1 ? '' : 's'} ·{' '}
        {resolved.cards.length} card{resolved.cards.length === 1 ? '' : 's'}
      </div>

      {candidates.length > 0 && (
        <fieldset className="min-w-0">
          <legend className={`mb-2 ${fieldLabelClassName}`}>Excluded cards</legend>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search covered cards…"
            className={`mb-2 w-full text-sm ${inputFrameClassName}`}
          />
          <div className="max-h-56 overflow-y-auto rounded-xl border-[1.5px] border-line">
            {lessons
              .filter((lesson) => coveredLessonIds.has(lesson.id))
              .map((lesson) => {
                const lessonCards = candidates.filter(
                  (card) =>
                    cardLessonIds.get(card.id)?.includes(lesson.id) &&
                    (!normalisedQuery ||
                      card.front.toLocaleLowerCase().includes(normalisedQuery) ||
                      card.back.toLocaleLowerCase().includes(normalisedQuery)),
                );
                if (lessonCards.length === 0) return null;
                return (
                  <div key={lesson.id} className="border-b border-line last:border-0">
                    <div className="bg-surface-raised/40 px-3 py-1.5 text-xs font-medium text-ink-soft">
                      {lesson.name}
                    </div>
                    {lessonCards.map((card) => (
                      <label
                        key={`${lesson.id}-${card.id}`}
                        className="flex gap-2 px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={draft.excludedCardIds.includes(card.id)}
                          onChange={() => toggleExcludedCard(card.id)}
                        />
                        <span className="truncate text-ink" title={plainFront(card)}>
                          {plainFront(card)}
                        </span>
                      </label>
                    ))}
                  </div>
                );
              })}
          </div>
        </fieldset>
      )}

      {resolved.validation.issues.length > 0 && (
        <div role="alert" className="rounded-lg border border-negative/30 bg-negative/5 px-3 py-2">
          {resolved.validation.issues.map((issue) => (
            <p key={`${issue.code}-${issue.referenceId ?? ''}`} className="text-xs text-negative">
              {issue.message}
            </p>
          ))}
        </div>
      )}

      {resolved.validation.needsAuthorConfirmation && resolved.validation.issues.length === 0 && (
        <label className="flex items-start gap-2 text-xs text-ink-soft">
          <input
            type="checkbox"
            checked={!draft.needsAuthorConfirmation}
            onChange={(event) =>
              onChange({ ...draft, needsAuthorConfirmation: !event.target.checked })
            }
          />
          I have checked this assessment’s placement and scope.
        </label>
      )}
    </div>
  );
}

export function assessmentDraftIsSaveable(
  courseId: string,
  kind: CourseAssessment['kind'],
  draft: AssessmentDraft,
  lessons: Lesson[],
  cards: Card[],
  links: LessonCardLink[],
  specificationContext?: AssessmentSpecificationContext,
): boolean {
  const resolved = resolveAssessmentCoverage(
    {
      id: 'draft',
      courseId,
      kind,
      createdAt: 0,
      updatedAt: 0,
      ...assessmentChanges(draft),
    } as CourseAssessment,
    lessons,
    cards,
    links,
    undefined,
    specificationContext,
  );
  return resolved.validation.valid && !resolved.validation.needsAuthorConfirmation;
}
