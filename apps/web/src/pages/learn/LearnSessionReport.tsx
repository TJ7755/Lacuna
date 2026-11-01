import type { RefObject } from 'react';
import { SessionReport } from '../../components/learn/SessionReport';
import type { SessionSummary } from '../../components/learn/types';
import type { useLearnSession } from './useLearnSession';
import type { useLearnAnswerFeedback } from './useLearnAnswerFeedback';

export function LearnSessionReport({
  session,
  summary,
  onStepFinished,
  confirmingCompletion,
  undoWithTransitionCancel,
  completionDeliveriesRef,
  confirmReport,
  stepFinished,
}: {
  session: ReturnType<typeof useLearnSession>;
  summary: SessionSummary;
  onStepFinished?: (summary: SessionSummary) => void;
  confirmingCompletion: boolean;
  undoWithTransitionCancel: () => Promise<void>;
  completionDeliveriesRef: RefObject<number>;
  confirmReport: ReturnType<typeof useLearnAnswerFeedback>['confirmReport'];
  stepFinished: (summary: SessionSummary) => void;
}) {
  const { canUndo, backOut, continueStudying } = session;

  return (
    <SessionReport
      summary={summary}
      returnLabel={onStepFinished ? 'Continue' : 'Done'}
      actionsDisabled={confirmingCompletion}
      onUndo={canUndo ? () => void undoWithTransitionCancel() : undefined}
      onReturn={() => {
        const deliveriesBefore = completionDeliveriesRef.current;
        void confirmReport(() => {
          if (!onStepFinished) backOut();
          // A new confirmation delivers automatically. An already-confirmed
          // report still needs an explicit request to advance its parent.
          else if (completionDeliveriesRef.current === deliveriesBefore) stepFinished(summary);
        }, !onStepFinished);
      }}
      onContinue={
        onStepFinished ||
        (summary.reachedGoal &&
          !summary.limitReached &&
          !summary.timeLimitReached &&
          !summary.simpleMode)
          ? undefined
          : () => void confirmReport(continueStudying)
      }
    />
  );
}
