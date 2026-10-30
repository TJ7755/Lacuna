# Repository policy and live verification

GitHub settings are authoritative for enforcement. Checked-in prose cannot establish the current
required checks, access list or protected environments. Inspect them when making a merge/release
decision rather than relying on an old successful API response:

```bash
gh api repos/TJ7755/Lacuna/branches/master/protection
gh api repos/TJ7755/Lacuna/rulesets
gh api repos/TJ7755/Lacuna/collaborators --jq '.[] | {login, permissions}'
gh api repos/TJ7755/Lacuna/environments
gh api repos/TJ7755/Lacuna/actions/permissions/workflow
```

The adopted branch policy requires up-to-date PRs, relevant checks, resolved conversations and
protection against force pushes/deletion, including administrators. Require aggregate checks where
they enforce all component jobs, rather than copying a transient shard count into protection.
After changing settings, re-read the API response and compare names with the actual workflows.

Aggregate jobs such as `test` and `browser-smoke` are scheduled after their dependencies finish;
their check runs can therefore appear later than other required checks. CI consumers must compare
the complete live protection context list with checks for the current candidate, treating missing
contexts as pending. All currently reported checks passing does not establish that every required
check exists or passed. Workflow cancellation suppresses the aggregate jobs rather than reporting
a second failure for superseded work; a failed or independently cancelled dependency in an active
run still fails its aggregate. Do not publish early green or skipped placeholders under required names.

If a successful CI or Security workflow retains a running job record after every step, including
`Complete job`, succeeded, [CI recovery](../../.github/workflows/ci-recovery.yml) requests one real
job rerun. This handles stale GitHub reporting, not slow tests. It runs trusted default-branch code
and never writes check conclusions or changes branch protection. Fork runs, failed workflows,
unfinished steps, obsolete branch commits, unsafe legacy workflow concurrency, multiple incomplete
job records and repeated recovery are excluded. CI retries use a separate concurrency group, so an
older retry cannot cancel validation for a newer commit even if the branch advances during recovery.
Recovery inspects the workflow definition at the tested commit recorded in its run title, not the
PR head commit; older runs without that record need manual inspection. A failed
recovery needs operator inspection; it does not authorise an administrative merge.

To inspect or recover a completed run manually using the same guards:

```bash
GH_REPO=TJ7755/Lacuna RUN_ID=<workflow-run-id> node scripts/ci-recover-stale-jobs.mjs
```

The command can request a rerun; it is not a read-only status command. A normal completed run
performs no write. If the API continues to disagree, inspect the run and job records directly
rather than repeatedly rerunning the full suite or treating workflow success as proof that every
required check has passed.

The [contributor policy](../../CONTRIBUTING.md) requires independent review for risk-bearing work.
The sol-loop skill’s independent agent review satisfies that requirement; human approval is not required. The authoring
agent cannot serve as its own independent reviewer. CODEOWNERS requests and GitHub approval
requirements are separate controls; inspect live settings before merging.

Merging a release version bump with its notes is the maintainer's publication decision, per the
14 October 2026 policy. This is not an independently enforced review gate. A protected
step preparing a draft does not prevent an administrator publishing through another route.
Signing and rollout decisions belong in [release maintenance](release.md).
