import { QuestionSetPanel } from './QuestionSetPanel';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation } from 'react-router-dom';
import { listRemovedQuestionSetAttempts } from '../../questions/questionSetAttemptRepository';
import { QuestionSetAttemptList } from './QuestionSetAttemptList';

export function RemovedQuestionSetAttempts({ courseId }: { courseId: string }) {
  const location = useLocation();
  const attempts = useLiveQuery(() => listRemovedQuestionSetAttempts(courseId), [courseId], []);
  if (!attempts.length) return null;
  return (
    <QuestionSetPanel
      title={`Attempts from removed sets · ${attempts.length}`}
      className="qs-history"
    >
      <QuestionSetAttemptList
        attempts={attempts}
        showTitles
        origin={{
          questionSetReturnTo: location.pathname + location.search,
          questionSetReturnLabel: 'Back to Questions',
        }}
      />
    </QuestionSetPanel>
  );
}
