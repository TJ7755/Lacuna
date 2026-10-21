import { useEffect, useRef, useState } from 'react';
import type { Card } from '../../db/types';
import { markdownAnswerCorrect, markdownPlainText } from '../../components/markdown/MarkdownView';
import { answerComparisonOptions, type AnswerStrictness } from '../../state/answerStrictness';
import { renderClozeFront } from '../../utils/cloze';
import {
  JEV_TYPED_TIMEOUT_MS,
  useJevTypedMarker,
  type JevMarkProvenance,
  type JevTypedFeedback,
} from '../../jev';
import type { TypedAnswerJudgement } from '../../components/markdown/typedAnswerFeedback';
import { typingExpectedAnswer } from './sessionCardCapabilities';
import type { Phase } from './types';

export type TypedAutoMark =
  | { state: 'off' }
  | { state: 'idle' }
  | { state: 'checking' }
  /** The marker could not decide, but may still say which parts were missed. */
  | { state: 'unsure'; feedback: JevTypedFeedback; expected: string }
  | {
      state: 'marked';
      correct: boolean;
      provenance: JevMarkProvenance | null;
      feedback?: JevTypedFeedback;
      expected?: string;
    };

/** What the revealed card shows about a typed answer while automatic marking is on. */
export function typedAnswerJudgement(mark: TypedAutoMark): TypedAnswerJudgement | undefined {
  if (mark.state === 'checking') return { state: 'checking' };
  if (mark.state === 'unsure')
    return { state: 'judged', outcome: 'unsure', expected: mark.expected, feedback: mark.feedback };
  if (mark.state === 'marked' && mark.feedback && mark.expected !== undefined)
    return {
      state: 'judged',
      outcome: mark.correct ? 'correct' : 'incorrect',
      expected: mark.expected,
      feedback: mark.feedback,
      confidence: mark.provenance?.confidence,
    };
  return undefined;
}

const OFF: TypedAutoMark = { state: 'off' };
const IDLE: TypedAutoMark = { state: 'idle' };

/** How long a mark stays visible before the card is dismissed with it, before motion scaling. */
export const TYPED_AUTO_MARK_HOLD_MS = 700;

/**
 * Marks a revealed typed answer without the learner grading it, while automatic marking is on.
 * A word-for-word match is marked correct locally; anything else asks the marker, and an unsure
 * or late verdict leaves the ordinary grade controls in charge.
 */
export function useTypedAutoMark({
  card,
  phase,
  isTypingCard,
  typedAnswer,
  answerStrictness,
  occlusionAnswerText,
  paused,
  manual = false,
  m,
  onMarked,
  onHold,
}: {
  card: Card | null;
  phase: Phase;
  isTypingCard: boolean;
  typedAnswer: string;
  answerStrictness: AnswerStrictness;
  occlusionAnswerText?: string;
  /** Menus, editing and hints suspend automatic dismissal. */
  paused: boolean;
  /** Undo leaves the restored answer with the learner instead of grading it again. */
  manual?: boolean;
  m: number;
  onMarked: (correct: boolean, provenance: JevMarkProvenance | null) => void;
  onHold?: () => void;
}): TypedAutoMark {
  const marker = useJevTypedMarker();
  const [mark, setMark] = useState<TypedAutoMark>({ state: 'idle' });
  const [holding, setHolding] = useState(false);
  const dismissAt = useRef<number | null>(null);
  const onMarkedRef = useRef(onMarked);
  const onHoldRef = useRef(onHold);
  useEffect(() => {
    onMarkedRef.current = onMarked;
    onHoldRef.current = onHold;
  }, [onMarked, onHold]);

  const active = !manual && marker !== null && isTypingCard && phase === 'answer' && card !== null;
  const cardId = card?.id;
  const canHold = active && (mark.state === 'checking' || mark.state === 'marked');

  useEffect(() => {
    if (!canHold || paused) {
      setHolding(false);
      return;
    }
    const down = (event: KeyboardEvent) => {
      if (
        event.code !== 'Space' ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]',
        )
      )
        return;
      event.preventDefault();
      if (!event.repeat) onHoldRef.current?.();
      setHolding(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setHolding(false);
    };
    const release = () => setHolding(false);
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
    };
  }, [canHold, paused]);

  // Decide the mark once per revealed answer.
  useEffect(() => {
    dismissAt.current = null;
    setMark({ state: 'idle' });
    if (!active || !card || typedAnswer.trim() === '') return;
    const expected = typingExpectedAnswer(card, occlusionAnswerText);
    const options = answerComparisonOptions(answerStrictness);
    if (markdownAnswerCorrect(expected, { answer: typedAnswer, options })) {
      setMark({ state: 'marked', correct: true, provenance: null });
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setMark(IDLE);
      controller.abort();
    }, JEV_TYPED_TIMEOUT_MS);
    setMark({ state: 'checking' });
    const expectedText = markdownPlainText(expected);
    marker({
      cardId: card.id,
      prompt: markdownPlainText(card.type === 'cloze' ? renderClozeFront(card.front) : card.front),
      expected: expectedText,
      answer: typedAnswer,
      signal: controller.signal,
    })
      .then((verdict) => {
        if (controller.signal.aborted) return;
        setMark(
          verdict.outcome === 'unsure'
            ? verdict.feedback
              ? { state: 'unsure', feedback: verdict.feedback, expected: expectedText }
              : { state: 'idle' }
            : {
                state: 'marked',
                correct: verdict.outcome === 'correct',
                provenance: verdict.provenance,
                feedback: verdict.feedback,
                expected: expectedText,
              },
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setMark({ state: 'idle' });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
    // Content edits invalidate an in-flight request or a verdict held behind the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    active,
    cardId,
    card?.front,
    card?.back,
    card?.type,
    typedAnswer,
    answerStrictness,
    occlusionAnswerText,
    marker,
  ]);

  // A visible mark dismisses the card after a short hold, unless something interrupts.
  useEffect(() => {
    if (mark.state !== 'marked' || paused || !active) {
      dismissAt.current = null;
      return;
    }
    dismissAt.current ??= performance.now() + TYPED_AUTO_MARK_HOLD_MS * Math.max(m, 0.3);
    if (holding) return;
    const timer = window.setTimeout(
      () => onMarkedRef.current(mark.correct, mark.provenance),
      Math.max(0, dismissAt.current - performance.now()),
    );
    return () => window.clearTimeout(timer);
  }, [mark, paused, active, m, holding]);

  if (marker === null) return OFF;
  return active ? mark : IDLE;
}
