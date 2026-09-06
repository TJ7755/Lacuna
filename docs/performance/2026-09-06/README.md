# Heavy-data performance: 6 September 2026

The repeated study interaction is now responsive on both memory-limited VMs: all measured
single grades took less than 178 ms from browser input to a readable next Card; ten consecutive
grades stayed below 164 ms. The canonical review write completes before the next Card appears.
Full page loading is still noticeably slower than grading: warm dashboards took 1.1–1.4 seconds
in the final VM runs, and initial document loads took 4.8–5.8 seconds. These results support
smooth ongoing revision, not a claim that every operation is instantaneous.

## Workload and environments

Production web build, Chromium 151.0.7922.34, 10 courses, 100 lessons, 10,000 introduced maths
Cards, 10,000 Concepts and 200,000 canonical reviews. The fixture has no media, Questions or
synchronisation traffic. Fixtures and browser profiles are disposable; no personal profile was used.
The Mac is an Apple M5 with 24 GiB RAM. Lima 2.2.0 ran Ubuntu 24.04 ARM64 with two virtual CPUs,
first 4 GiB then 8 GiB RAM, a sparse 24 GiB disk and 2 GiB swap. No host directories were mounted.
The same VM and fixture were reused with a fresh measurement-profile copy for each configuration.
The VM was stopped during Mac measurements; benchmarks were sequential.

The first dashboard sample starts a new document without an application HTTP cache, not an OS
cold boot. There are two warm reload samples, three samples for other regular interactions,
ten consecutive study pairs, and one sample per backup operation. Maximum means slowest observed,
not a guaranteed worst case or p99. The unthrottled preliminary 4 GiB warm dashboard was faster
(612 ms median / 633 ms maximum); the final slower run is reported below, not discarded.

## Final measurements

All timings are milliseconds. Cells show median / slowest observed unless labelled n=1.
The input-to-readable rows measure from the actual browser click, verify readable opacity and
semantic content, and wait two animation frames. Other rows include Playwright overhead.

| Measurement | Mac-M5-24GB, 1× | Mac-M5-24GB, 4× | Mac-M5-24GB, 6× | Linux-4GiB, 1× | Linux-8GiB, 1× |
| --- | ---: | ---: | ---: | ---: | ---: |
| Dashboard first load (ms) | 1,952 (n=1) | 4,242 (n=1) | 7,608 (n=1) | 4,774 (n=1) | 5,753 (n=1) |
| Dashboard warm reload (ms) | 448 / 482 | 1,442 / 1,498 | 2,315 / 2,517 | 1,206 / 1,350 | 1,131 / 1,164 |
| Global search (ms) | 299 / 331 | 330 / 365 | 466 / 533 | 302 / 396 | 418 / 516 |
| Open course (ms) | 406 / 407 | 1,648 / 1,789 | 2,475 / 2,580 | 1,112 / 1,901 | 1,106 / 1,226 |
| Open Cards (ms) | 400 / 400 | 1,298 / 1,384 | 2,898 / 3,281 | 932 / 1,179 | 829 / 1,071 |
| Filter Cards (ms) | 80 / 97 | 298 / 311 | 456 / 800 | 188 / 219 | 182 / 305 |
| Open study (ms) | 901 / 933 | 1,466 / 1,982 | 2,548 / 2,812 | 1,718 / 1,864 | 1,196 / 1,834 |
| Reveal answer (ms) | 246 / 264 | 265 / 299 | 315 / 365 | 279 / 314 | 281 / 297 |
| Answer input to readable (ms) | 178 / 180 | 179 / 212 | 207 / 252 | 192 / 224 | 191 / 195 |
| Grade and show next Card (ms) | 229 / 231 | 247 / 248 | 293 / 327 | 244 / 258 | 242 / 243 |
| Grade input to readable (ms) | 162 / 164 | 180 / 180 | 211 / 240 | 175 / 177 | 162 / 163 |
| Burst reveal answer (ms) | 232 / 232 | 248 / 249 | 264 / 265 | 247 / 280 | 246 / 263 |
| Burst answer input to readable (ms) | 164 / 164 | 177 / 179 | 190 / 192 | 177 / 191 | 177 / 191 |
| Burst grade and show next Card (ms) | 229 / 231 | 247 / 249 | 275 / 289 | 230 / 240 | 228 / 231 |
| Burst grade input to readable (ms) | 161 / 163 | 179 / 180 | 192 / 209 | 161 / 163 | 159 / 163 |
| Export backup (ms) | 1,565 (n=1) | 3,951 (n=1) | 8,967 (n=1) | 4,059 (n=1) | 3,910 (n=1) |
| Preview backup (ms) | 331 (n=1) | 895 (n=1) | 1,203 (n=1) | 664 (n=1) | 581 (n=1) |
| Replace from backup (ms) | 29,572 (n=1) | 43,659 (n=1) | 83,047 (n=1) | 51,496 (n=1) | 50,573 (n=1) |
| Largest sampled JS heap (MiB) | 469 | 481 | 467 | 366 | 475 |
| Minimum guest available RAM (MiB) | — | — | — | 2066 | 5755 |
| Maximum guest swap used (MiB) | — | — | — | 0 | 0 |
| Guest OOM kills during measurements | — | — | — | 0 | 0 |
| Recorded errors | 0 | 0 | 0 | 0 | 0 |

