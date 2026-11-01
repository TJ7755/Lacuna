import type { TechniqueId } from '@lacuna/core/questions/techniqueTags';
import { startExamSkillPractice } from '../../questions/examSkillPractice';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { startConceptPractice } from '../../questions/conceptPractice';
import type { QuestionStudySummary } from '../../course/sessionSummary';
import type { QuestionSetAttemptRecord } from '@lacuna/core/questions/questionSetAttempts';
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
  techniqueId,
  scopeLessonIds,
  scopeConceptIds,
  allowFamiliar,
  sittingStartedAt,
  onComplete,
  onExit,
}: {
  courseId: string;
  conceptId?: string;
  techniqueId?: TechniqueId;
  scopeLessonIds?: string[];
  scopeConceptIds: string[];
  allowFamiliar?: boolean;
  sittingStartedAt?: number;
  onComplete: (summary: QuestionStudySummary) => void;
  onExit: () => void;
}) {
  const pending = useRef<Promise<{ attempt: QuestionSetAttemptRecord }> | null>(null);
  const [attempt, setAttempt] = useState<QuestionSetAttemptRecord>();
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    pending.current ??= techniqueId
      ? startExamSkillPractice(courseId, techniqueId, {
          allowFamiliar,
          resume: true,
          study: { sittingStartedAt, scopeConceptIds, scopeLessonIds },
        })
      : startConceptPractice(courseId, conceptId, {
          mode: 'mixed',
          resume: true,
          scopeConceptIds,
          allowFamiliar,
          study: { sittingStartedAt },
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
  }, [
    courseId,
    conceptId,
    techniqueId,
    scopeConceptIds,
    scopeLessonIds,
    allowFamiliar,
    sittingStartedAt,
  ]);
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
