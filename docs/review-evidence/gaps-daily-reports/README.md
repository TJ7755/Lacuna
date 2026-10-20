# Gaps daily reporting

Synthetic class and pupil data only. The screenshots contain a public class
invitation, not an ownership token, private key or passphrase.

- [Pupil consent](pupil.png): verified class enrolment, explicit consent and the
  accepted reporting day.
- [Teacher desktop](desktop.png) and [teacher mobile](mobile.png): a decrypted
  report produced by actual card study in a separate learner browser.

Captured through `VITE_GAPS_REPORTING_ENABLED=true PLAYWRIGHT_WEB_PORT=4337 bun run
verify:browser -- --project=chromium gaps-daily-flow.spec.ts`, using the frozen
candidate recorded in `artifacts/browser-checks/run-WzTj4b/source.json`. The test
builds the separate teacher entry, uses the real in-memory relay handler, checks
no upload before consent, ciphertext-only transport, daily acknowledgement,
teacher decryption, storage separation, mobile overflow and opt-out persistence.

The same candidate passed the seven standalone connection/recovery/migration
checks and five main-site entry/sharing checks (before subsequent test-only and
screenshot changes). These local checks do not activate collection or prove the
production hostname assignment. Production gates remain off.
