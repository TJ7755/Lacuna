# Lacuna performance audit

Record of the original read-only audit on 11 August 2026 and the production
follow-ups measured against later builds. Historical figures remain below so
regressions are compared with the work that actually ran at the time.

## First-load and network follow-up (30 August 2026)

Fresh `master` had regressed to four initial JavaScript assets: the 967,691-byte
application entry, 399,386-byte vendor chunk, 416,648-byte charts chunk and
777,820-byte Markdown chunk. The generated HTML also referenced the optional
29,290-byte Markdown stylesheet. That was 2,561,545 raw JavaScript bytes before
the user had asked for a chart, Markdown rendering or AI.

The follow-up restores the intended boundaries without changing UI, motion or AI
lifecycle behaviour:

- the disabled relay runtime is behind an enabled-only dynamic import, and the AI
  panel (including Markdown, KaTeX and syntax highlighting) is fetched only when
  the panel opens;
- automatic sync installs after application readiness as a 2,380-byte lazy
  trigger. Pairing, backup validation, math verification and charts are no longer
  fetched by that trigger unless remembered credentials exist and a sync runs;
- the schema-v24 question migration loads its expression verifier only while that
  upgrade runs. `Dexie.waitFor` keeps the version-change transaction alive across
  the dynamic import;
- Workbox precaches only the application shell. Content-addressed scripts and the
  hosted font stylesheet use bounded cache-first runtime caches, avoiding pointless
  repeat revalidation while retaining the complete hosted font language coverage.

| Production measurement | Fresh `master` | After follow-up | Change |
|---|---:|---:|---:|
| Initial JavaScript | 2,561,545 bytes / ~748,825 gz | 863,072 / 264,205 gz | -66.3% raw / -64.7% gz |
| Initial CSS | 148,744 bytes | 119,454 / 17,533 gz | -29,290 bytes |
| PWA install precache | 1,519.50 KiB | 998.47 KiB | -521.03 KiB |

The generated HTML now references only `app` and `vendor` JavaScript plus the
base stylesheet. Charts, Markdown JavaScript and Markdown CSS remain lazy. The
application entry is 462,755 bytes; `vendor` is 400,317 bytes.

`bun run perf:check` enforces 900,000 raw / 280,000 gzip initial JavaScript and
130,000 raw / 22,000 gzip initial CSS budgets, and rejects eager `charts-*` or
`markdown-*` references. Run it after `bun run build`. The repaired full audit on
this branch measured 10,000-card `selectNext` and `sessionComplete` medians of
15.45 ms and 16.00 ms; one `recordReview` call measured 13.82 ms at 500 cards,
6.05 ms at 2,000 cards and 29.04 ms at 10,000 cards. The separate once-daily
10,000-card sample measured 83.68 ms in fake IndexedDB.

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

Measured navigation pipeline (fast laptop, warm cache): click → exit dead time 220 ms → chunk fetch+parse 5-200 ms → IndexedDB query waterfall 15-80 ms → entrance animation 220 ms. Slow network (first visit): CoursePath/QuestionBank navs add ~2 s of chunk download including the markdown stack.

The 220-900 ms figure previously recorded here included per-item entrance staggers. Those were removed with the transition work; see the note on course-path staggering below. The measurement predates that change and has not been retaken.

## Repeatable measurements

Run `bun run build` followed by `bun run perf:audit`. The audit script reports the
same production asset sizes from `dist/`, median 10,000-card session timings, and
one single `recordReview` call (not a loop) on 500, 2,000 and 10,000-card pools.
Those calls use the common path where today's trajectory sample already exists. It
also reports the separate one-off cost of taking the once-daily 10,000-card sample.
The full Vitest suite is timed separately with `/usr/bin/time -p bun run test -- --reporter=dot`.

The 12 Aug 2026 baseline on the performance branch was:

