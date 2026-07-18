import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import {
  isDemoInReadingArea,
  SCROLL_ACTION_DISTANCE,
  type ScrollDrivenDemoHandle,
} from './scrollDrivenDemo';

/**
 * Landing-page "practice node": features as a due-card pile rather than a
 * marketing grid. Advance through each card; optional onComplete when finished.
 */

type PracticeCard = {
  name: string;
  detail: string;
  face: ReactNode;
};

const CARDS: PracticeCard[] = [
  {
    name: 'Local only',
    detail: 'Everything lives in your browser. No server, no account, no network.',
    face: (
      <svg
        viewBox="0 0 48 48"
        className="size-12 text-accent"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M8 20 24 8l16 12v18a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3z" strokeLinejoin="round" />
        <path d="M20 41V28h8v13" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    name: 'Card types',
    detail: 'Basic, reversed, cloze deletions and typed answers.',
    face: (
      <div className="w-full max-w-[14rem] rounded-[8px] border border-line-strong bg-paper px-4 py-3 text-left">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">Cloze</p>
        <p className="mt-2 text-sm text-ink">
          The capital of France is{' '}
          <span className="rounded bg-accent-soft px-1.5 py-0.5 font-medium text-accent-ink">
            […]
          </span>
          .
        </p>
      </div>
    ),
  },
  {
    name: 'Rich notes',
    detail: 'Markdown with maths, code highlighting and inline images.',
    face: (
      <div className="w-full max-w-[14rem] rounded-[8px] border border-line bg-paper px-4 py-3 text-left font-mono text-xs leading-relaxed text-ink-soft">
        <span className="text-ink-faint">##</span> Integration
        <br />
        <span className="text-accent">$$\int_a^b f(x)\,dx$$</span>
      </div>
    ),
  },
  {
    name: 'Analytics',
    detail: 'Predicted trajectory, stability and review volume per course.',
    face: (
      <svg
        viewBox="0 0 120 48"
        className="h-12 w-28 text-accent"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path
          d="M4 36 C 20 36, 28 20, 40 24 C 56 30, 64 10, 80 14 C 96 18, 104 8, 116 6"
          strokeLinecap="round"
        />
        <circle cx="116" cy="6" r="3" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    name: 'Portable',
    detail:
      'Import and export a whole course as a single JSON file — or bring an Anki deck across.',
    face: (
      <svg
        viewBox="0 0 48 48"
        className="size-12 text-accent"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="10" y="16" width="28" height="22" rx="3" />
        <path d="M18 16V12a6 6 0 0 1 12 0v4" />
        <path d="M24 24v8M20 28h8" strokeLinecap="round" />
      </svg>
    ),
  },
];

export const PracticeDeck = forwardRef<ScrollDrivenDemoHandle, { onComplete?: () => void }>(
  function PracticeDeck({ onComplete }, ref) {
    const [index, setIndex] = useState(0);
    const [finished, setFinished] = useState(false);
    const [scrollProgress, setScrollProgress] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const indexRef = useRef(0);
    const finishedRef = useRef(false);
    const scrollProgressRef = useRef(0);
    const card = CARDS[index] ?? CARDS[CARDS.length - 1];
    const remaining = Math.max(0, CARDS.length - index);

    function next() {
      if (finishedRef.current) return;
      scrollProgressRef.current = 0;
      setScrollProgress(0);
      const i = indexRef.current;
      if (i >= CARDS.length - 1) {
        finishedRef.current = true;
        setFinished(true);
        onComplete?.();
        return;
      }
      const nextIndex = i + 1;
      indexRef.current = nextIndex;
      setIndex(nextIndex);
    }

    function reset() {
      indexRef.current = 0;
      finishedRef.current = false;
      setIndex(0);
      setFinished(false);
      scrollProgressRef.current = 0;
      setScrollProgress(0);
    }

    useImperativeHandle(ref, () => ({
      consumeScroll(deltaY: number) {
        if (finishedRef.current || deltaY <= 0 || !isDemoInReadingArea(rootRef.current)) {
          return false;
        }
        const nextProgress = Math.min(
          1,
          scrollProgressRef.current + deltaY / SCROLL_ACTION_DISTANCE,
        );
        scrollProgressRef.current = nextProgress;
        setScrollProgress(nextProgress);
        if (nextProgress >= 1) next();
        return true;
      },
    }));

    const scrollPressed = scrollProgress > 0.45;

    return (
      <div
        ref={rootRef}
        className="shadow-paper mt-2 overflow-hidden rounded-[10px] border border-line-strong bg-surface"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-2.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
            {finished ? 'Practice clear' : `${remaining} due · practice`}
          </span>
          {finished && (
            <button
              type="button"
              onClick={reset}
              className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent transition-opacity hover:opacity-70"
            >
              Again
            </button>
          )}
        </div>

        <div className="flex gap-1.5 border-b border-line px-5 py-2" aria-hidden>
          {CARDS.map((_, cardIndex) => (
            <span
              key={cardIndex}
              className={
                'h-1 flex-1 overflow-hidden rounded-full ' +
                (cardIndex < index || finished
                  ? 'bg-accent'
                  : cardIndex === index
                    ? 'bg-accent/20'
                    : 'bg-line-strong')
              }
            >
              {cardIndex === index && !finished && (
                <span
                  className="block h-full rounded-full bg-accent transition-[width] duration-75"
                  style={{ width: `${scrollProgress * 100}%` }}
                />
              )}
            </span>
          ))}
        </div>

        <div className="grid min-h-52 place-items-center px-6 py-8 text-center">
          {finished ? (
            <div className="animate-demo-flip">
              <p className="text-2xl text-ink">Queue empty</p>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
                Local data, flexible cards, rich notes, exam-aware analytics and full portability —
                the kit behind every course.
              </p>
            </div>
          ) : (
            <div
              key={card.name}
              className="animate-demo-flip flex w-full max-w-md flex-col items-center"
            >
              <div className="grid min-h-16 place-items-center">{card.face}</div>
              <h3 className="mt-5 font-body text-lg font-semibold tracking-normal text-ink">
                {card.name}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{card.detail}</p>
              <button
                type="button"
                onClick={next}
                className={
                  'shadow-paper shadow-paper-hover mt-6 inline-flex min-h-11 items-center rounded-[10px] bg-accent px-8 text-sm font-medium text-accent-fg transition-all duration-100 ' +
                  (scrollPressed ? 'translate-y-1 shadow-none brightness-95' : '')
                }
              >
                {index >= CARDS.length - 1 ? 'Finish practice' : 'Next card'}
              </button>
              <p className="mt-3 font-mono text-[11px] text-ink-faint">
                {index + 1} of {CARDS.length}
              </p>
            </div>
          )}
        </div>

        {/* Stack hint under the active card */}
        {!finished && remaining > 1 && (
          <div
            className="pointer-events-none relative -mt-2 mb-4 flex justify-center gap-0"
            aria-hidden
          >
            {Array.from({ length: Math.min(3, remaining - 1) }).map((_, i) => (
              <span
                key={i}
                className="absolute h-1.5 rounded-full bg-line-strong"
                style={{
                  width: `${40 - i * 8}%`,
                  bottom: -4 - i * 5,
                  opacity: 0.45 - i * 0.1,
                }}
              />
            ))}
          </div>
        )}
      </div>
    );
  },
);
