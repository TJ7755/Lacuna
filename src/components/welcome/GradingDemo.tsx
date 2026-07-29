import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import {
  isDemoInReadingArea,
  SCROLL_ACTION_DISTANCE,
  type ScrollDrivenDemoHandle,
} from './scrollDrivenDemo';

/**
 * A self-contained, clickable miniature of Learn mode for the landing page.
 * Several cards in a short session: reveal, Yes/No, and a response timer that
 * infers the grade — the same trick the real reviewer performs invisibly.
 */

type Stage = 'question' | 'answer' | 'graded';

type DemoCard = {
  kind: 'basic' | 'cloze';
  front: string;
  back: string;
};

const CARDS: DemoCard[] = [
  { kind: 'basic', front: 'lacuna — noun', back: 'A gap; a missing part.' },
  {
    kind: 'cloze',
    front: 'FSRS schedules reviews so memory peaks on {{c1::exam day}}.',
    back: 'exam day',
  },
  {
    kind: 'basic',
    front: 'retrievability — noun',
    back: 'The probability you can recall a card right now.',
  },
];

/** Mirror of the real inference bands, simplified for demonstration. */
function inferGrade(elapsedMs: number, correct: boolean): string {
  if (!correct) return 'Again';
  if (elapsedMs < 2500) return 'Easy';
  if (elapsedMs < 6000) return 'Good';
  return 'Hard';
}

/** Rough mock of exam-day ΔR contribution for the landing-page session strip. */
function deltaR(grade: string): number {
  if (grade === 'Easy') return 1.4;
  if (grade === 'Good') return 0.9;
  if (grade === 'Hard') return 0.4;
  return -0.6;
}

function renderFront(card: DemoCard) {
  if (card.kind === 'cloze') {
    const parts = card.front.split(/\{\{c1::([^}]+)\}\}/);
    return (
      <p className="text-xl leading-snug sm:text-2xl">
        {parts[0]}
        <span className="rounded bg-accent-soft px-1.5 py-0.5 font-medium text-accent-ink">
          […]
        </span>
        {parts[2] ?? ''}
      </p>
    );
  }
  return <p className="text-2xl">{card.front}</p>;
}

const SCROLL_ANSWERS = [true, false, true] as const;

