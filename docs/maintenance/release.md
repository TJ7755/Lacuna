# Release maintenance

Merging a version bump with release notes into master is the maintainer's publication decision.
The [tag workflow](../../.github/workflows/release-tag.yml) and
[release workflow](../../.github/workflows/release.yml) own automation, job names and asset lists.
Without the matching notes file the build remains a draft. Windows/Linux-only unsigned limited
betas are supported; macOS packages are a separate local step, not an implicit publication blocker.

## Routine release

1. On a preparation branch, run `bun run release:prepare <version> "short release title"`.
   Edit only the root package version through this helper; it folds pending changelog entries
   and pins the previous Windows installer/digest for the upgrade gate.
2. Write `docs/releases/<version>.md` with the learner-facing notes and known limitations.
3. Check the actual PR and exact-commit CI/Security results, native upgrade evidence and applicable
   human gates. Merge through normal protection. An existing tag must never be moved.
4. If building or verification fails, fix the cause and rerun the failed release workflow.
   `gh workflow run release.yml --ref v<version>` restarts the existing tag's build.

The [weekly workflow](../../.github/workflows/weekly-release.yml) uses
[weekly-release](../../scripts/weekly-release.mjs) to propose eligible patch releases. An open release
PR is edited in place. Its GitHub App needs Contents and Pull requests write permissions, installation
on this repository, and `RELEASE_APP_ID`/`RELEASE_APP_PRIVATE_KEY` Actions secrets. Enable Allow
auto-merge. A regular `GITHUB_TOKEN` PR does not start the CI chain; do not replace the App token
without accounting for that boundary. Missing secrets do not constitute a successful release run.

## Inspect and publish

Use the pinned tools from [CONTRIBUTING](../../CONTRIBUTING.md) and authenticated `gh`; set `GH_PATH`
if needed. The helper uses existing credentials and never runs an installer over a working profile.

- `bun run release draft <version>` waits for exact-commit CI/Security and native builds, reuses
  only the correctly positioned tag, and prints a draft URL without publishing.
- `bun run release verify <version>` checks a draft or published release without publishing.
- `bun run release publish <version> --windows-linux-only --notes path/to/notes.md` freshly verifies
  every official asset and publishes the beta. It rejects extra assets; a draft containing local
  macOS packages needs the separate manual verification below.

Retained reports are under `artifacts/releases/`. Publication repeats verification and rejects
assets replaced during verification. Failure or an expired wait is not permission to bypass a gate.
Only exact tag/commit provenance is acceptable; `git describe` or a nearby checkout is insufficient.
Attestations and checksums identify bytes and their build source, not application signing.

## Native and human evidence

Dispatch `gh workflow run electron-e2e.yml --ref <branch>` for pre-merge hosted package/interaction
checks. Isolated profiles and fixture-backed services do not prove physical touch, real microphone/
camera, screen-reader, live provider/relay or managed-device behaviour. Use the
[manual checklist](../WEBSITE_TEST_CHECKLIST.md) on the actual candidate and keep outstanding
[redesign acceptance](https://github.com/TJ7755/Lacuna/issues/456#issuecomment-6246871342) explicit.

For persistence, packaging or updater changes, retain the isolated historical-profile upgrade and
actual updater-download evidence. Public feed discovery can only be established after publication;
a private draft is not an update-feed test. Use a disposable installation, never the maintainer's
working profile. Electron AI verification needs its configured port free so another server cannot
stand in for the intended build. Companion relaunch during Windows installation is a separate risk.

## macOS manual packages

On Apple Silicon at the exact release commit:

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
  release/latest-mac.yml > release/SHA256SUMS-macos.txt
```

Upload those six files explicitly with `gh release upload` to the matching draft after Actions has
created it. The local manifest provides integrity, not GitHub build provenance. Verify the GitHub
assets and their manifest separately with `gh attestation verify PATH_TO_ASSET -R TJ7755/Lacuna`
and the appropriate SHA-256 tool. Release automation preserves local macOS assets and refuses to
replace a published release. Never broaden uploads to `release/**`: it contains intermediates and
unpacked applications. The exact allowlists live in the workflow and
[release asset verifier](../../scripts/release-assets.mjs).

## Signing and rollout policy

Maintainer decision, 6 September 2026: explicitly unsigned packages may serve the limited beta.
Windows/macOS signing and macOS notarisation are required before wider school rollout. Hashes,
provenance and unsigned native checks do not satisfy this gate.

Initial testing uses clean and historical profiles. A limited pupil beta needs a confirmed backup
routine, diagnostics and a named support channel. Wider rollout additionally needs two weeks
without unresolved data-loss, startup or installation P0s and evidence from the actual signed
release artefacts. Keep manual-update behaviour and platform scope explicit for each release.

Action pins use full commit SHAs with version comments. For updates, verify the upstream release
and peeled commit for annotated tags, run the existing workflow policy checks, and retain native
build/draft verification where release actions change. GitHub enforcement is inspected through
[repository governance](governance.md), not inferred from this file.
