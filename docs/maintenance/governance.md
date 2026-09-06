# Repository governance

## Verified baseline — 6 September 2026

The authenticated GitHub REST API reported:

- `master` has no branch protection; the branch-protection endpoint returned `404 Branch not protected`.
- The repository has no rulesets.
- `TJ7755` is the only collaborator with write access, with administrator permission.
- None of the eight environments has a required-reviewer rule. The desktop release workflow
  creates a draft and does not publish it; it does not reference a protected release environment.
- Workflow tokens default to read access and cannot approve pull requests.
- All 18 check runs on starting commit `988505975b21e86f278187d5499242b5634073f2` passed.

These are dated observations, not guarantees about subsequent settings or commits.

## Applied branch policy — 6 September 2026

The maintainer approved this policy and the GitHub branch-protection API accepted it. A separate
GET confirmed all 13 required checks, strict up-to-date checking, administrator enforcement,
resolved conversations, zero required approvals, and disabled force pushes/deletion.

`master` requires an up-to-date pull request with the following GitHub Actions checks, bound to app id
`15368`, before merging into `master`:

`typecheck`, `lint`, `test`, `relay`, `ai-mcp`, `production`, `browser-smoke`, `electron-ai`,
`audit-root`, `audit-relay`, `audit-handwriting`, `CodeQL (actions)` and
`CodeQL (javascript-typescript)`.

The `test` job already requires every unit-test shard and both coverage suites to succeed, so
requiring its aggregate avoids coupling protection to the number of shards. Review conversations
must be resolved, force pushes and deletion are blocked, and administrators are included.

Pull requests are required, but mandatory approval is deferred while there is only one writer. The sole
CODEOWNER cannot approve their own pull request. When a second trusted reviewer has confirmed write
access, decide ownership explicitly and enable one required approval with stale approvals dismissed
and CODEOWNER review required. Do not add an unconfirmed account to CODEOWNERS.

## Release review

The existing workflow's final output is a draft; publishing remains a maintainer action after
artefact inspection. This is a manual release policy, not an independently enforced second-person
approval. A protected environment on draft creation would gate draft preparation, not prevent an
administrator from publishing a release through another route.

The maintainer decided on 6 September 2026 to permit unsigned limited beta releases and require
signing, including macOS notarisation, before wider school rollout. Mandatory second-person release
review remains a separate decision. Build provenance and checksums do not substitute for application
signing. Package behaviour and the rollout gate are documented in [release maintenance](release.md).

## Verification commands

```bash
gh api repos/TJ7755/Lacuna/branches/master/protection
gh api repos/TJ7755/Lacuna/rulesets
gh api repos/TJ7755/Lacuna/collaborators --jq '.[] | {login, permissions}'
gh api repos/TJ7755/Lacuna/environments
gh api repos/TJ7755/Lacuna/actions/permissions/workflow
```

After any policy change, read the server response again and compare the required check names with
the workflows. Do not infer enforcement from a checked-in policy file.
