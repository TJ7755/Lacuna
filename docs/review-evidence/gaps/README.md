# Gaps preparation screen

Captured against `99d003d0` with the standalone teacher build:

```bash
PLAYWRIGHT_WEB_PORT=4327 bun run verify:browser -- --gaps --project=chromium gaps-standalone.spec.ts gaps-worker-migration.spec.ts
```

All four cases passed: desktop, mobile, preserving existing learner storage and
retiring the old Gaps worker without touching course data or the main-site worker.
The screen deliberately shows no connected courses or pupil results.

- [Desktop, 1280 pixels](desktop.png)
- [Mobile, 390 pixels](mobile.png)

The migration fixture uses local interception of the real hostname; it does not
prove the timing of a returning browser's worker update after publication.
