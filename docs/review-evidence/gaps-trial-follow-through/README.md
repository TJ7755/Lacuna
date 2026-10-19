# Gaps operational rehearsal — 19 October 2026

This is an operator's synthetic rehearsal, not a teacher usability session or
evidence that the first real class has delivered. The owner requested the human
walkthrough be prepared for later.

## Live delivery

The committed daily-flow browser scenario was adapted temporarily to use
`getlacuna.app`, `gaps.getlacuna.app` and the actual Blob-backed relay. The
in-memory relay and teacher-asset interceptions were removed; no product source
was changed for the rehearsal. Traces and video were disabled.

One scenario passed in 44.8 seconds. It exercised course publication and encrypted
connection export, teacher-key recovery download and pinned-code publication,
consent initially off, explicit opt-in, recorded synthetic card study, one upload
for the completed UTC day, teacher decryption, desktop/390px fit, close/lock and
opt-out persisting after reload. Ciphertext contained neither the synthetic pupil
label nor card prompt. The teacher opened only the two teacher databases.

Only the synthetic pupil's browser clock was moved across the reporting-day
boundary. No production server clock or retention rule was changed. Cleanup used
the scenario's owner credential: share deletion returned 204 and its payload then
returned 404. No real pupil record was opened.

## Maintenance authentication

The 03:00 UTC scheduled request returned 401. Production `lacuna-relay` had no
`CRON_SECRET`; the handler correctly rejected unauthorised requests. A new
production Secret was installed and the existing production relay source was
redeployed. No repository secret, new service or authentication bypass was added.

An authorised manual run returned 200 in 25.8 seconds; all aggregate deletion
counts were zero. An invalid credential still returned 401. A previous authorised
client request timed out after 60 seconds; Vercel recorded it as 200. The completed
manual response is the positive verification, not the timed-out client request.

No expired report fixture was inserted into the production store. The run proves
that the authenticated maintenance path can complete, not that an aged report was
physically deleted. Existing relay tests cover logical expiry and batch deletion.
The next genuine 03:00 UTC invocation remains a follow-through check; a manual
run does not prove timer delivery.

## Cost boundary

Current billing usage and service categories were checked privately. The total
is account-wide and includes other projects and builds, so it is not a Gaps-only
cost measurement. No billing plan, paid integration or account-wide spending
action was changed. Use the [operations procedure](../../gaps-trial-operations.md)
for subsequent checks and the [walkthrough](../../gaps-teacher-walkthrough.md)
for the uncompleted human session.
