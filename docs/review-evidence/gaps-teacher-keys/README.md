# Teacher-key setup and recovery

Captured from the runtime at `48c1b955`:

```bash
PLAYWRIGHT_WEB_PORT=4317 bun run verify:browser -- --gaps --project=chromium gaps-standalone.spec.ts gaps-worker-migration.spec.ts gaps-teacher-keys.spec.ts
```

All five cases passed. The new case creates and downloads an encrypted recovery
file, reopens its saved key after reload, rejects a wrong passphrase in a fresh
browser and restores the same key there. It checks that no relay request or
learner database is opened and that the mobile page fits the viewport.

- [Prepared key on desktop](desktop.png)
- [Restored key in a fresh mobile browser](mobile.png)

The course code and key are synthetic. These screens do not claim a connected
course or collected pupil results.
