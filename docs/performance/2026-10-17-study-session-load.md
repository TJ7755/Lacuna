# Image-heavy study session startup, 17 October 2026

On `t3/study-session-load-perf`, starting the fixture improved from **1,226.79 ms to
860.30 ms** (29.9%). First grade to the second card's image painting improved from
**143.33 ms to 125.60 ms** (12.4%). These are single fresh-context samples on the same
machine, using production Vite builds, headless Chromium, one worker, normal motion,
and no CPU/network throttling. They are not a claim about every device.

Baseline: `6c939732dc847c126e26fa033aacd74f2545e397`, the checked-out
`redesign/direction-c` head. The first exploratory samples were 1,392/152 ms and
1,442/144 ms; the latter exposed that an occlusion placeholder must not count as an
image paint. The final figures above require a loaded image for both cards.
The [recorded mark and database breakdown](2026-10-17-study-session-load.json) retains
the final comparable samples.

## Fixture and measurement

`tests/e2e/fixtures/studySessionLoad.ts` seeds 322 Biology cards with 6,440 canonical
review events. There are 105 Markdown image cards, 105 occlusion cards and 112 text
cards. The first two are an image card and an occlusion card. Its 210 unique 1280 × 960
JPEGs pass through `storeImageBlob`, including normal compression and hashing. Their
129,008,829 stored bytes live in Dexie's asset table as `Uint8Array`, referenced through
`lacuna-asset://` hashes. Card rows have empty inline histories. No images are fetched
from the network and fixture generation is outside the timed interval.

The timer starts on pointer down on **Start session**, then samples animation frames
until the front is visible at at least 90% opacity, is outside any inert subtree, and
contains a complete image with non-zero natural width. Enter must reveal the first
answer. The second measurement starts on the first **Yes** pointer down and requires
a different card and a loaded image. Card ids are checked against the unchanged
expected first and second cards. One face is mounted at first readiness in both builds.

## Findings

The delay was a combination of cold study code and event-by-event history traversal.
There was no eager creation/decoding of every image and no all-image preload barrier.

- Before: the session hook started at **907.46 ms** after Start. The conductor's
  history query traversed **6,440 cursor rows in 133.25 ms**; the session repeated
  that traversal in **99.20 ms**. The session pool was ready at **1,044.93 ms**.
- After: the hook started at **546.96 ms**, and the pool was ready at **658.41 ms**.
  Each history reader uses **322 concurrent exact-key `getAll` requests in one
  transaction**, with wall spans of **69.90 ms** and **72.59 ms**, rather than 6,440
  cursor callbacks. These are per-card indexed reads, not sequential per-card
  transactions or an unscoped database scan. Reading by card id preserves history
  when a card's historical course ownership differs from its current ownership.
- Context construction took **1.55 ms before / 1.93 ms after**. First selection took
  **7.33 ms before / 9.27 ms after**. Whole-session FSRS scheduling was not the
  dominant delay. Pool order, canonical collision precedence and scheduling logic
  remain unchanged.
- Before: one image object URL was created at **1,093.89 ms**. After: the current URL
  was created at **723.61 ms**, with two speculative URLs and decodes at approximately
  **741–743 ms**, before the first grade. No later image is awaited by startup.

The preview now uses the existing route-prefetch system to fetch the study module and
its renderers before navigation. Occlusion and KaTeX are already dependencies of that
route; Mermaid's existing module-level warm-up also starts when that module loads.
Neither sample requested any new JavaScript after the first grade.

The first review's IndexedDB work began at approximately **73 ms** after the grade
in both builds. Its final undo-state read completed around **81 ms**. The later daily
trajectory sampling and reactive refreshes did not gate the next card. These numbers
do **not reproduce the reported intermittent 1–2 second advance stall**. The bounded
lookahead removes cold next-image reads/decoding from the usual advance path; this
fixture cannot prove every source of that intermittent symptom is resolved.

Lookahead runs after a paint, follows the Simple queue or predicts two scheduled
candidates, and uses separate FSRS engines. The state-invariance test caught that
`selectNext` mutates an engine's fuzz seed; sharing the live engine would have broken
the scheduling guarantee. Failed/missing assets and cancellation are best effort, and
URL lifetime remains owned by the existing bounded asset cache. No card component,
exit motion or layout CSS was changed. No storage schema or persisted format changed.

## Reproduction and validation

```sh
bun run build:assets
STUDY_STARTUP_BUDGET_MS=900 bunx playwright test \
  -c tests/performance/playwright.study-load.config.ts \
  tests/e2e/study-session-load.spec.ts --project=chromium --workers=1
```

The dedicated config refuses an existing server and lets Playwright stop its own
preview process. Each run writes `study-startup.json` under its test output directory
and attaches the same payload. Native IndexedDB operations, object URL creation and
explicit image decoding are instrumented by the browser test. Marking
`lacuna:measure-study-startup` enables the session hook's load/pool/context/metadata/
progress/serve boundaries; ordinary sessions emit none of those diagnostic marks.
The baseline build used equivalent temporary marks at the same boundaries.

The browser test failed on the baseline's 900 ms diagnostic budget and passed after
the change. Its normal budget is deliberately looser because machine timings vary.
The history regression failed on the baseline's cursor reader and then passed; it
also compares complete session order. The preload test compares complete order and
live scheduler state with and without lookahead, and covers bounded, deduplicated,
non-blocking image work and cancellation.

Validation: `bun run typecheck`; targeted Vitest files for history reads, session
preloading, the session hook, route prefetch, the study preview and FSRS sessions;
one final before and after browser measurement with one worker. No full lint or
full test suite. Preview servers and browser contexts were stopped after each run.
