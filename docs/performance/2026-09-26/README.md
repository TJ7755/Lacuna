# Desktop interaction audit implementation

Branch: `fix/desktop-interaction-audit`. Baseline: `94884f12184bf922f2ee0f65245dc0a059ef2dee`.
The original audit described `55de711f`; changes were checked against the newer baseline.

## Behaviour and verification

- Study-step actions are available during the entrance. Graded-card departure, pause
  and arrival timings are unchanged, as explicitly requested by the prompter.
- Study overlays own keyboard input, cancel pending grades and restore a stable focus
  target. Typed answers and card search have persistent accessible names.
- Author-mode mouse and pen lesson drags start after 8 px of movement. The lesson
  follows the pointer and neighbours make room. Touch retains the deliberate hold;
  Alt+Arrow reordering and announcements remain available.
- Card details use native named buttons. Hover actions also appear on focus, concealed
  swipe actions are inert, and held card swipes follow the pointer without spring lag.
- Automatic input mode follows current input; explicit preferences remain fixed.
- Analytics charts expose their values in keyboard-accessible tables. Secondary text
  meets 4.5:1 on the tested theme surfaces. Exiting shell pages are inert.

The targeted unit/component run passed 180 tests across 21 files. Copied regression
tests failed 19 assertions against the baseline in a disposable worktree; the two new
pointer-drag browser regressions also failed there. Assertions were not weakened.
The existing virtualisation test now queries `aria-expanded` on the native details
button rather than its former generic container.

Browser checks passed for keyboard search and focus return, menus/sidebar details,
study reveal and grading, card virtualisation, lesson/card dragging, populated analytics,
rapid course navigation and offline reload. Layout checks included 768, 1,024 and
1,920 px windows; analytics at 150% text, and course tabs/card authoring at 150% text
in 768 and 1,024 px windows. Web typechecking, targeted lint and production builds passed.

A macOS arm64 package built from this branch passed the packaged Electron smoke test
(launch, persistence across reload and study-step completion). The test environment
needed `ELECTRON_RUN_AS_NODE` unset to launch Electron normally.

## Measurements

Apple M5, Chromium 153.0.8010.12, normal motion, no CPU throttling. The canonical quick
fixture contains one course, two lessons, 200 cards and 4,000 reviews. These are short
controlled probes, not evidence of hours-long smoothness on an ordinary older laptop.

| Probe | Result |
| --- | --- |
| 30 reveals | Median 429.9 ms; first five 430.0 ms, last five 430.2 ms |
| 30 graded-card changes | Median 596.4 ms; first five 597.4 ms, last five 596.4 ms |
| Separate 10-grade diagnostic run | Frame p95/max 16.7 ms; no recorded long tasks |
| Card opening/search diagnostic | Frame p95/max 16.7 ms; no recorded long tasks |
| 15 rapid course-tab changes with populated analytics | Frame p95 16.7 ms, max 50 ms; one 53 ms long task; maximum recorded event input delay 37.1 ms |

Reveal/card-change timings include the deliberate animation and pause; they are not
raw input latency. The navigation probe establishes correct final navigation and
one accessible current page, but its long task prevents a blanket claim of flawless
frame pacing. Raw results are beside this report.

Reproduction uses `scripts/performance-heavy/build.mjs` followed by the emitted
`artifacts/performance/run.mjs`, with `PERF_MODE=quick PERF_SMOKE=1 PERF_RATES=1
PERF_REPETITIONS=1 PERF_BURST_REVIEWS=30`. The separate diagnostic run uses ten reviews
and `PERF_DIAGNOSTICS=1`. Browser coverage is in `tests/e2e/desktop-audit.spec.ts` and
the existing accessibility, course-navigation-layout, sidebar-details, study-response,
study-swipe, assessment-editor-width, cards-virtualisation and offline-reload suites.

## Page entrances

All ordinary app-shell routes share an existing 180 ms fade. Course-section navigation
uses a 300 ms directional slide. These durations are scaled by motion preferences;
the initial shell render skips the route entrance. Full-screen study/welcome/download
boundaries have their own existing fade. This pass preserves those designs.

Page content is less uniform: dashboard signals and heatmap have local reveals;
analytics combines section reveals with chart-content animation; Cards staggers lesson
sections by their index. Editors/settings rely primarily on the shared route entrance.
An extra entrance wrapper on every page would overlap the existing route animation.
Nested analytics reveals and the uncapped Cards section stagger remain candidates for
a separate choreography decision, rather than silently treating all deliberate pacing
as a defect. This was a source inspection, not a visual sign-off of every route and state.

## Coverage limits

No Windows package, physical Surface/iPad, pen hardware, high-refresh display or older
laptop was available. Automated macOS smoke coverage does not establish native title-bar
dragging, window-control ergonomics or operating-system scaling. Input switching has
synthetic regression coverage; it still needs physical hybrid-device validation.
Trackpad navigation remains unchanged: ordinary scrolling is not a section gesture.
