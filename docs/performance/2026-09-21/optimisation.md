# Windows performance investigation and optimisation

The original measurements and diagnostic harness were preserved in commit `50b3268`
before changing application behaviour. The application baseline is
`6f72773e18993e5edf3d2f1570b16598c61a72ca`. Work uses disposable Chromium profiles;
the installed application and the user's study library are not modified.

## Matched heavy-data comparison

Both completed runs use Chromium 153, 10,000 Cards, 100 lessons, 200,000 initial
canonical reviews and normal motion. There are 20 navigation cycles and 20 additional
consecutive reveal/grade pairs per run. Individual elapsed and readable samples,
aggregates and the interrupted comparison are retained in
[optimisation-comparison.json](optimisation-comparison.json).

| Measurement | Before | After |
| --- | ---: | ---: |
| Cards opening, median of 20 | 2,921 ms | 1,103 ms |
| Cards opening, warm median of 19 | 2,890 ms | 1,087 ms |
| Cards opening, slowest observed | 6,283 ms | 2,089 ms |
| Mounted Card rows at each opening boundary | 140 | 54 |
| Renderer task time during Cards opening, median | 2,523 ms | 948 ms |
| Observed long tasks across 20 Cards openings | 213 | 48 |
| Median longest sampled frame interval per Cards opening | 375 ms | 158 ms |
| Filtering Cards, median | 279 ms | 156 ms |
| Reveal input to readable, navigation-cycle median | 438 ms | 429 ms |
| Grade input to readable next Card, navigation-cycle median | 656 ms | 645 ms |
| Warm dashboard reload, median | 2,008 ms | 2,137 ms |
| Global search, median | 1,170 ms | 1,192 ms |
| Course opening, median | 2,297 ms | 2,330 ms |

The Cards median is 62% lower in this harness, supported by the deterministic 61%
reduction in mounted rows. These timings include Playwright work; they do not promise
the same percentage for the populated installed app. Other operations and late-run
timings vary with the busy host. The incomplete first comparison also mounted 54 rows
and had a 1,109 ms Cards median across its 18 completed openings.

The largest sampled JavaScript heap across common operations was 607 MiB before and
414 MiB afterwards; at Cards-opening boundaries it was 441 MiB and 230 MiB. These
are boundary samples affected by garbage collection, not peak process memory or
proof of reduced resident RAM. Windows paging and GPU utilisation remain unmeasured.

## Study and backup results

Both completed runs recorded 40 successful review transactions touching Cards, with
no observed aborts. Their transaction medians were 14.6 ms and 8.0 ms; these include
callback scheduling and must not be treated as pure disk latency. All 40 reveal
windows in each completed run had no observed long tasks. No scheduling, persistence,
Undo, flip, departure, pause, feedback or entrance code was changed.

The full final run passed export, preview and replacement: 5.12 s, 0.50 s and 102.82 s,
respectively, for a 145,903,459-byte backup. Replacement remains slow. There is no
matched pre-change replacement sample in this comparison, so the earlier report's
38.43 s result cannot establish whether this is a regression. The new transaction
observer and current host conditions also differ from that earlier collection.

The first after-change run stopped on navigation iteration 18 when global search
displayed no match for the fixture Card `Recall item 0-0-99`. This is retained as an
unresolved observation, not discarded or claimed fixed. The unchanged repeat passed
all 20 search/navigation cycles and the full backup workload. The virtual-list change
does not touch search data or matching. A recurrence needs the failed profile and
query/animation state inspected; the harness now retains failed owned profiles and
failure diagnostics for that purpose. Raw JSON and the failure screenshot remain in
`artifacts/performance/optimisation-*`; CPU traces remain local as documented below.

## Desktop startup: narrowed to the period before document commit

The existing `desktop-startup.json` trace identifies the app navigation by its
`app://./index.html` URL, frame and navigation ID. Its first contentful paint matches
the saved buffered Paint Timing measurement:

| Boundary, relative to navigation | Time |
| --- | ---: |
| Document response end | 205.45 ms |
| Renderer V8 isolate initialisation event begins | 2,552.99 ms |
| App document commit | 2,565.31 ms |
| First contentful paint | 2,749.25 ms |
| Document commit to first contentful paint | 183.94 ms |

