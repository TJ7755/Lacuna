# Course loading diagnosis — 17 October 2026

Base: `redesign/direction-c`, `70989fab7ef38edbc3a7c15867269e92abaf5485`.
Branch: `t3/fewer-loading-skeletons`.

## Method and limits

Local production Vite bundles served by `vite preview`, not Vite development/HMR.
The baseline was built with `bun run build:assets` and independently passed `bun run typecheck`;
changed bundles used `bun run build --outDir /tmp/lacuna-loading-after` (which includes typecheck).
No measurements were taken against the deployed Vercel URL or the user's private database.

One completed serial Playwright comparison used one headless Chromium process and one page/context
at a time, 1440 × 900, default motion, 4× CPU slowdown, 80 ms network latency, 6 Mbit/s download
and 1 Mbit/s upload. Service workers were blocked so cached shell precaching could not conceal
cold chunk costs. Several fixture/locator bring-up attempts failed before the completed comparison.
These were harness errors, not application failures.

The fixture contains Biology, Chemistry and Physics, **322 cards and eight lessons each**:
966 cards, 24 lessons, 483 stored 512 × 512 PNG assets referenced from card Markdown, mixed new
and review card projections. Images use the same diagram bytes under distinct fixture asset IDs.
Canonical review history is empty; this is a navigation fixture, not a long-history stress test.
It does not reproduce slow storage, every deployed-network condition or the user's exact deck.

Navigation activates existing app links without hover, so pointer prefetch cannot mask cold loads.
The first visit is Today → Biology; revisit goes through Chemistry; tabs are visited Cards →
Questions → Progress → Settings → Path. Today → known course and a real simple-study Exit follow.
Lesson navigation uses the lesson URL; the last step returns to Today. A 500 ms settling window
follows each readiness marker. Loading is sampled on animation frames, including ancestor opacity
and visibility; counts are contiguous visible loading episodes, not individual skeleton blocks.
One frame is approximately 17 ms. Long tasks are whole-page observations, not attributed profiles.

## Measured comparison

Each cell is **visible episodes / total visible milliseconds**. These are single samples, not means.
The JSON alongside this report contains fallback attribution and long-task counts.

| Navigation | Before | After | Visible fallback before |
| --- | ---: | ---: | --- |
| First course visit, from Today | 1 / 100 | 0 / 0 | Generic lazy-route skeleton |
| Revisit course | 0 / 0 | 0 / 0 | None |
| Tab: Cards | 1 / 417 | 0 / 0 | Generic lazy-route skeleton |
| Tab: Questions | 1 / 17 | 0 / 0 | Generic lazy-route skeleton |
| Tab: Progress | 1 / 17 | 0 / 0 | Generic lazy-route skeleton |
| Tab: Settings | 1 / 33 | 1 / 67 (inline exam field) | Generic lazy-route skeleton |
| Tab: Path | 0 / 0 | 0 / 0 | None |
| Today → known course | 0 / 0 | 0 / 0 | None |
| Return from study via Exit | 0 / 0 | 0 / 0 | None |
| Open lesson | 1 / 33 | 0 / 0 | Generic lazy-route skeleton |
| Return to Today | 0 / 0 | 0 / 0 | None |
| **Total** | **6 / 617** | **1 / 67** | |

The sidebar falsely displayed **“No courses yet.”** during the baseline lesson navigation,
and on **zero** measured changed-build navigations.

**Final corrections after measurement:** the remaining 67 ms episode is the inline Final exam
field skeleton in loaded Settings, rather than the shared full-page fallback. The detector labels
this “page skeleton” because it has neither route-fallback markup nor Path circles. Inspection
identified its immediate `assessments === undefined` branch; Settings now reads the date already
present on its hydrated course, removing the redundant query and placeholder. Its regression
fails with the old placeholder and passes after the change.

An independent delayed-commit test also found that the initial minimum-time clock started when
the timer fired, before React necessarily committed. The final hook starts that clock in a layout
effect. A regression delays commit from 200 to 500 ms, then verifies another full 200 ms of visibility;
it failed before correction and passes after. The final production build includes both corrections.
Per the one-comparison constraint, the browser was not rerun: **the table records the intermediate
production build, and final browser timings remain unmeasured**. The measured full-page fallbacks
fell from six to zero; the one remaining measured inline fallback was subsequently removed.

## Causes confirmed or ruled out

1. **Remount resets:** `useCourse` and `useCourseStudyFlowRecords` originally initialise to
   `undefined` for every new consumer. The archive guard blocks its child, so its course query
   completes before the lazy module mounts, and only then do the page's queries start. The shell
   header independently queried the same course, initially showing “All courses” without View/Edit.
   The red regression remounted a just-loaded real CoursePath and immediately lost its Study button;
   it now passes. This fixture's warm data reads stayed below the original 250 ms show-delay, so
   there is no measured warm-navigation skeleton reduction to claim.
2. **Cold chunks:** confirmed as the dominant visible cause here: six generic-route episodes,
   617 ms total, with Cards contributing 417 ms. Modules already cache per loader; chunks do not
   refetch on every revisit. Existing hover/focus/pointer-down prefetch was insufficient for immediate
   activation. Idle prefetch now covers the next course path, course sections and first lesson.
3. **Heavy aggregation:** not established as the primary loader cause in this fixture. The largest
   baseline observed long task was 163 ms on lesson navigation; Cards reached 146 ms. Warm Path,
   Today-to-known-course and study return showed no skeleton. No forecast/FSRS algorithm or study
   scheduling logic was changed. This does not rule out aggregation on substantially slower machines
   or decks with extensive review history.
