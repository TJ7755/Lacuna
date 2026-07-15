import { useState } from 'react';

/**
 * A simplified, hand-drawn SVG rendering of the Lacuna dashboard for the
 * landing page hero. Drawn entirely with theme tokens so it stays crisp at
 * any size and follows light/dark mode and the chosen accent. The SVG stays
 * purely decorative — an accessible HTML overlay button sits on top of the
 * "Study all" bar and drives a tiny inline flashcard preview, in the same
 * spirit as GradingDemo.
 */

const ink = 'hsl(var(--ink))';
const inkSoft = 'hsl(var(--ink-soft))';
const inkFaint = 'hsl(var(--ink-faint))';
const line = 'hsl(var(--line))';
const lineStrong = 'hsl(var(--line-strong))';
const surface = 'hsl(var(--surface))';
const paper = 'hsl(var(--paper))';
const accent = 'hsl(var(--accent))';
const accentSoft = 'hsl(var(--accent-soft))';
const accentFg = 'hsl(var(--accent-fg))';
const mono = 'var(--font-mono)';
const display = 'var(--font-display)';
const body = 'var(--font-body)';

/** Grey skeleton bar standing in for text we do not need to spell out. */
function Bar({ x, y, w, o = 0.5 }: { x: number; y: number; w: number; o?: number }) {
  return <rect x={x} y={y} width={w} height={7} rx={3.5} fill={inkFaint} opacity={o * 0.5} />;
}

type DemoStage = 'idle' | 'front' | 'back';

/** Tiny demo card standing in for the real deck the "Study all" button draws from. */
const DEMO_CARD = { front: 'tempus — noun', back: 'time' };

export type DashboardMockProps = {
  /** Weeks until the demo exam date — drives labels and predicted score. */
  examWeeks?: number;
  /** Extra predicted-score points from landing-page demos (e.g. grading session). */
  readinessBoost?: number;
};

/** Mock predicted exam-day score for the hero dashboard, given horizon and demo boost. */
export function mockPredictedScore(examWeeks: number, readinessBoost = 0, studied = false): number {
  // Further horizons leave more scheduling room; studying one card nudges the bar.
  const base = 28 + examWeeks * 1.6 + (studied ? 3 : 0) + readinessBoost;
  return Math.round(Math.min(94, Math.max(14, base)));
}

