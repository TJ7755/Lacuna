import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useLocation } from 'react-router-dom';
import {
  listQuestionSetsForAssessment,
  listQuestionSetsForCard,
  listQuestionSetsForLesson,
} from '../../questions/questionSetRepository';

export function RelatedQuestionSets({
  courseId,
  lessonId,
  assessmentId,
  cardId,
  onNavigate,
}: {
  courseId: string;
  lessonId?: string;
  assessmentId?: string;
  cardId?: string;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const sets = useLiveQuery(
    () => {
      if (lessonId) return listQuestionSetsForLesson(courseId, lessonId);
      if (assessmentId) return listQuestionSetsForAssessment(courseId, assessmentId);
      if (cardId) return listQuestionSetsForCard(courseId, cardId, 'target');
      return Promise.resolve([]);
    },
    [courseId, lessonId, assessmentId, cardId],
    [],
  );
  if (!sets.length) return null;
  const search = new URLSearchParams(location.search);
  if (assessmentId) search.set('exam', assessmentId);
  const state = {
    questionSetReturnTo: location.pathname + (search.size ? `?${search}` : ''),
    questionSetReturnLabel: lessonId
      ? 'Back to lesson'
      : assessmentId
        ? 'Back to exam'
        : 'Back to Cards',
  };
  return (
    <section className="mt-6" aria-label="Practice questions">
      <h3 className="text-sm font-medium text-ink">Practice questions</h3>
      <ul className="mt-2 divide-y divide-line">
        {sets.map((set) => (
          <li key={set.id}>
            <Link
              className="block py-3 text-sm text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
              to={`/course/${courseId}/question-sets/${set.id}`}
              state={state}
              onClick={() => onNavigate?.()}
            >
              {set.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
