# Measuring performance

The [audit script](../scripts/performance-audit.ts) owns asset budgets and measurement definitions;
[package auditing](../scripts/electron-package-audit.ts) owns archive/payload limits. Read those
sources rather than copying thresholds here. Historical results live under [performance/](performance/).
They describe their named candidate and environment, not a current capacity guarantee. The previous
[historical audit narrative](https://github.com/TJ7755/Lacuna/blob/88561dc89556ebeb75de0e68075ad20afb830019/docs/PERFORMANCE.md)
remains in Git; it is not a current priority list.

## Reproduce

1. Record commit, dirty state, hardware/OS, browser/runtime versions, viewport, motion setting,
   fixture size, cold/warm cache state and any CPU/network throttle.
2. Build once and retain the exact assets for the whole comparison. Run `bun run build:assets`
   then `bun run perf:check` for the deterministic asset gate, or `bun run perf:audit` for assets
   and scheduling measurements. The [heavy harness](../scripts/performance-heavy/README.md)
   covers populated-library scenarios.
3. For browser checks, use `bun run verify:browser -- --project=chromium <spec>` to build into a
   unique directory and preserve its source/evidence manifest. Never rebuild output beneath a
   running preview or reuse another worktree's server. Set `PLAYWRIGHT_WEB_PORT` to a free port.
4. For packaged measurements, use `bun run perf:audit:electron-package` and
   `LACUNA_ELECTRON_APP_DIR=<path> bun run test:e2e:electron-package` against the intended package.
   Record the package's identity, host architecture and unsigned/signed state.

## Interpret

Compare equivalent workloads on named before/after commits. Count retries and failures separately
from successful execution time. A growing suite is not comparable to an older smaller suite merely
because both jobs have the same name. Preserve logs, traces and measurement inputs with the result.

Measure the first usable interaction as well as steady state. Separate a committed review's latency
from deferred trajectory work, and selection cost from storage/merge cost. Fake IndexedDB timings,
query counts, bundle size and process memory are different measurements; none substitutes for another.
An isolated synthetic benchmark cannot establish a physical device's behaviour or supported scale.

CPU-throttled image measurements belong on a runner without competing functional workers; see
[CI projects](../tests/config/playwright.web.ci.config.ts). Isolation removes contention, not product
regressions. New opportunities and unresolved regressions belong in issues, not an accumulating
priority list in this procedure.
