# Heavy dataset performance

Run from the repository root with the existing dependencies installed:

```sh
bun run perf:audit:heavy
```

This builds the production web application, bundles a separate fixture using the real database
schema, and runs headless Chromium in disposable browser contexts. Nothing is added to the
application bundle and no installed Lacuna profile is opened. The fixture refuses a non-empty
database. Each throttle factor gets a fresh dataset: 10 courses, 100 lessons, 10,000 introduced
maths-formatted Cards, 10,000 Concepts and 200,000 canonical review records. It contains no
media assets, Questions or synchronisation traffic.

The runner checks dashboard loading, global search, course navigation, Cards navigation and
filtering, study startup, readable answer reveal, readable grading to the next Card, and full backup export,
preview and replacement. It checks visible results and captures JavaScript errors. Fixture
generation is excluded from timings. Review history is synthetic workload data, not evidence
about the learning algorithm's accuracy.

Results are written to `artifacts/performance/local.json`. Options:

| Environment variable | Default                            | Meaning                                                                                                                                                   |
| -------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PERF_RATES`         | `1,4,6`                            | Chromium renderer CPU throttling factors                                                                                                                  |
| `PERF_REPETITIONS`   | `3`                                | Repetitions of navigation, search and study operations                                                                                                    |
| `PERF_OUTPUT`        | `artifacts/performance/local.json` | JSON report path                                                                                                                                          |
| `PERF_LABEL`         | `mac-host`                         | Environment label recorded in the report                                                                                                                  |
| `PERF_SMOKE`         | unset                              | Set to `1` for a small harness check; never use it as heavy-load evidence                                                                                 |
| `PERF_MODE`          | `full`                             | Set to `quick` to omit backup export, preview and replacement while iterating on navigation and study timings                                             |
| `PERF_PROFILE_DIR`   | unset                              | Reuse a disposable persistent Chromium profile and skip reseeding when its exact fixture counts already exist; stale fixture/schema revisions are refused |
| `PERF_PORT`          | `0` (`4173` with a profile)        | HTTP port; profile reuse needs a stable port so IndexedDB remains on the same origin                                                                      |
| `PERF_BURST_REVIEWS` | `0`                                | Optional consecutive answer-reveal/grading cycles in one study view, recorded as separate burst metrics                                                   |

Backup operations run once per factor. Report their individual timings separately from medians.
Generate the comparison table with `node scripts/performance-heavy/summarise.mjs <report.json> ...`.
Repeated timing cells show median / slowest observed; single measurements are labelled `n=1`.
The maximum of three samples is an observed maximum, not an estimated worst-case bound or p99.
Timings cover the action, an asserted visible result and two animation frames, and include
Playwright overhead and normal application animations. The first dashboard load starts a new
document without an application HTTP cache; later loads are warm reloads. This is not an
operating-system cold boot or a packaged Electron startup measurement.

The summary also reports `inputToReadableMs` for answer reveal and grading. It starts at the real
browser click event and ends after the readable semantic face has survived two animation frames;
the existing `elapsedMs` remains the wall-clock action timing and includes Playwright overhead.

CPU throttling does not reproduce a particular processor, graphics card or storage device.
JavaScript heap samples are taken at operation boundaries and are not total browser memory or
a continuously observed peak. On Linux the runner also samples whole-guest available memory,
swap usage, major page faults and the kernel OOM-kill counter every 500 ms during measurements.
Those include the OS, test runner and Chromium. Fixture generation is outside that sampling window.

For short repeated runs, use a new disposable directory and stable port:

```sh
PERF_PROFILE_DIR=/private/tmp/lacuna-heavy-profile PERF_PORT=4173 PERF_MODE=quick \
  PERF_RATES=1 PERF_REPETITIONS=5 bun run perf:audit:heavy
```

The first run still seeds the complete fixture. Later runs reuse the profile and verify the exact
10,000-card/200,000-review counts before measuring. Each rate runs from a fresh copy of the owned
base profile, so grading is measured repeatedly without changing the base. The profile directory
must be dedicated to this harness; the ownership and fixture/schema revision sentinel rejects
normal browser or Lacuna profiles. Remove the base and copied run profiles when finished.

The answer and grading timings assert readable content, including effective ancestor opacity, and
wait through two animation frames. These measurements are therefore not directly comparable with
reports made by older harness versions that only waited for a button or outgoing Card to disappear.

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
