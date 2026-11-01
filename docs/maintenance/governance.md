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
