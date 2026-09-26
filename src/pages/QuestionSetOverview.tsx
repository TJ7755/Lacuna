import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useParams } from 'react-router-dom';
import { getQuestionSet } from '../questions/questionSetRepository';
import { flattenQuestionSet } from '../questions/questionSetAuthoring';
import { questionSetMarks, nodeMarks } from '../components/question-sets/presentation';
import { useCourse } from '../state/useCourseData';
import { canEditLessons, resolveLessonViewMode } from '../course/lessonViewMode';
import { MarkdownView } from '../components/markdown/MarkdownView';
import '../components/question-sets/question-sets.css';

export function QuestionSetOverview() {
  const { courseId, setId } = useParams<{ courseId: string; setId: string }>();
  const course = useCourse(courseId);
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
      <Link className="qs-back" to={`/course/${courseId}/questions`}>
        ← Question sets
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
    </div>
  );
}
