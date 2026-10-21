# TLS trust maintenance

Lacuna's desktop runtime, build tools and Python tooling have separate certificate stores. Updating
a browser does not update those stores. The October 2026 eMudhra incident therefore requires
runtime updates as well as the Python lockfile changes.

The versioned manifests, workflow configuration and `.bun-version` hold the current runtime pins.
The temporary Bun canary is deliberate: the stable release still trusted a compromised certificate
when tested. [Bun's upstream fix](https://github.com/oven-sh/bun/pull/46159) is merged.

`relay/scripts/security-bun.mjs` installs the reviewed binary for CI and Vercel builds. It checks the
download against the SHA-256 digest in the adjacent JSON manifest before executing it, then checks
the exact revision. It creates a local cache under the relay's ignored `node_modules` directory.
CI adds that directory to `PATH`; Vercel invokes the same bootstrap for installation and builds.
The script lives inside the relay so the relay project does not need source outside its root.

Canary download URLs move. A changed download fails the checksum check rather than silently
changing the runtime. Once a patched stable release is published, review its certificate behaviour,
replace the temporary bootstrap with the normal version-pinned setup, update all manifests and
Vercel commands together, and regenerate lockfiles only with the selected Bun revision.

For a fresh local checkout, run `node relay/scripts/security-bun.mjs --install` using a patched Node
release. Run commands through `node relay/scripts/security-bun.mjs <arguments>` to use that exact
Bun binary, or put its printed cache directory on `PATH`. Keep the same revision for lockfile work.

## Check protection

The [researcher's disclosure](https://emudhra.we-have-a-problem.com/) supplies test hosts and an
offline archive of twelve certificate chains, covering the original issuer and Sectigo cross-signs.
Check both paths with each actual runtime; a timeout or DNS failure is inconclusive. Also check
an ordinary HTTPS destination so a broken network cannot masquerade as successful distrust.

The [Certifi advisory](https://github.com/advisories/GHSA-6q48-6c7w-9gw2) and
[Node security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
describe the upstream fixes. Python workspaces use `uv sync --frozen` and `uv run --frozen pytest`.
Do not restore removed roots to work around connection failures, or disable certificate validation.

On macOS, command-line clients may still read an old PEM bundle despite system browser protection.
Use the patched Homebrew `ca-certificates` bundle through `CURL_CA_BUNDLE`, `SSL_CERT_FILE`,
`REQUESTS_CA_BUNDLE` and `GIT_SSL_CAINFO` where appropriate. This is a machine configuration change,
not something a Git branch applies. Bun's additional-CA environment variables are insufficient
because adding trusted roots does not remove its vulnerable bundled roots.

## Roll out

Merge and redeploy the affected Vercel projects, then verify their actual runtime and outbound TLS
behaviour. Vercel chooses runtime patch versions; `package.json` alone is not evidence that a live
deployment is patched. Build and distribute a new desktop release through the existing release
procedure. Existing installations do not gain the Electron fix merely because this branch exists.

This remediation does not establish whether earlier interception occurred. No PHP or TiDB component
was found in Lacuna; those incidents do not require changes to this application's credentials.
