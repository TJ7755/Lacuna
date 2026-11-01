# Measuring performance

The [audit script](../scripts/performance-audit.ts) owns asset budgets and measurement definitions;
[package auditing](../scripts/electron-package-audit.ts) owns archive/payload limits. Read those
sources rather than copying thresholds here. Historical results remain in [Git history](https://github.com/TJ7755/Lacuna/tree/30d7e808f9b056afcfd61702c6de7d4ee204e759/docs/performance).
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

## Web return stress checks

These checks run against disposable local servers and stores. They require no Vercel, Blob or
production credentials. Do not point them at a deployed service. Run one browser benchmark at a
time; check `uptime` and available memory first on shared machines. Use GitHub Actions for repeated
or CPU-throttled runs rather than competing with other local builds.

### Relay

```sh
bun run stress:relay
STRESS_CONCURRENCY=16 STRESS_ITERATIONS=50 STRESS_PAYLOAD_BYTES=65536 bun run stress:relay
```

The relay harness invokes the real handler with an in-memory store. It exercises sync, sharing,
class codes and AI session mailboxes, and writes `artifacts/stress/relay.json`. Compare throughput,
p50/p95/p99 latency and status counts at the same concurrency and payload size. Expected contention
conflicts and rate-limit responses are separate from unexpected errors; the behavioural probes must
pass even when the throughput number looks healthy. An in-process store measures handler overhead
and contention semantics, not Blob latency or deployment capacity. The relay v2 integration must use
its shared protocol when that branch lands; do not preserve a parallel legacy wire format.

### Large libraries

```sh
bun run stress:web
```

This extends `perf:audit:heavy` on the production assets with budget enforcement. The fixture uses
real browser IndexedDB, thousands of cards and many courses. Keep the generated JSON report with
the tested commit and runner identity. The report records navigation, readable study/review results,
backup/import work, resources and renderer responsiveness. Read the budget definitions beside the
harness before changing a threshold. A threshold is a regression ceiling, not a claimed measurement
or a guarantee for every Chromebook. Record an observed baseline from the same runner and workload;
do not compare CPU-throttled runs with unthrottled ones.

The performance workflow runs a smaller workload on relevant pull requests and the full workload
on demand through `workflow_dispatch`. Download its artefacts to inspect failed measurements and
retain the first green full report as the named baseline. Cheap checks do not replace the full run
before the web return. Existing `perf:check` and first-interaction checks remain part of validation.
