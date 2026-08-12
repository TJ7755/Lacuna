# Lacuna MEMORIES.md

Durable facts about how to work in this repository, for every agent regardless of harness.

This file is not a changelog. `docs/CHANGES.md` records **what changed and why**, in chronological order, and grows forever. This file records **what is true now**, and is edited in place: when a fact stops being true, correct or delete the entry rather than appending a newer one below it. If something belongs in both, it goes in `docs/CHANGES.md` and is summarised here only if a future agent would get it wrong without being told.

Do not record what the codebase already states. Architecture, file layout, past fixes and commit history are discoverable by reading; the rules in `AGENTS.md` and `CLAUDE.md` are already injected. What belongs here is the non-obvious: things that have caught agents out before, constraints not visible from the code, and decisions whose reasoning would otherwise be lost.

Keep each entry to a heading and a few lines. State the fact, then why it matters.

---

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
