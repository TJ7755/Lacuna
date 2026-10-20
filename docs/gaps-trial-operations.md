# Operating the Gaps web trial

Scope: one class of about 30 pupils, daily reports, existing Vercel services.
Use the [school notice](gaps-school-notice.md) and the
[teacher walkthrough](gaps-teacher-walkthrough.md). The
[Gaps guide](gaps.md#disable-the-trial) owns the disable/rollback procedure.

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
consent starts off, a completed-day report is accepted once, the teacher can
decrypt it, close clears the view, and opt-out survives reload. Delete the
synthetic share afterwards and verify its payload returns 404. Keep browser traces
and video disabled: they can retain authorisation material. A successful synthetic
flow does not prove that every pupil's device has delivered.

Check failed requests by route/status in a bounded time window. Distinguish a
disabled gate (503), a request limit (429), an expired day (410), a rejected
credential (401), a duplicate slot conflict (409) and a server failure. Missing
reports are not an attendance count. Preserve self-reported/unknown evidence.

## Verify retention maintenance

`relay/vercel.json` schedules `/api/ai/maintenance` at **03:00 UTC daily**. The
existing job also maintains sync, shares and AI records. It requires a production
`CRON_SECRET` on `lacuna-relay`; Vercel supplies it in the cron's bearer header.
Keep it a server-only Secret, never a browser variable or repository file.
After adding or changing it, deploy the reviewed relay source: a saved variable
does not update a running deployment.

Check a real scheduled invocation for a 200 response. A schedule alone, a 401,
or an unauthenticated manual request does not prove cleanup ran. An authorised
manual run verifies the handler now, but does not prove the next timer fired.
Do not weaken authorisation to make a health check green.

Reports expire logically 84 days after the end of their reporting day. The job
scans up to 500 insight objects per invocation with a persistent cursor, so
physical deletion can lag. Inspect only aggregate deletion counts and operational
errors. Investigate non-200 runs, repeated timeouts or a growing scan backlog;
do not promise deletion at an exact wall-clock time. Never bulk-delete a shared
store to clear a trial problem.

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
The [cost assumptions](gaps.md#trial-cost-assumptions) are planning estimates;
check [current Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)
and [Pro credit rules](https://vercel.com/docs/plans/pro-plan) when reviewing them.

## After the class starts

After the first completed UTC day with the class, have the teacher confirm that
they can read the expected day's reports. Ask about missing reports privately;
first check consent, class invitation, app version and whether the app was opened
online. Record only aggregate operational findings publicly.

Review spend and the next scheduled maintenance result after the first day, then
after the first week. This is an operator procedure, not a newly installed
recurring automation. Keep the epic open for the real teacher's observations and
the first-class follow-through; do not mark them complete from synthetic tests.
