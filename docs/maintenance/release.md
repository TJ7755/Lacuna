# Release maintenance

The tag-triggered workflow in `.github/workflows/release.yml` verifies, builds the Windows and Linux
packages and prepares one GitHub pre-release draft. The unsigned macOS arm64 package is built and
tested separately on the maintainer's Apple Silicon device, then uploaded to that draft. Neither
path publishes the draft. Publishing remains a deliberate maintainer action after every artefact
has been inspected. Windows/Linux-only betas are supported; macOS is not an implicit blocker.

## Routine release commands

Use Node 24, the pinned Bun version and an authenticated GitHub CLI (`gh auth login`, or an
existing `GH_TOKEN`). Set `GH_PATH` to the executable path when `gh` is not on PATH. Git uses
the maintainer's existing credentials; the helper does not store credentials or change remotes.

1. On a release preparation branch, run
   `npm version 0.2.11 --no-git-tag-version --ignore-scripts --package-lock=false`, update
   `docs/CHANGES.md` with the release notes, and merge the PR through normal required checks.
   Substitute the intended version throughout. `package.json` is the only version to edit;
   release configuration tests no longer duplicate it.
2. Run `bun run release draft 0.2.11`. This resolves the canonical repository's default branch,
   checks its version, waits for successful **exact-commit** CI and Security push runs, pushes
   the version tag, waits for the native builds, and prints the draft URL. It never publishes.
   The local checkout may remain on a feature branch; no checkout, reset or stash is performed.
3. Inspect the notes and platform evidence. For Windows/Linux only, run
   `bun run release publish 0.2.11 --windows-linux-only --notes path/to/release-notes.md`.
   This freshly downloads and verifies the eight official assets before publishing the beta,
   and appends the unsigned/platform/update scope to the notes. It refuses extra assets, so a
   draft containing macOS packages must follow the manual platform verification below.

For inspection without publication, use `bun run release verify 0.2.11`. This works on drafts
and published releases. Reports and downloaded assets remain in ignored
`artifacts/releases/v0.2.11/verification-*` directories. Each report records the commit, SHA-256
checks, updater sizes and SHA-512 hashes, Windows block-map structure and provenance result.
Attestations must match this repository's release workflow, exact tag and commit. Publication
repeats verification rather than trusting an old report, and rejects asset replacements observed
during verification. No command runs an installer or touches an installed user profile.

The commands stop on failed workflows and wait at most 45 minutes per gate. Fix or rerun the
failed workflow in Actions, then repeat the command. An existing remote tag is reused only when
it names the expected commit; tags are never moved. Run `draft` before the default branch moves
beyond the intended release commit. If a tag push succeeds but Actions never starts, inspect the
Actions event before retrying; the helper does not bypass missing workflow evidence.

The tag is pushed with maintainer credentials, rather than from a workflow using `GITHUB_TOKEN`:
[GitHub does not trigger another push workflow from that token](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).
No new secret, scheduled watcher or repository permission is needed.

### Updating action pins

Release, CI and Security workflow actions use full commit SHAs with a same-line version comment.
The existing weekly `github-actions` Dependabot group can propose updates. Review the action's
upstream release and diff, confirm the proposed SHA resolves to its documented version tag, and
run the workflow policy test before merging. Annotated tags resolve first to a tag object: use
the peeled commit (`refs/tags/<version>^{}`) for the `uses:` reference. Keep the version comment
beside the SHA so Dependabot can identify the release. Run the normal CI and Security gates;
for release actions, retain a native build and draft verification before publishing.

### Evidence that still needs platform testing

Automated asset verification proves that updater metadata identifies the verified installer;
it does not prove installer execution, old-profile compatibility or the public update feed.
For changes to persistence, packaging or updates, retain the isolated old-version profile upgrade
and live updater download checks before considering the release validated. A draft is not visible
to the normal public updater, so public discovery can only be tested after publication. Never run
an installer over the maintainer's working installation to obtain this evidence. The existing
Windows AI companion shutdown issue must also be considered when testing installation.

The release workflow runs the existing normal-motion packaged interaction test on Windows before
attestation/upload and retains its `test-results` artefact. It checks the real packaged app, clean
shutdown and renderer errors; it is not an installation or historical-profile upgrade test.

### Why this is faster

The helper removes manual CI polling, tag coordination, individual downloads, provenance commands
and updater hash comparisons. The release verifier also avoids installing dependencies and
rebuilding web assets: the exact-commit `production` CI job already enforces that asset budget.
Required CI and Security gates remain intact. Native build time and platform checks still apply;
no end-to-end timing improvement is claimed until this workflow has run on a new release tag.
Browser CI now runs the full suite in two Playwright shards, each preserving its report and failure
evidence. The existing required `browser-smoke` check aggregates both shards and fails if either
fails. This shortens the longest observed CI stage without changing the tests or branch protection.

