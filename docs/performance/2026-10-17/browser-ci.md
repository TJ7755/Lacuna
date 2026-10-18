# Browser CI duration and progress

Measured on 17 October 2026. This investigation changes reporting only. It does not establish a new
runtime budget or change test selection, assertions, workers, shards, retries or timeouts.

## Archived measurements

The values below come from the uploaded Playwright HTML reports, not elapsed-time estimates.
Report duration includes runner setup; summed test duration measures execution across workers.
First-attempt passes and retry outcomes are reported separately. None of these samples skipped tests.

- [Run 39049109733](https://github.com/TJ7755/Lacuna/actions/runs/39049109733), tested commit
  `6deebef2c023869ec9a14bcabd389e1be4329bc9`: shard 1 ran **89 tests**, report duration
  **214.419 s**, summed execution **399.083 s**; shard 2 ran **88 tests**, report duration
  **287.319 s**, summed execution **542.764 s**. The suite total was **177**, not 407.
  GitHub job totals were 4 min 16 s and 5 min 25 s respectively.
- [Run 39064983929, shard 1](https://github.com/TJ7755/Lacuna/actions/runs/39064983929/job/117490688513),
  PR head `a8485f22a2cd089661822a46fbd8789109768e78`, tested merge
  `2c6ffcf493dd0b9e1c9f78aac65b140819b40bbc`: **204 tests passed**, report duration
  **386.138 s**, summed execution **743.640 s**. The workers carried **372.517 s** and
  **371.123 s**. Dependency/browser installation and job setup took about 35 s before the browser
  command; production build and server startup remained inside that command.
- [Run 39065757898, shard 1](https://github.com/TJ7755/Lacuna/actions/runs/39065757898/job/117493044904),
  frozen PR head `66feb7765bda45b97003b106753ddab2267b63f9`, tested merge
  `b71577753241463132e9ace8d9044b1ab5d0e71d`: **204 tests passed**, report duration
  **463.357 s**, summed execution **891.871 s**. Worker totals were **446.956 s** and
  **444.915 s**. Its slowest test was the same AI lifecycle scenario at **55.261 s**.
  This is a second balanced sample, with roughly 20% more execution time than the previous run;
  these two samples do not establish the cause of that variation.
- [Run 39065757898, shard 2](https://github.com/TJ7755/Lacuna/actions/runs/39065757898/job/117493044776),
  the same tested merge `b71577753241463132e9ace8d9044b1ab5d0e71d`: **201 first-attempt passes
  and 2 flaky tests**, no final failures; report duration **740.993 s**, summed execution across
  all attempts **1443.966 s**. Equal test counts do not imply equal workload: shard 1 had 204
  tests and shard 2 had 203, but the latter contained the **210.150 s** image-advance check,
  which deliberately measures 24 advances at 4× CPU slowdown. The existing two-shard/two-worker
  configuration is retained; changing concurrency or test allocation needs a separate measured trial.

The later shard has 2.29 times the tests and 1.86 times the summed execution of the earlier shard 1.
Five minutes is therefore not a fair target for the larger suite. The later workers were already
balanced to within 1.394 s. There is no evidence here for increasing concurrency.

The other shard of run 39064983929 was cancelled. Its incomplete duration is not a successful
baseline. Its old sidebar failure belongs to the separately owned #564 repair; this report does
not attribute it to the final #564 head. The final run completed successfully and #564 landed as
`a5ae7e426c97c0bbb8e0ee13a50c809d3655952f`. Its two remaining flaky cases are recorded below.
No live remote case count or hang is inferred from silence or elapsed time.

## Longest first-attempt tests in the 204-test shard

All times are from tested merge `2c6ffcf493dd0b9e1c9f78aac65b140819b40bbc`.

- `ai-lifecycle.spec.ts`: preserves AI across peer sync and revokes it after full replacement —
  **49.013 s**.
- `ai-terminal.spec.ts`: creates a complete authored course through approved AI tools — **17.605 s**.
- `course-settings-disclosure-motion.spec.ts`: settings headers stay still, 1280 px normal motion —
  **15.191 s**; 390 px normal motion — **14.670 s**; 1280 px reduced motion — **14.351 s**;
  390 px reduced motion — **14.255 s**.
- `data-recovery.spec.ts`: replaces a clean browser context with a media-bearing full backup —
  **13.732 s**.
- `ai-terminal.spec.ts`: carries misconception-first instructions through a memory-guided teaching
  exchange — **12.650 s**.

These are successful workflow costs, not timeout failures. The AI lifecycle scenario includes two
5.1 s waits around sync cooldowns; each settings scenario samples eleven 650 ms animation windows.
Removing those waits or shortening those windows requires a separate reproduction proving that the
same concurrency and motion assertions remain meaningful. Neither is changed here.

Failures have a different cost: some scenarios allow 90–300 s and CI permits one retry. An eventual
failure can therefore have a long tail. The report retains every attempt so future investigations
can distinguish first-attempt work from retry cost. Blanket retries or longer timeouts would hide
the mechanism rather than fix it.

An archived failing comparison is [release run 39065197087, shard 1](https://github.com/TJ7755/Lacuna/actions/runs/39065197087/job/117491312461),
tested commit `4370aa608b071b979a83c006e758acbb6662e6c0`: **26 failed and 178 passed in
16.7 min**. Its browser command ran from `20:06:34Z` to `20:23:18Z`. The failures span nine specs,
all within the separately owned #564 repair. For example, all four settings motion cases exhausted
30 s on the old course-link locator and exhausted another 30 s on retry. The desktop dragging
case did the same with `[aria-roledescription="sortable lesson"]`; the landing preview expected
the old `.method-page` class. This is concrete evidence of avoidable failure/retry cost on the old
commit, not a successful-suite duration target or a new failure attributed to the frozen repair.

The final frozen-head shard 2 still had two first-attempt failures, both successful on the existing
retry. The sidebar course-dropdown test's row-opacity comparison at line 189 failed after **18.756 s**
and passed its **17.128 s** retry. The study-swipe keyboard Yes case at 1280 px with normal motion
failed its offscreen assertion at line 179 after **9.262 s** and passed its **9.313 s** retry.
Failed attempts consumed **28.018 worker seconds**, with another **26.441 s** on successful retries.
These are concrete follow-up reliability findings, not evidence of a hang. Their existing owner
and the release coordinator were notified; no assertion or sampling change is folded into this PR.

## Reproduced progress defect and change

In the passing 204-test shard, the first progress line was at `20:03:02.9245708Z`. Dot batches then
appeared at `20:06:15.0288286Z`, `20:08:39.1047892Z` and `20:09:19.0709681Z`: gaps of **192.104 s**,
**144.076 s** and **39.966 s**. The first two batches contain 80 dots each.
The newer passing shard repeats the mechanism: **231.399 s**, **173.711 s** and **45.895 s**
between its start and the same 80/80/44-dot batches.

In installed Playwright 1.64.0, GitHub and HTML reporters both report that they do not print to
standard output. Playwright consequently adds its default CI dot reporter. Successful dots do not
end a line until the batch fills. The archived timestamps demonstrate the resulting visibility gap;
they do not prove the tests stopped running.

The configuration now explicitly adds the built-in **line** reporter. Each test start includes its
project, file, title and attempt number. These counters describe starts, including retry starts;
they are not completed-test counts or an estimate of remaining time. Long cases can still be silent
while running, and GitHub's live log API can still return `404 BlobNotFound` until logs are archived.

GitHub annotations and HTML evidence remain. The built-in JSON reporter writes
`test-results/browser-results.json`, already covered by both existing browser artefact uploads.
It includes per-attempt start time, worker, duration, status and errors. No new dependency, custom
reporter, heartbeat process or workflow gate is needed. This improves diagnosis and visible progress;
it does not claim a measured throughput improvement.

## Validation and reproduction

A temporary no-browser suite imported the real web configuration, overriding only its test directory,
server, project device settings and worker count for the probe. It contained a pass, a failure on the
first attempt followed by success, and a permanent assertion failure. Standard output was piped and
read line by line while the subprocess was still running.

Before the change, the probe returned status 1 and retained failure annotations and HTML, but had
**no live named start and no visible retry start**. After the change it returned status 1, emitted
live named starts and `retry #1`, retained annotations and HTML, and wrote JSON with attempt statuses
`passed, failed, passed, failed, failed`, positive durations, one flaky test and one unexpected failure.
The probe's assertion on live named progress failed before and passed after the change. It launches
no browser and makes no application reliability claim.

Local checks on the reporting change (Bun 1.4.3):

- `python3 /tmp/lacuna-browser-duration/check-reporting.py`: the temporary probe above passed.
- `bunx eslint tests/config/playwright.web.config.ts --max-warnings=0`: passed.
- `bun run changelog:check`: passed, 280 fragments at the time of measurement.
- `bun run build:assets`: passed.
- `CI=true bun run test:e2e:web -- --list --project=chromium --reporter=line`: discovered
  **407 tests in 102 files**. Initial discovery before building correctly failed because
  `landing-prerender-paint.spec.ts` reads `dist/index.html`; repeating after the build passed.
- `git diff --check`: passed.

The full browser suite and native packages were not run locally for this CI-only change. Existing
owners were running release diagnostics; duplicating them would contaminate timing measurements.

Retrieve the source evidence with:

```sh
gh run view 39064983929 --json headSha,jobs
gh run download 39064983929 --name browser-results-1 --dir /tmp/browser-ci-39064983929
gh api repos/TJ7755/Lacuna/actions/jobs/117490688513/logs --allow-escape-sequences > /tmp/browser-ci-39064983929.log
```

For new runs, download the shard artefact and inspect `test-results/browser-results.json` directly:

```sh
jq '[.. | objects | select(has("specs")) | .specs[] as $spec |
  $spec.tests[] as $test | $test.results[] |
  {file: $spec.file, title: $spec.title, project: $test.projectName,
   workerIndex, startTime, duration, retry, status}] | sort_by(-.duration)' \
  test-results/browser-results.json
```

The browser and native required CI gates remain authoritative. This reporting-only change does not
replace the release's exact-master CI and Security evidence, or alter its #564 then #568 cutoff.
