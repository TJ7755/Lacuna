# Lacuna MEMORIES.md

Durable facts about how to work in this repository, for every agent regardless of harness.

This file is not a changelog. `docs/CHANGES.md` records **what changed and why**, in chronological order, and grows forever. This file records **what is true now**, and is edited in place: when a fact stops being true, correct or delete the entry rather than appending a newer one below it. If something belongs in both, it goes in `docs/CHANGES.md` and is summarised here only if a future agent would get it wrong without being told.

Do not record what the codebase already states. Architecture, file layout, past fixes and commit history are discoverable by reading; the rules in `AGENTS.md` and `CLAUDE.md` are already injected. What belongs here is the non-obvious: things that have caught agents out before, constraints not visible from the code, and decisions whose reasoning would otherwise be lost.

Keep each entry to a heading and a few lines. State the fact, then why it matters.

---

## Replace-import does not clear `db.backups`, and that is load-bearing

`importBackup(payload, 'replace')` clears the content tables but leaves `backups` alone, and
`exportDatabase` does not serialise that table either. This is what makes the restore point taken
before a manual two-device combine survive the very replace it protects against. Do not "tidy" the
replace list by adding `backups` to it, and do not start exporting the table: either change would
silently turn the safety net into decoration.

## Recover-merge does not resolve conflicts on `updatedAt`

`importBackup(payload, 'merge')` predates schema v23 and still compares `lastReviewed ?? createdAt`
for cards and `createdAt` for most course tables. Only the peer merge in `src/sync/mergeSnapshots.ts`
uses `updatedAt`. Settings copy and `docs/APP-FLOWS.md` both claimed recency wins here and both were
wrong; a regression test now asserts that wording is absent. Do not reintroduce the claim, and do
not assume the two merge paths behave alike — they answer different questions.

## `new Error(message, { cause })` does not typecheck

The project TypeScript lib only accepts the single-argument `Error` constructor. Pass the
message through and, if you need a flag, put it on a subclass. `{ cause }` fails `typecheck:web`.

## Active Course/Lesson sessions read scheduling config through the target projection

`useLearnSession` must feed Course/Lesson FSRS contexts from `schedulingUnits`, including inherited
limits and goals; `Course` remains the source for path and assessment semantics. Keep a read-side
fallback for databases whose projection is absent, and do not apply this cutover to legacy global
Deck sessions.

## Do not delete Deck/Folder stores while legacy product paths remain active

The destructive gate is still closed while `/deck/:deckId`, global study, search/editing, MCP scope
resolution and legacy backup/import/share contracts depend on `db.decks` or `db.folders`. The safe
migration endpoint is a reviewed additive projection until those paths have their own cutover and
restore story.

## Lacuna is not yet in real use, and goes live in September 2026

The prompter revises with other tools. Lacuna currently holds no irreplaceable study data, and
the summer's work is to polish it for genuine use from the start of the 2026–27 academic year.

This governs the order of work, so do not plan around it being in daily use today. Two
consequences follow. Anything touching data integrity — destructive schema migrations, storage
cutovers, backup and restore changes — is far safer now than it will ever be again, and that
window closes permanently once real revision history exists. Conversely, any plan whose payoff
is measured in observed usage, such as return-rate or retention experiments, cannot produce an
answer before September 2026 and should not be scheduled as though it can.

## Verify a plan's follow-up list against the code before working it

Follow-up lists in `docs/plans/` go stale quietly. They are written at the end of one arc and then
delivered incidentally by the next, so the document keeps describing work that no longer exists.
On 12 August 2026 all three follow-ups at the end of `plans/learn-screen-redesign.md` turned out to
be already done — the study interstitial had been replaced by a bottom sheet, the landing-page pill
overlap had been fixed by gating the pill behind a wheel event, and the dashboard study control had
moved above the fold — while `next_plan.md` still recorded the plan itself as *ready*.

The same plan already carried two findings that were wrong because they were written from a browser
session without reading the handler underneath. The rule that covers both: confirm against the
source before acting, and treat a plan as a record of intent at a past date rather than as current
state.

## Delegation goes through Freebuff first

