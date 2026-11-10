import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { Card, Grade } from '@lacuna/core/db/types';
import type { JevMarkProvenance } from '../../jev';
import type { useToast } from '../../components/ui/Toast';
import type { StudyGradeFeedback } from './StudyGradeButton';
import type { StudyCardTransitionHandle } from './StudyCardTransition';
import type { StreakMoment } from './StreakCelebration';
import { isStreakMilestone, nextRun } from './answerStreak';
import type { MachineMarkedAnswer } from './types';
import type { useLearnSession } from './useLearnSession';

type Session = ReturnType<typeof useLearnSession>;

interface CompletionUndoToast {
  dismissed: boolean;
  show: () => void;
}

export function useLearnAnswerFeedback({
  answer,
  undoLast,
  confirmCompletion,
  setMenuOpen,
  setTypedAnswer,
  leavingSessionRef,
  notify,
  presentedAnswerInput,
  current,
  typedAnswer,
  verifyTypedRecall,
  quietCardPractice,
}: {
  answer: Session['answer'];
  undoLast: Session['undoLast'];
  confirmCompletion: Session['confirmCompletion'];
  setMenuOpen: Dispatch<SetStateAction<boolean>>;
  setTypedAnswer: Dispatch<SetStateAction<string>>;
  leavingSessionRef: RefObject<boolean>;
  notify: ReturnType<typeof useToast>['notify'];
  presentedAnswerInput: Session['presentedAnswerInput'];
  current: Card | null;
  typedAnswer: string;
  verifyTypedRecall: boolean;
  quietCardPractice?: boolean;
}) {
  const [gradeFeedback, setGradeFeedback] = useState<StudyGradeFeedback>();
  const cardTransitionRef = useRef<StudyCardTransitionHandle>(null);
  const answerPromiseRef = useRef<Promise<void> | null>(null);
  const [answerSaveStatus, setAnswerSaveStatus] = useState<'saving' | 'failed' | undefined>();
  const settleAnswer = useCallback(() => {
    cardTransitionRef.current?.flush();
    return answerPromiseRef.current ?? Promise.resolve();
  }, []);
  // Consecutive correct answers, self-graded or machine-marked, for the milestone celebration.
  const runRef = useRef(0);
  const [streakMoment, setStreakMoment] = useState<StreakMoment | null>(null);
  const clearStreakMoment = useCallback(() => setStreakMoment(null), []);
  const undoInFlightRef = useRef(false);
  const completionInFlightRef = useRef(false);
  const completionUndoToastRef = useRef<CompletionUndoToast | null>(null);
  useEffect(
    () => () => {
      completionUndoToastRef.current = null;
    },
    [],
  );
  const lastTypedAnswerRef = useRef<{ cardId: string; answer: string; verified: boolean } | null>(
    null,
  );
  const [manualRestoredCardId, setManualRestoredCardId] = useState<string | null>(null);
  const [confirmingCompletion, setConfirmingCompletion] = useState(false);
  const undoWithTransitionCancel = useCallback(async () => {
    if (undoInFlightRef.current || completionInFlightRef.current) return;
    undoInFlightRef.current = true;
    const completionUndoToast = completionUndoToastRef.current;
    setMenuOpen(false);
    try {
      cardTransitionRef.current?.cancel();
      runRef.current = 0;
      setStreakMoment(null);
      const typed = lastTypedAnswerRef.current;
      if (typed) setManualRestoredCardId(typed.verified ? null : typed.cardId);
      // Restore verified recall to the input so only an intentional resubmission is marked.
      const restored = await undoLast({ reveal: typed !== null && !typed.verified });
      if (restored) completionUndoToastRef.current = null;
      if (restored && typed?.cardId === restored.id) {
        setTypedAnswer(typed.answer);
        lastTypedAnswerRef.current = null;
      }
    } finally {
      undoInFlightRef.current = false;
      // Keep Undo available for a retry if its save failed as the toast dismissed.
      if (completionUndoToast?.dismissed && completionUndoToastRef.current === completionUndoToast)
        completionUndoToast.show();
    }
  }, [undoLast, setMenuOpen, setTypedAnswer]);

  const confirmReport = useCallback(
    async (then: () => void, leaving = false) => {
      if (completionInFlightRef.current || undoInFlightRef.current) return;
      completionInFlightRef.current = true;
      setConfirmingCompletion(true);
      if (leaving) leavingSessionRef.current = true;
      try {
        if (await confirmCompletion()) then();
        else if (leaving) leavingSessionRef.current = false;
      } finally {
        completionInFlightRef.current = false;
        setConfirmingCompletion(false);
      }
    },
    [confirmCompletion, leavingSessionRef],
  );

  const answerWithUndo = useCallback(
    (
      input: boolean | Grade | MachineMarkedAnswer,
      source: 'touch' | 'keyboard' = 'keyboard',
      velocity = 0,
      markedBy?: JevMarkProvenance,
      automatic = false,
    ) => {
      if (undoInFlightRef.current || answerPromiseRef.current) return;
      const commit = () => {
        setAnswerSaveStatus('saving');
        const pending = (async () => {
          try {
            const result = await answer(
              input,
              automatic || verifyTypedRecall
                ? {
                    ...(automatic ? { markedBy, retainUndo: true } : {}),
                    ...(verifyTypedRecall ? { typedAnswer } : {}),
                  }
                : undefined,
            );
            lastTypedAnswerRef.current =
              result.undoAvailable && presentedAnswerInput === 'typed' && current
                ? { cardId: current.id, answer: typedAnswer, verified: verifyTypedRecall }
                : null;
            if (result.undoAvailable) {
              const message = result.feedbackMessage ?? 'Answer recorded';
              if (quietCardPractice && result.completionPending) {
                cardTransitionRef.current?.cancel();
                const showUndo = () => {
                  const toast = { dismissed: false, show: showUndo };
                  completionUndoToastRef.current = toast;
                  notify(message, 'neutral', {
                    actionLabel: 'Undo',
                    onAction: () => {
                      if (completionUndoToastRef.current === toast) void undoWithTransitionCancel();
                    },
                    onDismiss: () => {
                      toast.dismissed = true;
                      if (completionUndoToastRef.current !== toast || undoInFlightRef.current)
                        return;
                      completionUndoToastRef.current = null;
                      if (!leavingSessionRef.current) void confirmReport(() => {});
                    },
                    replaceKey: 'learn-answer',
                    keepVisible: true,
                  });
                };
                showUndo();
              } else {
                notify(message, 'neutral', {
                  actionLabel: 'Undo',
                  onAction: () => void undoWithTransitionCancel(),
                  replaceKey: 'learn-answer',
                });
              }
            }
            setAnswerSaveStatus(undefined);
          } catch (error) {
            setAnswerSaveStatus('failed');
            cardTransitionRef.current?.cancel();
            notify('Your answer could not be saved. Please try again.', 'negative');
            throw error;
          } finally {
            answerPromiseRef.current = null;
          }
        })();
        answerPromiseRef.current = pending;
        // Exit awaits this promise; failures during ordinary study are shown above.
        void pending.catch(() => {});
      };
      const correct =
        typeof input === 'object' ? input.correct : typeof input === 'number' ? input > 1 : input;
      // Machine-marked cards measure response time at submission, so keep that path immediate.
      if (typeof input === 'object' || !cardTransitionRef.current) commit();
      else if (!cardTransitionRef.current.dismiss(correct, commit, source, velocity)) return;
      if (typeof input !== 'object') {
        setGradeFeedback((previous) => ({ input, serial: (previous?.serial ?? 0) + 1 }));
      }
      runRef.current = nextRun(runRef.current, correct);
      if (isStreakMilestone(runRef.current)) {
        setStreakMoment({ run: runRef.current, key: Date.now() });
      }
    },
    [
      answer,
      notify,
      undoWithTransitionCancel,
      presentedAnswerInput,
      current,
      typedAnswer,
      verifyTypedRecall,
      quietCardPractice,
      leavingSessionRef,
      confirmReport,
    ],
  );

  return {
    gradeFeedback,
    cardTransitionRef,
    streakMoment,
    clearStreakMoment,
    manualRestoredCardId,
    confirmingCompletion,
    undoWithTransitionCancel,
    confirmReport,
    answerWithUndo,
    answerSaveStatus,
    settleAnswer,
  };
}
