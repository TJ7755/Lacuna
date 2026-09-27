import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation } from 'react-router-dom';
import { listRemovedQuestionSetAttempts } from '../../questions/questionSetAttemptRepository';
import { QuestionSetAttemptList } from './QuestionSetAttemptList';

export function RemovedQuestionSetAttempts({ courseId }: { courseId: string }) {
  const location = useLocation();
  const attempts = useLiveQuery(() => listRemovedQuestionSetAttempts(courseId), [courseId], []);
  if (!attempts.length) return null;
  return (
    <details className="qs-history">
      <summary className="qs-back">Attempts from removed sets · {attempts.length}</summary>
      <QuestionSetAttemptList
        attempts={attempts}
        showTitles
        origin={{
          questionSetReturnTo: location.pathname + location.search,
          questionSetReturnLabel: 'Back to Questions',
        }}
      />
    </details>
  );
}
