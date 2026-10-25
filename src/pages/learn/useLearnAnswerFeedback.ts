import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { Card, Grade } from '../../db/types';
import type { JevMarkProvenance } from '../../jev';
import type { useToast } from '../../components/ui/Toast';
import type { StudyGradeFeedback } from './StudyGradeButton';
import type { StudyCardTransitionHandle } from './StudyCardTransition';
import type { StreakMoment } from './StreakCelebration';
import { isStreakMilestone, nextRun } from './answerStreak';
import type { MachineMarkedAnswer } from './types';
import type { useLearnSession } from './useLearnSession';

type Session = ReturnType<typeof useLearnSession>;

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
}) {
  const [gradeFeedback, setGradeFeedback] = useState<StudyGradeFeedback>();
  const cardTransitionRef = useRef<StudyCardTransitionHandle>(null);
  // Consecutive correct answers, self-graded or machine-marked, for the milestone celebration.
  const runRef = useRef(0);
  const [streakMoment, setStreakMoment] = useState<StreakMoment | null>(null);
  const clearStreakMoment = useCallback(() => setStreakMoment(null), []);
  const undoInFlightRef = useRef(false);
  const completionInFlightRef = useRef(false);
  const lastTypedAnswerRef = useRef<{ cardId: string; answer: string } | null>(null);
  const [manualRestoredCardId, setManualRestoredCardId] = useState<string | null>(null);
  const [confirmingCompletion, setConfirmingCompletion] = useState(false);
  const undoWithTransitionCancel = useCallback(async () => {
    if (undoInFlightRef.current || completionInFlightRef.current) return;
    undoInFlightRef.current = true;
    setMenuOpen(false);
    try {
      cardTransitionRef.current?.cancel();
      runRef.current = 0;
      setStreakMoment(null);
      const typed = lastTypedAnswerRef.current;
      if (typed) setManualRestoredCardId(typed.cardId);
      const restored = await undoLast({ reveal: typed !== null });
      if (restored && typed?.cardId === restored.id) {
        setTypedAnswer(typed.answer);
        lastTypedAnswerRef.current = null;
      }
    } finally {
      undoInFlightRef.current = false;
    }
  }, [undoLast, setMenuOpen, setTypedAnswer]);

  const confirmReport = async (then: () => void, leaving = false) => {
    if (completionInFlightRef.current || undoInFlightRef.current) return;
    completionInFlightRef.current = true;
    setConfirmingCompletion(true);
    if (leaving) leavingSessionRef.current = true;
    try {
      if (await confirmCompletion()) then();
      else leavingSessionRef.current = false;
    } finally {
      completionInFlightRef.current = false;
      setConfirmingCompletion(false);
    }
  };

  const answerWithUndo = useCallback(
    (
      input: boolean | Grade | MachineMarkedAnswer,
      source: 'touch' | 'keyboard' = 'keyboard',
      velocity = 0,
      markedBy?: JevMarkProvenance,
      automatic = false,
    ) => {
      if (undoInFlightRef.current) return;
      const commit = () =>
        void (async () => {
          const result = await answer(
            input,
            automatic ? { markedBy, retainUndo: true } : undefined,
          );
          lastTypedAnswerRef.current =
            result.undoAvailable && presentedAnswerInput === 'typed' && current
              ? { cardId: current.id, answer: typedAnswer }
              : null;
          if (result.undoAvailable) {
            notify(result.feedbackMessage ?? 'Answer recorded', 'neutral', {
              actionLabel: 'Undo',
              onAction: () => void undoWithTransitionCancel(),
              replaceKey: 'learn-answer',
            });
          }
        })();
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
    [answer, notify, undoWithTransitionCancel, presentedAnswerInput, current, typedAnswer],
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
  };
}
