import {
  COURSE_PAGE_FRAME,
  COURSE_PAGE_HEADER,
  COURSE_PAGE_TITLE,
} from '../components/course/coursePageLayout';
import { RemovedQuestionSetAttempts } from '../components/question-sets/RemovedQuestionSetAttempts';
import { QuestionSetLibraryActions } from '../components/question-sets/QuestionSetLibraryActions';
import { useQuestionSetScroll } from '../components/question-sets/useQuestionSetScroll';
import { useState } from 'react';
import { PlusIcon } from '../components/ui/icons';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, makeId } from '../db/schema';
import { useCourse } from '../state/useCourseData';
import { canEditLessons, resolveLessonViewMode } from '../course/lessonViewMode';
import { updateCourse } from '../db/courseRepository';
import {
  createEmptyQuestionSetDraft,
  listQuestionSetDrafts,
  saveQuestionSetDraft,
} from '../questions/questionSetDrafts';
import { listQuestionSets } from '../questions/questionSetRepository';
import { Button } from '../components/ui/Button';
import { LegacyQuestionsPage } from './LegacyQuestionsPage';
import { questionSetMarks } from '../components/question-sets/presentation';
import { QuestionSetScore } from '../components/question-sets/QuestionSetScore';
import { questionSetProgress, type QuestionSetProgress } from '../questions/questionSetProgress';
import { startQuestionSetAttempt } from '../questions/questionSetAttemptRepository';
import { parseQuestionSetAttemptRecord } from '../questions/questionSetAttemptCodec';
import type { QuestionSetAttemptRecord } from '../questions/questionSetAttempts';
import { countOf } from '../utils/plural';
import { formatRelativeTime } from '../utils/datetime';

const NO_PROGRESS: QuestionSetProgress = { history: [] };
import '../components/question-sets/question-sets.css';

