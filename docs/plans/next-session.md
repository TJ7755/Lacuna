# Next session plan — 14 August 2026

Written at the end of the 13 August session, for the orchestrator who picks this up next.

This is an orchestration plan, not an architecture document. It assumes the pattern that worked on
13 August: Claude reads plans, writes briefs, arbitrates territory and reviews; Grok workers write
every line of code. That session shipped five PRs for roughly 20% of one day's Claude usage.

---

## 1. Where things actually stand

**On `master`** (all merged 13 August):

| | |
| --- | --- |
| P3 | Schema v23 — `updatedAt` on snapshot-carried rows, `tombstones` table, one write helper, backup version 10, 90-day tombstone prune |
| P4 | `src/sync/mergeSnapshots.ts` — pure two-device peer merge, property-tested for commutativity and idempotence |
| Manual merge | `src/sync/manualMerge.ts` + a **Combine** action in Settings → Full backup and recovery |
| Motion | App-wide transition polish; shared `StepSwap` primitive; page-arrival lifts and `height` tweens removed |

**Open PR:** #65, documentation corrections (this file is on that branch).

**Unpushed branch:** `feat/p3-test-gaps` — 22 tests closing the gaps §7.4 specified but nobody wrote.
Tests only, production untouched, all green. Push and merge it first thing; it is free confidence.

### What is verified, and what is merely tested

Be precise about this, because the difference matters.

- **Verified by live test:** the restore-point guarantee. `manualMerge` runs against a real database
  and the snapshot stored in `db.backups` is proven to be the pre-merge state, to survive
  replace-import, and to restore correctly. It also survives a failed import.
- **Verified by mutation testing:** the P3 tombstone contract. The `feat/p3-test-gaps` worker removed
  `stampUpdatedAt` and `recordTombstone`, confirmed the new tests went red, and reverted. The tests
  can fail.
- **Tested but never run by a human:** every UI change from 13 August. CI's `browser-smoke` job
  passes, so the app boots, but nobody has clicked the Combine flow, the reframed Settings section,
  or the motion changes across roughly twenty files.
- **Never done at all:** a real two-device merge (P9 in the sync plan). Not automatable.

**First task for a human, not an agent:** run `bun run dev` and click through Settings, a study
session, the dashboard and the card list. Ten minutes closes the largest remaining unknown.

---

## 2. Decisions only Tom can make

Nothing below the line moves until these are answered.

### 2.1 The relay hosting gate — the big one

`docs/plans/sync-implementation.html` §9 gates P1 (relay), P2 (crypto), P5 (HTTP transport), P6
(pairing UI) and P7 (automatic triggers) behind one question: **are you willing to stand up and
maintain a Vercel Blob relay?**

- **Yes** → P1 and P2 unlock, and real sync is reachable before September.
- **No** → manual Combine is what you have. After 13 August it genuinely works, and the plan itself
  says automatic triggers may slip if the manual merge does the job.

This is a standing maintenance commitment, not a technical question, which is why the plan reserves
it. Do not let an agent decide it by implication.

### 2.2 Is "kept" the right word?

The Combine success toast reads *"12 cards kept, 3 added. A restore point was saved."* "Kept" means
the record id survived, not that its content is unchanged — a card overwritten by the other device
still counts as kept. Two reviewers and one orchestrator failed to find a better short word. Options:
accept it, or have the resting copy say the newest edit of each card wins.

### 2.3 How far to take the `repository.ts` split

Section 3 proposes an incremental split. Decide whether to do two modules and stop, or commit to the
whole sequence. Doing two and stopping is a perfectly good outcome; a half-finished nine-module plan
is not.

---

## 3. The work, in recommended order

Sourced from the 13 August bloat audit (read-only, `master` at `ef8c1ff`). Where I disagree with it,
that is marked.

### Track A — free wins, do first

**A1. Push and merge `feat/p3-test-gaps`.** Already written and green. No brief needed.

**A2. Delete verified-dead code.** Two to three hours, very low risk. The audit verified each by
searching all of `src/`, `electron/` and `scripts/`.

**A3. Correct stale comments and docs.** Small, and they actively mislead agents.

### Track B — the one structural change worth making

**B1. Split `src/db/repository.ts` incrementally.**

The audit's central finding, and I agree with it: *the size of the tree is not the problem — the
problem is that one file is the data layer, so two people cannot change two nouns at once.* That
constraint shaped the whole of 13 August. Every sync worker had to be told to keep off
`repository.ts`, and `mergeImport.ts` carries a comment saying it used Dexie directly because a
concurrent task owned the file.