Timing cells show median / slowest observed. First load and each backup operation are single measurements (n=1). Three repetitions cannot establish a guaranteed worst case.
JavaScript heap is sampled at operation boundaries, not total application memory. Linux memory is whole-guest memory sampled every 500 ms.

## Before and after

Against master at `830803bdddb602e3fe631175afa12282f057a330`, on the Mac without CPU throttling:

| Comparable measurement | Before | After |
| --- | ---: | ---: |
| First dashboard load, one sample | 8,450 ms | 1,952 ms |
| Warm dashboard, median / maximum | 6,584 / 7,521 ms | 448 / 482 ms |
| Global search, median / maximum | 5,481 / 7,108 ms | 299 / 331 ms |
| Replace heavy backup, one sample | Timed out after 180 seconds | 29.6 seconds |

Earlier answer timings only waited for a button, and earlier grading timings waited for an outgoing
Card to disappear. They are not comparable with the corrected input-to-readable measure. The browser
regression separately measured the old answer transition at about 566 ms, failing its 250 ms limit;
the new transition passes that same assertion.

## Changes and validation

Search and collapsed Card lists read stored Card projections without hydrating canonical histories.
The dashboard uses a transactionally maintained timestamp-only projection, backfilled in schema 27;
canonical review events remain authoritative and derived rows are excluded from backups. Expanded
Card analytics still hydrate the selected Card's history. Grading defers and coalesces daily trajectory
sampling until after a rendering opportunity, retaining durable-save ordering and undo checks.
Answer and next-Card transitions are shorter. Backup replacement and merge write review events in
bounded batches inside the existing atomic transaction.

Validation during the change included 1,167 tests across 123 relevant suites, followed by 87 focused
tests after the final changes; web and Electron typechecks, production build, harness typecheck and
full application lint passed. Thirteen selected Chromium checks passed across the final runs:
offline reload, release smoke, accessibility, school workflow, recovery, and the new readable-answer /
canonical-review / expanded-analytics regression. This is selected browser coverage, not the entire
browser suite. Projection tests cover partial bulk failure, repeated keys, rollback, direct writes,
live-query invalidation and historical migrations. Backup tests prove bounded writes and rollback
when a later batch fails. Regression assertions also cover avoiding full-history reads and preserving
canonical activity, duplicate timestamps and rolling new-card limits.

## Interpretation and limits

Neither VM used swap or recorded OOM kills. Extra RAM therefore does not address the main remaining
cost in this workload. Differences between two short runs are not evidence that 8 GiB is slower or
faster than 4 GiB. The Linux guests retain the M5's ARM CPU characteristics: these are actual RAM-limited
VM tests, not measurements of an Intel Windows laptop. Headless Chromium also does not establish
packaged Electron startup, GPU behaviour or Windows memory requirements. Renderer CPU throttling
is a sensitivity test, not a calibrated model of a particular low-end processor.

The 6× stress case still shows multi-second navigation and an 83-second full restore. Those costs
remain visible and should not be described as background-only. Ordinary review interactions remain
much shorter. A native Windows run on the available Intel Ultra / 16 GiB laptop is still unmeasured.

Reproduce with the [heavy-data harness](../../../scripts/performance-heavy/README.md).
Raw reports alongside this document retain samples, memory observations and error lists; only the
local profile path has been removed. The baseline report retains its failed restore as evidence.