export const GradingDemo = forwardRef<ScrollDrivenDemoHandle, { onComplete?: () => void }>(
  function GradingDemo({ onComplete }, ref) {
    const [cardIndex, setCardIndex] = useState(0);
    const [stage, setStage] = useState<Stage>('question');
    const [grade, setGrade] = useState<string | null>(null);
    const [elapsed, setElapsed] = useState(0);
    const [sessionDelta, setSessionDelta] = useState(0);
    const [grades, setGrades] = useState<string[]>([]);
    const [finished, setFinished] = useState(false);
    const [scrollProgress, setScrollProgress] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const scrollProgressRef = useRef(0);
    const revealedAt = useRef(0);
    const completedRef = useRef(false);
    const cardIndexRef = useRef(0);
    const stageRef = useRef<Stage>('question');

    const card = CARDS[cardIndex] ?? CARDS[0];
    const total = CARDS.length;

    function clearScrollProgress() {
      scrollProgressRef.current = 0;
      setScrollProgress(0);
    }

    function reveal() {
      if (stageRef.current !== 'question') return;
      clearScrollProgress();
      revealedAt.current = performance.now();
      stageRef.current = 'answer';
      setStage('answer');
    }

    function answer(correct: boolean) {
      if (stageRef.current !== 'answer') return;
      clearScrollProgress();
      const ms = performance.now() - revealedAt.current;
      const g = inferGrade(ms, correct);
      setElapsed(ms);
      setGrade(g);
      setSessionDelta((d) => d + deltaR(g));
      setGrades((prev) => [...prev, g]);
      stageRef.current = 'graded';
      setStage('graded');
    }

    function continueSession() {
      if (stageRef.current !== 'graded' && !finished) return;
      clearScrollProgress();
      const i = cardIndexRef.current;
      if (i >= total - 1) {
        setFinished(true);
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete?.();
        }
        return;
      }
      const nextIndex = i + 1;
      cardIndexRef.current = nextIndex;
      setCardIndex(nextIndex);
      setGrade(null);
      stageRef.current = 'question';
      setStage('question');
    }

    function reset() {
      clearScrollProgress();
      cardIndexRef.current = 0;
      stageRef.current = 'question';
      setCardIndex(0);
      setGrade(null);
      setStage('question');
      setSessionDelta(0);
      setGrades([]);
      setFinished(false);
      completedRef.current = false;
    }

    useImperativeHandle(ref, () => ({
      consumeScroll(deltaY: number) {
        if (finished || deltaY <= 0 || !isDemoInReadingArea(rootRef.current)) return false;

        const nextProgress = Math.min(
          1,
          scrollProgressRef.current + deltaY / SCROLL_ACTION_DISTANCE,
        );
        scrollProgressRef.current = nextProgress;
        setScrollProgress(nextProgress);

        if (nextProgress < 1) return true;

        if (stageRef.current === 'question') reveal();
        else if (stageRef.current === 'answer') answer(SCROLL_ANSWERS[cardIndexRef.current]);
        else continueSession();
        return true;
      },
    }));

    const scrollPressed = scrollProgress > 0.45;
    const scrollAnswer = SCROLL_ANSWERS[cardIndex];

    return (
      <div
        ref={rootRef}
        className="shadow-paper mt-6 overflow-hidden rounded-[10px] border border-line-strong bg-surface"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-2.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
            {finished ? 'Session complete' : `Try it — card ${cardIndex + 1} of ${total}`}
          </span>
          <div className="flex items-center gap-3">
            {!finished && (
              <span
                className={
                  'font-mono text-[11px] tabular-nums tracking-wide ' +
                  (sessionDelta >= 0 ? 'text-accent' : 'text-ink-faint')
                }
                title="Mock change in predicted exam-day recall"
              >
                exam ΔR {sessionDelta >= 0 ? '+' : ''}
                {sessionDelta.toFixed(1)}%
              </span>
            )}
            {(finished || grades.length > 0) && (
              <button
                type="button"
                onClick={reset}
                className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent transition-opacity hover:opacity-70"
              >
                Again
              </button>
            )}
          </div>
        </div>

        {/* Session strip */}
        <div className="flex gap-1.5 border-b border-line px-5 py-2" aria-hidden>
          {CARDS.map((_, i) => {
            const g = grades[i];
            return (
              <span
                key={i}
                className={
                  'h-1 flex-1 overflow-hidden rounded-full transition-colors duration-300 ' +
                  (g
                    ? g === 'Again'
                      ? 'bg-ink-faint/40'
                      : 'bg-accent'
                    : i === cardIndex && !finished
                      ? 'bg-accent/20'
                      : 'bg-line-strong')
                }
              >
                {i === cardIndex && !g && !finished && (
                  <span
                    className="block h-full rounded-full bg-accent transition-[width] duration-75"
                    style={{ width: `${scrollProgress * 100}%` }}
                  />
                )}
              </span>
            );
          })}
        </div>

        <div className="grid min-h-48 place-items-center px-6 py-8 text-center">
          {finished ? (
            <div className="animate-demo-flip">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
                three cards · no four-button guesswork
              </p>
              <p className="mt-3 text-2xl">
                Exam ΔR{' '}
                <span className="font-semibold text-accent-ink">
                  {sessionDelta >= 0 ? '+' : ''}
                  {sessionDelta.toFixed(1)}%
                </span>
              </p>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
                You pressed one button per card; the timer supplied the rest. In a real course the
                bands are calibrated to your own response times, and the number updates the same
                exam objective as the progress bar.
              </p>
            </div>
          ) : stage === 'question' ? (
            <div key={`q-${cardIndex}`} className="animate-demo-flip">
              {renderFront(card)}
              <button
                type="button"
                onClick={reveal}
                className={
                  'shadow-paper shadow-paper-hover mt-6 inline-flex min-h-11 items-center rounded-[10px] border bg-surface px-6 text-sm font-medium transition-all duration-100 ' +
                  (scrollPressed ? 'translate-y-1 border-accent shadow-none' : 'border-line-strong')
                }
              >
                Show answer
              </button>
            </div>
          ) : stage === 'answer' ? (
            <div key={`a-${cardIndex}`} className="animate-demo-flip">
              {card.kind === 'cloze' ? (
                <>
                  <p className="text-lg text-ink-soft">
                    {card.front.split(/\{\{c1::([^}]+)\}\}/)[0]}
                    <span className="font-medium text-ink">{card.back}</span>
                    {card.front.split(/\{\{c1::([^}]+)\}\}/)[2] ?? ''}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg text-ink-soft">{card.front}</p>
                  <p className="mt-2 text-2xl">{card.back}</p>
                </>
              )}
              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => answer(false)}
                  className={
                    'shadow-paper shadow-paper-hover inline-flex min-h-11 items-center rounded-[10px] border bg-surface px-8 text-sm font-medium transition-all duration-100 ' +
                    (scrollPressed && !scrollAnswer
                      ? 'translate-y-1 border-accent shadow-none'
                      : 'border-line-strong')
                  }
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => answer(true)}
                  className={
                    'shadow-paper shadow-paper-hover inline-flex min-h-11 items-center rounded-[10px] bg-accent px-8 text-sm font-medium text-accent-fg transition-all duration-100 ' +
                    (scrollPressed && scrollAnswer ? 'translate-y-1 shadow-none brightness-95' : '')
                  }
                >
                  Yes
                </button>
              </div>
              <p className="mt-4 font-mono text-[11px] text-ink-faint">did you know it?</p>
            </div>
          ) : (
            grade && (
              <div key={`g-${cardIndex}`} className="animate-demo-flip">
                <div className="mx-auto mb-4 size-14 rounded-full border-2 border-accent/40 grid place-items-center">
                  <span className="font-mono text-sm tabular-nums text-accent">
                    {(elapsed / 1000).toFixed(1)}s
                  </span>
                </div>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
                  answered in {(elapsed / 1000).toFixed(1)}s
                </p>
                <p className="mt-3 text-2xl">
                  Inferred grade: <span className="font-semibold text-accent-ink">{grade}</span>
                </p>
                <p className="mt-2 font-mono text-[11px] text-ink-soft">
                  exam ΔR {deltaR(grade) >= 0 ? '+' : ''}
                  {deltaR(grade).toFixed(1)}% this card
                </p>
                <button
                  type="button"
                  onClick={continueSession}
                  className={
                    'shadow-paper shadow-paper-hover mt-6 inline-flex min-h-11 items-center rounded-[10px] bg-accent px-8 text-sm font-medium text-accent-fg transition-all duration-100 ' +
                    (scrollPressed ? 'translate-y-1 shadow-none brightness-95' : '')
                  }
                >
                  {cardIndex >= total - 1 ? 'Finish session' : 'Next card'}
                </button>
              </div>
            )
          )}
        </div>
      </div>
    );
  },
);
