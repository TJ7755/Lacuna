# Gaps recovery code review evidence

Chromium, 20 October 2026, at 1280 × 900 and 390 × 900. These captures use a
synthetic relay and disposable class. The Playwright init script replaces only
the 24-byte random draw with a fixed sample; production generation has no test
flag or injection path. The sample does not open a live class.

The done view hides its surrounding introduction and connection-method buttons,
focuses **Class created**, and shows the code once. The unlock view has one code
field and the existing remember checkbox. Legacy two-passphrase imports and
recovery remain covered by the same browser run.

| View | 1280 pixels | 390 pixels |
| --- | --- | --- |
| Create form | [Desktop](course-link-form-1280.png) | [Mobile](course-link-form-390.png) |
| Class created | [Desktop](class-created-1280.png) | [Mobile](class-created-390.png) |
| Unlock with code | [Desktop](recovery-code-unlock-1280.png) | [Mobile](recovery-code-unlock-390.png) |

Validation command:

```sh
PLAYWRIGHT_WEB_PORT=4317 bun run verify:browser -- --gaps --project=chromium gaps-course-connection.spec.ts gaps-teacher-keys.spec.ts gaps-standalone.spec.ts
```

Result: 10 tests passed. Browser automation does not replace a teacher usability
session or independent human review of the storage and recovery changes.
