# Schema v22: removal of the hidden Deck and Folder stores

**Status:** contract agreed, implementation not started

**Written:** 13 August 2026

**Supersedes the destructive gate in:** [storage-migration.md](storage-migration.md) phase 5

## Purpose

Schema v21 completed the additive half of the domain storage migration. `schedulingUnits`,
`coursePerformance` and `schedulingPerformance` are backfilled and are the read source for
Course/Lesson sessions. What remains is the destructive half: deleting the `decks` and `folders`
stores, and with them the hidden Deck-shaped scheduling model that the Course/Lesson domain has
been quietly resting on since the course architecture landed.

This document is the contract for that removal. It exists because the removal cannot be a silent
schema bump — five product paths still read the legacy stores, old backups contain Deck rows, and
the change is irreversible in a user's browser once it runs.

### Why now

Lacuna goes live in September 2026 and currently holds no irreplaceable study data. A destructive
schema migration is cheap today and permanently expensive after a term of real revision history has
accumulated. That reasoning is recorded in `MEMORIES.md` and is the whole justification for
choosing removal over another compatibility release.

## Decisions

Two decisions were taken before this document was written. They are settled, not open.

### 1. Full removal, not a partial one

`schedulingUnits` becomes the sole scheduling record. The hidden backing Deck is not retained in
any form. `src/db/backingDecks.ts` — currently 577 lines whose entire purpose is to bridge
Course/Lesson to a Deck-shaped row — collapses into a thin scheduling-unit accessor.

The alternative considered was dropping `folders` only and keeping backing decks. It was rejected:
it leaves the dual-model problem intact, keeps two sources of scheduling truth in the codebase, and
guarantees a v23 doing this same work later against real user data.

### 2. Old backups and share codes convert on import

A pre-v22 backup, or a `LAC0`–`LAC3` share code carrying Deck or Folder rows, imports successfully.
The import adapter reuses `buildDomainStorageMigration` (`src/db/storageMigration.ts`) against the
backup payload, so legacy decks become courses and scheduling units on the way in.

Refusing old backups was rejected: it would permanently break every backup taken before September
2026, including the pre-migration snapshots this very migration writes. The conversion adapter is
the single most important piece of compatibility work in this plan and must not be treated as a
detail of the removal commit.

## The five gate-holders

Each subsection states what is deleted, what replaces it, and what must be true before the deletion
commit lands.

### Gate 1 — the `/deck/:deckId` route

**Current state.** `src/App.tsx:83` already routes `deck/:deckId` to `<Navigate to="/" replace />`.
There is no Deck page left; the route is a bookmark redirect and nothing more.

**Deleted.** Nothing in the data layer. The route entry stays.

**Replacement.** None required. The redirect is correct behaviour for an old bookmark and costs one
route entry.

**Gate condition.** A test asserting `#/deck/anything` redirects to the dashboard rather than
rendering a not-found screen. This is the cheapest of the five and should be done first to confirm
the tooling before harder work begins.

### Gate 2 — global `/learn` and `/study` sessions

**Current state.** `src/pages/learn/useLearnSession.ts:1080` handles the global, cross-course
"Today" session by reading `await db.decks.toArray()` and using every Deck as a session unit. This
is the only remaining runtime path that treats Decks as scheduling units; Course and Lesson sessions
already read `getSchedulingUnit`.

**Deleted.** The `db.decks.toArray()` branch and the `Deck[]`-typed `units`/`sessionUnits` locals it
feeds.

**Replacement.** The same branch reads `db.schedulingUnits.toArray()`. `SchedulingUnitRecord`
extends `SchedulerConfig`, which is what `sessionUnits` actually needs, so the substitution is
mostly type-level. Two details must be got right:

- `performanceForReviewUnits(units.map(u => u.id), reviewKindRef.current)` currently passes Deck ids
  with kind `'deck'`. After removal it passes scheduling-unit ids. The `'deck'` kind disappears from
  `ReviewPerformanceUnitKind` entirely; see gate 4's note on the calibration key space.
- `decksRef.current` is a `Map<string, Deck>`. It becomes `Map<string, SchedulingUnitRecord>` and
  should be renamed to match, since the name is now actively misleading.

**Gate condition.** A global-session test that seeds two courses with lessons, runs a cross-course
session, and asserts the same card ordering and the same daily limits as the v21 behaviour. The
limits matter: scheduling units carry inherited lesson-level limits that Decks did not express, so
a naive substitution can change how many new cards a global session introduces.

### Gate 3 — search and card editing

**Current state.** Two live queries read the legacy store:

- `src/state/useSearchData.ts:30` returns `decks` in its `SearchData` so search surfaces can label
  a card's owner.
- `src/state/useData.ts:121` (`useDashboardData`) reads decks, all cards and `userPerformance`, then
  computes per-deck summaries and global study stats.

