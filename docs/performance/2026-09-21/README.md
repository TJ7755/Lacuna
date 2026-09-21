# Windows laptop baseline: 21 September 2026

Follow-up: [populated desktop startup measurements and reproduction](startup/README.md)
adds three fresh-process samples, twenty untraced reloads and local diagnostic traces.

Measured on my managed Windows laptop with existing applications and browser
tabs left open. Intel Core Ultra 7 266V, eight logical processors, 15.72 GiB usable physical
memory, Windows build 26100. Initially 1.90 GiB was available. No administrator access,
power-setting changes or artificial CPU throttling were used. AC state, power mode and
thermal state were not recorded; this is a busy-machine observation, not a controlled
hardware comparison.

## Installed desktop application

The existing packaged interaction test passed against installed Lacuna 0.2.10, using its
own disposable profile and starter course. It verified the Electron preload, `app:` protocol,
absence of Vite resources, normal motion, valid interaction boundaries and clean shutdown.
No renderer errors or long tasks were recorded in these three samples.

| Interaction | Input to feedback | Input to usable | Input to settled |
| --- | ---: | ---: | ---: |
| Open quick search | 86 ms | 142 ms | 289 ms |
| Open Settings | 23 ms | 139 ms | 481 ms |
| Open starter course | 21 ms | 322 ms | 425 ms |

Each row is **one sample**. Search measures opening and focusing the search interface,
not searching the populated library. Usable follows the harness's DOM and animation-frame
checks; settled also waits for finite animations. These are not startup measurements.
The populated app was brought into view during this run, which can affect foreground
scheduling. Treat these samples as preliminary, not a stable latency distribution.

The populated application was inspected separately through Computer Use: its dashboard
showed 3,500 cards in French, alongside other courses. No review or library mutation was
performed in that profile. Sixteen process samples, approximately one second apart over
15.48 seconds after the test finished, covered seven existing Lacuna processes:

| Observation | Value |
| --- | ---: |
| Sum of working sets, observed range | 300–434 MiB |
| Sum of private committed memory, observed range | 474–610 MiB |
| CPU time increase / elapsed time, one-core equivalent | 0.20% |
| CPU use divided by eight logical processors | 0.025% |

Working-set sums can double-count shared pages. Private bytes are committed virtual
memory, not resident RAM. The decline during sampling does not establish whether garbage
collection or Windows memory management caused it. This short, idle dashboard sample is
neither active-study CPU use nor a peak-memory test. Raw observations are in
[populated-process-samples.json](populated-process-samples.json), with desktop timings in
[packaged-interactions.json](packaged-interactions.json) and host details in
[environment.json](environment.json).

## Reproducing the desktop sample

From PowerShell, set the installed executable directory and an absolute report path:

```powershell
$env:LACUNA_ELECTRON_APP_DIR = "$env:LOCALAPPDATA\Programs\Lacuna"
$env:PLAYWRIGHT_JSON_OUTPUT_NAME = Join-Path $PWD 'artifacts/performance/windows-packaged.json'
bun run test:e2e:electron-package --reporter=list,json
```

The sandbox initially blocked Playwright's worker spawn with `EPERM`; the same command
passed outside the shell sandbox. This did not require Windows administrator elevation.
WMI hardware queries returned access denied, so host specifications came from Node's
`os` API and process counters from `Get-Process`.

## Heavy production web workload

The existing heavy-data harness ran the production web build at commit
`6f72773e18993e5edf3d2f1570b16598c61a72ca`, in headless Chromium 153.0.8010.12.
It seeded a disposable dataset of 10 courses, 100 lessons, 10,000 cards and 200,000
canonical reviews. This is separate from the populated desktop profile. Five navigation
and study repetitions and ten consecutive reveal/grade pairs were requested at 1× CPU.
Fixture creation and building are outside interaction timings.

See [heavy-summary.md](heavy-summary.md) for the complete timing table and
[heavy.json](heavy.json) for raw samples. First dashboard load means a new document
without an application HTTP cache, not a cold Windows or Electron launch. Study
input-to-readable timings start at the browser click and check readable content and
animation frames; other action timings include Playwright overhead. The full run completed
with zero recorded errors. Backup export took 7.13 seconds, preview 0.70 seconds and
replacement 38.43 seconds, each measured once. The largest sampled JavaScript heap was
508 MiB; it is not total browser memory or a continuously observed peak.

For historical context, these selected medians compare with the unthrottled
[6 September Mac run](../2026-09-06/README.md):

| Measurement | Windows now | Historical M5 Mac |
| --- | ---: | ---: |
| First dashboard load, one sample | 4,807 ms | 1,952 ms |
| Warm dashboard reload | 1,854 ms | 448 ms |
| Global search including result | 432 ms | 299 ms |
| Open course | 1,763 ms | 406 ms |
| Open Cards | 2,425 ms | 400 ms |
| Open study | 1,982 ms | 901 ms |
| Answer input to readable | 439 ms | 178 ms |
| Grade input to readable next card | 654 ms | 162 ms |

