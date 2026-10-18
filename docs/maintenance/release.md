# Release maintenance

Merging a version bump into master is the release decision; everything after it is automatic.
Once CI and Security pass on that commit, `.github/workflows/release-tag.yml` tags it and dispatches
`.github/workflows/release.yml`, which verifies, builds the Windows and Linux packages, prepares a
GitHub pre-release draft and, when `docs/releases/<version>.md` exists, verifies every asset afresh
and publishes the beta with those notes. The unsigned macOS arm64 package is still built and tested
separately on the maintainer's Apple Silicon device (see below); Windows/Linux-only betas are
supported, so macOS is not an implicit blocker.

## Routine release

1. On a release preparation branch, run `bun run release:prepare <version> "short release title"`.
   It sets `package.json` (the only version to edit), folds the fragments in
   `docs/changes/unreleased/` and any bullets still under "Unreleased" into a new
   `## <version> beta — short release title` section of `docs/CHANGES.md`, and pins the Windows
   upgrade gate in `scripts/windows-release-baseline.json` to the release being replaced, using
   the installer digest GitHub recorded for it.
2. Write the user-facing notes in `docs/releases/<version>.md`. The publisher appends the
   unsigned/platform/update scope. Without this file the draft waits for manual publication.
3. Merge the PR through normal required checks. CI on the pull request runs the installed-upgrade
   gate against the new baseline.

Nothing else is needed. If the build or verification fails, fix it and rerun the failed `Build &
Release` run; an existing tag is never moved. To restart from scratch on an existing tag, run
`gh workflow run release.yml --ref v<version>`. A tag pushed by hand still triggers the same
workflow, and the maintainer commands below remain for inspection and manual publication.

## Weekly release

`.github/workflows/weekly-release.yml` does the routine release above every Thursday at 07:53 UTC
(or when dispatched). `scripts/weekly-release.mjs` skips the week unless the current version is
already tagged, the diff since that tag touches shipped paths (`src/`, `electron/`, `public/`,
`index.html`, `package.json`, `bun.lock`, `vite.config.ts`) and changelog entries are pending.
Otherwise it bumps the patch, runs `release:prepare` and writes `docs/releases/<version>.md` from
the pending changelog bullets. The workflow opens `release/<version>` as a pull request and enables
squash auto-merge, so the normal required checks gate it. An open `release/*` pull request also
skips the week; edit its notes there before the checks finish if they need rewording.

It authenticates as a GitHub App, because pull requests and pushes made with `GITHUB_TOKEN` start
no workflows: CI would never run and the merge would not start the Release tag workflow. One-time
setup:

1. Create a GitHub App owned by the maintainer account (Settings, Developer settings, GitHub Apps,
   New GitHub App). Any name and homepage URL; untick Webhook. Repository permissions: Contents
   read and write, Pull requests read and write. Install it only on this repository.
2. Generate a private key on the App's page and note its App ID.
3. In this repository's Actions secrets, add `RELEASE_APP_ID` and `RELEASE_APP_PRIVATE_KEY` (the
   whole `.pem` file).
4. In the repository's general settings, enable "Allow auto-merge".

Without the secrets the workflow only warns. The macOS packages remain a local step after each
release (below); skipping them leaves Mac users on the previous manual-update package.

## Maintainer commands

For pre-merge package evidence without tagging or publishing, dispatch `electron-e2e.yml` on
the preparation branch. It builds unsigned Windows, Linux and macOS packages, runs the packaged
interaction suite on each, and checks native AI on Windows/macOS plus the macOS study smoke.
These hosted checks do not replace the physical managed-device or signing/notarisation matrix.

Use Node 24, the pinned Bun version and an authenticated GitHub CLI (`gh auth login`, or an
existing `GH_TOKEN`). Set `GH_PATH` to the executable path when `gh` is not on PATH. Git uses
the maintainer's existing credentials; the helper does not store credentials or change remotes.

- `bun run release draft <version>` resolves the canonical repository's default branch, checks its
  version, waits for successful **exact-commit** CI and Security push runs, pushes the version tag
  if it does not exist, waits for the native builds, and prints the draft URL. It never publishes.
  The local checkout may remain on a feature branch; no checkout, reset or stash is performed.
- `bun run release publish <version> --windows-linux-only --notes path/to/release-notes.md`
  freshly downloads and verifies the eight official assets before publishing the beta, and
  appends the unsigned/platform/update scope to the notes. It refuses extra assets, so a draft
  containing macOS packages must follow the manual platform verification below. The release
  workflow runs this same command.
- `bun run release verify <version>` inspects without publishing. It works on drafts and
  published releases. Reports and downloaded assets remain in ignored
  `artifacts/releases/v<version>/verification-*` directories.

Each report records the commit, SHA-256 checks, updater sizes and SHA-512 hashes, Windows
block-map structure and provenance result. Attestations must match this repository's release
workflow, exact tag and commit. Publication repeats verification rather than trusting an old
report, and rejects asset replacements observed during verification. No command runs an installer
or touches an installed user profile.

The commands stop on failed workflows and wait at most 45 minutes per gate. Fix or rerun the
failed workflow in Actions, then repeat the command. An existing remote tag is reused only when
it names the expected commit; tags are never moved.

A tag created with `GITHUB_TOKEN` does not start push workflows
([GitHub documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)),
so the Release tag workflow starts the build with `workflow_dispatch` on the new tag, which that
token may trigger. The dispatched run's `GITHUB_REF` is the tag, so trigger integrity and
attestation source refs are unchanged. No new secret or scheduled watcher is needed.

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
shutdown and renderer errors. A separate native Windows gate installs the hash-pinned previous
release from `scripts/windows-release-baseline.json`, records a study answer in an isolated profile, downloads the release through the installed
updater using a loopback feed, silently installs it, and checks
that course, lesson, card and review records survive unchanged and automatic update mode remains enabled.
Ordinary CI also tests upgrading 0.2.7 with a long-running AI companion.

