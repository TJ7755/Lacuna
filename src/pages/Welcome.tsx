import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useRevealOnScroll } from '../hooks/useRevealOnScroll';
import { GradingDemo } from '../components/welcome/GradingDemo';
import { DashboardMock, mockPredictedScore } from '../components/welcome/DashboardMock';
import { ExamCurve, type ExamWeeks } from '../components/welcome/ExamCurve';
import { PathDemo } from '../components/welcome/PathDemo';
import { PracticeDeck } from '../components/welcome/PracticeDeck';
import { LandingCta } from '../components/welcome/LandingCta';
import { useSmoothScroll } from '../components/welcome/useSmoothScroll';

/**
 * Standalone landing page, presented as a Lacuna course. The page itself is
 * laid out as a course path: every section is a node on a single vertical
 * spine — the hero opens the syllabus, the differentiators are the first
 * lessons, features are a practice node, planned work sits locked further
 * down the path, and the closing call to action is the exam checkpoint.
 * Full-screen and outside the app shell, like Learn mode.
 *
 * The path animates as you walk it: the spine draws itself ahead of the
 * scroll position, each node pops open as it enters view, and the exam
 * curve is traced live. Nodes unlock as demos are completed, mirroring a
 * real course. All CSS-driven; reduced-motion is honoured globally.
 */

type NodeState = 'done' | 'current' | 'locked';

