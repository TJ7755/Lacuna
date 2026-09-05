# Lacuna performance audit

## Worker, query and desktop package cleanup (5 September 2026)

Compared with merge-base `62b539ab` (the merged landing/dead-font cleanup), using the
same installed dependency versions and macOS arm64 unpacked packaging configuration:

| Measurement | Before | After |
|---|---:|---:|
| macOS `app.asar` | 18,047,205 bytes | 11,115,563 bytes |
| ASAR payload | 17,735,725 bytes | 10,995,955 bytes |
| ASAR payload files | 1,211 | 453 |
| Anki parsing worker | 198,261 bytes | 56,326 bytes |
| Anki worker gzip (level 9) | 61,300 bytes | 20,841 bytes |
| Initial JavaScript | 877,362 bytes | 877,353 bytes |

The archive shrank 38.4%; the parsing worker shrank 71.6%. These are application
archive and JavaScript measurements, not installer download or whole-process RAM
measurements. The unchanged Chromium runtime still dominates the installed app.
Initial application JavaScript is effectively unchanged.

The MCP build now bundles its SDK and Zod into shared ESM chunks, retaining Electron
and electron-log as runtime externals. It emits the full licences of every bundled
package and clears obsolete generated chunks before building. No dependency version
changed. The Windows archive/payload budget is now 14 MB and 600 files, down from
22 MB and 1,400 files; existing locale and source-map limits remain.

Anki parsing now has no application database dependency. ZIP/SQLite parsing, Anki
field mapping and persistence are separate modules; the browser only loads the parser
on the main thread when workers are unavailable. Image ingestion reuses the hash
returned by asset storage rather than hashing the bytes twice. The two-asset regression
now observes two SHA-256 calls instead of three.

Assessment details share one course snapshot across all assessments. The three-assessment
regression drops card and lesson reads from three each to one, scopes lesson links, and
eliminates review-history hydration. Diagnostic note/link counts use indexed multi-lesson
counts; the card count also avoids loading card bodies and review histories. These
remove allocations and database requests without claiming an unmeasured heap reduction.

Four regression assertions fail against the merge base and pass after the changes.
The parser also has a real SQLite/ZIP fixture covering standard cards, cloze cards,
media and review-history extraction. Two disconnected AI fixture/conformance islands
were removed (318 lines); they had no production consumers and do not affect bundle size.

Validation: 3,029 unit tests pass, as do web/Electron typechecks, lint, the asset budget,
the native AI companion message cycle, packaged macOS interactions and production offline
reload. The packaged interaction harness's stale button selector was corrected to the
current landing link in a separate commit. The Windows x64 package cross-built on macOS has the same 11,115,563-byte archive and
453 payload files, and passes the tightened archive, source-map, build-only-asset and locale
checks. Its Electron ZIP was verified against the release's SHA-256 manifest before use.
Windows runtime execution requires the native Windows CI runner; macOS cross-packaging is
not a substitute.

### Remaining opportunities

- The sidebar and dashboard independently load and hydrate much of the same data.
  Sharing their base snapshot is the next runtime priority, with subscription/query-count
  tests across writes, navigation and the mobile drawer.
- CoursePath similarly combines fragmented hooks that reread its course snapshot.
  Reuse the existing study-flow snapshot rather than introducing another cache.
- Command palette and study sheet code is still imported eagerly. Any lazy-loading change
  should preserve focus restoration, exit animation and first-interaction latency tests.
- The maths verifier's narrow expression grammar still uses mathjs. Replacement needs
  explicit syntax/numeric parity evidence; dependency removal alone is not sufficient.

## Small interaction feedback (2 September 2026)

The heatmap and upcoming-assessment feedback uses existing Motion runtime primitives and CSS
utilities. The baseline is the editor-continuity branch immediately before this change; the
production renderer remains functionally unchanged apart from the intentional feedback styles.

| Production-build change | Before | After | Change |
|---|---:|---:|---:|
| Initial JavaScript | 867,917 bytes | 870,197 bytes | +2,280 bytes / +0.26% |
| Initial JavaScript gzip | 266,665 bytes | 267,476 bytes | +811 bytes / +0.30% |
| Initial CSS | 121,805 bytes | 122,613 bytes | +808 bytes / +0.66% |
| App chunk | 468,150 bytes | 469,492 bytes | +1,342 bytes / +0.29% |

The CSS increase is the tooltip and state-class vocabulary required for the new focus/hover
surface. The Motion import was already part of the app closure for the heatmap; assessment
feedback adds the small incremental initial JavaScript shown above, without a new dependency.