The preferred route for delegable work is a prompt written for the prompter to run in Freebuff, not a worker spawned directly. Freebuff is a TUI with no headless mode, so no agent can drive it — only the prompter can. Codex and DeepSeek are for when the prompter has explicitly asked for autonomy. Full rules in `CLAUDE.md`.

## Worktree agents start from master

Agents given their own Git worktree branch from `master` by default, so they begin on stale code whenever the real work is on a feature branch. Brief every worktree agent to reset to the correct feature branch before it starts, or it will silently reimplement against an old tree.

## Subagents must not spawn subagents

Only the orchestrator delegates. Every subagent brief must forbid nested spawning and forbid the subagent-orchestration skill. Nested fan-out multiplies spend invisibly and produces work nobody reviews.

## Review once, at the end

Batch code review to the end of a task list rather than reviewing after each individual task. Per-task review on a multi-task run burns budget re-reading the same files and fragments the reviewer's picture of the change.

This does not apply to Freebuff, which is deliberately told to spawn a reviewer on every commit — on free inference that cadence is what keeps the output honest.

## Review predictions are already recorded honestly

`ReviewLog.retrievabilityAtReview` is a genuine ex-ante prediction: `applyReview` in `src/fsrs/fsrs.ts`
computes it from the pre-grade card state, and `src/db/repository.ts` persists it in the same
transaction as the grade. It is null only for a card's first review and for Anki-imported history,
which carries no FSRS equivalent. Full JSON backups include it.

This matters because it means calibration analysis can be done at any point in the future against
data recorded today. There is no closing window and no reason to rush a harness to "capture" data.

## The FSRS weight set behind a prediction is recorded from this change onward

Reviews written by the repository now carry a short fingerprint of the FSRS `w` array that
produced the prediction. Earlier reviews and imported history carry no fingerprint. The actual
weight vectors are not stored: the current set is recoverable from the course row and the defaults
from Git history.

## The short-term-memory harness is not a precedent for Lacuna-data analysis

`tooling/short-term-memory/` is a standalone Python project over an external Anki corpus
(`anki-revlogs-10k`) that ships a frozen coefficient JSON into the runtime. It never touches Lacuna's
own review data. Any harness analysing Lacuna's own history is a different shape entirely —
TypeScript reading a backup file — so do not model one on the other.

## Canonical review history is authoritative when supplied

Consumers that receive an explicit `reviewHistory` result must use an empty sequence for cards
with no matching event rows. Falling back per card to `Card.history` resurrects stale projection
events; the card projection is only a compatibility fallback when no canonical result was supplied.

## Trajectory history is sampled daily after review commit

`SessionHistoryEntry.averagePredictedRetrievability` is historical chart data, not a scheduler or
unlock input. New points are sampled asynchronously at most once per local calendar day per unit;
do not put that aggregate back into the `recordReview` transaction or replace it with a cache/table.

## Share workers use a transport-only codec

`src/workers/share.worker.ts` must import `src/db/shareCodec.ts`, not `src/db/share.ts`.
The worker handles compression and encoding only; the main thread validates decoded payloads with
the share schema. Importing the database module into the worker recreates the application's
repository, validation and maths bundle for no useful reason.

## Dexie projection helpers must inherit the caller's complete transaction scope

A helper that reads or writes several Dexie tables can be called inside an existing transaction,
but every table it touches must be listed by that caller. Omitting one does not always surface as
Dexie's clearer transaction-scope error; fake-indexeddb can report a misleading missing object-store
`NotFoundError`. Keep projection helpers free of nested transactions and expand the outer table list
when their dependencies change.

## Review-event identity excludes compatibility ownership metadata

Canonical review rows and Card projections may disagree temporarily on `deckId`, `courseId`,
`primaryLessonId` or `schedulingUnitId` while a storage projection is being backfilled. Those fields
must not distinguish duplicate copies of one event during portability; event content and event/card
ownership still determine genuine duplicates and cross-card collisions.

## Target pacing projections must combine duplicate legacy sources

A migrated Course/Lesson scheduling unit can temporarily be represented by more than one legacy
backing Deck. When rebuilding its target pacing row, combine the Welford summaries rather than
selecting the first Deck, and preserve an existing legacy profile if the target row is missing.