Do it behind re-exports so no caller changes in the same commit. Start with `sequenceRepository.ts`
(lines 2915–3218), then `noteRepository.ts` (2158–2282). Both own their own tables, both have named
test files already.

**Do not** touch `reviewRepository.ts` (`recordReview` / `undoReview`) as part of this. It shares a
transaction across cards, both performance tables, `reviewHistory` and `sessionHistory`. It is its
own reviewed task or nothing.

### Track C — only if learn work is imminent

**C1. Extract the session-load effect from `useLearnSession.ts`** (lines 840–1235) into its own
module. A day, medium risk. The audit is right that the loader is the coherent unit and that
splitting `answer` in the same pass would be a mistake.

I would defer this unless something is about to collide there. It is 1,781 lines of one hook, which
is ugly, but ugly is cheaper than a broken study session six weeks before go-live.

### Explicitly not now

- **`Card.history` / `db.reviewHistory` dual-write.** A genuine unfinished cutover, and the
  highest-risk leftover in the data layer. Its own task, with the card-history consistency tests in
  hand, or not at all.
- **Retiring `userPerformance`.** Live scheduling reads the two new performance tables; backup import
  still writes the old one, so they can drift. Real, but it changes the backup format.
- **`schema.ts`, `types.ts`, `HelpPage.tsx`, `DateTimePicker.tsx`, `Welcome.tsx`.** Long for good
  reasons. The Dexie version chain in particular cannot be shortened without bricking existing
  databases.
- **Renaming "backing deck" to scheduling unit.** Costume, not a parallel system. Stop adding new
  `Deck` names; do not spend a day on the old ones.
- **A test-suite cleanup pass.** 40k lines, and the audit found nothing worth a dedicated day.
  Under-testing is the worse failure and this codebase found two real bugs through tests yesterday.

---

## 4. Territory map

Two workers per harness. The rule that matters is territory: never two workers writing the same
files. They share one working tree with no isolation.

| Task | Owns | Safe alongside |
| --- | --- | --- |
| A2 dead code | `hooks/useCountUp.*`, `state/useCourseData.ts`, `CardList.tsx`, `repository.ts` (`moveCards` only), `items/marksAnalytics.*`, `db/read.ts` | Nothing touching `repository.ts` or `CardList.tsx` |
| A3 stale docs | `docs/**`, `MEMORIES.md`, comments in `types.ts` / `useLearnSession.ts` | Everything |
| B1 repository split | `src/db/repository.ts` + new `*Repository.ts` | Anything outside `src/db/` |
| C1 learn loader | `src/pages/learn/useLearnSession.ts` + new module | Anything outside `src/pages/learn/` |

**A2 and B1 collide** — both touch `repository.ts` and `CardList.tsx`. Run A2 first and completely;
it is only a few hours.

**A3 is safe alongside anything** and is the natural filler task.

---

## 5. Ready-to-paste briefs

Each assumes the standard preamble: read `AGENTS.md`, follow the `.agent-mail` protocol under the
given slug, no subagents, British English, no emojis, report real check output, commit granularly.

### A2 — delete verified-dead code

> Task slug: `dead-code-removal`. Branch `chore/dead-code` from `master`.
>
> Delete the following, each verified by the 13 August audit as having no production caller. Delete
> each item together with its tests in the same commit, one commit per item or per coherent group.
>
> - `src/hooks/useCountUp.ts` and `useCountUp.test.ts` — nothing renders it.
> - `useAllLessons` (`state/useCourseData.ts` 81–83), `useAllNotes` (171–173), `useRevisionPlan`
>   (263–275), `useCourseRevisionPlans` (277–283). Production uses `useSidebarData` and
>   `getRevisionPlanForAssessment` instead.
> - `usePomodoroContext` (`hooks/PomodoroContext.tsx` 35–37). Production uses
>   `usePomodoroFlowContext`. Keep that one.
> - `listRecordedUndos` / `clearRecordedUndos` (`mcp/bridge/undoRegistry.ts` 34–41). Keep
>   `recordUndo`.
> - `src/items/marksAnalytics.ts` and its test — the test is its only caller.
> - The CardList "Move to…" control (`CardList.tsx` 110–113, 564–571, state at 92–93), and the test
>   case at `CardList.test.tsx` 186–229 which is the only thing that enables it. Then `moveCards`
>   (`repository.ts` 580–587) — **after** the UI is gone, not before.
> - `getRevisionPlan` by plan id (`db/read.ts` 265–267) and `listPracticeNodes` (256–258).
>
> **Before deleting each one, verify the claim yourself** by searching `src/`, `electron/` and
> `scripts/`. The audit was read-only and may have missed a dynamic reference. If any item turns out
> to have a production caller, leave it and say so in your report.
>
> **Do not delete** `buildShareCode`, `encodeShareDirect`, `encodeShareQRDirect`,
> `createBasicReversedPair`, `sampleReviewTrajectory` or `rejectAllMergeReview`. They look unused and
> are not — they are test infrastructure, compatibility paths, or have wrapped callers.
>
> Run `bun run typecheck:web` and `bun run test`. Both must pass.