4. **Redundant Settings read:** its final-exam heading made a second assessment query instead of
   using the course date already hydrated from that same assessment. This produced the remaining
   67 ms inline placeholder in the changed-build measurement. The final implementation removes it.
5. **Timing:** the shared `DelayedFallback` already waited 250 ms. The fault was multiple independent
   clocks, no minimum visible lifetime, and Questions' immediate text fallback. A single page boundary
   now spans access checks, chunks and data, waits 200 ms, and holds a shown skeleton for 200 ms from
   commit. Study-session loading retains its own existing route/data implementation.
6. **N+1:** not found in the course-path read. Its eleven table-read operations are batched by course
   or lesson/card ID set, including one review-history query and one performance `bulkGet`. The real
   CoursePath integration test checks one course-card read and one history read. No per-card or
   per-lesson query loop was added or rewritten.

Course Path now retains up to five live presentation snapshots for five idle minutes. Subscriptions
continue observing writes while away, including reviews, archive changes and deletion; the next
mount reuses current data. Cross-course keys cannot leak a previous course's snapshot. The study
conductor uses the same underlying read function through its original uncached hook and generation.
Lightweight shell-owned course identity/permissions no longer wait on full-card forecasts or remount
per tab. There is no persisted cache, migration, import/export or wire-format change.

## Loading-path inventory

| Owner before | Trigger / navigation | Final behaviour |
| --- | --- | --- |
| `ArchivedCourseAccessGuard` | Every newly mounted guarded course route; lesson-course resolution for legacy lesson study URLs | Plain “Loading course…” removed; workspace routes report to their shared boundary; external study guard reuses the shared skeleton without changing session internals |
| `LazyRoute` / React Suspense | First unresolved module for Path, Cards, Questions, Progress, Settings or Lesson | Those workspace routes use one boundary with the relevant shared skeleton; generic fallback remains for unrelated routes |
| `CoursePath` data branch | Its compound course read has not returned; includes revisits after unmount | Retained live snapshot when available, otherwise reports pending to the same boundary |
| CoursePath inline LessonView Suspense | First single-lesson inline workspace module | Reports to the same course boundary |
| `LessonView` data branch | Lesson, notes/cards and study preview still resolving | Same lesson skeleton boundary as chunk/access loading; shell owns its persistent course navigation |
| `CardsPage`, `CourseAnalytics`, `CourseSettings` data branches | Their required reads are unresolved | Report to the shared course boundary; existing local skeletons remain standalone fallbacks |
| Settings Final exam field | Immediate `assessments === undefined` branch after the course is already loaded | Uses the hydrated course date; redundant query and inline skeleton removed |
| `QuestionsPage` `!course || !data` | Any unresolved course/library read; previously immediate “Loading Questions…” | Delayed shared course loading; resolved missing course now has a not-found state |
| Today / Dashboard | Shared shell data, or initial forecast readiness | One boundary around the queue; existing header stays mounted; no lazy Dashboard route fallback because Dashboard is eager |
| Today's forecast placeholder | Late optional chart/history | Deliberate progressive content, retained independently |
| Sidebar Courses | Unresolved shared shell data previously coerced to `[]` | No empty message until courses resolve |
| Archived | Unresolved course query | Already suppresses empty state until resolved; unchanged |
| Cards empty state | Unresolved course/cards/lesson/sequence/occlusion queries | Already gated before empty checks; unchanged |
| Search | Unresolved search dataset | Already hides “No results” and empty content until resolved; unchanged |

The separate Question Set authoring editor has its own `!course` text fallback; it is not the
course overview/tab/lesson loading path measured here. Other authoring, import and study surfaces
are outside this change. The shared CoursePathSkeleton markup and styles were not edited; the
lesson skeleton was extracted verbatim so the route and data owners can reuse it.

## Validation

- Bun **1.4.3**; frozen-lockfile root install, no dependency/lockfile changes.
- `bun run build --outDir /tmp/lacuna-loading-after --emptyOutDir`: final production build and full
  web/server/Electron typecheck passed.
- Targeted Vitest: 21 files / 233 tests passed across focused runs at the final implementation, including the
  delayed-commit, navigation identity and Settings field regressions. Dashboard was rerun after
  adjusting its fake-clock test to commit the skeleton at 200 ms before advancing to its unchanged
  1000 ms forecast deadline. The separate CoursePath file has 43 passes and the base failure below.
- `CoursePath.data.test.tsx`: real remount regression failed on original behaviour, passes with cache.
- Sidebar pending-data regression failed with the original empty-state condition, passes after gating.
- Minimum-time delayed-commit regression failed before the layout-effect clock correction, passes after.
- Existing `CoursePath.test.tsx` checkpoint creation/Escape focus test fails on both base and changed
  code. Reproduced with the pristine base page and test files; unrelated to loading. It was not weakened.
- No full lint or full unit suite. One completed serial headless comparison; no browser rerun after
  the final timer and Settings field corrections. All owned previews and Chromium were closed; no dev server was used.
- Reproduction: build two revisions into separate absolute output directories. Remove
  `/tmp/lacuna-course-loading-fixed-ready`, run
  `node scripts/performance-course-loading/run.mjs BEFORE_DIR AFTER_DIR`, then create that marker
  once the changed bundle is ready. The runner saves `/tmp/lacuna-course-loading-results.json` and
  closes both previews/browser. Do not run against a personal browser profile.
