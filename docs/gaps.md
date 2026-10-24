# Gaps: teacher insights

## Agreed trial boundaries

The forwardable [school data notice](gaps-school-notice.md) describes the current web
trial in plain English. The [teacher walkthrough](gaps-teacher-walkthrough.md) is ready
for a later human session; the [operations procedure](gaps-trial-operations.md) covers
delivery, maintenance and spending. These are not claims that a teacher usability
session or the first real class's follow-through has been completed.

The owner approved the four defaults from [#600](https://github.com/TJ7755/Lacuna/issues/600):

- An opaque relay mailbox retains submissions for 12 weeks; fetching does not delete them.
- Disclose the course, UTC reporting day, submission time and packet size visible to the service.
- Recover the teacher key using an offline passphrase and a saved encrypted recovery file.
- Do not display keyless participation counters in v1.

The production web trial was enabled on 19 October 2026 after the owner confirmed
their human review and approval and requested an additional Sol review. That AI
review found a UTC-midnight reporting defect; the fix passed a follow-up review
and the complete CI gate before activation. This is not a formal security audit.
Production `lacuna` sets `VITE_GAPS_REPORTING_ENABLED=true`; production
`lacuna-relay` sets `RELAY_INSIGHTS_ENABLED=1`. Desktop builds were not activated.
The [activation record](https://github.com/TJ7755/Lacuna/blob/30d7e808f9b056afcfd61702c6de7d4ee204e759/docs/review-evidence/gaps-trial-activation/README.md) identifies
the released source, deployments and live verification. Relay expiry cannot erase
results already retained by a teacher.

The independently supplied fingerprint authenticates the recipient without an
additional signing key. A key downloaded from the relay alone is insufficient.
This replaces the proposal's unimplemented public-key signature with an explicit
invitation trust anchor. It does not protect a pupil who obtains a substituted
invitation or runs compromised application code. Ordinary course links without a
pinned teacher fingerprint cannot enrol a device for encrypted reporting.
Desktop safeStorage and key rotation remain separate work. The production web
trial uses the reviewed flow and approval recorded above. The public key is trusted only
through the teacher invitation described above. Anyone holding an authentic public key
can encrypt a fabricated result. The spike bounds evidence to 64 KiB and rejects
unknown fields and versions; this provisional format is not a released contract.

Anyone with access to this browser profile can open remembered classes, like a signed-in
email account. The device key protects stored token bytes; it does not protect against
someone using the same profile. Keep recovery and connection files with their passphrases
separately for another device or cleared browser storage.

## Disable the trial

Confirm the intended team and projects before changing production configuration.
Set production `RELAY_INSIGHTS_ENABLED=0` on `lacuna-relay` and
`VITE_GAPS_REPORTING_ENABLED=false` on `lacuna`, or remove those production values.
Changing a saved variable does not change an already deployed build: deploy the
reviewed source with those disabled values, or roll back to verified production
deployments that captured disabled gates. Stop relay admission first, then pupil
delivery. The relay gate disables report reads as well as uploads; retained
ciphertext remains stored. Failed uploads retain the existing encrypted retry packet.

Use `bunx vercel rollback` with the exact selected production deployment URL and
the verified team scope. The activation record retains the initial fallback
deployments; for later releases, check compatibility before reverting learner code.
Disabling the saved values as well prevents a later automatic build from silently
reactivating reporting. Rollback disables collection; it does not erase retained
reports, teacher keys or pupil data. Keep the teacher hostname, retirement worker
and existing storage intact.

## Trial cost assumptions

At 30 pupils and one accepted upload each day, a 30-day month has at most 900
submissions before retries. The normal uncontended upload takes three Blob writes:
an IP counter, a capacity reservation and the envelope. That is about 2,700 paid
advanced operations, plus teacher reads, listing and maintenance. At the published
$5 per million advanced operations, those writes alone cost about $0.014. This
already exceeds Hobby's 2,000 included advanced operations; the current design
does not claim to fit that free-plan limit.

At the maximum envelope size, 30 pupils over 84 retained days use less than
0.24 GB of ciphertext, before cleanup lag. Storage, transfer, requests and function
time remain usage-based. A conservative planning estimate is under $1/month for
normal trial traffic, excluding app builds, other projects, abuse and any future
AI service. This is an estimate, not a spending cap. The existing Pro account's
$20 monthly infrastructure credit is shared across projects; excess usage is
billed on demand. No extra database or AI service is required for this mailbox.

Pricing references: [Blob usage and pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)
and [Pro plan](https://vercel.com/docs/plans/pro-plan). Check current rates and
account-wide remaining credit before enabling the trial.

## Hosting

`https://gaps.getlacuna.app` serves the separate static `lacuna-gaps` Vercel project.
`teach.getlacuna.app` redirects to it. Both teacher hostnames belong to that project;
neither is assigned to a learner branch. The `lacuna` project continues to serve
`getlacuna.app` with the root [Vercel configuration](../vercel.json).
Changing that shared project's build command would also change Lacuna: do not do that.

The Gaps project is connected to this repository with production branch `master`,
Root Directory `gaps` and source files outside that directory included
([Vercel monorepo procedure](https://vercel.com/docs/monorepos/monorepo-faq)).
[gaps/vercel.json](../gaps/vercel.json) owns its static deployment settings.
Its install/build commands run in the repository parent with Bun 1.4.3 and the frozen
root lockfile; output is `dist` relative to `gaps`. The teacher root contains no
`api` directory. Hosting the teacher workspace does not activate pupil delivery.

The remote Ignored Build Step runs production builds and skips automatic previews:

```sh
if [ "$VERCEL_ENV" = "production" ]; then exit 1; else exit 0; fi
```

This avoids an extra teacher build for every PR in the monorepo. Use an explicit,
authorised staged production deployment for publication checks. Inspect the linked
project and team before deploying; a local link to `lacuna` is the wrong target.
Stage with `bunx vercel deploy --prod --skip-domain`, verify the returned deployment
with `bunx vercel curl`, then promote that exact production deployment. Deployment
protection remains enabled for generated URLs; the production teacher domain is public.

For a hostname reassignment, Vercel's project-domain move endpoint also moves
redirects pointing to that hostname. Use it with the explicit destination project
and `gitBranch: null`; removing a domain with `domains add --force` fails while a
redirect points to it. Preserve the old project, branch assignment and deployment
before moving a hostname so that a failed cutover can be reversed. Later teacher
releases can roll back to a previous ready production deployment in `lacuna-gaps`.
Do not change the learner project's build, other hostnames or relay activation gates.

Serve `/sw.js` with `no-store` and retain this
retirement asset through the migration window; removing it early strands browsers
that have not returned yet. The existing cached study assets may remain on disk.

Before moving the hostname, verify a preview and then the production origin with
both a fresh profile and an existing installation. The latter must update its old
registration; a browser that delays worker updates may require a reload. Check
bare root, old hashes, preserved course data, missing assets (must not return HTML),
sharing and the main site's study/desktop behaviour. The migration browser test
installs a cached learner-shell fixture on the real Gaps hostname through local interception, updates it to the candidate worker and
checks that course data and the separate main-site worker survive. The test changes
only the worker URL query because Chromium background update fetches bypass
Playwright routing; it exercises the same registration takeover and activation.
It does not prove the remote assignment or update timing of an existing production installation.
