import { useRef, useState } from 'react';

/**
 * A self-contained, clickable miniature of Learn mode for the landing page.
 * Reveal the answer, press Yes or No, and watch the response timer infer a
 * grade — the same trick the real reviewer performs invisibly.
 */

type Stage = 'question' | 'answer' | 'graded';

const CARD = {
  front: 'lacuna — noun',
  back: 'A gap; a missing part.',
};

/** Mirror of the real inference bands, simplified for demonstration. */
function inferGrade(elapsedMs: number, correct: boolean): string {
  if (!correct) return 'Again';
  if (elapsedMs < 2500) return 'Easy';
  if (elapsedMs < 6000) return 'Good';
  return 'Hard';
}

export function GradingDemo() {
  const [stage, setStage] = useState<Stage>('question');
  const [grade, setGrade] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const revealedAt = useRef(0);

  function reveal() {
    revealedAt.current = performance.now();
    setStage('answer');
  }

  function answer(correct: boolean) {
    const ms = performance.now() - revealedAt.current;
    setElapsed(ms);
    setGrade(inferGrade(ms, correct));
    setStage('graded');
  }

  function reset() {
    setGrade(null);
    setStage('question');
  }

  return (
    <div className="shadow-paper mt-6 overflow-hidden rounded-[10px] border border-line-strong bg-surface">
      <div className="flex items-center justify-between border-b border-line px-5 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
          Try it — one card, no strings
        </span>
        {stage === 'graded' && (
          <button
            type="button"
            onClick={reset}
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent transition-opacity hover:opacity-70"
          >
            Again
          </button>
        )}
      </div>

      <div className="grid min-h-44 place-items-center px-6 py-8 text-center">
        {stage === 'question' && (
          <div>
            <p className="text-2xl">{CARD.front}</p>
            <button
              type="button"
              onClick={reveal}
              className="shadow-paper shadow-paper-hover mt-6 inline-flex min-h-11 items-center rounded-[10px] border border-line-strong bg-surface px-6 text-sm font-medium"
            >
              Show answer
            </button>
          </div>
        )}

        {stage === 'answer' && (
          <div className="animate-demo-flip">
            <p className="text-lg text-ink-soft">{CARD.front}</p>
            <p className="mt-2 text-2xl">{CARD.back}</p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => answer(false)}
                className="shadow-paper shadow-paper-hover inline-flex min-h-11 items-center rounded-[10px] border border-line-strong bg-surface px-8 text-sm font-medium"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => answer(true)}
                className="shadow-paper shadow-paper-hover inline-flex min-h-11 items-center rounded-[10px] bg-accent px-8 text-sm font-medium text-accent-fg"
              >
                Yes
              </button>
            </div>
            <p className="mt-4 font-mono text-[11px] text-ink-faint">did you know it?</p>
          </div>
        )}

        {stage === 'graded' && grade && (
          <div className="animate-demo-flip">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
              answered in {(elapsed / 1000).toFixed(1)}s
            </p>
            <p className="mt-3 text-2xl">
              Inferred grade: <span className="text-accent-ink font-semibold">{grade}</span>
            </p>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
              You pressed one button; the timer supplied the rest. In a real course the bands are
              calibrated to your own response times.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
