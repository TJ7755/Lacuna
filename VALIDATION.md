# Validation and hand-off for #825

Candidate: `c16c2c3d373d38b9e2a708c069bf797d771528c9`. Source is unchanged after independent review.

## Completed local checks

- `bun install --frozen-lockfile`: pass in ., relay, tooling/handwriting-maths.
- `bun run typecheck`: pass; initial unsupported test-locator option corrected before candidate.
- `bun run lint`: pass.
- `bun run docs:check`: pass.
- `bun run changelog:check`: pass.
- `bun run test -- src/pages/settings/SyncSection.test.tsx src/components/ui/ConfirmInline.test.tsx --maxWorkers=1`: 31 passed.
- `PLAYWRIGHT_WEB_PORT=4425 bun run verify:browser -- --project=chromium tests/e2e/settings-your-data.spec.ts --workers=1`: 6 passed.
- `bunx playwright install --with-deps chromium`: pass.
- `bunx playwright install webkit`: pass.
- `git diff --cached --check`: pass.

## Regression evidence

The before layout capture command fails all six width/theme cases against the original component,
and both newly added focus tests fail against that original component. The final focused run passes
all six browser cases. Both prompts are captured at 1440px, 390px and 320px in light/dark, with a visible sync error.

Exploratory failures were corrected before hand-off: dependencies were initially absent (Vite exit 127;
resolved by the frozen installs); the initial typecheck rejected an unsupported Testing Library `exact`
option (removed before the candidate); the first candidate browser run's two 320px cases rejected stacked
buttons. The layout test was refined to require natural-width, single-line labels and an 8px vertical gap
at 320px, retaining the full-width, wrapping, growth, overflow and wider-screen alignment checks.
The final focused browser run passes all six cases.

## Deliberately incomplete local matrix

The parent confirmed complete passing CI and both independent reviews on this exact presentation-only
candidate. Redundant self-started local broad runs were stopped rather than repeated.

- `bun run test:ci:unit`: interrupted with exit 130. No complete unit totals or full-suite verdict are claimed. Happy DOM emitted disabled-iframe diagnostics during the partial run.
- `PLAYWRIGHT_WEB_PORT=4425 bun run verify:browser -- --workers=1`: exit 130; **216 passed, 22 skipped, one interrupted, 150 not run**, zero completed failures. The interrupted test was question-set-search-scroll setup; its trace reflects cancellation, not a diagnosed product defect.
- The local matrix scheduler was stopped before these commands started:

- `bun run test:coverage`
- `bun run test:coverage:recovery`
- `bun run test:coverage:risk`
- `bun run build:assets (standalone matrix command; isolated browser builds passed)`
- `bun run release:scenario`
- `bun run perf:check`
- `(cd relay && bun run typecheck)`
- `(cd relay && bun run lint)`
- `(cd relay && bun run test -- --maxWorkers=1)`
- `(cd tooling/handwriting-maths && bun run build)`
- `(cd tooling/handwriting-maths && bun run test -- --maxWorkers=1)`
- `bun run --cwd tooling/lacuna-ai-mcp typecheck`
- `bun run --cwd tooling/lacuna-ai-mcp lint`
- `bun run --cwd tooling/lacuna-ai-mcp test -- --maxWorkers=1`
- `bun run --cwd tooling/lacuna-ai-mcp build`

## Parent-reported checks and review

The parent reports both independent reviews PASS at the candidate (31 and 48 focused tests; the spec review
also ran six browser cases), all 13 required checks and all reported CI jobs passing, and merge state CLEAN.
These are parent-supplied results, not an approval claimed by the implementation agent. No PR monitoring was performed.

## Platforms and scope

Local web Chromium on macOS exercised desktop and narrow mobile CSS widths. WebKit was installed but
its mobile project had not run before cancellation. Native Windows/Linux/macOS Electron and package
builds were not exercised locally. No persisted-data, backup/import, wire-format, crypto, relay or release
semantics changed. The presentation change can be reverted without data conversion.
