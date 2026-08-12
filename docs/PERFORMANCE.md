# Lacuna performance audit

Record of the performance audit performed on 11 Aug 2026 (read-only; no code changed). All file:line references were verified against the source tree and the production build at that date.

## Baseline (production build, 11 Aug 2026)

First load (fresh browser, no service worker): **~1.44 MB raw / ~460 KB gz** JavaScript; 139.8 KB CSS (25.1 KB gz).

| Chunk | Size / gz | Eager or lazy |
|---|---|---|
| `app` | 697 KB / 202 | eager — includes mathjs via backup-validation chain |
| `charts` (recharts) | 417 KB / 128 | **eager on first paint** (modulepreload) and re-eager per route |
| `vendor` | 327 KB / 107 | eager — acceptable |
| `markdown` (katex + highlight.js) | 778 KB / 233 | lazy — good |
| `index` (html5-qrcode) | 375 KB | lazy — good |
| `share.worker` | 356 KB | worker — duplicates zod, dexie, mathjs |
| `optimise.worker` + `wasi-worker` | 215 + 168 KB | worker |
| `apkg.worker` | 171 KB | worker |

Measured navigation pipeline (fast laptop, warm cache): click → exit dead time 220 ms → chunk fetch+parse 5-200 ms → IndexedDB query waterfall 15-80 ms → entrance animation + stagger 220-900 ms. Slow network (first visit): CoursePath/QuestionBank navs add ~2 s of chunk download including the markdown stack.

## Repeatable measurements

Run `bun run build` followed by `bun run perf:audit`. The audit script reports the
same production asset sizes from `dist/`, median 10,000-card session timings, and
the latency of one 10,000-card `recordReview` write. The full Vitest suite is timed
separately with `/usr/bin/time -p bun run test -- --reporter=dot`.

The 12 Aug 2026 baseline on the performance branch was:

| Measurement | Baseline |
|---|---:|
| Initial JavaScript | 1,449,886 bytes / 424,887 bytes gz |
| Initial CSS | 139,566 bytes / 25,005 bytes gz |
| `selectNext`, 10,000 cards | 20.41 ms median |
| `sessionComplete`, 10,000 cards | 21.60 ms median |
| `recordReview`, 10,000 cards | 37,793.71 ms |
| Full Vitest suite | 150.68 s wall time; 1,835 tests |

The build-report gzip values above use Vite's output from the baseline build; the
script uses gzip level 9 for comparable output after each change. Hardware and
browser navigation timings are not treated as regression gates because they are
environment-dependent.

## Findings by area

### 1. Navigation latency (click → painted page)

- **`AnimatePresence mode="wait"` serialises exit → lazy-chunk fetch → enter.** `src/components/layout/AppShell.tsx:253-262` keys the routed `motion.div` by `location.pathname` with `mode="wait"`. The old page's 0.22 s exit must complete before the new route mounts, and the new route's `React.lazy` import (App.tsx:32-71) does not start until that mount. Cost: 220 ms dead time on every navigation, plus a further 220 ms delay on the chunk fetch itself on slow connections.
- **CoursePath statically imports LessonView** (`src/pages/CoursePath.tsx:48`), dragging the 778 KB / 233 KB gz markdown+katex chunk into every course-path navigation even when no card content renders. Confirmed in the built `CoursePath-*.js` chunk.
- **QuestionBank reaches the same markdown chunk statically** via CardList → CardContent → MarkdownView.
- **`charts` is `modulepreload`-ed at startup** (built `index.html`), so the 417 KB recharts chunk downloads on first paint even though no chart is on the Dashboard.
- **Double skeleton flash**: `RouteFallback` (App.tsx:73-84) swaps to the page's own skeleton mid-entrance animation.
- **Stagger scales with content length**: CoursePath reveals nodes at 55 ms × index (CoursePathSegment.tsx:76) — a 10-node course is still animating at ~900 ms.
- **No prefetching anywhere** (no hover prefetch, no `modulepreload` of lazy routes). The PWA only runtime-caches a route chunk after its first visit.

### 2. Bundle weight

- **mathjs (~153 KB min) enters the eager `app` chunk** through the backup-validation chain: `src/App.tsx:14` (auto-backup) → `src/db/backups.ts:6` → `src/db/portability.ts:149` → `src/items/payloadValidation.ts` → `src/items/verify.ts:16`. Used only on export/import.
- **The MCP tool registry is statically bundled for all users, including web**: `src/App.tsx:21` imports `McpBridgeController` (rendered only under Electron), which pulls `src/mcp/registry.ts:8-12` and `src/mcp/tools/content.ts:16-18` — a second path into mathjs.
- **Coarse `manualChunks` buckets**: `vite.config.ts:116-129` puts all of recharts in one chunk; an ~15-line `Object.assign` polyfill module co-resident with recharts forces the whole charts chunk into the eager graph.
- **Worker duplication**: `share.worker` (356 KB) re-embeds zod, dexie and mathjs because `src/db/share.ts:149` runs `itemPayloadIsValid` inside the worker; the sql.js glue is compiled twice (`apkg.worker` and `UnifiedImportPanel`).
- **KaTeX CSS is global**: `@import 'katex/dist/katex.min.css'` in `src/index.css` ships ~30 KB CSS plus 59 font assets to every page.