| Measurement | Baseline |
|---|---:|
| Initial JavaScript | 1,449,886 bytes / 424,887 bytes gz |
| Initial CSS | 139,566 bytes / 25,005 bytes gz |
| `selectNext`, 10,000 cards | 20.41 ms median |
| `sessionComplete`, 10,000 cards | 21.60 ms median |
| One `recordReview` call, 10,000 cards | 37,793.71 ms |
| Full Vitest suite | 150.68 s wall time; 1,835 tests |

The build-report gzip values above use Vite's output from the baseline build; the
script uses gzip level 9 for comparable output after each change. Hardware and
browser navigation timings are not treated as regression gates because they are
environment-dependent.

The PR #53 performance branch build and audit run on 12 Aug 2026 measured:

| Measurement | After |
|---|---:|
| Initial JavaScript | 784,692 bytes / 244,593 bytes gz |
| Initial CSS | 138,632 bytes / 24,777 bytes gz |
| `selectNext`, 10,000 cards | 22.86 ms median |
| `sessionComplete`, 10,000 cards | 23.39 ms median |
| One `recordReview`, 500 cards, sample already exists | 10.55 ms |
| One `recordReview`, 2,000 cards, sample already exists | 6.71 ms |
| One `recordReview`, 10,000 cards, sample already exists | 21.67 ms |
| Once-daily trajectory sample, 10,000 cards | 108.45 ms |
| Full Vitest suite | 149.28 s wall time; 1,839 tests |

The old 10,000-card measurement was one cold `recordReview` call and took
37,793.71 ms because it scanned the whole pool inside the write transaction. The
new measurements are deliberately split: the review path is the human-facing
latency, while the once-daily scan is deferred and non-blocking. The common-path
measurements remain bounded in the tens of milliseconds rather than growing
linearly with the pool; the larger 10,000-card value is IndexedDB table overhead in
the fake-IndexedDB audit environment, not a card-pool scan.

The follow-up branch was measured before and after its changes. Each
`recordReview` figure below is one call, never a loop, and all timings are median
milliseconds from the audit script's fake-IndexedDB environment:

| Measurement | Before follow-up | After follow-up |
|---|---:|---:|
| Initial JavaScript | 784,692 bytes / 244,593 bytes gz | 783,790 bytes / 244,168 bytes gz |
| Initial CSS | 138,632 bytes / 24,777 bytes gz | 107,735 bytes / 16,210 bytes gz |
| `selectNext`, 10,000 cards | 20.51 ms | 13.31 ms |
| `sessionComplete`, 10,000 cards | 20.86 ms | 12.48 ms |
| One `recordReview`, 500 cards, sample already exists | 13.03 ms | 9.59 ms |
| One `recordReview`, 2,000 cards, sample already exists | 7.69 ms | 7.33 ms |
| One `recordReview`, 10,000 cards, sample already exists | 26.77 ms | 16.48 ms |
| Once-daily trajectory sample, 10,000 cards | 103.75 ms | 74.16 ms |
| `share.worker` | ~358.07 KB / ~104.43 KB gz | 3,813 bytes / 1,416 bytes gz |
| Full Vitest suite | 149.28 s; 211 files; 1,839 tests | 99.07 s; 212 files; 1,843 tests |

The review measurements no longer show the former linear pool-size scaling because
`recordReview` no longer reads the card pool. The 10,000-card value is still a
single human-facing review write; the separate trajectory sample is the only
operation in this audit that scans cards, and it runs after commit at most once per
day per unit.

## September phone-priority changes

- `recordReview` now writes the review transition and existing unit/performance
  metadata, then schedules at most one `SessionHistory` trajectory sample per local
  calendar day after commit.
  The sample is skipped before reading cards when that day's point already exists;
  failures cannot reject a committed review. Existing historical points and the
  chart definition are unchanged.
- Recharts graphical elements no longer animate on mount or data changes. Width and
  height progress animations use compositor transforms, and persistent sidebar,
  mobile-header, Learn-header and section-rail backdrop blurs are gone.
- Card and occlusion images use `loading="lazy"` and `decoding="async"`.
- Sidebar links prefetch their route chunks on pointer hover, keyboard focus or
  pointer down, using the same loader functions as the router.
