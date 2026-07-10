import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useRevealOnScroll } from '../hooks/useRevealOnScroll';
import { GradingDemo } from '../components/welcome/GradingDemo';
import { DashboardMock } from '../components/welcome/DashboardMock';
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
 * curve is traced live. All CSS-driven; reduced-motion is honoured globally.
 */

type NodeState = 'done' | 'current' | 'locked';

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
  children,
}: {
  state: NodeState;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  const { ref, visible } = useRevealOnScroll<HTMLElement>();
  return (
    <section ref={ref} className="relative pb-20 pl-10 sm:pl-14">
      <NodeMarker state={state} visible={visible} />
      <div className={'reveal ' + (visible ? 'reveal-visible' : '')}>
        <p
          className={
            'font-mono text-[11px] uppercase tracking-[0.18em] ' +
            (state === 'current' ? 'text-accent' : 'text-ink-faint')
          }
        >
          {eyebrow}
        </p>
        <h2 className="mt-2 text-3xl text-balance sm:text-4xl">{title}</h2>
        <div className="mt-5 max-w-2xl">{children}</div>
      </div>
    </section>
  );
}

/** Retrievability sketch: a forgetting curve bent so it peaks on exam day. */
function ExamCurve() {
  const { ref, visible } = useRevealOnScroll<HTMLElement>();
  return (
    <figure ref={ref} className="mt-6 rounded-[10px] border border-line bg-surface p-5 shadow-paper">
      <svg viewBox="0 0 560 180" className="w-full" role="img" aria-label="Recall probability scheduled to peak on the exam date rather than decay between fixed intervals">
        {/* Decaying interval-based recall, the conventional approach. */}
        <path
          d="M20 40 C 80 130, 110 55, 130 55 C 190 145, 220 70, 240 70 C 310 155, 350 90, 380 90 C 440 160, 480 120, 500 120"
          fill="none"
          stroke="hsl(var(--ink-faint))"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          style={{ opacity: visible ? 1 : 0, transition: 'opacity 800ms ease 200ms' }}
        />
        {/* Exam-objective scheduling: retrievability shepherded upwards to exam
            day, traced live as the figure scrolls into view. */}
        <path
          d="M20 40 C 90 110, 150 60, 210 78 C 290 100, 380 55, 500 28"
          fill="none"
          stroke="hsl(var(--accent))"
          strokeWidth="2.5"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={visible ? 0 : 1}
          style={{ transition: 'stroke-dashoffset 1600ms cubic-bezier(0.4, 0, 0.2, 1) 300ms' }}
        />
        {/* Exam-day marker. */}
        <line x1="500" y1="14" x2="500" y2="166" stroke="hsl(var(--line-strong))" strokeWidth="1" />
        <circle cx="500" cy="28" r="4.5" fill="hsl(var(--accent))" className={visible ? 'exam-pulse' : ''} />
        <text x="492" y="176" textAnchor="end" fontFamily="var(--font-mono)" fontSize="10" fill="hsl(var(--ink-faint))">
          exam day
        </text>
        <text x="20" y="176" fontFamily="var(--font-mono)" fontSize="10" fill="hsl(var(--ink-faint))">
          today
        </text>
      </svg>
      <figcaption className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] text-ink-faint">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-0.5 w-5 bg-accent" aria-hidden />
          scheduled against the exam
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-px w-5 border-t border-dashed border-ink-faint" aria-hidden />
          left to fixed intervals
        </span>
      </figcaption>
    </figure>
  );
}

