# Release maintenance

The tag-triggered workflow in `.github/workflows/release.yml` verifies, builds and prepares one
GitHub pre-release draft. It does not publish the draft. Publishing remains a deliberate maintainer
action after the draft and its artefacts have been inspected.

## Trigger integrity

The workflow accepts tags matching `v*`, then rejects the run unless both conditions hold:

- the tag is exactly `v<version from package.json>`; and
- that exact tag resolves to `GITHUB_SHA` as a commit.

The verifier fetches tag history and uses the fully qualified `GITHUB_REF`, so annotated and
lightweight tags are both compared with the event commit rather than with a nearby or merely
version-shaped tag. Do not weaken this to `git describe` or a checkout-only `HEAD` comparison;
neither proves that the exact release tag names the workflow commit.

## Verification and native builds

The verifier runs typechecking, linting, unit and coverage suites, the asset build, canonical
release scenario, performance gate and browser end-to-end suite before any package job starts.
The package matrix is:

| Job | Official runner | Packages | Native AI gate |
| --- | --- | --- | --- |
| Windows | `windows-latest` x64 | NSIS and portable EXE | Yes |
| Linux | `ubuntu-latest` x64 | AppImage and DEB | No |
| macOS | `macos-15` arm64 | DMG and ZIP | Yes |

The macOS packages are explicitly unsigned: the job disables certificate auto-discovery with
`CSC_IDENTITY_AUTO_DISCOVERY=false`. They are not notarised and remain manual-update packages.
The hosted Apple Silicon AI test is native CI evidence, not evidence from a physical Mac.

Each build uploads only its explicit release allowlist:

- Windows: `*.exe`, `*.exe.blockmap`, and `latest.yml`;
- Linux: `*.AppImage`, `*.AppImage.blockmap`, `*.deb`, and `latest-linux.yml`; and
- macOS: `*.dmg`, `*.dmg.blockmap`, `*.zip`, `*.zip.blockmap`, and `latest-mac.yml`.

Before attestation, a native PowerShell check on Windows and Bash checks on Linux and macOS require
at least one file from every listed class. The job therefore fails if, for example, Electron Builder
quietly omits the macOS ZIP while still producing the DMG; aggregate glob success is not enough.

Do not replace these lists with `release/*` or `release/**`. Electron Builder also writes unpacked
applications, debug configuration and intermediate files into that directory. Uploading the whole
directory would turn the release into a landfill and can collide on filenames.

## Provenance and checksums

Every native build job uses `actions/attest@v4` to create GitHub build-provenance attestations for
the exact files in its upload allowlist. Those jobs have only `contents: read`, `id-token: write`,
`attestations: write` and `artifact-metadata: write`; only the publisher receives `contents: write`.

Before repeating the release checks, the tag workflow requires successful ordinary `CI` and
`Security` push workflows for the exact tagged commit on `master` or `main`. A tag created before
those workflows finish fails closed and must be rerun after both succeed. Repeating selected checks
inside the release workflow is not treated as evidence that the ordinary commit checks passed.

After all three jobs pass, the publisher downloads the three named workflow artefacts into one
directory and writes `SHA256SUMS.txt`. The checksum manifest did not exist in a native build job, so
the publisher attests it separately before adding it to the draft. An attestation proves which
GitHub workflow and commit produced a file with that digest. It does not sign the application with
an Apple or Microsoft identity, notarise it, or prove that it was tested on physical hardware.

After downloading a draft asset, verify its provenance with the GitHub CLI:

```bash
gh attestation verify PATH_TO_ASSET -R TJ7755/Lacuna
```

Verify the checksum manifest the same way, then compare the downloaded files with it using the
platform's SHA-256 tool. The workflow deletes assets from an existing draft before re-uploading the
complete set, but refuses to overwrite an already published release.

Repository plan, branch protection, required checks and release-review rules are GitHub settings.
They cannot be proved by this checkout and must be reviewed separately by the maintainer.