The application and Chromium versions, operating systems and background workloads differ.
This comparison does **not** isolate a processor effect or establish a code regression.
Neither headless run establishes latency for the user's populated desktop app. Repeated
Windows study interactions and Cards navigation deserve profiling next, because they
are frequent actions with substantial measured delays. These measurements alone cannot
separate animation waits, JavaScript execution, storage and scheduling delays.

Reproduce the heavy workload from PowerShell:

```powershell
$env:PERF_RATES = '1'
$env:PERF_REPETITIONS = '5'
$env:PERF_BURST_REVIEWS = '10'
$env:PERF_LABEL = 'Windows-Ultra7-266V-16GB-busy'
$env:PERF_OUTPUT = 'artifacts/performance/windows-heavy.json'
bun run perf:audit:heavy
```

No application behaviour was changed. Remaining measurement gaps include repeated
interactions against a copy of the populated desktop library, packaged cold/warm startup,
active-study process memory, GPU utilisation, paging, and controlled power conditions.
The current harness samples whole-system paging only on Linux; absent Windows values
must not be interpreted as zero paging. No other applications were benchmarked, so this
report makes no claim that Lacuna is the fastest application on this laptop.

## Suspected causes and investigation hand-off

These are investigation leads, not confirmed defects or approved changes. Source links
refer to the measured checkout; use the recorded commit when line numbers move.

**Prompter requirement:** retain the deliberate answer flip, grade departure, feedback,
inter-card pause and entrance timings. Their pacing is desired. Optimisation should remove
lag around that choreography, not make the experience faster by shortening it. Investigate
input dispatch delays, dropped frames, long main-thread tasks, loading and persistence
stalls. Total input-to-readable time includes intended waiting and is not itself a lag measure.

### 1. Deliberate study animation and pause costs: strong evidence

[StudyCardTransition.tsx](../../../src/pages/learn/StudyCardTransition.tsx) declares a
200 ms departure, a 180 ms inter-card pause, a 320 ms feedback pulse and a 360 ms entrance.
Its `dismiss` callback waits for departure completion and then the pause before invoking
`commit`. The entrance opacity animates separately for 180 ms. In
[LearnMode.tsx](../../../src/pages/LearnMode.tsx), `answerWithUndo` wraps `answer(input)`
inside that deferred commit for ordinary boolean/numeric grades. Machine-marked answers
take an immediate path. Thus ordinary grading deliberately waits around 380 ms before
the answer operation begins at normal motion speed, before persistence and entrance costs.
Do not add all the animation durations together: some overlap.

[FlipCard.tsx](../../../src/pages/learn/FlipCard.tsx) uses `AnimatePresence mode="wait"`
and 280 ms transitions for outgoing and incoming faces. The incoming content can become
readable before its entire animation finishes. This is consistent with the 439 ms reveal
median, and [study-response.spec.ts](../../../tests/e2e/study-response.spec.ts) explicitly
expects answer readability between 300 and 650 ms. The older report's discussion of a
250 ms limit is historical, not the current test contract.

Confirmation experiment: in a disposable profile, repeat identical cards at normal,
fast and reduced motion, recording the actual multiplier. Existing
[motionSpeed.ts](../../../src/state/motionSpeed.ts) uses 1.0, 0.6 and 0 respectively.
Instrument input, departure completion, commit invocation, review-write completion and
readable-next-face timestamps. This will separate intentional waiting from execution cost.
Keep normal-motion results as the principal user-visible baseline; reduced-motion results
are a diagnostic control. No such A/B experiment was performed in this collection.

These durations are a retained product requirement, not a proposed optimisation. Existing
[StudyCardTransition.timing.test.tsx](../../../src/pages/learn/StudyCardTransition.timing.test.tsx)
specifically verifies the pause, one commit, feedback cleanup and Undo cancellation.
Preserve those timing and correctness properties. Compare actual animation start/completion
with intended deadlines, frame intervals and time from commit to durable write/readable
content. Do not subtract a single nominal animation sum from total latency and call the
remainder CPU lag: overlapping transitions, opacity easing, frame boundaries and persistence
make that subtraction unreliable. Do not loosen a performance ceiling until a change passes.

### 2. Cards navigation performs substantial renderer work: moderate evidence

The first Cards opening took 3,176 ms with 2,959 ms of Chromium `TaskDuration` growth;
the second took 2,461 ms with 2,417 ms of task time. Later openings fell to about 1,405 ms.
This points towards substantial renderer work and a warm-up effect, but does not identify
which function or prove that CPU alone is responsible. `TaskDuration` is the renderer's
cumulative task-time metric, not whole-machine CPU time.

