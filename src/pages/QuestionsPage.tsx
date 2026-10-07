import {
  COURSE_PAGE_FRAME,
  COURSE_PAGE_HEADER,
  COURSE_PAGE_TITLE,
} from '../components/course/coursePageLayout';
import { RemovedQuestionSetAttempts } from '../components/question-sets/RemovedQuestionSetAttempts';
import { QuestionSetLibraryActions } from '../components/question-sets/QuestionSetLibraryActions';
import { useQuestionSetScroll } from '../components/question-sets/useQuestionSetScroll';
import { useState } from 'react';
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
  const data = useLiveQuery(async () => {
    if (!courseId) return null;
    try {
      const [sets, drafts, legacy] = await Promise.all([
        listQuestionSets(courseId),
        listQuestionSetDrafts(courseId),
        db.questions.where('courseId').equals(courseId).count(),
      ]);
      return { sets, drafts, legacy, error: '' };
    } catch (cause) {
      return { sets: [], drafts: [], legacy: 0, error: String(cause) };
    }
  }, [courseId]);
  const root = useQuestionSetScroll(
    `question-set-library-scroll:${courseId}:${search}`,
    !!course && !!data,
  );
  if (!course || !data) return <p className="p-8 text-ink-soft">Loading Questions…</p>;
  const author = resolveLessonViewMode(course) === 'edit' && !course.archived;
  const draftIds = new Set(data.drafts.map((d) => d.content.id));
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
            <Link
              className="qs-set-row"
              state={origin}
              to={`/course/${course.id}/question-sets/${content.id}${author ? '/edit' : ''}`}
            >
              <div>
                <h2>{content.title || 'Untitled set'}</h2>
                <p>
                  {content.questions.length}{' '}
                  {content.questions.length === 1 ? 'question' : 'questions'} ·{' '}
                  {questionSetMarks(content)} {questionSetMarks(content) === 1 ? 'mark' : 'marks'}
                </p>
              </div>
              <span>{draft ? 'Draft' : author ? 'Edit →' : 'View →'}</span>
            </Link>
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