- The always-mounted sidebar uses one combined live data query instead of separate
  whole-database queries for streaks, course summaries and lessons.
- The follow-up isolates Pomodoro flow consumers from the per-second countdown,
  prunes virtual-list measurement callbacks, terminates idle share workers,
  fast-paths single-unit session indexing, removes persistent decorative animation
  loops and count-up rAFs, slows MCP polling to 10 seconds while visible, and
  prunes old files from the backup-folder mirror.
- The share worker now imports only a transport codec; payload validation remains
  on the main thread. KaTeX CSS is loaded with the lazy Markdown chunk rather than
  on the initial page.

The remaining retention findings are deliberately deferred: pruning the compatible
`Card.history` projection, choosing a `sessionHistory` horizon, and changing
whole-table import/merge materialisation all alter storage or analytics semantics.

## Findings by area

### 1. Navigation latency (click → painted page)

- **Route exit sequencing is fixed.** `AppShell` mounts the incoming route without `mode="wait"`, so the old 220 ms dead time no longer blocks the lazy import. It now uses `popLayout` for the same reason: the next page can start immediately, but the outgoing page is taken out of flow so the two do not stack.
- **CoursePath's LessonView is lazy** and **QuestionBank's CardContent is lazy**, so the Markdown/Katex stack is not pulled into those route chunks before card content is actually rendered.
- **The charts chunk is lazy.** The production HTML modulepreloads only the app and vendor entries; Recharts is not downloaded on Dashboard first paint.
- **Double skeleton flash**: `RouteFallback` (App.tsx:73-84) swaps to the page's own skeleton mid-entrance animation.
- **Course-path node stagger is gone.** Nodes and connecting lines paint at once; a
  10-node course is no longer still animating at ~900 ms.
- **Sidebar route prefetching is fixed** for hover, keyboard focus and pointer down. Other entry points still fetch on demand, which is expected.

### 2. Bundle weight

- **The eager mathjs paths are split.** Backup validation is lazy, the MCP bridge is both lazy and gated on Electron, and the chart/manual-chunk boundary no longer drags Recharts into first paint.
- **The share-worker duplication is fixed.** Its raw bundle fell from about 358 KB to 3.8 KB because it no longer imports the database, zod or mathjs. The separate sql.js duplication in APKG/import tooling remains a worker-boundary investigation, not part of this follow-up.
- **KaTeX CSS is lazy.** It now ships in a 29,290-byte Markdown CSS chunk (8,070 bytes gz) instead of the 107,735-byte initial stylesheet.

### 3. Runtime render cost

- **Pomodoro countdown isolation is fixed.** Only timer chrome consumes the ticking value; flow-level consumers receive break state and actions, and runtime storage writes happen at boundaries or unmount rather than every second.
- **The always-mounted Sidebar now uses one combined live data read** for its review-dependent summaries.
- **Single-unit objective sessions now bypass full unit-index construction.** Multi-unit and cram sessions still score their complete pool because that is their definition; the 10,000-card session benchmark is now about 12–13 ms.
- **`recordReview` no longer scans the card pool.** It writes the reviewed card, event rows and performance row; the daily trajectory sample is scheduled after commit.
- **QuestionBank grouping was already memoised** by `cards`, `lessons` and `query`; the original per-keystroke finding was stale.
- **`McpSection` now refreshes every 10 seconds while visible**, and on visibility/focus changes.

### 4. Memory and retention