[CardsPage.tsx](../../../src/pages/CardsPage.tsx) loads course projections, lessons,
sequences and occlusions, groups cards by lesson and mounts lesson sections. It already
uses `useCourseCardProjections` from
[useCourseData.ts](../../../src/state/useCourseData.ts), so do not assume collapsed lists
hydrate all canonical review history. Likewise,
[CardList.tsx](../../../src/components/cards/CardList.tsx) already virtualises each list
above 50 cards via [useVirtualList.ts](../../../src/hooks/useVirtualList.ts).
The fixture opens a course with ten separate 100-card lesson lists, rather than one
10,000-card list. Multiple mounted list instances are a lead to inspect, not proof that
virtualisation is broken. The observed French course has a different shape: one lesson
and 3,500 cards. Both shapes matter when reproducing.

Next capture a Chromium Performance trace around the first and subsequent Cards openings.
Count mounted rows across all lesson sections; break time into module loading/evaluation,
IndexedDB queries, grouping, React render/commit, layout and paint. Compare the existing
ten-by-100 distribution with one lesson containing 1,000 cards, keeping total cards equal.
Check markdown/KaTeX work in [CardContent.tsx](../../../src/components/cards/CardContent.tsx)
and the markdown components only if trace stacks point there. Extend the current projection
and virtual-list systems if justified; do not introduce a second implementation on assumption.

### 3. Study setup and persistence: plausible additional costs, unquantified

[useLearnSession.ts](../../../src/pages/learn/useLearnSession.ts) hydrates course cards
with history in its course-start path and awaits `recordReview` in grading. The measured
study-open median is 1,982 ms. Inspect that path and
[reviewRepository.ts](../../../src/db/reviewRepository.ts) with performance marks around
history hydration, scheduler preparation, transactions and next-card selection. The current
measurement does not split these phases or prove that database writes are slow.

Any later optimisation must retain canonical review durability, accurate scheduling,
single-write behaviour, error recovery and Undo. Never show a successfully saved next card
by silently discarding or ignoring persistence failures. The browser study-response test
checks canonical history and expanded analytics; preserve that coverage.

### 4. Memory pressure and background load: credible context, weak causal evidence

Only 1.90 GiB was available initially, and ordinary background applications remained open.
This makes competition for resources plausible. However, no Windows paging, hard-fault,
disk-latency, GPU or thermal measurements were collected. The short idle CPU sample and
working-set decline do not prove paging, a leak, antivirus interference or CPU throttling.
Do not describe the machine's background software as the established cause.

Repeat with the same commit, profile, power mode and window state, first under the normal
busy workload and then with voluntarily closed user applications. Record available RAM
throughout, all Lacuna process counters and, where permitted without administrator access,
per-process I/O and paging counters. Preserve both runs; do not discard the slower one.
Avoid build jobs, parallel benchmark processes and UI automation during timed interactions.

## Procedure for the next optimisation task

1. Record commit, installed app version, browser/Electron version, fixture counts, motion
   setting, AC state, power mode, foreground state and background workload. Keep installed
   0.2.10 desktop measurements separate from the current source web build.
2. Start with the PowerShell commands above. For iteration, the existing heavy runner supports
   `PERF_MODE=quick`, `PERF_PROFILE_DIR` and a stable `PERF_PORT`; follow its
   [profile ownership instructions](../../../scripts/performance-heavy/README.md). Use a new
   dedicated directory, never the user's live Lacuna profile. Restore `PERF_MODE=full` for
   the final backup comparison. Existing dependencies and Playwright Chromium must be present.
3. For real-library timings, export/copy the test workload into a disposable desktop profile
   and verify counts first. The packaged suite currently assumes the starter course; extend
   its scenario selection before using it for the populated library. Do not run its seeding
   assumptions against the live profile. Use input-event timestamps, not the duration of
   Computer Use screenshots or tool calls.
4. Collect normal-motion baseline samples and one trace for each candidate bottleneck. Keep
   first-load and warm samples separate. Increase repeated interactions to at least 20 for
   a more useful median and observed tail; this still does not establish a dependable p99.
   Repeat across several launches, keeping benchmark runs sequential.
5. Choose a fix only after the trace or controlled experiment supports it. Retain the current
   intentional motion durations and pause. Require a
   red-to-green regression against the merge-base for any behaviour change, plus relevant
   scheduler, persistence, Undo and accessibility coverage. Any future change to deliberate
   pacing requires a separate explicit request. Use the same workload, readiness assertions and motion settings before
   and after; do not substitute DOM presence for readable content.
6. Re-run the packaged suite and heavy suite, retain failures and raw JSON, and report
   input feedback, frame stalls, execution/storage phases, total latency and process memory.
   Success means less unintentional waiting and smoother frames with the same choreography,
   without lost reviews,
   changed scheduling, broken cancellation or a worse memory footprint.

This task changed documentation and retained measurements only. No fix was implemented.
