import { useMemo, useState } from 'react';
import { resolveAssessmentCoverage } from '../../course/assessmentCoverage';
import type { Card, CourseAssessment, Lesson, LessonCardLink } from '../../db/types';
import { DateTimePicker } from '../ui/DateTimePicker';

export type AssessmentDraft = Pick<
  CourseAssessment,
  | 'name'
  | 'examDate'
  | 'timeZone'
  | 'afterLessonId'
  | 'coverageMode'
  | 'excludedCardIds'
  | 'needsAuthorConfirmation'
> & { lessonIds: string[] };

export function draftFromAssessment(assessment: CourseAssessment): AssessmentDraft {
  return {
    name: assessment.name,
    examDate: assessment.examDate,
    timeZone: assessment.timeZone,
    afterLessonId: assessment.afterLessonId,
    coverageMode: assessment.coverageMode,
    lessonIds: assessment.coverageMode === 'custom' ? [...assessment.lessonIds] : [],
    excludedCardIds: [...assessment.excludedCardIds],
    needsAuthorConfirmation: assessment.needsAuthorConfirmation,
  };
}

export function emptyAssessmentDraft(lessons: Lesson[], timeZone?: string): AssessmentDraft {
  return {
    name: '',
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
    examDate: draft.examDate,
    timeZone: draft.timeZone,
    afterLessonId: draft.afterLessonId,
    excludedCardIds: draft.excludedCardIds,
    needsAuthorConfirmation: draft.needsAuthorConfirmation,
  };
  return draft.coverageMode === 'custom'
    ? { ...common, coverageMode: 'custom', lessonIds: draft.lessonIds }
    : { ...common, coverageMode: 'prefix', lessonIds: undefined };
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
}: AssessmentEditorProps) {
  const [query, setQuery] = useState('');
  const assessment = useMemo(
    () =>
      ({
        id: 'draft',
        courseId,
        kind,
        createdAt: 0,
        ...assessmentChanges(draft),
      }) as CourseAssessment,
    [courseId, draft, kind],
  );
  const resolved = useMemo(
    () => resolveAssessmentCoverage(assessment, lessons, cards, links),
    [assessment, cards, lessons, links],
  );
  const candidates = useMemo(
    () =>
      resolveAssessmentCoverage(
        { ...assessment, excludedCardIds: [] },
        lessons,
        cards,
        links,
      ).cards,
    [assessment, cards, lessons, links],
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
      <label className="block text-sm text-ink-soft">
        Name
        <input
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          placeholder={kind === 'final' ? 'Final assessment' : 'e.g. Mock exam'}
          className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
        />
      </label>

      <DateTimePicker
        value={draft.examDate}
        onChange={(examDate) => onChange({ ...draft, examDate })}
        timeZone={draft.timeZone ?? timeZone}
        label="Date and time"
      />

      <label className="block text-sm text-ink-soft">
        Path position
        <select
          value={draft.afterLessonId ?? ''}
          onChange={(event) => onChange({ ...draft, afterLessonId: event.target.value || null })}
          className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
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
        <legend className="mb-2 text-sm text-ink-soft">Coverage</legend>
        <div className="grid grid-cols-2 gap-2">
          {(['prefix', 'custom'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={draft.coverageMode === mode}
              onClick={() => onChange({ ...draft, coverageMode: mode })}
              className={
                'rounded-lg border px-3 py-2 text-sm transition-colors ' +
                (draft.coverageMode === mode
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line text-ink-soft hover:border-line-strong')
              }
            >
              {mode === 'prefix' ? 'Everything so far' : 'Choose lessons'}
            </button>
          ))}
        </div>
      </fieldset>

      {draft.coverageMode === 'custom' && (
        <fieldset>
          <legend className="mb-2 text-sm text-ink-soft">Covered lessons</legend>
          <div className="flex flex-wrap gap-2">
            {lessons.map((lesson) => {
              const active = draft.lessonIds.includes(lesson.id);
              return (
                <button
                  key={lesson.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleLesson(lesson.id)}
                  className={
                    'rounded-full border px-3 py-1 text-xs transition-colors ' +
                    (active
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line text-ink-soft hover:border-line-strong')
                  }
                >
                  {lesson.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="rounded-lg border border-line bg-surface-raised/40 px-3 py-2 text-xs text-ink-soft">
        {resolved.coveredLessons.length} lesson{resolved.coveredLessons.length === 1 ? '' : 's'} ·{' '}
        {resolved.cards.length} card{resolved.cards.length === 1 ? '' : 's'}
      </div>

      {candidates.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm text-ink-soft">Excluded cards</legend>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search covered cards…"
            className="mb-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
          <div className="max-h-56 overflow-y-auto rounded-lg border border-line">
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
                      <label key={`${lesson.id}-${card.id}`} className="flex gap-2 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={draft.excludedCardIds.includes(card.id)}
                          onChange={() => toggleExcludedCard(card.id)}
                        />
                        <span className="truncate text-ink">{card.front}</span>
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
): boolean {
  const resolved = resolveAssessmentCoverage(
    {
      id: 'draft',
      courseId,
      kind,
      createdAt: 0,
      ...assessmentChanges(draft),
    } as CourseAssessment,
    lessons,
    cards,
    links,
  );
  return resolved.validation.valid && !resolved.validation.needsAuthorConfirmation;
}