**Deleted.** `SearchData.decks`, `DeckSummary`, `computeDeckSummaries`, and the `Deck[]` member of
the CardList union that workstream 2 of `docs/course-domain-boundary-follow-ups.md` describes. That
workstream is subsumed here and must not be run as a separate pass.

**Replacement.** Both queries read `db.schedulingUnits`. Card ownership labelling resolves through
`Card.courseId` and `Card.primaryLessonId`, which is what the UI wants to display anyway; the Deck
name was only ever a proxy for it. `useDashboardData`'s `deckSeconds` map, which keys response-time
calibration by Deck id, reads `coursePerformance` keyed by course id instead.

**Gate condition.** Search returns identical results for a course-owned card, a lesson-owned card
and a bank card. Dashboard study stats are numerically unchanged for a seeded database — assert on
the computed `StudyStats` object, not on rendered text.

### Gate 4 — MCP scope resolution

**Current state.** `src/mcp/bridge/scopeResolver.ts:49` resolves a card with no `courseId` by
looking up its Deck and reading `backingCourseId`:

```ts
const backingCourseId = (await db.decks.get(card.deckId))?.backingCourseId;
```

This is the fallback that lets an MCP tool call scoped to a card find the course that authorises it.

**Deleted.** The `db.decks.get` lookup.

**Replacement.** `Card.schedulingUnitId` resolves through `db.schedulingUnits.get(...)`, whose
`courseId` field carries the same information the Deck's `backingCourseId` did. The v21 upgrade
stamped `schedulingUnitId` onto every card, so the fallback has a value to read.

**Security note, and the reason this gate is not mechanical.** This resolver is an authorisation
boundary: it decides which course an MCP caller may touch. A card whose `schedulingUnitId` is
missing or dangling must resolve to `missing(...)` and deny the call. It must **not** fall back to
any looser rule, and it must not treat an absent scheduling unit as "no restriction". Write the
denial test before the change, not after.

**Gate condition.** Existing tests in `src/mcp/tools/*.test.ts` pass unchanged, plus a new test
proving that a card with a dangling `schedulingUnitId` is denied rather than silently authorised.

### Gate 5 — legacy backup, import and share contracts

This is the largest gate and the one carrying real user risk.

**Current state.**

- `src/db/portability.ts` reads and writes `db.decks` and `db.folders` throughout: full export
  (line 84, 88), restore with `clear()` + `bulkAdd` (376–439) and merge (495–533).
- `BackupFile` (`src/db/types.ts:1028`) declares `decks: Deck[]` as a **required** field and
  `folders?: Folder[]` as optional.
- `src/db/share.ts` resolves and writes Deck rows for share import (805, 1122–1195).
- `src/db/apkgImport.ts:702` calls `createDeck(result.deckName)` — Anki import creates a Deck as its
  destination.
- `src/db/export.ts`, `src/db/diagnostics.ts`, `src/db/seed.ts`, `src/db/mergeImport.ts` and
  `src/db/occlusionRepository.ts` each read or transact over `db.decks` incidentally.
- `src/db/repository.ts` still exports `createDeck`, `updateDeck` and `deleteDeck`. Note that
  `apkgImport` is their **only** remaining non-test caller; there is no Deck CRUD left in the UI.

**Deleted.** The `decks` and `folders` tables; `createDeck`, `updateDeck`, `deleteDeck`; the
`Deck` and `Folder` interfaces move from live types into a legacy-payload namespace used only by
the import adapter.

**Replacement — the compatibility adapter.** One new module, `src/db/legacyBackupAdapter.ts`, owns
every path by which a Deck or Folder row can enter the application. Its contract:

- Input: a `BackupFile` at any version, or a decoded share payload.
- If the payload contains `decks`, run `buildDomainStorageMigration` over it — the same function the
  v21 upgrade uses, so conversion semantics are proven code rather than a second implementation.
- Backing decks (those with a `backingCourseId`) convert to the scheduling units of their existing
  course.
- Standalone legacy decks — decks with no `backingCourseId`, from a backup predating the course
  architecture — convert to a course each, named after the deck, with a single bank scheduling unit.
  Folder hierarchy is discarded; record the discarded folder names in the import report so the user
  is told rather than left to notice.
- `userPerformance` rows split into `coursePerformance` and `schedulingPerformance` by the same
  rules `buildDomainStorageMigration` already applies.
- Review history is preserved exactly. No event may be dropped, reordered or re-identified by this
  conversion. This is the invariant that outranks every other goal in this document.

**`BackupFile` shape.** `decks` becomes `decks?: LegacyDeck[]` — optional, and never emitted by a
v22 export. `folders?` stays optional and likewise unemitted. The fields remain in the type solely
so old payloads parse; deleting them would make old backups unreadable, which is precisely what
decision 2 forbids.

