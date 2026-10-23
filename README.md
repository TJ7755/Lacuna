# Learner scheduling on shared-course import (#819)

Synthetic local course fixtures only; no personal learner data or credentials.

- Before implementation: base acec3ef9540d8e8a27f0bdefbcb251a4c4ee7a46 with regression tests added. Both viewport tests fail because import is enabled without a scheduling choice. The eight initial repository regressions fail because teacher scheduling wins.
- After implementation: clean candidate 8726655f3b92203707f2cd391a5105c9ecabe563. The trial-enabled browser run passes all three tests, including the complete pupil-to-Gaps workflow and import scheduling at 1280 and 390 pixels. The focused final unit run passes 131 tests.
- The desktop choice capture changes 17 March 2030 to 19 March 2030; the phone capture chooses steady retention with no fixed exam. Browser assertions inspect the persisted final assessment after import.

Commands:

```sh
bun run test -- src/db/importScheduling.test.ts --maxWorkers=1
PLAYWRIGHT_WEB_PORT=4419 bun run verify:browser -- --project=chromium tests/e2e/shared-course-scheduling.spec.ts --workers=1
PLAYWRIGHT_WEB_PORT=4419 VITE_GAPS_REPORTING_ENABLED=true bun run verify:browser -- tests/e2e/shared-course-scheduling.spec.ts tests/e2e/gaps-daily-flow.spec.ts --project=chromium --workers=1
```

The first two commands were run before implementation and fail as described. The third ran on the clean candidate and passes. Full source fingerprints, HTML/JSON reports and traces are retained in the implementation worktree for the parent reviewer. CI and independent review remain separate gates.
