# Measuring performance

Record the commit, hardware, runtime, viewport, fixture size, cache state and any throttling.
Compare equivalent workloads on the same runner. Preserve input, traces, retries and failures
alongside successful measurements.

- Use `bun run build:assets` and `bun run perf:check` for the asset gate, or
  `bun run perf:audit` for measurements. See the [heavy harness](../scripts/performance-heavy/README.md)
  for populated libraries.
- Use `bun run verify:browser -- --project=chromium <spec>` with a free `PLAYWRIGHT_WEB_PORT`.
  Keep the build fixed for the run and isolate timing measurements from functional workers.
- For packaged measurements, run `bun run perf:audit:electron-package` and
  `LACUNA_ELECTRON_APP_DIR=<path> bun run test:e2e:electron-package`. Record the package identity,
  host architecture and signing state.
- For hosted comparisons, dispatch `performance.yml` with `comparison_base` and, for an exact
  candidate, `comparison_candidate`. Retain the `storage-comparison-*` artefact and its plan.

## Web return stress checks

Use disposable local servers and stores. Run one browser benchmark at a time.

```sh
bun run stress:relay
STRESS_CONCURRENCY=16 STRESS_ITERATIONS=50 STRESS_PAYLOAD_BYTES=65536 bun run stress:relay
bun run stress:web
```

For the return gate, use a full manual performance workflow and compare its artefacts with the
[first green full workload](https://github.com/TJ7755/Lacuna/actions/runs/41318877608)
(`e5863f4d`, 10,000 cards, 200,000 reviews). Initial JS/CSS bytes were
1,514,190/141,005 on Today, 1,384,777/156,498 on Course and 2,899,249/177,820 on Learn. Backup
export, preview and replacement took 6,089 ms, 1,588 ms and 22,954 ms. Earlier
[route](https://github.com/TJ7755/Lacuna/actions/runs/41316356939) and
[full](https://github.com/TJ7755/Lacuna/actions/runs/41317388148) runs raced background prefetch.
[Run 41317899236](https://github.com/TJ7755/Lacuna/actions/runs/41317899236) recorded the first
initial-only route measurements.

[Earlier performance evidence](https://github.com/TJ7755/Lacuna/tree/30d7e808f9b056afcfd61702c6de7d4ee204e759/docs/performance)
