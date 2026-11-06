import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card, Grade } from '@lacuna/core/db/types';
import { markdownAnswerCorrect, markdownPlainText } from '../../components/markdown/MarkdownView';
import { answerComparisonOptions, type AnswerStrictness } from '../../state/answerStrictness';
import { renderClozeFront } from '../../utils/cloze';
import {
  JEV_JUDGING_MS,
  JEV_TYPED_TIMEOUT_MS,
  useJevTypedMarker,
  useJevStatus,
  type JevMarkProvenance,
  type JevPauseReason,
  type JevTypedFeedback,
} from '../../jev';
import type { TypedAnswerJudgement } from '../../components/markdown/typedAnswerFeedback';
import { typingExpectedAnswer } from './sessionCardCapabilities';
import type { Phase } from './types';

export type TypedAutoMark =
  | { state: 'off' }
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'manual'; reason: JevPauseReason | 'timeout' | 'uncertain'; retryAt?: number | null }
  /** The marker could not decide, but may still say which parts were missed. */
  | { state: 'unsure'; feedback: JevTypedFeedback; expected: string }
  | {
      state: 'marked';
      correct: boolean;
      grade?: Grade;
      provenance: JevMarkProvenance | null;
      feedback?: JevTypedFeedback;
      expected?: string;
      onContinue?: () => void;
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

/** How long a submitted answer waits before it is marked, before motion scaling. */
export const TYPED_AUTO_MARK_DELAY_MS = 500;

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
}: {
  card: Card | null;
  phase: Phase;
  isTypingCard: boolean;
  typedAnswer: string;
  answerStrictness: AnswerStrictness;
  occlusionAnswerText?: string;
  /** Menus, editing and hints suspend accepting a verdict. */
  paused: boolean;
  /** Undo leaves the restored answer with the learner instead of grading it again. */
  manual?: boolean;
  m: number;
  onMarked: (correct: boolean, provenance: JevMarkProvenance | null, grade?: Grade) => void;
}): TypedAutoMark {
  const marker = useJevTypedMarker();
  const status = useJevStatus();
  const [mark, setMark] = useState<TypedAutoMark>({ state: 'idle' });
  const accepted = useRef(false);
  const onMarkedRef = useRef(onMarked);
  useEffect(() => {
    onMarkedRef.current = onMarked;
  }, [onMarked]);

  const eligible = !manual && isTypingCard && phase === 'answer' && card !== null;
  const active = eligible && marker !== null;
  const cardId = card?.id;

  // Reading time belongs to the learner, independently of animation speed. A cancelled
  // departure can be accepted again after its menu/editor/leave dialogue closes.
  useEffect(() => {
    accepted.current = false;
  }, [active, mark, paused]);
  const continueAnswer = useCallback(() => {
    if (!active || paused || mark.state !== 'marked' || accepted.current) return;
    accepted.current = true;
    if (mark.grade === undefined) onMarkedRef.current(mark.correct, mark.provenance);
    else onMarkedRef.current(mark.correct, mark.provenance, mark.grade);
  }, [active, paused, mark]);

  useEffect(() => {
    if (!active || paused || mark.state !== 'marked') return;
    const down = (event: KeyboardEvent) => {
      if (
        (event.code !== 'Space' && event.key !== 'Enter') ||
        event.repeat ||
        event.defaultPrevented ||
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
          'input, textarea, select, button, a, [role="button"], [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="menu"]',
        )
      )
        return;
      event.preventDefault();
      continueAnswer();
    };
    window.addEventListener('keydown', down, true);
    return () => {
      window.removeEventListener('keydown', down, true);
    };
  }, [active, paused, mark, continueAnswer]);

  // Decide the mark once per revealed answer, after the pause that keeps a verdict from
  // landing in the same breath as the submission.
  useEffect(() => {
    setMark({ state: 'idle' });
    if (!active || !card || typedAnswer.trim() === '') return;
    const expected = typingExpectedAnswer(card, occlusionAnswerText);
    const options = answerComparisonOptions(answerStrictness);
    setMark({ state: 'checking' });
    const controller = new AbortController();
    const scale = Math.max(m, 0.3);
    // A verdict, however quick, waits until the answer has visibly been judged.
    const shownAt = performance.now() + JEV_JUDGING_MS * scale;
    let settle: number | undefined;
    let reveal: number | undefined;
    const show = (next: TypedAutoMark) => {
      reveal = window.setTimeout(() => setMark(next), Math.max(0, shownAt - performance.now()));
    };
    const pause = window.setTimeout(() => {
      if (markdownAnswerCorrect(expected, { answer: typedAnswer, options })) {
        show({ state: 'marked', correct: true, provenance: null });
        return;
      }
      settle = window.setTimeout(() => {
        setMark({ state: 'manual', reason: 'timeout' });
        controller.abort();
      }, JEV_TYPED_TIMEOUT_MS);
      const expectedText = markdownPlainText(expected);
      marker({
        cardId: card.id,
        prompt: markdownPlainText(
          card.type === 'cloze' ? renderClozeFront(card.front) : card.front,
        ),
        expected: expectedText,
        answer: typedAnswer,
        signal: controller.signal,
      })
        .then((verdict) => {
          if (controller.signal.aborted) return;
          window.clearTimeout(settle);
          show(
            verdict.outcome === 'unsure' ||
              (answerStrictness === 'exact' && verdict.outcome === 'correct')
              ? verdict.feedback
                ? { state: 'unsure', feedback: verdict.feedback, expected: expectedText }
                : { state: 'manual', reason: 'uncertain' }
              : {
                  state: 'marked',
                  correct: verdict.outcome === 'correct',
                  grade:
                    verdict.outcome === 'incorrect' ? jevPartialGrade(verdict.feedback) : undefined,
                  provenance: verdict.provenance,
                  feedback: verdict.feedback,
                  expected: expectedText,
                },
          );
        })
        .catch(() => {
          if (!controller.signal.aborted) setMark({ state: 'manual', reason: 'error' });
        })
        .finally(() => window.clearTimeout(settle));
    }, TYPED_AUTO_MARK_DELAY_MS * scale);
    return () => {
      window.clearTimeout(pause);
      window.clearTimeout(settle);
      window.clearTimeout(reveal);
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

  if (marker === null)
    return eligible && status.state === 'paused'
      ? { state: 'manual', reason: status.reason, retryAt: status.retryAt }
      : OFF;
  if (active && mark.state === 'marked') return { ...mark, onContinue: continueAnswer };
  return active ? mark : IDLE;
}

/** A brief local explanation when the ordinary self-marking controls take over. */
export function typedAutoMarkMessage(mark: TypedAutoMark): string | undefined {
  if (mark.state === 'unsure') return 'Check the mark';
  if (mark.state !== 'manual') return undefined;
  switch (mark.reason) {
    case 'timeout':
      return 'Marking timed out — mark yourself';
    case 'uncertain':
      return 'Marking unsure — mark yourself';
    case 'offline':
      return 'Offline — mark yourself';
    case 'limit-reached':
      return 'Marking allowance reached — mark yourself';
    case 'rate-limited':
      return 'Marking paused — mark yourself';
    default:
      return 'Marking unavailable — mark yourself';
  }
}

/** Partial recall requires a known majority of expected parts, never a guess. */
export function jevPartialGrade(feedback: JevTypedFeedback | undefined): Grade | undefined {
  if (!feedback) return undefined;
  if (feedback.kind === 'imprecise') return 2;
  if (feedback.kind !== 'partial') return undefined;
  const parts = feedback.parts;
  return parts.length > 0 &&
    parts.every((part) => part.covered !== null) &&
    parts.filter((part) => part.covered === true).length > parts.length / 2
    ? 2
    : undefined;
}