### 3. Runtime render cost

- **Pomodoro re-renders the whole study-flow tree every second**: `usePomodoro` ticks via `setInterval` (`src/hooks/usePomodoro.ts:183-185`), writes the runtime to localStorage on every tick (`:147-159`), and `PomodoroProvider` passes the whole controller as context value without `useMemo` (`src/hooks/PomodoroContext.tsx:9-10`). Consumed by `src/pages/CourseStudyFlow.tsx:69`, so LearnMode + FlipCard re-render 1/s while a focus timer runs.
- **The always-mounted Sidebar runs three whole-table live queries**: `useStudyStats` (all cards × user performance), `useCourseSummaries`, `useAllLessons` (`src/components/layout/Sidebar.tsx:132, 361-363`). Every review anywhere re-runs full-table reads and O(cards) recomputation (useData.ts:35-47, 82-108).
- **Per-review session re-scoring is O(pool) twice on every answer**: `selectNext` and `sessionComplete` re-index and re-score the entire remaining pool, including per-card exam-date resolution (`src/fsrs/session.ts:254, 351`; `src/course/path.ts` objective sorts; `src/fsrs/examDate.ts:82-88`; `src/pages/learn/useLearnSession.ts:796, 800`). Sub-millisecond at 100 cards; visible stutter at 10k.
- **`recordReview` scans every card in the unit inside the write transaction** (`src/db/repository.ts:811-821`) to compute average retrievability — O(course) held under the read-write lock on every review.
- **QuestionBank computes grouping per keystroke**: O(n) grouping plus per-bucket filters in the render body (`src/pages/QuestionBank.tsx:64-87, 179-191`), with one live query per lesson (`:239`).
- **`McpSection` polls every 2 s** and re-renders unconditionally (`src/pages/settings/McpSection.tsx:43-50`).

### 4. Memory and retention

- **`card.history` grows forever** (`src/db/repository.ts:773`, `history: [...cardBefore.history, log]`). Every review appends a ~25-field `ReviewLog` to the card row. This is the master multiplier: it inflates the cards table, every full-table read (dashboard/search/analytics/learn), and every backup snapshot. At 10k cards × 100 reviews, a full-table load exceeds 400 MB in JS heap.
- **`sessionHistory` is unbounded** (`src/db/schema.ts`) and re-read wholesale by Analytics (`src/pages/Analytics.tsx:71`, `src/components/analytics/prepare.ts`).
- **Auto-backups retain 10 full-DB snapshots** (`src/db/backups.ts:88-117`), each containing all history arrays, plus a pretty-printed `JSON.stringify(payload, null, 2)` folder mirror (`backups.ts:73`) that is never pruned.
- **Deck study loads the entire cards table for a single-deck session** (`src/pages/learn/useLearnSession.ts:1057-1061`).
- **Import/backup-merge materialises whole tables into Maps** (`src/db/portability.ts:582-631`) inside one transaction — ≥2× live data transiently.
- **`useVirtualList` measurement registry never prunes scrolled-out rows** (`src/hooks/useVirtualList.ts:109-128`).
- **The share worker is never terminated on clean success** (`src/db/share.ts:675-751`).
- **Confirmed clean** (do not touch): assetCache is a bounded 200-entry LRU with URL revocation; MarkdownView's HTML cache is a bounded 600-entry LRU with TTL; every `addEventListener` has a matching removal; sql.js runs only inside `apkg.worker`; Apkg/optimise workers terminate on all paths; QR camera streams stop on unmount; PWA caches are all bounded.

### 5. GPU / CPU (paint and compositor work)