**`Card.deckId`.** Becomes optional and is documented as legacy provenance only. No runtime read may
depend on it after this change; `schedulingUnitId` becomes the required field and its index replaces
the `deckId` index on `cards`. Retaining the field costs one nullable column and preserves the
ability to trace an imported card back to its original deck; renaming it would touch several hundred
call sites for no behavioural gain.

**Anki import.** `apkgImport` stops calling `createDeck`. An imported `.apkg` creates a course named
after the Anki deck, with a bank scheduling unit as its destination. This is a small user-visible
behaviour change and belongs in the release note.

**Gate condition.** Round-trip tests, each asserting on data rather than on absence of error:

1. A v21 backup containing backing decks imports into v22; every card, review event and performance
   row survives with identical values.
2. A pre-course-architecture backup containing standalone decks and folders imports; each deck
   becomes a course, and the discarded folder names appear in the import report.
3. A `LAC0`, `LAC1`, `LAC2` and `LAC3` share code each import successfully.
4. A v22 export re-imports into v22 unchanged.
5. An `.apkg` import produces a course with the deck's cards.

## Pre-migration snapshot interaction

`src/db/preMigrationSnapshots.ts` already does exactly what this migration needs, and the removal
**must use it rather than reinvent it**.

The existing mechanism: `ensurePreMigrationSnapshot` (`src/db/schema.ts:973`) detects a pending
upgrade, reads every store at the current version, and writes a full `BackupFile` into a separate
`lacuna-pre-migration` IndexedDB database in its own committed transaction — separate specifically
so that a failed or aborted upgrade of the main database cannot roll the snapshot back with it. It
also mirrors the payload to the user's configured folder on a best-effort basis.

Three requirements follow.

**The snapshot must be captured before v22 runs, and must contain the Deck and Folder rows.**
`readAllDataFromVersion` reads from the database at its *current* version, so a v21 database
snapshots with its `decks` and `folders` intact. This already works. What must not happen is a
well-meaning tidy-up that removes `decks` from the snapshot payload builder at the same time as
removing it from `BackupFile` — that would produce a snapshot which cannot restore what it was taken
to protect. Add a test that asserts a v21 snapshot payload contains a non-empty `decks` array.

**The snapshot's failure mode is currently silent.** `ensurePreMigrationSnapshot` catches and logs.
For every migration so far that has been acceptable, because every migration so far has been
additive. It is not acceptable for a destructive one. For the v22 upgrade specifically, a failed
snapshot must **block the upgrade** and surface the existing database failure screen, rather than
proceeding to delete stores with no restore point. This is the single most important behavioural
change in the plan and should be its own commit.

**Restore must go through the compatibility adapter.** A v22 build restoring a v21 snapshot is
importing a legacy backup, so it takes exactly the path defined in gate 5. There is no separate
snapshot-restore code path and none should be written.

## Rollback

Two distinct scenarios, deliberately separated because they have different answers.

### Upgrade fails partway

Dexie runs the `.upgrade()` callback in a single transaction, so a throw inside it aborts and leaves
the database at v21. The application must then present the failure screen rather than opening in a
half-migrated state. Cover this with a migration test that throws mid-upgrade and asserts the
database is still readable at v21 afterwards, matching the existing rollback tests in
`src/db/migrations.test.ts`.

### User wants to go back after a successful upgrade

There is no in-place downgrade. IndexedDB cannot lower a version, and the Deck rows are gone. The
honest recovery path is: install the previous build, and import the pre-migration snapshot. That is
the only reason the snapshot gate above is non-negotiable.

State this plainly in the release note. Do not describe v22 as reversible.

## Release gates

The removal commit may not land until all of the following hold:

- every gate condition above has a passing test;
- `bun run typecheck`, `bun run lint` and the full `bun run test` suite pass;
- the Electron typechecks pass — `electron/dist-electron/mcp/*` contains compiled references to the
  legacy stores and must be rebuilt, not hand-edited;
- a migration rollback test covers the aborted-upgrade case;
- a compatibility release note exists, covering the Anki import behaviour change, the discarded
  folder hierarchy, and the absence of a downgrade path;
- `docs/plans/storage-migration.md` is updated to record phase 5 as closed.

## Sequencing

The compatibility net for gate 5 should exist **before** the removal commit, not after. Its entire
purpose is to be a net that already caught the round trips while the legacy code was still present
to compare against; written afterwards it can only assert that the new behaviour matches itself.

Suggested commit order:

1. Snapshot hardening — make a failed snapshot block a destructive upgrade.
2. The compatibility net — round-trip tests against v21, still passing on v21 code.
3. Gates 1 through 4, one commit each, each still leaving the legacy stores present.
4. `src/db/legacyBackupAdapter.ts` and the `BackupFile` shape change.
5. The v22 schema upgrade: drop `decks` and `folders`, collapse `backingDecks.ts`, delete the Deck
   CRUD.
6. Documentation and the release note.

Steps 1 through 4 are individually revertible. Step 5 is not, which is why everything that can
precede it does.
