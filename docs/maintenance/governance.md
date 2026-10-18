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

Mandatory second-person approval was deferred while there is only one writer: the sole CODEOWNER
cannot approve their own PR. When a second trusted reviewer has confirmed write access, decide
ownership and enable approval with stale-review dismissal and CODEOWNER enforcement. Do not treat
an unconfirmed account as a reviewer. The [contributor policy](../../CONTRIBUTING.md) still requires
independent human approval for risk-bearing work; lack of enforced approval does not grant it.

Merging a release version bump with its notes is the maintainer's publication decision, per the
14 October 2026 policy. This is not independently enforced second-person approval. A protected
step preparing a draft does not prevent an administrator publishing through another route.
Signing and rollout decisions belong in [release maintenance](release.md).
