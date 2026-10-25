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
  const {
    canUndo,
    backOut,
    simpleMastered,
    simpleWrong,
    simpleQueue,
    createSimpleQueue,
    cardsRef,
    events,
    progressBefore,
    sessionStartMs,
    setSummary,
    setSessionCardIds,
    resetSimpleSessionOutcomes,
    serveNext,
    ctxRef,
    cachedSessionProgress,
    setLimitOverride,
    setTimeLimitOverride,
  } = session;

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
          : summary.simpleMode
            ? () =>
                void confirmReport(() => {
                  // Restart simple mode: reset all simple state and begin again.
                  simpleMastered.current = new Set();
                  simpleWrong.current = new Set();
                  simpleQueue.current = createSimpleQueue(
                    cardsRef.current.filter(
                      (c) => !c.suspended && !(c.buriedUntil && c.buriedUntil > Date.now()),
                    ),
                  );
                  events.current = [];
                  progressBefore.current = 0;
                  sessionStartMs.current = Date.now();
                  setSummary(null);
                  setSessionCardIds(simpleQueue.current.map((card) => card.id));
                  resetSimpleSessionOutcomes();
                  serveNext();
                })
            : () =>
                void confirmReport(() => {
                  const ctx = ctxRef.current;
                  if (!ctx) return;
                  events.current = [];
                  progressBefore.current = cachedSessionProgress(cardsRef.current, ctx);
                  setSummary(null);
                  setLimitOverride(true);
                  setTimeLimitOverride(true);
                  serveNext();
                })
      }
    />
  );
}