export function DashboardMock({ examWeeks = 12, readinessBoost = 0 }: DashboardMockProps) {
  const [stage, setStage] = useState<DemoStage>('idle');
  const studied = stage === 'back';
  const due = studied ? 28 : 29;
  const percent = mockPredictedScore(examWeeks, readinessBoost, studied);
  const barWidth = Math.round((percent / 100) * 284);
  const examDays = examWeeks * 7;
  const examLabel =
    examDays <= 14
      ? `EXAM IN ${examDays} DAYS`
      : `EXAM IN ${examWeeks} WEEKS`;

  function openStudy() {
    setStage((s) => (s === 'idle' ? 'front' : s));
  }

  function flip() {
    setStage('back');
  }

  function resetDemo() {
    setStage('idle');
  }

  return (
    <div className="relative">
      <svg
        viewBox="0 0 960 610"
        className="w-full"
        role="img"
        aria-label="The Lacuna dashboard: course list, seven-day forecast and predicted exam scores"
      >
        <defs>
          <pattern id="mock-dots" width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="1.2" cy="1.2" r="1.2" fill={ink} opacity="0.07" />
          </pattern>
          <clipPath id="mock-frame">
            <rect x="0" y="0" width="960" height="610" rx="14" />
          </clipPath>
        </defs>

        <g clipPath="url(#mock-frame)">
          {/* Chrome */}
          <rect x="0" y="0" width="960" height="610" fill={paper} />

          {/* ——— Sidebar ——— */}
          <rect x="0" y="0" width="212" height="610" fill={surface} />
          <line x1="212" y1="0" x2="212" y2="610" stroke={line} />

          {/* Logo */}
          <rect x="24" y="24" width="34" height="34" rx="10" fill={accent} />
          <path
            d="M37.5 31.5v7l-5.5 9a2.8 2.8 0 0 0 2.4 4.3h13.2a2.8 2.8 0 0 0 2.4-4.3l-5.5-9v-7M35 31.5h12"
            fill="none"
            stroke={accentFg}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <text x="70" y="42" fontFamily={display} fontSize="19" fontWeight="500" fill={ink}>
            Lacuna
          </text>
          <text x="70" y="56" fontFamily={mono} fontSize="7.5" letterSpacing="2" fill={inkFaint}>
            SPACED REVISION
          </text>

          {/* Active nav item */}
          <rect x="14" y="82" width="184" height="34" rx="9" fill={accentSoft} />
          <rect x="14" y="88" width="3" height="22" rx="1.5" fill={accent} />
          <rect
            x="28"
            y="93"
            width="12"
            height="12"
            rx="3"
            fill="none"
            stroke={accent}
            strokeWidth="1.8"
          />
          <text x="50" y="103" fontFamily={body} fontSize="12" fontWeight="500" fill={accent}>
            Dashboard
          </text>

          {/* Remaining nav */}
          {['Study today', 'Search', 'Analytics', 'Settings'].map((label, i) => (
            <g key={label}>
              <circle
                cx="34"
                cy={140 + i * 36}
                r="6.5"
                fill="none"
                stroke={inkFaint}
                strokeWidth="1.6"
              />
              <text x="50" y={144 + i * 36} fontFamily={body} fontSize="12" fill={inkSoft}>
                {label}
              </text>
            </g>
          ))}

          {/* Course list */}
          <text x="24" y="302" fontFamily={mono} fontSize="8.5" letterSpacing="2" fill={inkFaint}>
            COURSES
          </text>
          <rect
            x="26"
            y="318"
            width="13"
            height="13"
            rx="3"
            fill="none"
            stroke={inkSoft}
            strokeWidth="1.6"
          />
          <text x="50" y="329" fontFamily={body} fontSize="12" fill={ink}>
            Welcome to Lacuna
          </text>
          <rect x="168" y="316" width="26" height="17" rx="8.5" fill={accentSoft} />
          <text x="181" y="328" fontFamily={mono} fontSize="9" fill={accent} textAnchor="middle">
            29
          </text>
          <rect
            x="26"
            y="352"
            width="13"
            height="13"
            rx="3"
            fill="none"
            stroke={inkSoft}
            strokeWidth="1.6"
          />
          <text x="50" y="363" fontFamily={body} fontSize="12" fill={ink}>
            Latin
          </text>

          {/* ——— Main: header card ——— */}
          <rect x="238" y="26" width="696" height="118" rx="12" fill={surface} stroke={line} />
          <rect x="239" y="27" width="694" height="116" rx="11" fill="url(#mock-dots)" />
          <text x="266" y="62" fontFamily={mono} fontSize="9.5" letterSpacing="3" fill={inkFaint}>
            YOUR REVISION
          </text>
          <text x="264" y="116" fontFamily={display} fontSize="44" fontWeight="500" fill={ink}>
            Courses
          </text>
          <rect x="794" y="66" width="116" height="36" rx="9" fill={accent} />
          <text
            x="852"
            y="89"
            fontFamily={body}
            fontSize="12"
            fontWeight="500"
            fill={accentFg}
            textAnchor="middle"
          >
            + New course
          </text>

          {/* ——— Forecast card ——— */}
          <rect x="238" y="168" width="696" height="168" rx="12" fill={surface} stroke={line} />
          {/* Streak column */}
          <circle cx="278" cy="212" r="13" fill={accentSoft} />
          <path
            d="M278 205c3 4 5 6 5 9a5 5 0 0 1-10 0c0-3 2-5 5-9z"
            fill="none"
            stroke={accent}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <text x="300" y="217" fontFamily={display} fontSize="18" fill={ink}>
            0{' '}
            <tspan fontFamily={body} fontSize="11" fill={inkSoft}>
              days
            </tspan>
          </text>
          <Bar x={266} y={232} w={110} o={0.7} />
          <text x="266" y="262" fontFamily={body} fontSize="10" fill={inkFaint}>
            study streak
          </text>
          <Bar x={266} y={286} w={110} o={0.7} />
          <text x="266" y="314" fontFamily={body} fontSize="10" fill={inkFaint}>
            reviewed today
          </text>
          <line x1="412" y1="190" x2="412" y2="314" stroke={line} />

          {/* Seven-day forecast */}
          <text x="438" y="204" fontFamily={mono} fontSize="9" letterSpacing="2.5" fill={inkFaint}>
            NEXT 7 DAYS
          </text>
          <text x="908" y="204" fontFamily={body} fontSize="10" fill={inkSoft} textAnchor="end">
            29 cards · 60 min
          </text>
          {['Today', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'].map((day, i) => {
            const x = 456 + i * 66;
            return (
              <g key={day}>
                {i === 0 && (
                  <>
                    <rect x={x - 13} y="220" width="26" height="30" rx="6" fill={accentSoft} />
                    <text
                      x={x}
                      y="240"
                      fontFamily={mono}
                      fontSize="11"
                      fill={accent}
                      textAnchor="middle"
                    >
                      29
                    </text>
                  </>
                )}
                <text
                  x={x}
                  y="266"
                  fontFamily={body}
                  fontSize="10"
                  fontWeight={i === 0 ? 600 : 400}
                  fill={i === 0 ? ink : inkFaint}
                  textAnchor="middle"
                >
                  {day}
                </text>
              </g>
            );
          })}
          <rect x="438" y="282" width="472" height="38" rx="8" fill="none" stroke={line} />
          <text x="452" y="302" fontFamily={body} fontSize="11" fontWeight="500" fill={ink}>
            Today
          </text>
          <text x="896" y="302" fontFamily={body} fontSize="10" fill={inkSoft} textAnchor="end">
            29 cards · 60 min
          </text>
          <rect
            x="452"
            y="310"
            width="444"
            height="3"
            rx="1.5"
            fill="hsl(174 60% 40%)"
            opacity="0.85"
          />

          {/* ——— Study-all bar ——— */}
          <rect x="238" y="360" width="696" height="54" rx="12" fill={surface} stroke={line} />
          <rect x="262" y="376" width="58" height="22" rx="6" fill={accentSoft} />
          <text x="291" y="391" fontFamily={mono} fontSize="10" fill={accent} textAnchor="middle">
            {due} due
          </text>
          <text x="334" y="391" fontFamily={body} fontSize="11" fill={inkSoft}>
            across all courses
          </text>
          <rect x="812" y="371" width="98" height="32" rx="8" fill={accent} />
          <text
            x="861"
            y="391"
            fontFamily={body}
            fontSize="11.5"
            fontWeight="500"
            fill={accentFg}
            textAnchor="middle"
          >
            Study all
          </text>

          {/* ——— Course cards ——— */}
          <rect x="238" y="438" width="336" height="146" rx="12" fill={surface} stroke={line} />
          <text x="264" y="470" fontFamily={mono} fontSize="9" letterSpacing="2" fill={inkFaint}>
            EXAM DATE PASSED
          </text>
          <text x="262" y="500" fontFamily={display} fontSize="22" fontWeight="500" fill={ink}>
            Welcome to Lacuna
          </text>
          <text x="264" y="530" fontFamily={body} fontSize="10.5" fill={inkSoft}>
            1 lesson · 29 cards
          </text>
          <text x="548" y="530" fontFamily={body} fontSize="10.5" fill={ink} textAnchor="end">
            {Math.min(100, percent + 8)}% predicted score
          </text>
          <rect x="264" y="544" width="284" height="5" rx="2.5" fill={lineStrong} opacity="0.5" />
          <rect
            x="264"
            y="544"
            width={Math.min(284, barWidth + 24)}
            height="5"
            rx="2.5"
            fill={accent}
            className="transition-[width] duration-500 ease-out"
          />

          <rect x="598" y="438" width="336" height="146" rx="12" fill={surface} stroke={line} />
          <rect x="604" y="438" width="324" height="4" rx="2" fill={accent} />
          <text x="624" y="470" fontFamily={mono} fontSize="9" letterSpacing="2" fill={accent}>
            {examLabel}
          </text>
          <text x="622" y="500" fontFamily={display} fontSize="22" fontWeight="500" fill={ink}>
            Latin
          </text>
          <text x="624" y="530" fontFamily={body} fontSize="10.5" fill={inkSoft}>
            4 lessons · 86 cards
          </text>
          <text x="908" y="530" fontFamily={body} fontSize="10.5" fill={ink} textAnchor="end">
            {percent}% predicted score
          </text>
          <rect x="624" y="544" width="284" height="5" rx="2.5" fill={lineStrong} opacity="0.5" />
          <rect
            x="624"
            y="544"
            width={barWidth}
            height="5"
            rx="2.5"
            fill={accent}
            className="transition-[width] duration-500 ease-out"
          />
          <text x="624" y="570" fontFamily={body} fontSize="10" fill={accent}>
            {due} due today
          </text>
        </g>

        <rect x="0.5" y="0.5" width="959" height="609" rx="14" fill="none" stroke={lineStrong} />
      </svg>

      {/* Accessible hit target laid over the drawn "Study all" button (812–910, 371–403 of the 960×610 viewBox). */}
      <button
        type="button"
        onClick={openStudy}
        className="absolute rounded-[8px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        style={{ left: '84.58%', top: '60.82%', width: '10.21%', height: '5.25%' }}
      >
        <span className="sr-only">Study all — try a demo card</span>
      </button>

      {stage !== 'idle' && (
        <div
          className="shadow-paper absolute z-10 rounded-[10px] border border-line-strong bg-surface p-4 text-center"
          style={{ left: '58%', top: '68.5%', width: '34%' }}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
              Try it — study all
            </span>
            <button
              type="button"
              onClick={resetDemo}
              aria-label="Close demo"
              className="text-ink-faint transition-opacity hover:opacity-70"
            >
              &times;
            </button>
          </div>

          {stage === 'front' && (
            <div className="animate-demo-flip mt-2">
              <p className="text-base text-ink">{DEMO_CARD.front}</p>
              <button
                type="button"
                onClick={flip}
                className="shadow-paper shadow-paper-hover mt-3 inline-flex min-h-9 items-center rounded-[8px] border border-line-strong bg-surface px-4 text-xs font-medium"
              >
                Reveal
              </button>
            </div>
          )}

          {stage === 'back' && (
            <div className="animate-demo-flip mt-2">
              <p className="text-sm text-ink-soft">{DEMO_CARD.front}</p>
              <p className="mt-1 text-base text-ink">{DEMO_CARD.back}</p>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                One card reviewed — the due count and predicted score just updated.
              </p>
              <button
                type="button"
                onClick={resetDemo}
                className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-accent transition-opacity hover:opacity-70"
              >
                Reset demo
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