Most of this first-paint interval precedes document commit and application script
evaluation. It therefore does not support changing dashboard queries or shortening
animations as a remedy for the dominant startup delay. The trace does not identify
what accounts for the gap between response end and renderer initialisation. It is
not evidence of antivirus interference, paging or a specific Electron defect.
No speculative startup change is made.

Further startup investigation needs process-launch and renderer-initialisation
evidence from a diagnostic Electron build under matched conditions. Preserve the
security settings and the normal installed application. The existing five-second
launcher observation remains unsuitable as exact user-visible startup latency.

## Cards: off-screen lessons each render a viewport of rows

The ten-by-100 Cards fixture mounts 140 rows at the measured operation boundary.
`useVirtualList` clamps the list-relative viewport start to zero when the list is
below the viewport. It then adds a full viewport height. Consequently every lower
lesson behaves as though its first rows were on screen. The end binary search also
includes the first row beyond the calculated viewport before adding overscan.

The correction retains a signed list-relative offset and selects the last row
whose start is within the viewport. It keeps the configured overscan at both ends:
completely off-screen lists retain only their boundary overscan rows. Existing
motion timings, row measurement, scrolling and expanded-card behaviour remain intact.

## Regression proof

Two new hook tests fail in an isolated checkout of merge-base `6f72773`: a list
well below the viewport renders eight rows instead of three, and a partially visible
list renders eight instead of four. Both pass after the two calculation changes.
The three existing hook tests still pass. The focused suite passes all 35 tests,
including CardList interactions and StudyCardTransition's timing, single-commit
and cancellation contracts.

A new production-browser regression reuses the small heavy-data fixture. Before
the change it mounts 28 rows and fails the limit of 22; afterwards it passes that
limit, scrolling to the last Card and back, filtering, and expanding the result.
The existing study-response browser test passes its unchanged readable-answer
timing bounds and canonical-review/analytics assertions. Cold-cache offline Cards
reload also passes. Its first attempt exceeded the 30-second whole-test timeout
whilst full lint consumed substantial memory; the sequential rerun completed in
47.5 seconds with the same assertions and a 60-second whole-test allowance.

Application and performance-harness typechecks pass. Focused lint passes. Full
repository lint was interrupted after reaching approximately 2.7 GiB of working
set on this busy laptop; it is not reported as a passing check. The disposable
merge-base checkout and its copied dependencies were removed after validation.

The corrected source was also built as an unsigned Windows directory package using
Electron 44.4.1 and tested in a disposable desktop profile. The packaged interaction
suite passed search, Settings and course opening with normal motion, no recorded
renderer errors or long tasks, no Vite resources and a clean process exit. These
are starter-course smoke samples, not a populated-library timing distribution.
See [packaged evidence](optimisation-packaged.json). The package was neither installed
nor published; PE resource editing/signing was skipped for this local validation.

## Measurement limits and reproduction

The diagnostic Cards trace contains substantial Playwright accessibility/selector
work and a 647 ms CPU-profiler start event. Do not attribute all renderer task time
to React or markdown, or use traced results as the headline comparison. The first
diagnostic attempt failed because the observer was installed on the fixture page
instead of the measured page; its failure report remains in local artefacts.

The corrected harness uses `PERF_DIAGNOSTICS=1` for frame, input, mounted-row and
IndexedDB transaction observations. `PERF_TRACE_DIR` is only set for separate
diagnostic traces. The initial traced observer can report a negative first frame
interval after reset; the untraced comparison skips queued timestamps preceding
the reset, and does not use those invalid intervals.

Baseline/comparison settings are `PERF_RATES=1`, `PERF_REPETITIONS=20`,
`PERF_BURST_REVIEWS=20`, `PERF_MODE=quick`, `PERF_DIAGNOSTICS=1`, a dedicated
`PERF_PROFILE_DIR` and `PERF_PORT=4187`. Clear `PERF_TRACE_DIR`. Build with
`bun run build:assets` and `node scripts/performance-heavy/build.mjs`, then run
`node artifacts/performance/run.mjs`. The base profile is copied before each run;
reviews do not accumulate between baseline and comparison runs.

The host remains in Balanced power mode with ordinary background applications
open. Available memory during the baseline was approximately 1.14 GiB. Power-source
and thermal conditions are unrecorded. Timings include browser automation and
desired animation; differences on this busy machine are observations rather than
hardware-independent guarantees. Benchmark processes and builds run sequentially.
