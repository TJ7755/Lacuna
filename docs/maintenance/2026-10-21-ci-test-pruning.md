# CI test pruning, 21 October 2026

The audit removes 134 browser cases (504 → 370, including the unchanged three-case mobile WebKit
suite) and 66 executed unit cases (48 test declarations; Vitest discovery: 5,060 → 5,012).
Twenty test files disappear entirely.
Application code, coverage thresholds, CI gates and retries are unchanged.

## Evidence and limits

[CI run 39510646817](https://github.com/TJ7755/Lacuna/actions/runs/39510646817) recorded 509 browser
cases, including skipped standalone-site cases. Its reports contain about 2,693 seconds of summed
case execution. The removed cases account for about 693 seconds of that historical execution,
roughly 26%. This is avoided browser execution across parallel jobs, not a promised wall-clock
saving. Browser installation, builds, runner scheduling and shard balance still affect CI duration.
The current base has fewer cases than that historical run; before/after discovery above uses the
same checkout and Playwright configuration.

Git history includes audit-only repairs such as waiting for card surfaces, reading layout bounds in
one frame and sampling sidebar motion on the browser frame clock. These stabilised measurements;
they do not demonstrate a regression in a learner workflow. Recent failed CI runs also include a
production asset-budget failure and a question-set picker focus failure. Those checks remain.

Available history cannot prove that a test has *never* caught a regression. Absence of a recorded
failure alone is insufficient grounds to discard data-loss, security or scheduling coverage.
Deletions below instead have a concrete implementation-coupling or duplication reason.

## Removed checks and retained coverage

- **Design policing:** remove source scans for uppercase captions, font placement, rounded corners,
  sizing-class spellings and exact palette values; remove Skeleton and SectionCard rendering tests.
  The source scans cannot establish actual readability or hit areas. Rendered hit-area checks in
  `direction-c-audit.spec.ts`, narrow text tests, theme contrast and accent-label contrast remain.
- **Browser styling audits:** remove `course-colours`, `flat-cards`, `sidebar-brand`,
  `no-eyebrow-labels`, `course-frame`, `course-layout-audit`, `page-frame` and `interface-polish`.
  These police token equality, shadows, font faces, heading edges or obsolete decorative elements.
  Actual navigation, course actions, analytics, touch targets and text reflow remain elsewhere.
- **Repeated workflows:** remove `app-identity` and `settings-help-layout`. Their archive/create,
  report disclosure, FAQ and Help search checks repeat the focused component and workflow suites:
  Dashboard, SessionReport, HelpPage, `dashboard-course-actions` and `landing-rework`.
- **Animation measurements:** remove settings header/frame sampling, nested disclosure speed loops,
  sidebar stagger curves, timer coordinates, card rotation/translation ratios and paced exit bounds.
  Remove the corresponding pure-audit files and geometry-only cases in mixed suites. Keep disclosure
  draft retention and inertness in AnimatedDisclosure, keyboard/focus transitions in StepSwap and
  NavigationGuard, sidebar tooltip behaviour, real touch cancellation, vertical scrolling and
  exactly-once persistence with delayed writes. Image-advance performance stays isolated in CI.
- **Copy and presentation:** remove the landing text allowlist and exact layout matrix, caption
  absence tests, brand sizing, mocked shortcut group labels, button class/size propagation and
  a hard-coded download version. Keep landing hydration, app entry, FAQ interaction, film playback,
  platform/package selection and checksum destinations. Keep KeyHints binding refresh, closing and
  rapid reopening, Button click/disabled behaviour and Field labelling/error associations.
- **Duplicate matrices:** reduce card editor combinations from 20 to five explicit scenarios,
  retaining 320px enlarged touch, phone keyboard, tablet touch and desktop breakpoint checks.
  Reduce tall-diagram fitting from eight cases to three: desktop keyboard and both phone input
  modes; theme does not change this geometry. Remove ordinary basic/reversed/sequence fit repeats
  while retaining cloze, typed, image, long-text and recitation cases in both study modes; specialised
  entry and study suites still cover the removed card kinds. Reduce swipe grading from 18 to 12
  cases, keeping both answers, all three input methods and both motion preferences.

The deletion count deliberately exceeds the normal change-size target: the user requested a broad
suite cleanup. Splitting the audit into cosmetic batches would repeat CI without improving review.
