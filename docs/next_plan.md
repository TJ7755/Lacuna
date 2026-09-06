# Lacuna roadmap

Reviewed 6 September 2026.

This is the current decision surface: what Lacuna is now, what maintenance follows, and what is
deliberately frozen. Detailed specifications, implementation diaries and completed arcs belong in
`docs/SPEC.md`, `docs/CHANGES.md` or the archive. Historical plans are not an implementation queue.

## Current state

### v0.2.5 beta

**Status:** delivered.

The current public release is **v0.2.5**. Lacuna is a local-first web/PWA and
Electron learning application. Study data remains on-device; optional device sync and browser AI
use the hosted relay, while packaged Electron AI uses its separate authenticated local companion.
Windows, Linux and unsigned macOS desktop packages are beta artefacts with platform-specific update
behaviour. The published v0.2.5 Windows and Linux artefacts have GitHub build provenance; the locally
built macOS artefacts have a separate checksum manifest but no hosted provenance. The limited beta
may remain unsigned; signing and macOS notarisation are required before wider school rollout
(maintainer decision, 6 September). The complete managed-device matrix remains release-readiness work.

The application is usable. It is not declared stable or school-wide ready until the data-durability,
dependency, release and device checks below have evidence on the exact release commit.

There are currently no active users with active data (maintainer confirmation, 5 September).
Historical compatibility defects are therefore latent defects, not recovery incidents.
Prioritise first-use study, authoring, backup and sync on the intended devices over an exhaustive
historical-profile matrix; retain the small migration regression suite already established.

## Feature freeze

**Status:** in progress.

No net-new learning modes, integrations, hosted services or visual redesigns are accepted while the
maintenance programme is in progress. Permitted work is limited to:

- data-safety, migration, backup, restore and sync fixes;
- security and dependency updates;
- crashes, regressions and installation/device compatibility;
- CI, release provenance and governance controls;
- already-evidenced usability work on core study, authoring and backup workflows.

Ideas in old plans, audits or `docs/new_features_list.md` stay parked until a fresh product decision.

## Ordered maintenance programme

### 1. Dependency and release security

**Status:** in progress.

Dependency refreshes, the supported Electron 42/Electron Builder 26 and Vitest 3 toolchain, root and
relay audit jobs, and a provenance workflow for releases are delivered. The current v0.2.5 Windows
and Linux artefacts are attested; the macOS artefacts are locally built and checksummed. Remaining
work is signing/notarisation before wider rollout and the
complete managed-device matrix; every critical or high finding still needs a fix or a named owner
and review date.

**Exit:** audits and all existing quality gates pass, with remaining advisories explicitly triaged.

### 2. Data durability and desktop evidence

**Status:** in progress; schema frozen at v26 unless a data-integrity defect forces a migration.

Media-bearing full-backup round trips, replace and merge restore points, and quota/persistence-denial
recovery are delivered. v1/v8 migration, JSON export, clean restore and reopen now preserve reviews,
scheduling and referenced image bytes; a v20 round trip also covers split performance and provenance.
Two Chromium profiles now cover independent Card additions, simultaneous edits, newer deletion
versus edit, and concurrent reviews after a forced relay 412 and reload. Review checks preserve both
event identities and verify the complete replayed schedule; a persistence integration test also
covers review merge, database reopen and export. These are manual-sync scenarios using the stateful
relay fixture; they do not certify automatic triggers or the hosted service. Remaining work is live
sync convergence, native AI evidence,
locked-down Windows installed/portable/update checks, the clean-account macOS matrix, and
signed/notarised artefacts before wider rollout.

Local checks on 5 September: 137 targeted migration, backup and sync tests; web/desktop typechecks;
lint; Chromium full-backup recovery, first-device pairing and forced concurrent-write convergence;
Electron companion transport and video embeds. These are development-checkout checks, not an
exact-release or clean-account certification. The companion harness does not prove model-authored AI.

**Exit:** no known path silently loses data and every advertised desktop artefact has reproducible
evidence.

### 3. Enforceable quality signal and governance

**Status:** in progress.

Warning cleanup, CSP and browser checks, offline reload, keyboard use, backup round trips, the future
release-provenance workflow and repository policy files are delivered. On 6 September, GitHub
`master` protection was configured and independently read back: 13 CI/security checks, an up-to-date
PR, resolved conversations, administrator enforcement, and no force pushes or deletion. Mandatory
human/CODEOWNER approval is deliberately deferred while the maintainer is the only writer. Release
publication remains a manual maintainer action; it is not second-person enforced approval. See
[the governance record](maintenance/governance.md).

**Exit:** a red check means broken, not merely noisy.

### 4. Persistence consolidation

**Status:** delivered.

Card, review, Course, Lesson and assessment operations now live in their owning repository modules.
The compatibility barrel retains the existing export surface; study and authoring callers import
the owners directly. Existing specialised readers remain in place rather than gaining another wrapper.
The 134 repository characterisation tests pass before and after extraction, including transaction,
rollback, cascade and undo coverage. Schema and wire contracts are unchanged.

**Exit:** the owner and transaction scope of a persistence change are obvious.

### 5. Study-session consolidation

**Status:** delivered.

Pure scope identity and Simple/revision answer transitions now sit outside `useLearnSession.ts`.
The hook remains the sole lifecycle coordinator and mutable-state owner, and imports persistence
operations directly. Strengthened hook-level undo characterisation passes on the baseline and after
extraction; the 59 focused tests cover existing study flows, Simple persistence and the extracted
scope/transition contracts. Further extraction requires a concrete responsibility to move.

**Exit:** fewer responsibilities, not merely fewer lines.

## Controlled rollout

| Ring | Audience | Gate |
|---|---|---|
| 0 | TJ7755 and nc-3388 | Clean and restored historical profiles on Windows and macOS. |
| 1 | 5–10 consenting beta pupils | Confirmed backup routine, diagnostics and named support channel. |
| 2 | Wider school cohort | Two weeks without unresolved data-loss, startup or installation P0s; signed Windows/macOS releases, including macOS notarisation. |

For every pilot user, make backup status visible and explain how to export a full backup.

## Roadmap rules

1. Keep this file below 200 lines.
2. Completed behaviour belongs in `docs/SPEC.md`; released user-visible changes belong in
   `docs/CHANGES.md`; historical rationale belongs in the archive or Git history.
3. Keep one active maintenance programme; do not revive archived feature plans by implication.
4. Use only **proposed**, **ready**, **in progress**, **blocked** or **delivered** for status.
5. New infrastructure needs a named user workflow and an explicit maintenance decision.
