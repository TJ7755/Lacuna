import { QuestionSetEvidencePanel } from '../components/question-sets/QuestionSetEvidencePanel';
import { questionSetReturn } from '../questions/questionSetNavigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Button } from '../components/ui/Button';
import {
  listQuestionSetAttempts,
  startQuestionSetAttempt,
} from '../questions/questionSetAttemptRepository';
import { summariseSelfMarking } from '../questions/questionSets';
import type { QuestionSetAttemptMode } from '../questions/questionSetAttempts';
import '../components/question-sets/question-set-practice.css';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { getQuestionSet } from '../questions/questionSetRepository';
import { flattenQuestionSet } from '../questions/questionSetAuthoring';
import { questionSetMarks, nodeMarks } from '../components/question-sets/presentation';
import { useCourse } from '../state/useCourseData';
import { canEditLessons, resolveLessonViewMode } from '../course/lessonViewMode';
import { MarkdownView } from '../components/markdown/MarkdownView';
import '../components/question-sets/question-sets.css';

export function QuestionSetOverview() {
  const { courseId, setId } = useParams<{ courseId: string; setId: string }>();
  const origin = questionSetReturn(useLocation().state, courseId!);
  const course = useCourse(courseId);
  const navigate = useNavigate();
  const [mode, setMode] = useState<QuestionSetAttemptMode>('practice');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const attempts = useLiveQuery(() => listQuestionSetAttempts(setId!), [setId], []);
  const content = useLiveQuery(() => getQuestionSet(setId!), [setId]);
  if (content === undefined || !course) return <p className="p-8">Loading question set…</p>;
  if (!content || content.courseId !== courseId)
    return (
      <p className="p-8">
        Question set not found. <Link to={`/course/${courseId}/questions`}>Back to Questions</Link>
      </p>
    );
  return (
    <div className="qs-overview">
      <Link className="qs-back" to={origin?.questionSetReturnTo ?? `/course/${courseId}/questions`}>
        ← {origin?.questionSetReturnLabel ?? 'Question sets'}
      </Link>
      <div className="qs-between">
        <h1>{content.title}</h1>
        {canEditLessons(course) && resolveLessonViewMode(course) === 'edit' && !course.archived && (
          <Link className="qs-back" to={`/course/${courseId}/question-sets/${setId}/edit`}>
            Edit set →
          </Link>
        )}
      </div>
      <p className="qs-muted mb-8">
        {content.questions.length} {content.questions.length === 1 ? 'question' : 'questions'} ·{' '}
        {questionSetMarks(content)} {questionSetMarks(content) === 1 ? 'mark' : 'marks'}
      </p>
      <div className="qs-start">
        <label className="qs-field">
          Session
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as QuestionSetAttemptMode)}
          >
            <option value="practice">Practice — feedback after each question</option>
            <option value="paper">Paper — feedback at the end</option>
          </select>
        </label>
        <Button
          variant="primary"
          disabled={starting || course.archived}
          onClick={() => {
            setStarting(true);
            setError('');
            void startQuestionSetAttempt(setId!, mode)
              .then((attempt) =>
                navigate(`/course/${courseId}/question-sets/${setId}/attempts/${attempt.id}`, {
                  state: origin,
                }),
              )
              .catch((cause) => {
                setError(cause instanceof Error ? cause.message : 'Could not start this attempt.');
                setStarting(false);
              });
          }}
        >
          {starting ? 'Starting…' : 'Start attempt'}
        </Button>
      </div>
      {error && (
        <p className="qs-error" role="alert">
          {error}
        </p>
      )}
      {attempts.length > 0 && (
        <section className="qs-history">
          <h2>Your attempts</h2>
          <div className="qs-set-list">
            {attempts.map((attempt) => {
              const result = summariseSelfMarking(attempt.receipt, attempt.decisions);
              return (
                <Link
                  className="qs-set-row"
                  key={attempt.id}
                  state={origin}
                  to={`/course/${courseId}/question-sets/${setId}/attempts/${attempt.id}`}
                >
                  <div>
                    <p>
                      {attempt.mode === 'paper' ? 'Paper' : 'Practice'} ·{' '}
                      {new Date(attempt.createdAt).toLocaleDateString('en-GB')}
                    </p>
                    <p>
                      {attempt.status === 'complete'
                        ? `${result.total.awarded} / ${result.total.available} · self-marked`
                        : attempt.status === 'marking'
                          ? 'Ready to mark'
                          : 'In progress'}
                    </p>
                  </div>
                  <span>{attempt.status === 'complete' ? 'Review' : 'Continue'} →</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
      <QuestionSetEvidencePanel content={content} attempts={attempts} />
      <details>
        <summary className="qs-back">Browse questions</summary>
        <section className="qs-paper">
          {flattenQuestionSet(content).map((n) => (
            <section key={n.id} className="qs-source" style={{ marginLeft: n.depth * 12 }}>
              <div className="qs-between mb-4">
                <h2>{n.label}</h2>
                <span className="qs-muted">
                  {nodeMarks(n.node)} {nodeMarks(n.node) === 1 ? 'mark' : 'marks'}
                </span>
              </div>
              <MarkdownView source={n.node.prompt} />
            </section>
          ))}
        </section>
      </details>
    </div>
  );
}