Record of the original read-only audit on 11 August 2026 and the production
follow-ups measured against later builds. Historical figures remain below so
regressions are compared with the work that actually ran at the time.

## Editor and settings continuity (2 September 2026)

The Question editor, Course header, assessment editor and restore-point list now consume the
existing motion runtime and shared timing contract. Measurements compare clean production builds
on the same stacked branch; no new dependency or stylesheet was added.

| Production-build change | Before | After | Change |
|---|---:|---:|---:|
| Initial JavaScript | 867,689 bytes | 867,917 bytes | +228 bytes / +0.026% |
| Initial JavaScript gzip | 266,564 bytes | 266,665 bytes | +101 bytes / +0.038% |
| Initial CSS | 121,805 bytes | 121,805 bytes | No change |
| Lazy Question editor chunk | 14,458 bytes | 14,906 bytes | +448 bytes / +3.10% |
| Lazy Course Settings chunk | 44,921 bytes | 45,784 bytes | +863 bytes / +1.92% |
| Lazy Settings chunk | 81,201 bytes | 81,726 bytes | +525 bytes / +0.65% |

## Shared motion contract (2 September 2026)

The semantic motion foundation was measured in isolation on top of the
course-section prefetch stack. Unused tiers and helpers remain tree-shaken; the
existing disclosure helper consumes the shared standard easing.

| Production-build change | Before | After | Change |
|---|---:|---:|---:|
| Initial JavaScript | 867,329 bytes | 867,361 bytes | +32 bytes / +0.004% |
| Initial JavaScript gzip | 266,391 bytes | 266,392 bytes | +1 byte / +0.0004% |
| Initial CSS | 121,519 bytes | 121,519 bytes | No change |

## First-interaction baseline (2 September 2026)

The original production-preview probe measured pointer-down to the first visible
navigation acknowledgement separately from pointer-down to usable route content,
plus Long Tasks. It compared five fresh-context cold samples with five same-context
warm returns. That repeated baseline harness was retired after it identified the
route-chunk delay; retaining a general reporting layer for one resolved interaction
would add maintenance without protecting behaviour.

`bun run perf:audit:web-interactions` now runs the focused regression with normal
motion enabled. It injects a deterministic slow Cards chunk, proves that intent
prefetch finishes before pointer-down, records acknowledgement and usable-content
timings as attached JSON, and rejects a click path that absorbs the injected delay.

The initial Path-to-Cards sample measured:

| Interaction measurement   |  Median |     p95 |
| ------------------------- | ------: | ------: |
| Cold acknowledgement      | 28.3 ms | 28.8 ms |
| Cold usable Cards content | 61.9 ms | 62.5 ms |
| Warm acknowledgement      | 30.9 ms | 31.3 ms |
| Warm usable Cards content | 30.9 ms | 31.3 ms |

No Long Tasks occurred in the ten samples. This fast local route still showed
roughly a twofold first-use ready penalty.

The next stack layer then delayed the Cards route chunk by a deterministic 400 ms.
Before the fix, the request finished 427.5 ms after pointer-down and usable Cards
content appeared after 447.5 ms. Exact desktop and mobile intent prefetch moved the
same request completion to 303.4 ms before pointer-down; usable content appeared
after 45.1 ms, a 402.4 ms / 89.9% reduction. Acknowledgement remained 28.5 ms and
the normal route animation was not shortened or removed. The controlled red and
green runs both recorded zero Long Tasks.

The original five-cold/five-warm production-preview measurement was then repeated
without injected delay:

| Production-preview change   |  Before |   After |            Change |
| --------------------------- | ------: | ------: | ----------------: |
| Cold usable median          | 61.9 ms | 43.1 ms | -18.8 ms / -30.4% |
| Cold usable p95             | 62.5 ms | 43.5 ms | -19.0 ms / -30.4% |
| Cold-to-warm median gap     | 31.0 ms | 12.8 ms | -18.2 ms / -58.7% |
| Cold acknowledgement median | 28.3 ms | 26.6 ms |   -1.7 ms / -6.0% |

All ten post-change samples again recorded zero Long Tasks. The controlled case
proves that slow chunk delivery no longer lands on the click path; the ordinary
production-preview comparison shows the smaller but still material improvement on
the local fast path.

## Packaged Electron interaction validation