/** Feature grid with a per-card staggered reveal and accent-tinted hover. */
function FeatureGrid() {
  const { ref, visible } = useRevealOnScroll<HTMLUListElement>();
  return (
    <ul ref={ref} className="grid gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-2">
      {FEATURES.map((f, i) => (
        <li
          key={f.name}
          className={
            'reveal bg-surface p-5 transition-colors hover:bg-accent-soft/40 ' +
            (visible ? 'reveal-visible' : '')
          }
          style={{ transitionDelay: visible ? `${i * 70}ms` : undefined }}
        >
          <h3 className="font-body text-sm font-semibold tracking-normal">{f.name}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{f.detail}</p>
        </li>
      ))}
    </ul>
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
function HeroDashboard() {
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const frame = frameRef.current;
      if (!frame) return;
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
    <div className="hero-rise mx-auto max-w-5xl px-6 pb-20 sm:px-10" style={{ animationDelay: '480ms', perspective: '1400px' }}>
      <div
        ref={frameRef}
        className="overflow-hidden rounded-[14px] shadow-[0_24px_60px_-24px_hsl(var(--ink)/0.35)] will-change-transform"
        style={{ transformOrigin: 'center top' }}
      >
        <DashboardMock />
      </div>
    </div>
  );
}

const FEATURES: Array<{ name: string; detail: string }> = [
  { name: 'Local only', detail: 'Everything lives in your browser. No server, no account, no network.' },
  { name: 'Card types', detail: 'Basic, reversed, cloze deletions and typed answers.' },
  { name: 'Rich notes', detail: 'Markdown with maths, code highlighting and inline images.' },
  { name: 'Simple mode', detail: 'An algorithm-free Yes/No loop when you just want to drill.' },
  { name: 'Analytics', detail: 'Predicted trajectory, stability and review volume per course.' },
  { name: 'Question bank', detail: 'Every card in a course, searchable and editable in one place.' },
  { name: 'Touch first', detail: 'Swipes, bottom sheets and generous targets on every screen.' },
  { name: 'Portable', detail: 'Import and export a whole course as a single JSON file.' },
];

const PLANNED: Array<{ name: string; detail: string }> = [
  { name: 'Sequence learning', detail: 'Cards that teach ordered material — steps, stages, proofs — as a sequence rather than isolated facts.' },
  { name: 'MCP server', detail: 'Let an AI assistant read your courses and write cards for you.' },
  { name: 'Cram mode, rebuilt', detail: 'A proper short-horizon mode for when the exam is days away, not months.' },
];

const SMOOTH_SCROLL_KEY = 'lacuna-welcome-smooth-scroll';

export function Welcome() {
  const { containerRef, lineRef } = usePathProgress();
  const [smoothScroll, setSmoothScroll] = useState(
    () => localStorage.getItem(SMOOTH_SCROLL_KEY) !== 'off',
  );
  useSmoothScroll(smoothScroll);

  function toggleSmoothScroll() {
    setSmoothScroll((on) => {
      localStorage.setItem(SMOOTH_SCROLL_KEY, on ? 'off' : 'on');
      return !on;
    });
  }

  return (
    <div className="min-h-dvh">
      {/* Accessibility escape hatch for the weighted wheel scrolling. */}
      <button
        type="button"
        aria-pressed={smoothScroll}
        onClick={toggleSmoothScroll}
        className="fixed right-4 top-4 z-50 rounded-full border border-line-strong bg-paper/85 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft backdrop-blur transition-colors hover:border-accent hover:text-ink"
      >
        Smooth scroll {smoothScroll ? 'on' : 'off'}
      </button>
      {/* ——— Hero: the course opens ——— */}
      <header className="bg-dot-grid relative overflow-hidden border-b border-line">
        <div className="relative mx-auto flex min-h-[70dvh] max-w-3xl flex-col justify-center px-6 pb-10 pt-24 sm:px-10">
          <p className="hero-rise flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
            <span>Lacuna — noun. A gap; a missing part.</span>
            <span className="rounded-full border border-line-strong px-2.5 py-0.5 text-ink-soft">Prototype</span>
          </p>
          <h1 className="hero-rise mt-6 text-5xl leading-[1.05] text-balance sm:text-7xl" style={{ animationDelay: '120ms' }}>
            Study for the day it counts, not the day the app says.
          </h1>
          <p className="hero-rise mt-8 max-w-xl text-lg leading-relaxed text-ink-soft" style={{ animationDelay: '240ms' }}>
            Lacuna is a spaced-revision app with one fixed point: your exam date. Every card is
            scheduled backwards from it, so your memory peaks in the room where it matters.
          </p>
          <div className="hero-rise mt-10 flex flex-wrap items-center gap-4" style={{ animationDelay: '360ms' }}>
            <Link
              to="/"
              className="shadow-paper shadow-paper-hover inline-flex min-h-11 items-center rounded-[10px] bg-accent px-6 text-sm font-medium text-accent-fg"
            >
              Get started
            </Link>
            <a
              href="#syllabus"
              className="inline-flex min-h-11 items-center rounded-[10px] border border-line-strong px-6 text-sm font-medium text-ink-soft transition-colors hover:border-accent hover:text-ink"
            >
              Read the syllabus
            </a>
          </div>
        </div>

        {/* The dashboard itself, unfolding onto the desk as you scroll. */}
        <HeroDashboard />

        <p className="scroll-hint pointer-events-none absolute bottom-5 left-1/2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
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
            className="absolute -left-px top-0 h-full w-0.5 origin-top bg-accent will-change-transform"
            style={{ transform: 'scaleY(0)' }}
          />
          <PathNode state="done" eyebrow="Lesson 01 — completed" title="The exam is the objective">
            <p className="leading-relaxed text-ink-soft">
              Most spaced-repetition tools answer one question: when is this card next due? Lacuna
              answers a better one: how likely are you to recall it on exam day? Built on FSRS-6,
              it forward-simulates every card&rsquo;s memory to a fixed date and serves whatever
              raises your predicted exam-day recall the most. The progress bar and the scheduler
              read from the same objective, so the number you see is the number being optimised.
            </p>
            <ExamCurve />
          </PathNode>

          <PathNode state="done" eyebrow="Lesson 02 — completed" title="Grading you never see">
            <p className="leading-relaxed text-ink-soft">
              No four-button guesswork after every card. You answer <span className="font-medium text-ink">Yes</span> or{' '}
              <span className="font-medium text-ink">No</span>; a response timer, calibrated to you
              per course, quietly infers the full grade behind the scenes. The inference is
              measured against your actual recall — and if you would rather grade by hand, one
              toggle brings the four buttons back.
            </p>
            <GradingDemo />
          </PathNode>

          <PathNode state="current" eyebrow="Lesson 03 — you are here" title="Courses that are actually paths">
            <p className="leading-relaxed text-ink-soft">
              A course is an ordered path of lessons — notes and cards studied in sequence, each
              lesson unlocking the next, with practice nodes gathering due cards along the way and
              a checkpoint marking the exam at the end. You are walking one right now: this page is
              laid out exactly like a Lacuna course, spine, nodes, checkpoint and all.
            </p>
          </PathNode>

          <PathNode state="current" eyebrow="Practice — everything due" title="The rest of the kit">
            <FeatureGrid />
          </PathNode>

          <PathNode state="locked" eyebrow="Further along the path" title="Not yet unlocked">
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
          <CheckpointSection />
        </div>

        <footer className="border-t border-line py-10">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
            Lacuna — fill the gap before it is examined.
          </p>
        </footer>
      </main>
    </div>
  );
}

function CheckpointSection() {
  const { ref, visible } = useRevealOnScroll<HTMLElement>();
  return (
    <section ref={ref} className="relative pb-24 pl-10 sm:pl-14">
      <span
        aria-hidden
        className={
          'absolute left-0 top-1 grid size-9 -translate-x-1/2 place-items-center rounded-full border border-accent bg-accent text-accent-fg transition-all duration-500 ' +
          (visible ? 'scale-100 opacity-100 shadow-[0_0_0_6px_hsl(var(--accent)/0.15)]' : 'scale-50 opacity-0')
        }
      >
        <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 2h8v12l-4-3-4 3z" strokeLinejoin="round" />
        </svg>
      </span>
      <div className={'reveal ' + (visible ? 'reveal-visible' : '')}>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">Checkpoint — exam</p>
        <div className="shadow-paper mt-4 max-w-2xl rounded-[10px] border border-accent/40 bg-gradient-to-br from-surface-raised to-accent-soft/50 p-8 sm:p-10">
          <h2 className="text-3xl text-balance sm:text-4xl">Your exam already has a date. Give it a course.</h2>
          <p className="mt-4 leading-relaxed text-ink-soft">
            Free, open and entirely yours — every note and every review stays on your device.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              to="/"
              className="shadow-paper shadow-paper-hover inline-flex min-h-11 items-center rounded-[10px] bg-accent px-6 text-sm font-medium text-accent-fg"
            >
              Get started
            </Link>
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
              Lacuna is a prototype
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
