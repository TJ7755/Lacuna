# Operating the Gaps web trial

Scope: one class of about 30 pupils, daily reports, existing Vercel services.
Use the [school notice](gaps-school-notice.md) and the
[teacher walkthrough](gaps-teacher-walkthrough.md). Use the disable procedure below.

## Deploy the teacher project and migrate hostnames

Use `lacuna-gaps` for `gaps.getlacuna.app` and the `teach.getlacuna.app` redirect. Follow the
[workspace deployment procedure](maintenance/workspaces.md#github-built-production-deployments).

Inspect the linked project and team before deployment; a link to `lacuna` is the
wrong target. Stage with `bunx vercel deploy --prod --skip-domain`, verify the
returned deployment with `bunx vercel curl`, then promote that exact production
deployment. Keep protection enabled for generated URLs.

Before moving a hostname, preserve its old project, branch assignment and ready
deployment for rollback. Use Vercel's project-domain move endpoint with the
explicit destination project and `gitBranch: null`; it also moves redirects to
that hostname. `domains add --force` cannot remove a domain while a redirect
points to it. Leave the learner project's other hostnames and relay gates intact.

Retain `/sw.js` with `no-store` throughout the migration window so returning
installations can retire their old worker. Before the move, verify preview and
production using both a fresh profile and an existing installation. Check the
bare root, old hashes, preserved course data, sharing, missing assets returning
errors rather than HTML, and the main site's study and desktop behaviour.

Use the [frozen activation record](https://github.com/TJ7755/Lacuna/blob/30d7e808f9b056afcfd61702c6de7d4ee204e759/docs/review-evidence/gaps-trial-activation/README.md)
for initial source, deployment and fallback identities. For later teacher
releases, roll back to a verified ready production deployment in `lacuna-gaps`.

## Check device storage policy before the trial

Ask school IT whether shared PCs or pooled tablets clear browser storage at logout,
and verify with synthetic data on the devices pupils and teachers will use. A
persistence grant does not protect against a managed profile wipe. Rehearse pupil
backup or sync to a retained device through Lacuna Settings, and teacher recovery
from a file and code kept outside that profile. Missing reports do not prove no study.
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

Check request counts and status by route in a bounded time window. Preserve self-reported and
unknown evidence when investigating missing reports.

## Verify retention maintenance

Follow the [relay secret setup](../apps/relay/README.md#environment).

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

Compare builds, functions and Blob usage. Obtain the owner's approval before adding paid services
or account-wide pause rules.

Check [current Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)
and [Pro credit rules](https://vercel.com/docs/plans/pro-plan) when reviewing them.

## After the class starts

After the first explicit publication, have the teacher refresh today's results
and confirm they can read the snapshot. After the first completed local day with
the class, also confirm automatic daily delivery. Ask about missing reports privately;
first check consent, class invitation, app version and whether the app was opened
online. Record only aggregate operational findings publicly.

After a reporting update, refresh both Lacuna and Gaps on the trial devices.
Check the new day boundary on a date without a pre-update UTC report. If a
publication fails during rollout, retry after the relay deployment finishes.

Review spend and the next scheduled maintenance result after the first day and week. Record the
teacher's observations and first-class follow-through on the trial issue.

## Disable the trial

Confirm the intended team and projects before changing production configuration.
Set production `RELAY_INSIGHTS_ENABLED=0` on `lacuna-relay` and
`VITE_GAPS_REPORTING_ENABLED=false` on `lacuna`, or remove those production values.
Changing a saved variable does not change an already deployed build: deploy the
reviewed source with those disabled values, or roll back to verified production
deployments that captured disabled gates. Stop relay admission first, then pupil
delivery.

Use `bunx vercel rollback` with the exact selected production deployment URL and
the verified team scope. The activation record retains the initial fallback
deployments; for later releases, check compatibility before reverting learner code.
Disabling the saved values as well prevents a later automatic build from silently
reactivating reporting. Preserve reports, teacher keys, pupil recovery material, the teacher hostname,
retirement worker and existing storage.