- **All 13 recharts charts animate by default** — no `isAnimationActive` or `animationDuration` anywhere (`src/pages/Analytics.tsx:173-431`, `src/components/analytics/CourseAnalytics.tsx`, `src/components/cards/CardAnalytics.tsx`, `src/components/learn/SessionReport.tsx`). The whole chart grid re-animates on mount and on every data change.
- **Layout animations instead of transforms**: StudySignals animates `width` and `height` (`src/components/dashboard/StudySignals.tsx:38, 262, 284, 432`); the sidebar collapse animates `width` (`src/components/layout/Sidebar.tsx:408`). Fix with `scaleX`/`scaleY` inside overflow-hidden tracks.
- **Continuous `backdrop-blur` on always-mounted chrome**: Sidebar (`Sidebar.tsx:408`), mobile header (AppShell.tsx:226), LearnHeader (`src/pages/learn/LearnHeader.tsx:189`), SectionRail. Backdrop-filter repaints on every scroll during study.
- **11-14 parallel section-reveal animations per navigation** on Settings/CourseSettings (`motion.section initial={{opacity:0,y:12}}` in every settings section); **six concurrent count-up rAF loops** on the CoursePath header (`src/components/course/HeaderStats.tsx:64-69`) plus two on the Dashboard and four in SessionReport.
- **Infinite repeating animations on persistent chrome**: SectionRail has two infinite opacity pulses and an infinite gradient on the active pill (`src/components/ui/SectionRail.tsx:94-105, 176-178`); StudySignals runs an infinite flame scale/rotate (`StudySignals.tsx:138-143`).
- **Height/margin reveals across editors and panels**: SequenceEditor, SharePage (5 sites), UnifiedImportPanel (8 sites), LessonNode hover expansion (`src/components/course/LessonNode.tsx:132-133`, which reflows the grid).
- **Scroll-time layout reads**: `useVirtualList` performs two `getBoundingClientRect` reads per scroll tick; SectionRail reads a rect on every `mousemove` (`src/components/ui/SectionRail.tsx:148-152`).
- **Images lack `loading="lazy"`/`decoding="async"`** in MarkdownView-generated `<img>` and `OcclusionMaskLayer`.
- **Confirmed cheap** (do not touch): transform-only entrance animations; reduced-motion honoured via `motionMultiplier`; virtualised lists above 50 rows with rAF coalescing; Welcome scroll using direct DOM transforms; one card face mounted at a time in LearnMode; heavy I/O off the main thread via workers.

## Priority list

Ordered by impact per effort.

| # | Change | Location | Impact |
|---|---|---|---|
| 1 | Drop `mode="wait"` so the incoming route mounts immediately (or use `popLayout`) | AppShell.tsx:253 | Kills 220 ms+ dead time on every navigation |
| 2 | Add `isAnimationActive={false}` to all 13 chart instances | pages/Analytics.tsx, components/analytics, components/cards/CardAnalytics.tsx, components/learn/SessionReport.tsx | Largest single GPU win |
| 3 | Bound `card.history` retention (keep last N, or a separate table) and exclude full history from backup snapshots; prune the mirror folder | db/repository.ts:773, db/backups.ts:73-117 | Order-of-magnitude RAM + disk reduction; the only structural decision, worth making while schema migrations are young |
| 4 | Memoise the Pomodoro context / split the ticking value to a leaf consumer; persist localStorage only on phase change | hooks/PomodoroContext.tsx:9-10, hooks/usePomodoro.ts:147-159 | Stops 1 Hz re-render of the study tree and per-second disk writes |
| 5 | Dynamic-import the mathjs backup-validation path; gate `McpBridgeController` on `isElectron`; split the recharts polyfill helper out of `manualChunks.charts` | App.tsx:14, App.tsx:21, vite.config.ts:116-129 | Cuts the ~460 KB gz first load toward ~330 KB gz |
| 6 | Make CoursePath's single-lesson LessonView lazy | pages/CoursePath.tsx:48 | Removes the 233 KB gz markdown stack from course-path navigations |
| 7 | Convert bar/progress animations to `scaleX`/`scaleY`; drop the sidebar width transition and persistent backdrop-blurs | dashboard/StudySignals.tsx, layout/Sidebar.tsx:408, learn/LearnHeader.tsx:189 | Replaces per-frame layout reflow with compositor-only work |
| 8 | Prefetch the destination route chunk on sidebar hover/pointerdown | components/layout/Sidebar.tsx | Hides chunk fetch behind the exit animation and human reaction time |
| 9 | Scope session queries by deck before materialising; prune `useVirtualList`'s measurement registry; terminate the share worker on success | learn/useLearnSession.ts:1057-1061, hooks/useVirtualList.ts:109-128, db/share.ts:675-751 | Removes full-table loads and registry drift |
| 10 | Add `loading="lazy"` / `decoding="async"` to rendered card images | components/markdown/MarkdownView.tsx, components/occlusion/OcclusionMaskLayer.tsx | Cheaper card-row mounts with image assets |

## Scale verdict

- **Today (≤2-5k cards):** functionally fine. The waste is real but invisible: the sidebar's on-every-review re-reads, the pomodoro tick, the eager charts chunk and the serialised exit. These should be fixed because they cost nothing to fix, not because they hurt today.
- **10k cards:** per-review pool re-scoring and full-history table loads begin to stutter; first-load weight starts to matter on slow connections.
- **100k cards:** the whole-table live-query architecture and unbounded history retention are a hard ceiling. Requires projected card rows (no inline history arrays) and a denormalised stats table before this point.
