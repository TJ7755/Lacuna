# Lacuna roadmap

Reviewed 4 September 2026.

This is the current decision surface: what Lacuna is now, what maintenance follows, and what is
deliberately frozen. Detailed specifications, implementation diaries and completed arcs belong in
`docs/SPEC.md`, `docs/CHANGES.md` or the archive. Historical plans are not an implementation queue.

## Current state

### v0.2.4 beta

**Status:** delivered.

The current public release is **v0.2.4**; the development package is **v0.2.5** while its Windows
upgrade hotfix is prepared. Lacuna is a local-first web/PWA and
Electron learning application. Study data remains on-device; optional device sync and browser AI
use the hosted relay, while packaged Electron AI uses its separate authenticated local companion.
Windows, Linux and unsigned macOS desktop packages are beta artefacts with platform-specific update
behaviour. The checked-in release workflow can attest a future tag, but the already-published
v0.2.4 Windows and Linux artefacts have GitHub build provenance; the locally built macOS artefacts
have a separate checksum manifest but no hosted provenance. Signing and the complete managed-device
matrix remain release-readiness work.

The application is usable. It is not declared stable or school-wide ready until the data-durability,
dependency, release and device checks below have evidence on the exact release commit.

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
relay audit jobs, and a provenance workflow for releases are delivered. The current v0.2.4 Windows
and Linux artefacts are attested; the macOS artefacts are locally built and checksummed. Remaining
work is the explicit signing decision and the
complete managed-device matrix; every critical or high finding still needs a fix or a named owner
and review date.

**Exit:** audits and all existing quality gates pass, with remaining advisories explicitly triaged.

### 2. Data durability and desktop evidence

**Status:** in progress; schema frozen at v26 unless a data-integrity defect forces a migration.

Media-bearing full-backup round trips, replace and merge restore points, and quota/persistence-denial
recovery are delivered. Historical fixtures migrate, but the required post-migration re-export proof
remains outstanding. Other remaining work is concurrent sync convergence, native AI evidence,
locked-down Windows installed/portable/update checks, the clean-account macOS matrix, and an explicit
signing/notarisation decision.

**Exit:** no known path silently loses data and every advertised desktop artefact has reproducible
evidence.

### 3. Enforceable quality signal and governance

**Status:** in progress.

Warning cleanup, CSP and browser checks, offline reload, keyboard use, backup round trips, the future
release-provenance workflow and repository policy files are delivered. GitHub branch protection,
required checks, CODEOWNERS enforcement and release-review settings remain external controls to
configure and verify.

**Exit:** a red check means broken, not merely noisy.

### 4. Persistence consolidation

**Status:** proposed.

Characterise transaction and rollback behaviour, then extract assessment, review, Card, Course and
Lesson ownership from `src/db/repository.ts` in small behaviour-preserving changes. Add purpose-specific
query modules and move callers away from the compatibility barrel. Do not split by line-count quota or
introduce interfaces solely to mock Dexie.

**Exit:** the owner and transaction scope of a persistence change are obvious.

### 5. Study-session consolidation

**Status:** proposed.

Add characterisation tests for ordering, grading, undo, cooldown, unlock, Simple-session resume and
revision plans. Extract only pure scope/load/transition seams from `useLearnSession.ts`; retain one
lifecycle coordinator and stop if an extraction duplicates mutable state.

**Exit:** fewer responsibilities, not merely fewer lines.

## Controlled rollout

| Ring | Audience | Gate |
|---|---|---|
| 0 | TJ7755 and nc-3388 | Clean and restored historical profiles on Windows and macOS. |
| 1 | 5–10 consenting beta pupils | Confirmed backup routine, diagnostics and named support channel. |
| 2 | Wider school cohort | Two weeks without unresolved data-loss, startup or installation P0s; signing position documented. |

For every pilot user, make backup status visible and explain how to export a full backup.

## Roadmap rules

1. Keep this file below 200 lines.
2. Completed behaviour belongs in `docs/SPEC.md`; released user-visible changes belong in
   `docs/CHANGES.md`; historical rationale belongs in the archive or Git history.
3. Keep one active maintenance programme; do not revive archived feature plans by implication.
4. Use only **proposed**, **ready**, **in progress**, **blocked** or **delivered** for status.
5. New infrastructure needs a named user workflow and an explicit maintenance decision.
