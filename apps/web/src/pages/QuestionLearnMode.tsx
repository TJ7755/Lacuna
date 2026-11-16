import { Navigate, useParams } from 'react-router-dom';

/** Old bookmarks now enter the shared question-set practice system. */
export function QuestionLearnMode() {
  const { courseId } = useParams<{ courseId: string }>();
  return <Navigate replace to={`/course/${courseId}/questions`} />;
}
