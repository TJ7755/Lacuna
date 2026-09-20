# Security maintenance

The repository security workflow (`.github/workflows/security.yml`) runs on pull requests and
pushes to `master`/`main`, with an additional weekly scheduled run. Every audit job uses Bun 1.4.0,
`bun install --frozen-lockfile`, and `bun audit --audit-level=high` for one lockfile workspace:

- the root application;
- `relay/`; and
- `tooling/handwriting-maths/`.

The `high` threshold is deliberate: moderate findings remain visible without being suppressed
with a package-manager ignore, while a high or critical advisory fails the relevant job.
The previous React Router 6 deferral is obsolete following the Router 7 migration. Use the
audit output for the exact commit under review to establish the current advisory status.

The same workflow runs CodeQL v4 for `javascript-typescript` and `actions` with `build-mode: none`.
The jobs use read-only repository permissions except for the CodeQL analysis job's required
`security-events: write` permission. CodeQL and dependency-audit ownership belongs to the repository
maintainer; review the scheduled output and dependency updates before each beta release.

GitHub branch protection, required checks, alert notification, and CODEOWNERS enforcement are
repository settings rather than files in this checkout. The [governance record](governance.md)
contains the dated API verification and policy decisions. Release provenance, signing, and managed-device verification are covered by the
release maintenance documentation and remain separate from these static analysis gates.