`LACUNA_ELECTRON_APP_DIR=<path> bun run test:e2e:electron-package` spawns the
resolved packaged executable once, then attaches Playwright over loopback CDP.
The single application launch exercises Quick search, Settings and seeded-course
navigation in that fixed order with normal motion and the native viewport, then
verifies a clean exit from the exact spawned child handle. Retries, tracing and
parallel workers are disabled. The explicit lifecycle avoids Playwright's
intermittent native Electron attachment race after its debugger sockets connect.

Each interaction retains raw input-to-feedback, input-to-usable and
input-to-settled timings, finite-animation settlement, Long Tasks and renderer
errors as Playwright attachments. There is deliberately no aggregate report or
absolute timing threshold: one observation per interaction is validation and
diagnostic evidence, not a statistical baseline.

## Electron package baseline (2 September 2026)

`bun run perf:audit:electron-package -- --asar <path>` reads the packaged ASAR
header without extracting it, groups payload by top-level dependency and reports
source maps, build/test/documentation assets and external Chromium locale packs.
`bun run perf:check:electron-package` checks the explicit Windows unpacked ASAR;
the Windows release job runs it before attestation and upload. The baseline
ceilings are deterministic regression gates, not acceptable end-state targets;
the package-diet work must ratchet them down as waste is removed.

The checked v0.2.3 Windows package measured:

| Package measurement | Baseline |
|---|---:|
| `app.asar` archive | 138,813,549 bytes |
| ASAR payload | 136,261,561 bytes / 12,819 files |
| Source maps in ASAR | 23,727,309 bytes / 593 files |
| Build, test and documentation assets in ASAR | 16,803,219 bytes / 2,014 files |
| Chromium locale packs outside ASAR | 49,471,161 bytes / 55 files |

The largest payload groups were `sql.js` at 24,135,471 bytes, the MCP client at
12,016,457 bytes, the MCP server at 11,727,063 bytes, `mathjs` at 9,166,244 bytes,
the already-built renderer at 7,191,144 bytes and MCP core at 6,740,161 bytes.
Those figures proved the renderer dependency graph was packaged beside its Vite
output. The same release's macOS DMG was 153,950,565 bytes and its ZIP was
148,695,307 bytes.

The package-diet follow-up rebuilt both Windows x64 and macOS arm64 unpacked
applications at the fixed baseline commit and after the package-boundary change.
The Windows `Before` artefact is the unpacked build from
`c3750b8e076da21bf6d1eda20eef074df27972c5` (`app.asar` SHA-256
`6e407e04caf7ff69b5c3f68f068022c7cb36dcf000152987219934c1e42517e1`). The
`After` artefact is the package implementation at
`d0a6b7cecc452a6197b3b4493a7fb42e9c279079` (`app.asar` SHA-256
`01e05b244d1ec119e3633aab92ecb71804cb9e7c35db82a0caee8cb3aae69002`).
Renderer libraries remain available to Vite as development inputs but are no
longer copied beside the already-built renderer. Electron's runtime dependency
roots remain explicit, source maps and build-only files are excluded, licence
files are retained, and Chromium ships only the `en-GB` and `en-US` locale packs.

| Windows package measurement | Before | After | Change |
|---|---:|---:|---:|
| `app.asar` archive | 138,813,451 bytes | 20,575,956 bytes | -118,237,495 bytes (-85.2%) |
| ASAR payload | 136,262,023 bytes | 20,256,652 bytes | -116,005,371 bytes (-85.1%) |
| ASAR files | 12,817 | 1,240 | -11,577 (-90.3%) |
| Source maps | 23,726,946 bytes / 592 files | 0 bytes / 0 files | -100% |
| Build-only assets | 16,803,219 bytes / 2,014 files | 2,631 bytes / 2 licence files | -99.98% |
| Chromium locale packs | 49,471,161 bytes / 55 files | 1,137,014 bytes / 2 files | -97.7% bytes / -96.4% files |

The rebuilt macOS application showed the same 20,575,956-byte ASAR and fell from
430,764 KiB to 254,104 KiB on disk, a 41.0% reduction. Its localisation resources
fell from 49,229,002 bytes to 1,132,892 bytes. These are unpacked application
measurements, not estimates of compressed installer or download size.

The renderer build was reproduced before and after from the same commit. Asset
names and hashes were identical: initial JavaScript remained 866,840 bytes raw /
266,195 bytes gzip and initial CSS remained 121,519 / 17,795 bytes. Package
slimming therefore changed the desktop payload without trading away renderer
behaviour, animation or web loading performance. The Windows package ceilings
were ratcheted only after the rebuilt artefact passed them; the fixed baseline
artefact fails all seven new ceilings.

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
- automatic sync installs after application readiness as a 2,404-byte lazy
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
| Initial JavaScript | 2,561,545 bytes / ~748,825 gz | 863,072 / 264,211 gz | -66.3% raw / -64.7% gz |
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