### A3 — correct stale comments and docs

> Task slug: `stale-comment-sweep`. Branch `docs/stale-sweep` from `master`.
>
> Each of these describes a world that no longer exists. Correct them to match the code; do not
> change any behaviour.
>
> - `src/db/types.ts` 288–295 — describes Course tables as sitting "alongside the legacy Deck/Folder
>   model during the staged migration". The stores are gone as of v22.
> - `src/pages/learn/useLearnSession.ts` 343–344 — says global Today records against "a Deck". It
>   reads `schedulingUnits`.
> - `docs/plans/storage-v22-removal.md` Gate 2 — claims `useLearnSession.ts:1080` reads
>   `db.decks.toArray()`. That line reads `schedulingUnits`.
> - `docs/cardlist-caller-inventory.md` — describes a `deck`/`allDecks` CardList union.
>   `CardListProps` is now `CardListBaseProps & { context: CardListContext }`.
> - `src/components/import/UnifiedImportPanel.tsx` 3–4 — says it is used for "Dashboard (new deck
>   creation)".
>
> Where a document is wholly superseded rather than merely stale, say so in your report rather than
> rewriting it — the orchestrator will decide whether to delete it.

### B1 — first repository extraction

> Task slug: `repository-split-sequences`. Branch `refactor/repository-sequences` from `master`.
>
> Move the sequence section of `src/db/repository.ts` (lines 2915–3218) into a new
> `src/db/sequenceRepository.ts`: `cardsForSequence`, `createSequence`, `updateSequence`,
> `deleteSequence`, `listSequences`, `snapshotSequence`, `restoreSequence`, and the helpers
> `nextSequenceTimestamp`, `sequenceItemKeys`, `generatedCardFromPayload`.
>
> Copy the pattern of the two modules already extracted: `practiceNodeRepository.ts` and
> `occlusionRepository.ts`.
>
> **Rules that make this safe:**
> - Re-export every moved name from `repository.ts` so no existing import changes.
> - Do not retarget a single caller in this commit. That is a separate, greppable change later.
> - Do not change behaviour. This is a move, not a refactor. If you are tempted to improve something
>   you are moving, note it in your report and move it unchanged.
> - Shared helpers `assertValidCardPayload`, `friendlyDbError` and `stampUpdatedAt` stay in
>   `repository.ts`. Import them. Do not duplicate them.
> - Do not touch `mergeImport.ts` imports.
>
> Run `bun run typecheck:web` and `bun run test`, and confirm `sequenceRepository.test.ts`,
> `repository.test.ts` and `repository.mutation.test.ts` all pass through the re-export.
>
> If this lands cleanly, the same brief applies to `noteRepository.ts` (lines 2158–2282:
> `createNote`, `updateNote`, `deleteNote`, `listNotes`, `reorderNotes`, and the note-annotation
> CRUD).

---

## 6. Notes on running the workers

Learned on 13 August, all of it the hard way.

- **Delete consumed mailbox files** as soon as you have acted on them. A `-question.md` left in place
  makes every subsequent watcher fire on it immediately.
- **Detach long watchers** with `nohup`/`disown` if they must outlive the session. Session-bound
  background tasks die with Claude Code, and a merge watcher that dies never merges.
- **Headless Grok often cannot publish.** Its auto-mode intermittently refuses `gh pr create`,
  `gh pr edit`, `git reset --hard` and `git branch -f`. Brief it to write the exact command into its
  `-done.md`, and run it yourself. This is not a failed task.
- **Grok stops at guard rails** rather than working around them — reliably, across territory limits,
  refused commands and inherited work. That is what makes `--permission-mode acceptEdits` safe.
- **Ask for a "leave alone" section** in any audit. The bloat audit's was as valuable as its findings.
- **Ask workers to prove their tests can fail.** The P3 worker removed the production write, watched
  the test go red, and reverted. That is the difference between coverage and confidence.