### Why this is faster

The helper removes manual CI polling, tag coordination, individual downloads, provenance commands
and updater hash comparisons. The release verifier also avoids installing dependencies and
rebuilding web assets: the exact-commit `production` CI job already enforces that asset budget.
Required CI and Security gates remain intact. Native build time and platform checks still apply;
no end-to-end timing improvement is claimed until this workflow has run on a new release tag.
Browser CI runs functional Chromium tests in four Playwright shards with two workers each.
The original-sized image-advance measurement and frame-sensitive sidebar checks run serially
in a timing job with one worker and no concurrent functional test on that runner. CI selects
`chromium-functional` for the shards and `chromium-image-performance` plus `chromium-sidebar-motion`
for timing from `tests/config/playwright.web.ci.config.ts`; together they cover all tests in the
normal `chromium` project exactly once. The ordinary
`bun run test:e2e:web -- --project=chromium` command still includes the image measurement.
The focused iPhone-sized WebKit smoke suite runs in one worker. Each job preserves its failure
evidence. The existing required `browser-smoke` check fails if any Chromium shard, the timing
job or the WebKit job fails. Isolation removes competing test work; it does not establish
that a product performance regression has been fixed.

## Signing policy

Maintainer decision, 6 September 2026: the limited beta may continue with explicitly unsigned
desktop packages. Windows and macOS application signing is required before wider school rollout,
including notarisation for macOS. This closes the policy decision; it does not claim that certificates,
credentials or signed builds already exist.

Until that gate is met, retain the beta/pre-release designation and the documented manual-update
behaviour for unsigned macOS. Windows NSIS and Linux AppImage retain their existing updater paths;
Windows portable and Linux DEB remain manual updates. A wider rollout requires evidence from the
actual signed release artefacts as well as the existing data-durability and device gates.

## Controlled rollout

- Initial testing: clean and restored historical profiles on Windows and macOS.
- Limited pupil beta: confirmed backup routine, diagnostics and a named support channel.
- Wider school rollout: two weeks without unresolved data-loss, startup or installation P0s,
  signed Windows and macOS releases, and macOS notarisation.

For each pilot user, make backup status visible and explain how to export a full backup.
These gates do not claim that device verification or signing has already passed.

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

After both GitHub package jobs pass, the draft publisher downloads their named workflow artefacts and
writes `SHA256SUMS-github.txt`. The publisher attests that manifest separately before adding it to
the draft. An attestation proves which GitHub workflow and commit produced a file with that digest.
It does not sign the application with an Apple or Microsoft identity.

The Electron AI command builds renderer assets and serves them through Vite preview on
`http://localhost:5173`. Its asset check compares the loaded script with `dist/index.html`;
the port must be free so a development server cannot stand in for that build.

CI first packages an unsigned macOS app and runs `test:e2e:electron-macos-smoke` against it.
That required gate checks `app:` launch, IndexedDB course persistence after reload and a
seeded study answer. It uses the host architecture and does not replace signing or notarisation.

These Electron specs skip on Linux, and CI runs them only for pull requests into `master`.
To run them for another branch or tag, including branches CI does not cover, dispatch the
`Electron e2e` workflow on it (Actions, or `gh workflow run electron-e2e.yml --ref <branch>`).
The branch must already contain the workflow file. It runs `test:e2e:electron-ai` on Windows
and macOS and the packaged macOS smoke gate, and uploads `test-results/` from each.

On the exact release commit, the macOS operator runs:

```bash
bun install --frozen-lockfile
bun run test:e2e:electron-ai
CSC_IDENTITY_AUTO_DISCOVERY=false bun run electron:build:mac
bun run test:e2e:electron-package
release_version=$(node -p "require('./package.json').version")
unzip -t "release/Lacuna-${release_version}-arm64-mac.zip"
hdiutil verify "release/Lacuna-${release_version}-arm64.dmg"
shasum -a 256 \
  "release/Lacuna-${release_version}-arm64.dmg" \
  "release/Lacuna-${release_version}-arm64.dmg.blockmap" \
  "release/Lacuna-${release_version}-arm64-mac.zip" \
  "release/Lacuna-${release_version}-arm64-mac.zip.blockmap" \
  release/latest-mac.yml \
  > release/SHA256SUMS-macos.txt
```

After the Actions workflow has created the draft, upload those six local files to the matching
`v${release_version}` tag with `gh release upload`, listing each file explicitly. The workflow
deliberately preserves draft assets it does not own, so
a rerun does not delete the local macOS files. `SHA256SUMS-macos.txt` provides an integrity check,
not provenance: neither it nor the macOS artefacts can pass `gh attestation verify`.

After downloading a draft asset, verify its provenance with the GitHub CLI:

```bash
gh attestation verify PATH_TO_ASSET -R TJ7755/Lacuna
```

Verify `SHA256SUMS-github.txt` the same way, then compare the downloaded Windows and Linux files
with it using the platform's SHA-256 tool. Compare the macOS files with
`SHA256SUMS-macos.txt` separately. The workflow overwrites its own draft assets but preserves local
macOS assets, and refuses to overwrite an already published release.

Repository plan, branch protection, required checks and release-review rules are GitHub settings.
They cannot be proved by this checkout. See the [governance record](governance.md) for dated API
verification, the distinction between preparing a draft and approving publication, and remaining
policy decisions.