function formatExamDate(weeks: number): string {
  const d = new Date();
  d.setDate(d.getDate() + weeks * 7);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function NodeMarker({ state, visible }: { state: NodeState; visible: boolean }) {
  return (
    <span
      aria-hidden
      className={
        'absolute left-0 top-1 grid size-9 -translate-x-1/2 place-items-center rounded-full border bg-paper transition-all duration-500 ' +
        (visible ? 'scale-100 opacity-100 ' : 'scale-50 opacity-0 ') +
        (state === 'current'
          ? 'border-accent shadow-[0_0_0_4px_hsl(var(--accent)/0.15)]'
          : state === 'done'
            ? 'border-accent/60'
            : 'border-dashed border-line-strong')
      }
    >
      {state === 'done' && (
        <svg viewBox="0 0 16 16" className="size-4 text-accent" fill="none" stroke="currentColor" strokeWidth="2">
          <path
            d="M3.5 8.5l3 3 6-7"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={visible ? 0 : 1}
            style={{ transition: 'stroke-dashoffset 600ms ease 300ms' }}
          />
        </svg>
      )}
      {state === 'current' && <span className="size-2.5 animate-pulse rounded-full bg-accent" />}
      {state === 'locked' && (
        <svg viewBox="0 0 16 16" className="size-3.5 text-ink-faint" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="7" width="10" height="7" rx="1.5" />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
        </svg>
      )}
    </span>
  );
}

function PathNode({
  state,
  eyebrow,
  title,
  annotation,
  children,
  id,
  /** When true, locked nodes still show children (e.g. "next term" roadmap). */
  previewWhenLocked = false,
}: {
  state: NodeState;
  eyebrow: string;
  title: string;
  annotation?: string;
  children: ReactNode;
  id?: string;
  previewWhenLocked?: boolean;
}) {
  const { ref, visible } = useRevealOnScroll<HTMLElement>();
  const locked = state === 'locked';
  const hideBody = locked && !previewWhenLocked;
  return (
    <section ref={ref} id={id} className="relative pb-20 pl-10 sm:pl-14">
      <NodeMarker state={state} visible={visible} />
      {annotation && (
        <p
          aria-hidden
          className={
            'pointer-events-none absolute -left-2 top-14 hidden w-28 -translate-x-full pr-4 text-right font-mono text-[10px] leading-snug tracking-wide text-ink-faint/80 lg:block ' +
            (visible ? 'opacity-100' : 'opacity-0')
          }
          style={{ transition: 'opacity 900ms ease 200ms' }}
        >
          {annotation}
        </p>
      )}
      <div
        className={
          'reveal ' +
          (visible ? 'reveal-visible' : '') +
          (hideBody ? ' opacity-50' : locked ? ' opacity-80' : '')
        }
      >
        <p
          className={
            'font-mono text-[11px] uppercase tracking-[0.18em] ' +
            (state === 'current' ? 'text-accent' : 'text-ink-faint')
          }
        >
          {eyebrow}
        </p>
        <h2 className="mt-2 text-3xl text-balance sm:text-4xl">{title}</h2>
        <div className="mt-5 max-w-2xl">
          {hideBody ? (
            <p className="leading-relaxed text-ink-soft">
              Complete the lesson above to unlock this node — the same rule as every Lacuna course.
            </p>
          ) : (
            children
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The course spine, drawn ahead of the reader. A faint full-height rule shows
 * the whole path; an accent overlay is scaled to match how far the viewport
 * has descended through it, mutated directly to avoid re-rendering on scroll.
 */
function usePathProgress() {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const container = containerRef.current;
      const line = lineRef.current;
      if (!container || !line) return;
      const rect = container.getBoundingClientRect();
      // Progress of the viewport's lower third through the container.
      const anchor = window.innerHeight * 0.66;
      const progress = Math.min(1, Math.max(0, (anchor - rect.top) / rect.height));
      line.style.transform = `scaleY(${progress})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return { containerRef, lineRef };
}

/**
 * The dashboard screenshot in the hero, drawn as SVG. It arrives slightly
 * shrunken and tilted away, then expands to full size and flattens out as it
 * is scrolled towards the top of the viewport — scroll-linked, so the motion
 * follows the reader's own pace. Mutated directly, off React's render path.
 */
function HeroDashboard({
  examWeeks,
  readinessBoost,
}: {
  examWeeks: number;
  readinessBoost: number;
}) {
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const update = () => {
      raf = 0;
      const frame = frameRef.current;
      if (!frame) return;
      if (reduced) {
        frame.style.transform = 'scale(1) rotateX(0deg)';
        return;
      }
      const rect = frame.getBoundingClientRect();
      // 0 while the frame is still low in the viewport, 1 once its centre
      // has risen to 40% of the viewport height.
      const start = window.innerHeight;
      const end = window.innerHeight * 0.4;
      const centre = rect.top + rect.height / 2;
      const progress = Math.min(1, Math.max(0, (start - centre) / (start - end)));
      const eased = 1 - (1 - progress) ** 3;
      frame.style.transform = `scale(${0.88 + eased * 0.12}) rotateX(${(1 - eased) * 14}deg)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      className="hero-rise relative mx-auto max-w-5xl px-6 pb-24 sm:px-10"
      style={{ animationDelay: '480ms', perspective: '1400px' }}
    >
      {/* Soft desk plane under the mock — reads as an object on a surface. */}
      <div
        aria-hidden
        className="hero-desk pointer-events-none absolute inset-x-10 bottom-14 h-16 rounded-[50%] bg-ink/[0.07] blur-2xl dark:bg-ink/[0.18] sm:inset-x-20"
      />
      <div
        ref={frameRef}
        className="relative overflow-hidden rounded-[14px] shadow-[0_24px_60px_-24px_hsl(var(--ink)/0.35)] will-change-transform"
        style={{ transformOrigin: 'center top' }}
      >
        <DashboardMock examWeeks={examWeeks} readinessBoost={readinessBoost} />
      </div>
    </div>
  );
}

const PLANNED: Array<{ name: string; detail: string }> = [
  {
    name: 'Sequence learning',
    detail: 'Cards that teach ordered material — steps, stages, proofs — as a sequence rather than isolated facts.',
  },
  {
    name: 'MCP server',
    detail: 'Let an AI assistant read your courses and write cards for you.',
  },
];

const SMOOTH_SCROLL_KEY = 'lacuna-welcome-smooth-scroll';

export function Welcome() {
  const { containerRef, lineRef } = usePathProgress();
  const [smoothScroll, setSmoothScroll] = useState(
    () => localStorage.getItem(SMOOTH_SCROLL_KEY) !== 'off',
  );
  const [showScrollToggle, setShowScrollToggle] = useState(false);
  const [examWeeks, setExamWeeks] = useState<ExamWeeks>(12);
  const [gradingDone, setGradingDone] = useState(false);
  const [pathDone, setPathDone] = useState(false);
  const [practiceDone, setPracticeDone] = useState(false);
  const [checkpointSkip, setCheckpointSkip] = useState(false);
  useSmoothScroll(smoothScroll);

  const readinessBoost = gradingDone ? 4 : 0;
  const predicted = mockPredictedScore(examWeeks, readinessBoost);
  const examDateLabel = formatExamDate(examWeeks);

  // Path node states — demos unlock the path the way lessons unlock in-app.
  const examNode: NodeState = 'done';
  const gradingNode: NodeState = gradingDone ? 'done' : 'current';
  const pathNode: NodeState = !gradingDone ? 'locked' : pathDone ? 'done' : 'current';
  const practiceNode: NodeState = !pathDone ? 'locked' : practiceDone ? 'done' : 'current';
  const plannedNode: NodeState = 'locked';
  const checkpointOpen = pathDone || checkpointSkip;

  useEffect(() => {
    const onScroll = () => setShowScrollToggle(window.scrollY > 96);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function toggleSmoothScroll() {
    setSmoothScroll((on) => {
      localStorage.setItem(SMOOTH_SCROLL_KEY, on ? 'off' : 'on');
      return !on;
    });
  }

  return (
    <div className="min-h-dvh">
      {/* Accessibility escape hatch for the weighted wheel scrolling — appears after scroll. */}
      <button
        type="button"
        aria-pressed={smoothScroll}
        onClick={toggleSmoothScroll}
        className={
          'fixed right-4 top-4 z-50 rounded-full border border-line-strong bg-paper/85 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft backdrop-blur transition-all hover:border-accent hover:text-ink ' +
          (showScrollToggle ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0')
        }
      >
        Smooth scroll {smoothScroll ? 'on' : 'off'}
      </button>

      {/* ——— Hero: the course opens ——— */}
      <header className="bg-dot-grid relative overflow-hidden border-b border-line">
        <div className="relative mx-auto flex min-h-[70dvh] max-w-3xl flex-col justify-center px-6 pb-10 pt-24 sm:px-10">
          <p
            className="hero-rise font-mono text-[11px] uppercase tracking-[0.18em] text-accent"
            style={{ animationDelay: '40ms' }}
          >
            Spaced revision · exam-first
          </p>
          <h1
            className="hero-rise mt-6 text-5xl leading-[1.05] text-balance sm:text-7xl"
            style={{ animationDelay: '120ms' }}
          >
            Study for the day that counts.
          </h1>
          <p
            className="hero-rise mt-8 max-w-xl text-lg leading-relaxed text-ink-soft"
            style={{ animationDelay: '240ms' }}
          >
            Lacuna is a spaced-revision app with one fixed point: your exam date. Every card is
            scheduled backwards from it, so your memory peaks in the room where it matters.
          </p>

          <div className="hero-rise mt-10 flex flex-wrap items-center gap-4" style={{ animationDelay: '360ms' }}>
            <LandingCta>Create your first course</LandingCta>
            <button
              type="button"
              onClick={() => {
                const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                document
                  .getElementById('lesson-grading')
                  ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
              }}
              className="inline-flex min-h-12 items-center rounded-[10px] px-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-accent"
            >
              Try one card first
            </button>
            <Link
              to="/settings"
              className="inline-flex min-h-12 items-center rounded-[10px] px-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint transition-colors hover:text-ink-soft"
            >
              Import Anki / JSON
            </Link>
          </div>
        </div>

        {/* The dashboard itself, unfolding onto the desk as you scroll. */}
        <HeroDashboard examWeeks={examWeeks} readinessBoost={readinessBoost} />

        <p className="scroll-hint pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
          the path begins below
        </p>
      </header>

      {/* ——— The path: one spine, every section a node ——— */}
      <main id="syllabus" className="mx-auto max-w-3xl px-6 pt-24 sm:px-10">
        <div ref={containerRef} className="relative ml-4 border-l border-line sm:ml-8">
          {/* Accent spine drawn to the current scroll position. */}
          <span
            ref={lineRef}
            aria-hidden
            className="path-spine absolute -left-px top-0 h-full w-0.5 origin-top bg-accent will-change-transform"
            style={{ transform: 'scaleY(0)' }}
          />

          <PathNode
            state={examNode}
            eyebrow="Lesson 01 — completed"
            title="The exam is the objective"
            annotation="objective = exam R"
          >
            <p className="leading-relaxed text-ink-soft">
              Most spaced-repetition tools answer one question: when is this card next due? Lacuna
              answers a better one: how likely are you to recall it on exam day? Built on FSRS-6,
              it forward-simulates every card&rsquo;s memory to a fixed date and serves whatever
              raises your predicted exam-day recall the most. The progress bar and the scheduler
              read from the same objective, so the number you see is the number being optimised.
            </p>
            <ExamCurve weeks={examWeeks} onWeeksChange={setExamWeeks} />
          </PathNode>

          <PathNode
            state={gradingNode}
            eyebrow={gradingDone ? 'Lesson 02 — completed' : 'Lesson 02 — you are here'}
            title="Grading you never see"
            annotation="timer, not four buttons"
            id="lesson-grading"
          >
            <p className="leading-relaxed text-ink-soft">
              No four-button guesswork after every card. You answer <span className="font-medium text-ink">Yes</span> or{' '}
              <span className="font-medium text-ink">No</span>; a response timer, calibrated to you
              per course, quietly infers the full grade behind the scenes. The inference is
              measured against your actual recall — and if you would rather grade by hand, one
              toggle brings the four buttons back.
            </p>
            <GradingDemo onComplete={() => setGradingDone(true)} />
          </PathNode>

          <PathNode
            state={pathNode}
            eyebrow={
              pathNode === 'locked'
                ? 'Lesson 03 — locked'
                : pathDone
                  ? 'Lesson 03 — completed'
                  : 'Lesson 03 — you are here'
            }
            title="Courses that are actually paths"
            annotation="unlock in sequence"
            id="lesson-path"
          >
            <p className="leading-relaxed text-ink-soft">
              A course is an ordered path of lessons — notes and cards studied in sequence, each
              lesson unlocking the next, with practice nodes gathering due cards along the way and
              a checkpoint marking the exam at the end. You are walking one right now: this page is
              laid out exactly like a Lacuna course, spine, nodes, checkpoint and all.
            </p>
            <PathDemo onComplete={() => setPathDone(true)} />
          </PathNode>

          <PathNode
            state={practiceNode}
            eyebrow={
              practiceNode === 'locked'
                ? 'Practice — locked'
                : practiceDone
                  ? 'Practice — clear'
                  : 'Practice — everything due'
            }
            title="The rest of the kit"
            annotation="due after lessons"
          >
            <p className="mb-4 leading-relaxed text-ink-soft">
              Features as a practice queue — work through what is due, the way a practice node
              gathers cards from lessons you have already walked. Upcoming assessments can carry
              their own scope and exclusions; choose one by name to create a persistent,
              time-budgeted revision plan ranked by predicted assessment-day value, with ordinary
              Practice as the explicit fallback.
            </p>
            <PracticeDeck onComplete={() => setPracticeDone(true)} />
          </PathNode>

          <PathNode
            state={plannedNode}
            eyebrow="Further along the path"
            title="Next term"
            annotation="not yet shipped"
            previewWhenLocked
          >
            <ul className="space-y-5">
              {PLANNED.map((p) => (
                <li key={p.name} className="border-l-2 border-dashed border-line-strong pl-4">
                  <h3 className="font-body text-sm font-semibold tracking-normal text-ink-soft">{p.name}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-faint">{p.detail}</p>
                </li>
              ))}
            </ul>
          </PathNode>

          {/* ——— Checkpoint: the CTA is the exam ——— */}
          <CheckpointSection
            open={checkpointOpen}
            onSkip={() => setCheckpointSkip(true)}
            examDateLabel={examDateLabel}
            predicted={predicted}
          />
        </div>

        <footer className="border-t border-line py-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
              Lacuna — fill the gap before it is examined.
            </p>
            <div className="flex flex-wrap gap-4 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
              <Link to="/settings" className="transition-colors hover:text-ink-soft">
                Settings
              </Link>
              <a
                href="https://github.com/TJ7755/Lacuna"
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-ink-soft"
              >
                GitHub
              </a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

function CheckpointSection({
  open,
  onSkip,
  examDateLabel,
  predicted,
}: {
  open: boolean;
  onSkip: () => void;
  examDateLabel: string;
  predicted: number;
}) {
  const { ref, visible } = useRevealOnScroll<HTMLElement>();
  return (
    <section ref={ref} className="relative pb-24 pl-10 sm:pl-14">
      <span
        aria-hidden
        className={
          'absolute left-0 top-1 grid size-9 -translate-x-1/2 place-items-center rounded-full border transition-all duration-500 ' +
          (open
            ? 'border-accent bg-accent text-accent-fg ' +
              (visible ? 'scale-100 opacity-100 shadow-[0_0_0_6px_hsl(var(--accent)/0.15)]' : 'scale-50 opacity-0')
            : 'border-dashed border-line-strong bg-paper text-ink-faint ' +
              (visible ? 'scale-100 opacity-100' : 'scale-50 opacity-0'))
        }
      >
        {open ? (
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 2h8v12l-4-3-4 3z" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="7" width="10" height="7" rx="1.5" />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
          </svg>
        )}
      </span>
      <div className={'reveal ' + (visible ? 'reveal-visible' : '')}>
        <p className={'font-mono text-[11px] uppercase tracking-[0.18em] ' + (open ? 'text-accent' : 'text-ink-faint')}>
          {open ? 'Checkpoint — exam' : 'Checkpoint — locked'}
        </p>
        {!open ? (
          <div className="mt-4 max-w-2xl">
            <h2 className="text-3xl text-balance text-ink-soft sm:text-4xl">Walk the path to the exam</h2>
            <p className="mt-4 leading-relaxed text-ink-soft">
              Finish the grading session and the course-path demo above — or skip ahead if you
              already know the shape of the app.
            </p>
            <button
              type="button"
              onClick={onSkip}
              className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-accent transition-opacity hover:opacity-70"
            >
              Skip to the checkpoint
            </button>
          </div>
        ) : (
          <div className="checkpoint-card shadow-paper mt-4 max-w-2xl rounded-[10px] border border-accent/40 bg-gradient-to-br from-surface-raised to-accent-soft/50 p-8 sm:p-10">
            <h2 className="text-3xl text-balance sm:text-4xl">
              Your exam already has a date. Give it a course.
            </h2>
            <p className="mt-4 leading-relaxed text-ink-soft">
              The gap between what you know and what the exam asks is measurable. Close it on
              purpose — free, open and entirely yours. Every note and every review stays on your
              device.
            </p>
            <p className="mt-3 font-mono text-[11px] text-ink-faint">
              Demo horizon · {examDateLabel} · {predicted}% predicted readiness
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <LandingCta>Open the dashboard</LandingCta>
              <Link
                to="/settings"
                className="inline-flex min-h-12 items-center font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-accent"
              >
                Import a deck
              </Link>
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
                Alpha — local, free, yours
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
