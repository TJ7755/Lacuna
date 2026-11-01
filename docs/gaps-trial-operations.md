# Operating the Gaps web trial

Scope: one class of about 30 pupils, daily reports, existing Vercel services.
Use the [school notice](gaps-school-notice.md) and the
[teacher walkthrough](gaps-teacher-walkthrough.md). Use the disable procedure below.

## Deploy the teacher project and migrate hostnames

Use the separate `lacuna-gaps` project for `gaps.getlacuna.app` and its
`teach.getlacuna.app` redirect. Do not change the learner project's build command.
Confirm team `tj7755`, production branch `master`, Root Directory `apps/gaps`, and
inclusion of source files outside that directory. Keep the frozen-lockfile
install/build commands in [apps/gaps/vercel.json](../apps/gaps/vercel.json); they run from
the repository root (`cd ../..`) and produce `apps/gaps/dist`. Use the repository's pinned Bun.

Keep the remote Ignored Build Step skipping automatic previews:

```sh
if [ "$VERCEL_ENV" = "production" ]; then exit 1; else exit 0; fi
```

Inspect the linked project and team before deployment; a link to `lacuna` is the
wrong target. Stage with `bunx vercel deploy --prod --skip-domain`, verify the
returned deployment with `bunx vercel curl`, then promote that exact production
deployment. Keep protection enabled for generated URLs. Hosting the teacher
workspace does not activate pupil delivery.

Before moving a hostname, preserve its old project, branch assignment and ready
deployment for rollback. Use Vercel's project-domain move endpoint with the
explicit destination project and `gitBranch: null`; it also moves redirects to
that hostname. `domains add --force` cannot remove a domain while a redirect
points to it. Leave the learner project's other hostnames and relay gates intact.

Retain `/sw.js` with `no-store` throughout the migration window so returning
installations can retire their old worker. Before the move, verify preview and
production using both a fresh profile and an existing installation. Check the
bare root, old hashes, preserved course data, sharing, missing assets returning
errors rather than HTML, and the main site's study and desktop behaviour. The
existing installation must update its registration; delayed updates may require
a reload. The migration browser fixture proves local takeover, not remote domain
assignment or production update timing.

Use the [frozen activation record](https://github.com/TJ7755/Lacuna/blob/30d7e808f9b056afcfd61702c6de7d4ee204e759/docs/review-evidence/gaps-trial-activation/README.md)
for initial source, deployment and fallback identities. For later teacher
releases, roll back to a verified ready production deployment in `lacuna-gaps`.

## Check device storage policy before the trial

Ask school IT whether shared PCs or pooled tablets clear browser storage at logout,
and verify with synthetic data on the devices pupils and teachers will use. A
persistence grant does not protect against a managed profile wipe. Rehearse pupil
backup or sync to a retained device through Lacuna Settings, and teacher recovery
from a file and code kept outside that profile. A wipe can reset local consent and
queued reports as well as study history; missing reports do not prove no study.
Record reproducible device-policy failures with the Managed-device failure issue
template, without pupil records or credentials.

## Check delivery without reading pupil reports

Use the existing `lacuna`, `lacuna-gaps` and `lacuna-relay` projects in team
`tj7755`. Confirm the production deployment and its source before an investigation.
Do not pull pupil report bodies, teacher keys, connection files or passphrases
into an operations log. Do not use production pupil identities for a probe.

For a delivery rehearsal, use a disposable synthetic course, separate author,
teacher and pupil browser profiles, and the normal join/consent flow. Verify that
consent starts off, today's **Send latest progress** snapshot is accepted, the
teacher can decrypt it after **Refresh results**, and a second publication after
more study updates the same report without duplicating activity. Check that an
unchanged publication and a failed send show honest status, automatic completed-day
delivery still works, close clears the view, and opt-out survives reload. Delete the
synthetic share afterwards and verify its payload returns 404. Keep browser traces
and video disabled: they can retain authorisation material. A successful synthetic
flow does not prove that every pupil's device has delivered.

Check failed requests by route/status in a bounded time window. Distinguish a
disabled gate (503), a request limit (429), an expired day (410), a rejected
credential (401), a duplicate slot conflict (409) and a server failure. Missing
reports are not an attendance count. Preserve self-reported/unknown evidence.

## Verify retention maintenance

`apps/relay/vercel.json` schedules `/api/ai/maintenance` at **03:00 UTC daily**. The
existing job also maintains sync, shares and AI records. It requires a production
`CRON_SECRET` on `lacuna-relay`; Vercel supplies it in the cron's bearer header.
Keep it a server-only Secret, never a browser variable or repository file.
After adding or changing it, deploy the reviewed relay source: a saved variable
does not update a running deployment.

Check a real scheduled invocation for a 200 response. A schedule alone, a 401,
or an unauthenticated manual request does not prove cleanup ran. An authorised
manual run verifies the handler now, but does not prove the next timer fired.
Do not weaken authorisation to make a health check green.

Inspect aggregate deletion counts and operational errors. Investigate non-200 runs,
repeated timeouts or a growing backlog. Never bulk-delete a shared store to clear
a trial problem. Do not promise deletion at an exact wall-clock time.

## Keep spending visible

Use `vercel usage --scope tj7755 --json` for the current billing cycle. Record the
timestamp, cycle, credit used/remaining and service costs privately. Figures can
lag; they are not a final invoice or a spending cap. The account's Pro credit is
shared with other projects, and the subscription charge is separate from usage
consuming that credit. Do not attribute all account costs to Gaps.

Compare builds, functions and Blob usage, rather than counting encrypted reports
alone. Keep automatic PR previews skipped as configured; production builds still
run. Do not add paid monitoring, databases or account-wide pause rules for this
trial without a concrete need and the owner's choice about effects on other apps.
Check [current Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)
and [Pro credit rules](https://vercel.com/docs/plans/pro-plan) when reviewing them.

## After the class starts

After the first explicit publication, have the teacher refresh today's results
and confirm they can read the snapshot. After the first completed UTC day with
the class, also confirm automatic daily delivery. Ask about missing reports privately;
first check consent, class invitation, app version and whether the app was opened
online. Record only aggregate operational findings publicly.

Review spend and the next scheduled maintenance result after the first day, then
after the first week. This is an operator procedure, not a newly installed
recurring automation. Keep the epic open for the real teacher's observations and
the first-class follow-through; do not mark them complete from synthetic tests.

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
