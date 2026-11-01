# TLS trust maintenance

Lacuna's desktop runtime, build tools and Python tooling have separate certificate stores. Updating
a browser does not update those stores. The October 2026 eMudhra incident therefore requires
runtime updates as well as the Python lockfile changes.

The versioned manifests, workflow configuration and `.bun-version` hold the current runtime pins.
Bun uses a stable release containing both the
[eMudhra distrust fix](https://github.com/oven-sh/bun/pull/46159) and the
[Brotli decoder fix](https://github.com/oven-sh/bun/pull/46392).

Downloads use versioned stable release URLs. A changed download fails the checksum check rather
than silently changing the runtime. When updating Bun, review its certificate and Brotli decoder
behaviour, update all manifests and platform checksums together, and regenerate lockfiles only
with the selected Bun release.

For a fresh local checkout, run `node apps/relay/scripts/security-bun.mjs --install` using a patched Node
release. Run commands through `node apps/relay/scripts/security-bun.mjs <arguments>` to use that exact
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
