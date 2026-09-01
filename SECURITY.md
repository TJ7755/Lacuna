# Security policy

Lacuna is a local-first beta. The latest `master` and the latest published beta are supported for
security fixes. Older beta releases are not guaranteed to receive patches; update to the latest
release before investigating a report.

## Reporting a vulnerability

Do not open a public issue, discussion or pull request for a suspected vulnerability. If the
repository has GitHub Security Advisories enabled, use **Security → Advisories → Report a
vulnerability** in the GitHub repository. This creates a private report for the maintainers.

If that private route is unavailable, do not post vulnerability details publicly. Use a trusted
private contact route you already have with the maintainer, or open a detail-free issue asking for
private vulnerability reporting to be enabled. Do not invent or publish an email address for
security reports.

Include, where safe:

- the affected release, commit and platform;
- a concise description of the impact and realistic threat prerequisites;
- exact reproduction steps or a minimal proof of concept;
- whether data was read, changed, deleted or sent to a remote service;
- logs or screenshots with credentials, tokens, learner data and other personal data removed.

Please allow time for triage, a fix and a coordinated release before public disclosure. We will
acknowledge receipt through the private channel and may ask for further reproduction details. We do
not promise a particular response time or bounty.

## Security boundaries

The threat model matters more than the presence of a lock icon:

- Study data is stored locally in IndexedDB. The browser or Electron profile and the operating-system
  account are trusted boundaries; anyone who can read that profile may be able to read the study data.
- Backups, exports and share files are user-controlled copies. Treat them as sensitive and verify a
  restore before deleting the source.
- Optional device sync and browser AI use an HTTPS relay carrying encrypted mailbox records. The
  relay is not trusted with plaintext, but relay credentials, pairing material and ciphertext still
  require protection.
- Electron uses a sandboxed renderer, context isolation and a narrow preload bridge. Renderer content
  must not gain arbitrary filesystem, process or network authority.
- The desktop AI companion and the broader data MCP companion are separate authorities. Reads,
  writes, destructive operations, approvals, stop behaviour and call ledgers must not be combined.
- Managed-device controls such as SmartScreen, Gatekeeper, antivirus, application allowlists and
  proxies can block an unsigned package. Admin-free installation does not mean policy-free execution.

When changing any boundary, document the new capability, its user consent, its persisted or wire
format, and the tests proving denial as well as success.

## Dependency and release security

Run `bun audit` against the root and relay lockfiles for dependency changes. Build tooling processes
archives and release inputs, so development-only findings are not automatically harmless. A finding
that cannot affect Lacuna needs a concrete rationale, an owner and a review date; blanket ignores are
not an acceptable policy.

Releases must be built from the exact commit whose checks passed. Keep per-platform artefact allowlists,
checksums and the unsigned macOS status explicit. Do not claim signing, notarisation or automatic
updates for a format that has not been tested.
