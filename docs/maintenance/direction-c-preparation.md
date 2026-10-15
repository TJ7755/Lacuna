# Direction C preparation

Reviewed 15 October 2026. This records preparation evidence, not product acceptance or permission
to merge the redesign. The prompter has explicitly reserved that decision.

## Integration scope

The preparation branch starts at redesign commit `a17ddac6` and integrates master commit
`a9c80ed7`. The initial histories had 367 redesign-only commits and 94 master-only commits.
The integration resolves conflicts in 19 files while retaining the redesigned layout,
self-hosted fonts, editor validation and recitation feedback. It carries over master's
persistence, sync, author-mode enforcement, dependency and release fixes.

CI and Security both cover pull requests into `redesign/**`. All workflow Bun pins follow
the root's Bun 1.4.3 contract, including the manual Electron and newly integrated release jobs.
Local validation runs sequentially; full gates run on hosted Actions to respect laptop memory.

## Published baseline

GitHub's published beta is `v0.2.14`, released on 14 October 2026 at 19:45 UTC. The official
release contains Windows installer/portable and Linux AppImage/DEB assets, updater metadata
and `SHA256SUMS-github.txt`; it has no macOS artefact.

The inherited installed-upgrade gate pins `v0.2.13` by installer digest and tests its automatic
upgrade to this branch's `0.2.14` build. That provides historical-profile evidence. It cannot
certify an automatic upgrade from the already published `v0.2.14` to the next release: that
requires a higher target version and a freshly pinned baseline during release preparation.
No version bump, release notes, tag or publication is authorised by this preparation task.

## Remaining acceptance boundaries

- Full CI covers automated migration/recovery, fixture-backed two-profile sync, browser and
  mobile WebKit workflows, Windows installed upgrades, and a packaged macOS smoke test.
- The manual Electron workflow builds Windows, Linux and macOS packages and runs the existing
  packaged-interaction suite, as well as native AI transport on Windows and macOS. Its AI harness
  does not prove a real model-authored conversation or managed-device policy compatibility.
- Fixture-backed sync proves client conflict handling; it does not prove real hosted-relay
  convergence between physical devices or network-filtered school installations.
- Signing, notarisation, physical touch, screen-reader checks and the clean managed-account
  matrix remain prerequisites where required by the rollout policy.
- The prompter must accept the remaining redesign work before PR #389 can merge. This
  preparation does not change that boundary or widen the rollout ring.
