import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, makeId } from '../db/schema';
import { useCourse } from '../state/useCourseData';
import { resolveLessonViewMode } from '../course/lessonViewMode';
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
  const [search, setSearch] = useState('');
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
      draft.content.questions = [{ id: makeId(), prompt: '', parts: [] }];
      await saveQuestionSetDraft(draft, { expectedDraftRevisionId: null });
      await navigate(`/course/${course.id}/question-sets/${draft.content.id}/edit`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create a set.');
    } finally {
      setCreating(false);
    }
  };
  return (
    <div className="qs-library">
      <header className="qs-library-header">
        <div>
          <p className="qs-kicker">{course.name}</p>
          <h1>Questions</h1>
        </div>
        {author && (
          <Button onClick={() => void create()} disabled={creating}>
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
          <Link
            className="qs-set-row"
            key={content.id}
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
        ))}
        {rows.length === 0 && (
          <div className="qs-empty">
            <h2>{search ? 'No matching sets' : 'No question sets yet'}</h2>
            <p>
              {search
                ? 'Try a different search.'
                : author
                  ? 'Start with a question. Add marks and connections when you’re ready.'
                  : 'Question sets shared with this course will appear here.'}
            </p>
            {search && <button onClick={() => setSearch('')}>Clear search</button>}
          </div>
        )}
      </section>
      {data.legacy > 0 && (
        <details className="qs-legacy">
          <summary>Individual questions · {data.legacy}</summary>
          <LegacyQuestionsPage />
        </details>
      )}
    </div>
  );
}
