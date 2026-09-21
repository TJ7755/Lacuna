# Populated desktop startup follow-up

Installed Lacuna 0.2.10, Chromium 152.0.7977.78, the same Ultra 7 Windows laptop,
Balanced power scheme. The existing profile contains 13 courses, 67 lessons, 4,883 cards
and 439 canonical review records. Counts were unchanged across the three measured
untraced launches. No cards were seeded, imported, graded or edited. Ordinary startup
services still ran. Background apps remained open. AC and thermal state are unrecorded.

## Measurements

| Measurement | Result |
| --- | ---: |
| First contentful paint after navigation, launch 1 | 2,736 ms |
| First contentful paint after navigation, launch 2 | 2,549 ms |
| First contentful paint after navigation, launch 3 | 2,950 ms |
| Launch call to observed dashboard, three samples | 4,895–5,222 ms |
| Dashboard reload, 20 untraced samples, median | 422 ms |
| Dashboard reload, observed range | 304–474 ms |
| Long tasks observed across those 20 reload windows | 17 |
| Longest observed task | 80 ms |
| Longest sampled animation-frame interval | 133 ms |
| Lowest available host memory at reload boundaries | 1.79 GiB |

All four diagnostic runs completed with no recorded renderer errors and clean measured
process exits. The fourth launch was traced and is excluded from the three-launch table.
It reached first contentful paint at 2,749 ms after navigation. One separately traced
dashboard reload took 746 ms and is excluded from the 20-sample timing distribution.

The 4.9–5.2 second launch observation **is not an exact user-visible startup time**:
the existing launcher deliberately waits for a stable DevTools target for 500 ms, then
attaches and installs the observer. The dashboard may already have been usable before
attachment. Do not simply subtract 500 ms and present that as a measured startup time.
First contentful paint comes from Chromium's buffered Paint Timing entries and does not
include that late observer delay; it still starts at renderer navigation, not the user's click.
These are fresh app processes with existing caches, not first launch after a Windows reboot.
Two pre-existing Lacuna companion processes remained after the original window closed;
they were not terminated. Thus this is not an all-processes-cold measurement either.

Reload readiness means the Courses heading plus a laid-out course heading with effective
opacity at least 0.9 and two additional animation frames. A course may be below the fold
in the recorded small window; this asserts rendered content, not that every card is in
the viewport. It does not wait for every decorative animation or background service.
Reload observers run before application scripts. Frame gaps include initial loading and
automation waits, not just interactive animation frames; they are not a count of dropped
frames. Long tasks are observed over the whole reload window, not ordinary idle use.

## Evidence and interpretation

The repeatable difference between fresh-process paint (2.55–2.95 seconds) and same-process
dashboard reload (0.30–0.47 seconds) makes initialisation a stronger lead than study pacing.
It does not by itself identify the slow component. Current source inspection points to:

- [electron/main.ts](../../../../electron/main.ts): window creation, preload, custom `app:`
  resource loading, the `ready-to-show` gate and concurrently started services. Trace the
  period before resource evaluation; do not assume everything before paint is React work.
- [ShellCourseData.tsx](../../../../src/state/ShellCourseData.tsx): initial database reads,
  review activity, performance and course summary calculations shared with the dashboard.
  This is a candidate to measure, not proof that the library query dominates startup.
- Browser cache and graphics initialisation: the startup trace includes cache-thread and
  GPU tasks above 50 ms, but no measurement yet attributes the multi-second delay to them.

The startup trace contains multiple navigation markers and more than one renderer. Match
the app frame and navigation ID before calculating intervals. Do not sum nested trace
events or durations across threads into a supposed critical path. The app's resource timing
array was empty in the captured first document, so the saved JSON cannot establish a
resource waterfall on its own; use the trace's resource events.

The reload trace includes a 372 ms `CpuProfiler::StartProfiling` event. This is material
instrumentation overhead, which is why traced and untraced results are kept separate.
The launch trace omits CPU sampling and retains timeline events. A CPU profile can be useful
later, but should not be used as the headline startup timing without an untraced control.

## Raw data and local traces

[summary.json](summary.json) retains aggregates. [startup-1.json](startup-1.json),
[startup-2.json](startup-2.json), [startup-3.json](startup-3.json) and
[startup-traced.json](startup-traced.json) retain counts, paint/navigation timings, frame
intervals, long tasks, memory observations and Chromium metrics. No library text was exported.

Full traces remain locally under `artifacts/performance/windows-2026-09-21-followup/traces/`:

- `desktop-startup.json`: eight-second launch timeline, approximately 3.9 MB.
- `desktop-dashboard-reload.json`: first reload timeline with CPU sampling, approximately 1.6 MB.

Open a trace locally in Chromium DevTools' Performance panel using Load profile. Raw traces
can include local paths and URLs; inspect them before sharing. They are not committed here.
The startup flags follow Electron's own
[startup-tracing test](https://github.com/electron/electron/blob/main/spec/chromium-spec.ts).

## Reproduction

Close the Lacuna window cleanly first. Do not run two instances against the same profile.
The runner reads the existing profile and closes the process it launches afterwards. It
does not create a fixture or mutate study data. Reopen Lacuna normally when finished.

```powershell
$env:LACUNA_ELECTRON_APP_DIR = Join-Path $env:LOCALAPPDATA 'Programs/Lacuna'
$env:PERF_STARTUP_PROFILE = Join-Path $env:APPDATA 'Lacuna'
$env:PERF_OUTPUT = 'artifacts/performance/startup-repeat.json'
$env:PERF_RELOADS = '10'
bun scripts/electron-performance/startup.ts
```

For a separate launch trace, set `PERF_RELOADS=0` and `PERF_STARTUP_TRACE` to an absolute
output filename. The runner waits at least ten seconds from its launch call so the
eight-second trace can flush. For a separate reload trace set `PERF_TRACE_DIR`; only the
first reload is traced. Clear trace environment variables before untraced runs.

The shared launcher and diagnostic runner typecheck with:

```powershell
bunx tsc -p scripts/electron-performance/tsconfig.json --noEmit
bunx tsc -p scripts/performance-heavy/tsconfig.json --noEmit
```

Next investigate navigation-to-first-paint in the launch trace, add early lifecycle markers
in a diagnostic build only if needed, and compare the same installed assets/profile/power
conditions. Preserve normal animation timings. No application fix was made; only optional
benchmark instrumentation was added. The new CLI assumes a populated dashboard and normal
motion, matching this profile, rather than supporting first-run onboarding.

Computer Use was stopped with Escape during the attempted final normal relaunch. No further
desktop input was issued, so reopening the original app was not verified.