## Signing policy

Maintainer decision, 6 September 2026: the limited beta may continue with explicitly unsigned
desktop packages. Windows and macOS application signing is required before wider school rollout,
including notarisation for macOS. This closes the policy decision; it does not claim that certificates,
credentials or signed builds already exist.

Until that gate is met, retain the beta/pre-release designation and the documented manual-update
behaviour for unsigned macOS. Windows NSIS and Linux AppImage retain their existing updater paths;
Windows portable and Linux DEB remain manual updates. A wider rollout requires evidence from the
actual signed release artefacts as well as the existing data-durability and device gates.

## Trigger integrity

The workflow accepts tags matching `v*`, then rejects the run unless both conditions hold:

- the tag is exactly `v<version from package.json>`; and
- that exact tag resolves to `GITHUB_SHA` as a commit.

The verifier fetches tag history and uses the fully qualified `GITHUB_REF`, so annotated and
lightweight tags are both compared with the event commit rather than with a nearby or merely
version-shaped tag. Do not weaken this to `git describe` or a checkout-only `HEAD` comparison;
neither proves that the exact release tag names the workflow commit.

## Verification and native builds

The verifier requires successful ordinary CI and Security push workflows for the exact tagged
commit on master or main. Those workflows cover root typechecking, lint, all unit shards and
coverage, the canonical release scenario, browser end-to-end tests, relay checks and standalone
AI MCP checks. The release verifier reuses that evidence rather than running those suites again.
Root typechecking and lint cover the Playwright suites and web performance audit used by these
gates; the typecheck job installs relay dependencies because browser fixtures import its handler.
The ordinary production job also builds assets and enforces the performance budget, so the release
verifier needs no dependency installation or repeated web build. Windows and Linux still build natively in Actions; macOS
builds and package checks run locally on Apple Silicon.

Ordinary CI still requires both root and relay installations: the AI MCP test suite imports the
real relay handler and store. Do not add an unlocked installation inside `tooling/lacuna-ai-mcp`.

The package matrix is:

| Job     | Official runner                 | Packages              | Native AI gate |
| ------- | ------------------------------- | --------------------- | -------------- |
| Windows | `windows-latest` x64            | NSIS and portable EXE | Yes            |
| Linux   | `ubuntu-latest` x64             | AppImage and DEB      | No             |
| macOS   | Maintainer Apple Silicon device | DMG and ZIP           | Yes            |

The macOS packages are explicitly unsigned: the local build disables certificate auto-discovery
with `CSC_IDENTITY_AUTO_DISCOVERY=false`. They are not notarised and remain manual-update packages.
The local run is physical Apple Silicon evidence, but it has no GitHub Actions OIDC provenance.

Each GitHub build uploads only its explicit release allowlist:

- Windows: `*.exe`, `*.exe.blockmap`, and `latest.yml`;
- Linux: `*.AppImage`, `*.deb`, and `latest-linux.yml`. Electron Builder 26 embeds the AppImage
  block map in the AppImage itself; it does not produce a separate `*.AppImage.blockmap` file.

Before attestation, a native PowerShell check on Windows and a Bash check on Linux require at least
one file from every listed class. Aggregate glob success is not enough.

Do not replace these lists with `release/*` or `release/**`. Electron Builder also writes unpacked
applications, debug configuration and intermediate files into that directory. Uploading the whole
directory would turn the release into a landfill and can collide on filenames.

## Provenance and checksums

Each GitHub native build job uses `actions/attest@v4` to create build-provenance attestations for the
exact files in its upload allowlist. Those jobs have only `contents: read`, `id-token: write`,
`attestations: write` and `artifact-metadata: write`; only the publisher receives `contents: write`.

Before building release packages, the tag workflow requires successful ordinary `CI` and
`Security` push workflows for the exact tagged commit on `master` or `main`. A tag created before
those workflows finish fails closed and must be rerun after both succeed. The asset-budget check inside the release workflow is not a substitute for those completed workflows.

After both GitHub package jobs pass, the publisher downloads their named workflow artefacts and
writes `SHA256SUMS-github.txt`. The publisher attests that manifest separately before adding it to
the draft. An attestation proves which GitHub workflow and commit produced a file with that digest.
It does not sign the application with an Apple or Microsoft identity.


CI first packages an unsigned macOS app and runs `test:e2e:electron-macos-smoke` against it.
That required gate checks `app:` launch, IndexedDB course persistence after reload and a
seeded study answer. It uses the host architecture and does not replace signing or notarisation.