export function QuestionsPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const course = useCourse(courseId);
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const setSearch = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value);
    else next.delete('q');
    setParams(next, { replace: true });
  };
  const origin = {
    questionSetReturnTo: location.pathname + location.search,
    questionSetReturnLabel: 'Back to Questions',
  };
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [startingSetId, setStartingSetId] = useState<string | null>(null);
  const data = useLiveQuery(async () => {
    if (!courseId) return null;
    try {
      const [sets, drafts, legacy, attemptRows] = await Promise.all([
        listQuestionSets(courseId),
        listQuestionSetDrafts(courseId),
        db.questions.where('courseId').equals(courseId).count(),
        db.questionSetAttempts.where('courseId').equals(courseId).toArray(),
      ]);
      const attemptsBySet = new Map<string, QuestionSetAttemptRecord[]>();
      for (const row of attemptRows) {
        // Scores are a summary: an attempt that cannot be read leaves its set unscored
        // rather than hiding every set. The set's own page still reports it.
        try {
          const attempt = parseQuestionSetAttemptRecord(row);
          attemptsBySet.set(attempt.questionSetId, [
            ...(attemptsBySet.get(attempt.questionSetId) ?? []),
            attempt,
          ]);
        } catch {
          continue;
        }
      }
      return { sets, drafts, legacy, attemptsBySet, error: '' };
    } catch (cause) {
      return {
        sets: [],
        drafts: [],
        legacy: 0,
        attemptsBySet: new Map<string, QuestionSetAttemptRecord[]>(),
        error: String(cause),
      };
    }
  }, [courseId]);
  const root = useQuestionSetScroll(
    `question-set-library-scroll:${courseId}:${search}`,
    !!course && !!data,
  );
  if (!course || !data) return <p className="p-8 text-ink-soft">Loading Questions…</p>;
  const author = resolveLessonViewMode(course) === 'edit' && !course.archived;
  const draftIds = new Set(data.drafts.map((d) => d.content.id));
  const progress = new Map<string, QuestionSetProgress>();
  for (const [setId, attempts] of data.attemptsBySet) {
    try {
      progress.set(setId, questionSetProgress(attempts));
    } catch {
      // A receipt that no longer validates cannot be scored; the set stays unscored.
    }
  }
  const rows = [
    ...data.drafts.filter(() => author).map((d) => ({ content: d.content, draft: true })),
    ...data.sets
      .filter((s) => !author || !draftIds.has(s.id))
      .map((content) => ({ content, draft: false })),
  ].filter((row) => row.content.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const create = async () => {
    setCreating(true);
    setError('');
    try {
      const draft = createEmptyQuestionSetDraft(course.id, makeId());
      await saveQuestionSetDraft(draft, { expectedDraftRevisionId: null });
      await navigate(`/course/${course.id}/question-sets/${draft.content.id}/edit`, {
        state: origin,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create a set.');
    } finally {
      setCreating(false);
    }
  };
  // Practice mode is the default; Paper is one tap further, on the set's own page.
  const attempt = async (setId: string) => {
    setStartingSetId(setId);
    setError('');
    try {
      const started = await startQuestionSetAttempt(setId, 'practice');
      await navigate(`/course/${course.id}/question-sets/${setId}/attempts/${started.id}`, {
        state: origin,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start this attempt.');
      setStartingSetId(null);
    }
  };
  if (params.get('view') === 'individual') return <LegacyQuestionsPage />;
  return (
    <div ref={root} className={`${COURSE_PAGE_FRAME} qs-library pb-8`}>
      <header className={COURSE_PAGE_HEADER}>
        <div>
          <h1 tabIndex={-1} className={COURSE_PAGE_TITLE}>
            Questions
          </h1>
        </div>
        {author && (
          <Button variant="primary" onClick={() => void create()} disabled={creating}>
            {/* Leads with + like New card and New course. */}
            <PlusIcon width={16} height={16} />
            {creating ? 'Creating…' : 'New question set'}
          </Button>
        )}
      </header>
      {(error || data.error) && (
        <p role="alert" className="qs-error">
          {error || data.error}
        </p>
      )}
      {(data.sets.length > 0 || (author && data.drafts.length > 0)) && (
        <label className="qs-search">
          Search sets
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a question set"
          />
        </label>
      )}
      <section className="qs-set-list" aria-label="Question sets">
        {rows.map(({ content, draft }) => (
          <div className="qs-library-row" key={content.id}>
            <div className="qs-set-row qs-scored-row">
              <Link
                className="qs-scored-title"
                state={origin}
                to={`/course/${course.id}/question-sets/${content.id}${author ? '/edit' : ''}`}
              >
                <h2>{content.title || 'Untitled set'}</h2>
                <p>
                  {countOf(content.questions.length, 'question')} ·{' '}
                  {countOf(questionSetMarks(content), 'mark')}
                  {draft
                    ? ' · Draft'
                    : progress.get(content.id)?.lastTriedAt !== undefined
                      ? ` · last tried ${formatRelativeTime(progress.get(content.id)!.lastTriedAt!)}`
                      : ' · not tried yet'}
                </p>
              </Link>
              {!draft && <QuestionSetScore progress={progress.get(content.id) ?? NO_PROGRESS} />}
              {author ? (
                <span className="qs-scored-hint">{draft ? 'Draft' : 'Edit →'}</span>
              ) : progress.get(content.id)?.open ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    void navigate(
                      `/course/${course.id}/question-sets/${content.id}/attempts/${progress.get(content.id)!.open!.id}`,
                      { state: origin },
                    )
                  }
                >
                  Continue
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  disabled={course.archived || startingSetId !== null}
                  onClick={() => void attempt(content.id)}
                >
                  {startingSetId === content.id ? 'Starting…' : 'Attempt'}
                </Button>
              )}
            </div>
            {author && (
              <QuestionSetLibraryActions
                courseId={course.id}
                setId={content.id}
                title={content.title || 'Untitled set'}
                contentRevisionId={
                  data.sets.find((set) => set.id === content.id)?.contentRevisionId ?? null
                }
                draftRevisionId={
                  data.drafts.find((row) => row.content.id === content.id)?.draftRevisionId ?? null
                }
                onRemoved={() =>
                  requestAnimationFrame(() => {
                    (
                      root.current?.querySelector<HTMLElement>('input[type="search"]') ??
                      root.current?.querySelector<HTMLElement>('h1')
                    )?.focus();
                  })
                }
              />
            )}
          </div>
        ))}
        {rows.length === 0 && (
          <div className="qs-empty">
            <h2>{search ? 'No matching sets' : 'No question sets yet'}</h2>
            {search ? (
              <p>Try a different search.</p>
            ) : (
              <p>Exam-style questions with mark schemes.</p>
            )}
            {search && <button onClick={() => setSearch('')}>Clear search</button>}
            {!search && !author && !course.archived && canEditLessons(course) && (
              // View mode is read-only, so the way forward is the mode switch itself.
              <Button
                variant="secondary"
                className="mt-4"
                onClick={() => void updateCourse(course.id, { lessonViewMode: 'edit' })}
              >
                Switch to Edit to write one
              </Button>
            )}
          </div>
        )}
      </section>
      <RemovedQuestionSetAttempts courseId={course.id} />
      {data.legacy > 0 && (
        <Link
          className="qs-legacy-link"
          to={`?view=individual${search ? `&q=${encodeURIComponent(search)}` : ''}`}
        >
          Individual questions <span>{data.legacy} →</span>
        </Link>
      )}
    </div>
  );
}