- **`card.history` grows forever** (`src/db/repository.ts:773`, `history: [...cardBefore.history, log]`). Every review appends a ~25-field `ReviewLog` to the card row. This is the master multiplier: it inflates the cards table, every full-table read (dashboard/search/analytics/learn), and every backup snapshot. At 10k cards × 100 reviews, a full-table load exceeds 400 MB in JS heap.
- **`sessionHistory` is unbounded** (`src/db/schema.ts`) and re-read wholesale by Analytics (`src/pages/Analytics.tsx:71`, `src/components/analytics/prepare.ts`).
- **Auto-backups retain 10 full-DB snapshots** (`src/db/backups.ts:88-117`), each containing all history arrays. The folder mirror is now pruned to the same ten Lacuna backup files without touching unrelated files.
- **The alleged single-deck load is not a defect.** The no-course/no-lesson path is the deliberate cross-course “Review today” session, so it must consider all cards. Course and lesson sessions already use their scoped card queries.
- **Import/backup-merge materialises whole tables into Maps** (`src/db/portability.ts:582-631`) inside one transaction — ≥2× live data transiently.
- **`useVirtualList` now removes callbacks and disconnects observers when rows unmount.**
- **Share workers now terminate after the final concurrent job settles**, including error and timeout paths.
- **Confirmed clean** (do not touch): assetCache is a bounded 200-entry LRU with URL revocation; MarkdownView's HTML cache is a bounded 600-entry LRU with TTL; every `addEventListener` has a matching removal; sql.js runs only inside `apkg.worker`; Apkg/optimise workers terminate on all paths; QR camera streams stop on unmount; PWA caches are all bounded.

### 5. GPU / CPU (paint and compositor work)

- **All chart animations are disabled** on the 13 Recharts instances.
- **Persistent progress bars and dashboard bars use compositor transforms**, and the persistent Sidebar/Learn-header/mobile-header/SectionRail blurs are gone. Modal and loading overlays still use blur because they are not persistent scroll chrome.
- **Decorative count-up rAF loops and persistent infinite effects are gone.** Settings section reveals and interactive editor/import height reveals remain one-shot work, not continuous review-path work.
- **Height/margin reveals across editors and panels**: SequenceEditor, SharePage (5 sites), UnifiedImportPanel (8 sites), LessonNode hover expansion (`src/components/course/LessonNode.tsx:132-133`, which reflows the grid).
- **Scroll-time layout reads are bounded.** Virtual-list reads remain necessary to map the scrolling container to content; SectionRail caches its button rect on pointer entry instead of reading it on every `mousemove`.
- **Rendered card images now use `loading="lazy"` and `decoding="async"`**, including Markdown and occlusion surfaces.
- **Confirmed cheap** (do not touch): transform-only entrance animations; reduced-motion honoured via `motionMultiplier`; virtualised lists above 50 rows with rAF coalescing; Welcome scroll using direct DOM transforms; one card face mounted at a time in LearnMode; heavy I/O off the main thread via workers.

## Priority list

Ordered by impact per effort.

| # | Change | Location | Impact |
|---|---|---|---|
| Done | Remove review-path aggregate scan and defer the daily trajectory sample | db/repository.ts | Removes the emergency write-path latency without changing the chart definition |
| Done | Remove phone-visible chart, blur, layout and image costs; prefetch route chunks and combine Sidebar reads | UI routes and Sidebar | Reduces first paint, scroll paint and review-adjacent work |
| Done | Isolate Pomodoro, virtual-list, share-worker and MCP background work | hooks, workers and settings | Removes invisible but persistent timers, registries and worker lifetimes |
| Done | Split mathjs/MCP/Markdown/Share optional work from initial bundles | App.tsx, vite.config.ts, MarkdownView.tsx, shareCodec.ts | Initial CSS fell to 107,735 bytes; share worker to 3,813 bytes |
| Deferred | Decide retention for `Card.history` and `sessionHistory` and reduce import/merge peak memory | repository.ts, schema.ts, portability.ts | Requires storage and analytics semantics, not another opportunistic cache |

## Scale verdict

- **Today (≤2–5k cards):** the phone-visible review path no longer carries the aggregate scan, per-second persistence or redundant Sidebar reads. Optional charts, Markdown and worker code stay off first paint.
- **10k cards:** a single objective session selection/completion measured 13.31/12.48 ms, and one `recordReview` measured 16.48 ms. Inline history retention and multi-unit scoring remain the material costs.
- **100k cards:** inline history and whole-table live-query/merge paths remain a hard ceiling. A retention and storage-projection decision is required before claiming support at that scale.
