# Release maintenance

The tag-triggered workflow in `.github/workflows/release.yml` verifies, builds the Windows and Linux
packages and prepares one GitHub pre-release draft. The unsigned macOS arm64 package is built and
tested separately on the maintainer's Apple Silicon device, then uploaded to that draft. Neither
path publishes the draft. Publishing remains a deliberate maintainer action after every artefact
has been inspected.

## Trigger integrity

The workflow accepts tags matching `v*`, then rejects the run unless both conditions hold:

- the tag is exactly `v<version from package.json>`; and
- that exact tag resolves to `GITHUB_SHA` as a commit.

The verifier fetches tag history and uses the fully qualified `GITHUB_REF`, so annotated and
lightweight tags are both compared with the event commit rather than with a nearby or merely
version-shaped tag. Do not weaken this to `git describe` or a checkout-only `HEAD` comparison;
neither proves that the exact release tag names the workflow commit.

## Verification and native builds

The verifier runs the root typechecking, linting, unit and coverage suites, asset build, canonical
release scenario, performance gate and browser end-to-end suite before any package job starts. It
also runs the relay's typecheck, lint and tests, then the standalone AI MCP tool's typecheck, lint,
tests and build.

The root and relay dependency installations are both required. The relay owns a separate lockfile.
The standalone AI MCP tool intentionally uses the root installation, but its normal test suite
imports the real in-process relay handler and store, so the relay dependency tree must also be
installed. Do not add an unlocked installation inside `tooling/lacuna-ai-mcp`.

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

Before repeating the release checks, the tag workflow requires successful ordinary `CI` and
`Security` push workflows for the exact tagged commit on `master` or `main`. A tag created before
those workflows finish fails closed and must be rerun after both succeed. Repeating selected checks
inside the release workflow is not treated as evidence that the ordinary commit checks passed.

After both GitHub package jobs pass, the publisher downloads their named workflow artefacts and
writes `SHA256SUMS-github.txt`. The publisher attests that manifest separately before adding it to
the draft. An attestation proves which GitHub workflow and commit produced a file with that digest.
It does not sign the application with an Apple or Microsoft identity.

On the exact release commit, the macOS operator runs:

```bash
bun install --frozen-lockfile
bun run test:e2e:electron-ai
CSC_IDENTITY_AUTO_DISCOVERY=false bun run electron:build:mac
bun run test:e2e:electron-package
unzip -t release/Lacuna-0.2.5-arm64-mac.zip
hdiutil verify release/Lacuna-0.2.5-arm64.dmg
shasum -a 256 \
  release/Lacuna-0.2.5-arm64.dmg \
  release/Lacuna-0.2.5-arm64.dmg.blockmap \
  release/Lacuna-0.2.5-arm64-mac.zip \
  release/Lacuna-0.2.5-arm64-mac.zip.blockmap \
  release/latest-mac.yml \
  > release/SHA256SUMS-macos.txt
```

After the Actions workflow has created the draft, upload those six local files with `gh release
upload v0.2.5 ... --clobber`. The workflow deliberately preserves draft assets it does not own, so
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
They cannot be proved by this checkout and must be reviewed separately by the maintainer.