The review-history storage cutover is now complete. Schema v26 verifies every legacy inline event
in the canonical store before clearing `Card.history`, and a Card-table write hook prevents
restores or imports from resurrecting it. No `sessionHistory` horizon was invented: analytics now
materialises only its exact last-sample-per-day projection while retaining every stored row.

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

- **Inline review-history multiplication is fixed.** Card rows, full backups and encrypted peer
  snapshots now keep `history: []`; canonical `reviewHistory` rows carry the evidence once. Runtime
  Cards are hydrated through the existing read seam, so study, analytics, optimisation and exports
  retain their previous interface without loading duplicate copies from IndexedDB.
- **`sessionHistory` remains unbounded by design**, but Analytics no longer re-reads it into an
  array merely to discard repeated same-day points. Cursor-backed readers retain the last point per
  day (and per Course globally), which is exactly the chart's existing projection.
- **Auto-backups retain 10 full-DB snapshots**, now without duplicated Card history arrays. The
  folder mirror remains pruned to the same ten Lacuna backup files without touching unrelated files.
- **The alleged single-deck load is not a defect.** The no-course/no-lesson path is the deliberate cross-course “Review today” session, so it must consider all cards. Course and lesson sessions already use their scoped card queries.
- **Recovery merge session deduplication is scoped.** It queries only event ids and legacy
  timestamps present in the incoming backup instead of materialising the whole local
  `sessionHistory` table. Other course/content merge maps still scale with their participating
  tables; changing those semantics remains separate work.
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
| Done | Remove persisted `Card.history`, preserve legacy import and project daily analytics reads | reviewHistory, schema, portability, sync and state reads | Removes the dominant storage/network multiplier without discarding evidence or changing charts |

## Scale verdict

- **Today (≤2–5k cards):** the phone-visible review path no longer carries the aggregate scan, per-second persistence or redundant Sidebar reads. Optional charts, Markdown and worker code stay off first paint.
- **10k cards:** a single objective session selection/completion measured 13.31/12.48 ms, and one `recordReview` measured 16.48 ms. Multi-unit scoring and canonical event volume remain the material costs.
- **100k cards:** the former inline-history multiplier is gone, but whole-table content merge and
  all-history analytics/calibration paths remain a ceiling. This work does not claim 100k-card support.
# Electron MCP contract boundary

The packaged MCP server and data companion register handler-free tool contracts. Executable
handlers remain in the renderer, the only process that owns IndexedDB. An esbuild-metafile gate
rejects any server or companion bundle containing `src/db`, `src/fsrs`, `src/items`,
`src/questions` or `src/state`, or external imports of Dexie, React or `ts-fsrs`.

| MCP JavaScript bundle | Before | After | Change |
| --- | ---: | ---: | ---: |
| Main server | 467,780 B | 96,043 B | -79.5% |
| Data companion | 429,992 B | 58,270 B | -86.4% |
| Combined | 897,772 B | 154,313 B | -82.8% |

Those bundle figures come from `electron/mcp/build.mjs` run from the branch worktree at
`5cbdbb6`; the generated JavaScript includes its source-map reference. The same commit was
then packaged as unsigned Windows x64 and macOS arm64 unpacked applications. Its `app.asar`
SHA-256 is `03bedfcd8d190e23e0384a92df01159bd13bd80ba16eb0f903d7039093d2d85d` on both
platforms. The comparison artefact is the package-diet build at `d0a6b7c` documented above.

| Package measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| `app.asar` archive | 20,575,956 B | 18,294,523 B | -2,281,433 B (-11.1%) |
| ASAR payload | 20,256,652 B | 17,987,555 B | -2,269,097 B (-11.2%) |
| ASAR files | 1,240 | 1,194 | -46 (-3.7%) |
| Windows unpacked application | 338,132 KiB | 336,220 KiB | -1,912 KiB (-0.6%) |
| macOS unpacked application | 254,104 KiB | 251,876 KiB | -2,228 KiB (-0.9%) |

The renderer output remained 7,416 KiB before and after. These measurements claim package
and Electron main-process bundle reduction only; they do not claim a renderer-speed or memory
improvement.

The AI companion surface is deliberately unchanged. Its five-tool bundle remains separate from
the broader data contract registry.
