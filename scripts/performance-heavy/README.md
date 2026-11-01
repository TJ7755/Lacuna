# Heavy dataset performance

Run from the repository root with the existing dependencies installed:

```sh
bun run perf:audit:heavy
```

Keep traced timings separate from untraced runs: starting CPU profiling can itself block
the renderer. Playwright's selector and accessibility work also appears in traces. Inspect
stacks before attributing a long task to Lacuna. Summarise a local trace with
`node scripts/performance-heavy/trace-summary.mjs <trace.json>`; inclusive timeline
durations are displayed individually and must not be summed. Keep traces local because
they may contain paths and library content.

Generate the comparison table with `node scripts/performance-heavy/summarise.mjs <report.json> ...`.
For short repeated runs, use a new disposable directory and stable port:

```sh
PERF_PROFILE_DIR=/private/tmp/lacuna-heavy-profile PERF_PORT=4173 PERF_MODE=quick \
  PERF_RATES=1 PERF_REPETITIONS=5 bun run perf:audit:heavy
```

## Disposable Linux VM

The September 2026 run uses Lima with Ubuntu 24.04 ARM64, two virtual CPUs, a sparse 24 GiB disk,
4 GiB then 8 GiB RAM, and a fixed 2 GiB swap file. No host directories are mounted. Install Node
20 or newer and the repository's Playwright version with its Chromium dependencies in the guest.
Copy `dist/`, `artifacts/performance/fixture.js` and `artifacts/performance/run.mjs` into a guest
working directory with `@playwright/test` installed, then run the bundled script there.

```sh
limactl start --name=lacuna-performance --vm-type=vz --cpus=2 --memory=4 --disk=24 --mount-none --containerd=none -y template:ubuntu-24.04
```

Run the VM cases with `PERF_RATES=1`, changing only the RAM allocation between cases. Verify
`free -m`, `swapon --show` and `nproc` in the guest before each run. Keep the VM stopped during
host measurements, and avoid overlapping benchmark runs. An ARM Linux server with headless
Chromium is a memory-limit test, not a reproduction of a Windows desktop.

Copy the reports out before deleting the disposable VM with `limactl delete -f lacuna-performance`.
Remove only the cached image and temporary files created for this test, not other VM caches or
browser profiles. Remove the Lima installation afterwards if it was installed solely for the test.
