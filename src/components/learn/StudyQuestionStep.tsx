import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { startConceptPractice } from '../../questions/conceptPractice';
import type { QuestionStudySummary } from '../../course/sessionSummary';
import type { QuestionSetAttemptRecord } from '../../questions/questionSetAttempts';
const QuestionSetPractice = lazy(() =>
  import('../../pages/QuestionSetPractice').then((module) => ({
    default: module.QuestionSetPractice,
  })),
);
import { PageLoading } from '../ui/PageLoadingBoundary';
import { StudyExitHeader } from './StudyExitHeader';
import { StudyFlowMessage } from './StudyFlowMessage';

export function StudyQuestionStep({
  courseId,
  conceptId,
  scopeConceptIds,
  allowFamiliar,
  onComplete,
  onExit,
}: {
  courseId: string;
  conceptId: string;
  scopeConceptIds: string[];
  allowFamiliar?: boolean;
  onComplete: (summary: QuestionStudySummary) => void;
  onExit: () => void;
}) {
  const pending = useRef<ReturnType<typeof startConceptPractice> | null>(null);
  const [attempt, setAttempt] = useState<QuestionSetAttemptRecord>();
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    pending.current ??= startConceptPractice(courseId, conceptId, {
      mode: 'mixed',
      resume: true,
      scopeConceptIds,
      allowFamiliar,
    });
    void pending.current
      .then((result) => {
        if (!cancelled) setAttempt(result.attempt);
      })
      .catch((cause) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : 'Could not start question practice.');
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, conceptId, scopeConceptIds, allowFamiliar]);
  if (error)
    return (
      <StudyFlowMessage title="Question practice unavailable" detail={error} onExit={onExit} />
    );
  if (!attempt)
    return (
      <div className="min-h-dvh bg-paper">
        <StudyExitHeader onExit={onExit} />
        <PageLoading />
      </div>
    );
  return (
    <Suspense fallback={<PageLoading />}>
      <QuestionSetPractice
        study={{
          courseId,
          setId: attempt.questionSetId,
          attemptId: attempt.id,
          onComplete,
          onExit,
        }}
      />
    </Suspense>
  );
}
