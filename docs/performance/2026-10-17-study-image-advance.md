# Large-image card advances, 17 October 2026

On `t3/study-image-card-advance`, grade to the incoming image fully painted improved
from **260.24 ms p50 / 447.61 ms worst** to **179.06 ms p50 / 271.35 ms worst**:
31.2% lower p50 and 39.4% lower worst case in these samples.

There was one single-worker browser measurement run per build, with 24 advances per
run. Baseline: `ce418d83f9f15cb20883e43c39e4aed3aab269e3`, fetched from
`origin/redesign/direction-c`, including merge `70010b2d` and the subsequent exit-motion
merge. Both runs used a production Vite build, headless Chromium, normal motion and
CDP `Emulation.setCPUThrottlingRate({ rate: 4 })`. These are observed distributions
from one machine, not a guarantee that every deck or device has the same tail latency.

[Summary and probe breakdown](2026-10-17-study-image-advance.json).
[All 48 before/after samples](2026-10-17-study-image-advance.csv).

## Fixture and measurement

The rebuilt 322-card fixture has 54 ordinary image cards, 54 occlusion cards and 214
text cards. Its **108 distinct JPEGs/PNGs total 397,930,832 bytes**. Each is
**2,932,099–4,580,050 bytes**, with dimensions **3200 × 2400, 3600 × 2700 or
4000 × 3000**. There are 54 JPEGs and 54 PNGs; each measured card kind includes both
codecs. The synthetic images contain unique seeded photographic texture or scan-like
paper texture, text and diagram strokes. They are not real user photographs. File
sizes and unique SHA-256 hashes are checked during generation and again at ingestion.

Images use the original-sized APKG import storage seam, `storeImageBlob`: hashed
`Uint8Array` media in IndexedDB, referenced by `lacuna-asset://`. This bypasses the
1280 px upload compressor deliberately, as actual package imports do. The previous
checked-in fixture had distinct 1280 × 960 JPEGs; it did not cover original-sized
phone photos or scans. No binary fixture files are committed. Generation is cached
under the OS temporary directory and excluded from measurement.

Each run seeds a fresh browser context with the same 108 image files and 6,440
canonical review events. CPU slowdown starts after seeding and before app navigation.
The test starts a scheduled Study session, then advances through cards 1–24: six
each of ordinary JPEG, ordinary PNG, occlusion JPEG and occlusion PNG. Each current
card gets a 250 ms reading dwell plus the normal answer flip; the test never awaits
a speculative decode before grading. The same expected card ids are required in both
runs, and the existing full scheduler-order/state regression remains in the targeted
checks.

Timing starts at **Yes pointer down**. The harness separately records first frame,
image-element mount, image load, explicit decode completion and full image paint.
The paint endpoint requires the expected incoming card outside any inert subtree,
non-zero image dimensions, completed `HTMLImageElement.decode()`, two animation-frame
samples and at least 99% accumulated opacity. Entrance motion is allowed to continue;
this is image paint, not animation completion. The first frame's height is compared
with the painted frame's height independently of image readiness.

Probes wrap native IndexedDB asset reads, object-URL creation, image decode completion,
DOM image-load events and canvas-context creation. The raw payload remains in the
Playwright output directory; the committed summary and CSV keep the relevant evidence
without retaining a large browser trace or hundreds of megabytes of image files.

## What was slow

Warm-up already awaited actual `Image.decode()` completion. **All 24 incoming cards
in both runs had completed a decode of the exact URL subsequently rendered before
the grade**. No measured target re-read its asset from IndexedDB after grading. URL
churn and fetch-only warm-up were ruled out for this fixture.

Cold background asset reads were material but happened ahead of the grade: before,
**30.99 ms p50 / 85.04 ms worst**. Background decode wall time was **159.44 ms p50 /
461.87 ms worst**, including contention with other work. The after run observed
7.05/49.96 ms for reads and 131.92/220.14 ms for decodes. Those background differences
are not attributed to this rendering fix: cold storage/cache and host contention
vary. The important invariant is that these operations completed before the grade.

The measured defect was the hand-off into rendering:

- Markdown initially rendered unresolved source, then replaced it from an effect,
  even when its object URL was already cached. It also omitted intrinsic image
  dimensions, so the first layout had no image space reserved.
- Occlusion rendering initially returned nothing until an asynchronous resolver
  effect ran. Across the mixed sample, the image element mounted at **166.21 ms
  median**, after the card frame had already appeared at **146.94 ms median**.
- Initial frames were only **276.79 px high median**, growing to **495.83 px** when
  the images appeared. The smallest initial/final height ratio was **0.5498**.
  This made the card arrive as a small surface, then expand and reveal the image.
- After the fix, the frame, image element and loaded image appear together at
  **137.46 ms median**. The initial/final frame heights are **488.37/490.85 px**,
  with a minimum ratio of **0.9893**; the small remaining change is entrance scale.

Occlusion masks are percentage-positioned DOM overlays. **Neither run created any
canvas contexts** during study. The fixture uses one target region per diagram;
it does not stress unusually large numbers of masks. No exit-motion, FlipCard,
card-height measurement hook or study layout CSS was changed.

By card kind, ordinary image cards improved from **267.43/447.61 ms** p50/worst to
**181.62/202.31 ms**. Occlusions improved from **244.19/447.07 ms** to
**177.71/271.35 ms**. JPEG and PNG results are recorded separately in the JSON.

## Change and limits

The existing bounded URL cache now exposes a synchronous read and intrinsic dimensions.
Markdown's initial render resolves available URLs immediately. Ordinary and occlusion
images receive width/height attributes so the browser reserves their aspect ratio
before loading; explicitly authored dimensions are preserved. Cold references retain
the existing asynchronous path. Incoming presentation never awaits image readiness.

The existing background decoder also records natural dimensions after successful
completion, covering older imports whose metadata is missing or zero. These dimensions
are held only in memory, removed on URL eviction/teardown, and cannot resurrect an
already evicted URL. No schema, stored image bytes or persisted scheduling behaviour
changed. Full-resolution viewing remains available.

A separate downscaled study-display cache remains an option for memory-constrained
phones: a 4000 × 3000 RGBA decode is about 48 MB before additional browser overhead.
It would need a separate, bounded variant cache while retaining originals for zoom,
export and editing. This run did not show cold decoding on the measured critical
path, so adding re-encoding, another URL lifecycle and quality decisions was not
justified. Cold or immediately graded images can still incur real decode costs;
this change removes the measured presentation delay rather than making decoding free.

## Validation and reproduction

```sh
bun run build:assets
bunx playwright test -c tests/performance/playwright.study-load.config.ts \
  tests/e2e/study-session-load.spec.ts --project=chromium --workers=1
```

The dedicated config refuses existing servers; Playwright owns and stops its preview
and browser. The fixture is generated once locally, not fetched from a public host.
Each run writes `study-image-advance.json` to its Playwright output directory and
attaches the same data. The test checks the expected card order and that every initial
frame retains at least 85% of its painted height. The baseline's saved samples fail
that frame assertion; both new first-commit component regressions failed on the old
code and passed after the change.

Validation passed: `bun run typecheck`; **96 targeted tests in eight files** covering
asset-cache lifetime, decode completion, Markdown and occlusion first commits, image
viewing, import previews, card-list previews, occlusion editing and scheduler lookahead;
one single-worker measurement before and one after. No full lint or full test suite.
Measurement servers and browser contexts were stopped after each run.
