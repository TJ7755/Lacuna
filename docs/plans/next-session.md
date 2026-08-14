# Next session plan — 15 August 2026

Written at the end of the 14 August session. Supersedes the 14 August plan: everything its Track A
and Track B specified has shipped.

Same pattern as the last two sessions: Claude reads plans, writes briefs, arbitrates territory and
merges; Grok workers write every line of code **and every review**. Claude does not review diffs.

---

## 1. Where things actually stand

**Merged to `master` on 14 August:**

| PR | |
| --- | --- |
| #69 | `sequenceRepository.ts` — sequence CRUD out of `repository.ts`, behind re-exports |
| #70 | **P1, the relay service** — `relay/`, a standalone Vercel project |
| #71 | `lessonCardExposureId` defined once in `mutationStamp.ts` |
| #72 | Docs: the day's decisions |
| #73 | `noteRepository.ts` — note and annotation CRUD |

**The `repository.ts` split is finished.** "Sequences and notes, then stop" was the decision and both
are done. Anything further needs a fresh decision, not an assumption that the sequence continues.

### Decisions taken on 14 August

- **The relay hosting gate is answered yes.** P1 and P2 are authorised; P5, P6, P7 follow.
- **The 4.5 MB transport ceiling is accepted.** Recorded in `sync-implementation.html` with its
  consequences. Do not reopen it by speculatively building client-direct Blob upload.
- **"Kept" stays** in the Combine toast. Settled. Do not reopen.

### What is verified, and what is merely tested

Still the distinction that matters most.

- **Verified by an independent reviewer:** all four code PRs above. Each was reviewed by a separate
  Grok worker against named claims rather than a general look. The sequence and note extractions
  were confirmed byte-identical to their originals; the id helper was proved to fail when its
  separator changed.
- **Tested but never run against live infrastructure:** the relay. Its reviewer put it precisely —
  *"every relay test would still pass if the live endpoint were broken."* All 13 cases run against
  an in-memory seam; nothing instantiates the Vercel adapter.
- **Tested but never run by a human:** every UI change from 13 August. Still true, still outstanding,
  now two days old. The Combine flow, the reframed Settings section and the motion changes across
  roughly twenty files have never been clicked.
- **Never done at all:** a real two-device merge (P9).

---

## 2. What needs Tom, not an agent

**2.1 Click through the app.** `bun run dev`, then Settings, a study session, the dashboard, the card
list. Ten minutes. This has been the top item for two sessions and is now the oldest unknown in the
project.

**2.2 Deploy the relay, and race it.** Three steps in `relay/README.md`: a new Vercel project with
root directory `relay`, a private Blob store connected to it, deploy. No other environment variables.

Then the four `curl` commands. **These are not a formality** — they are the only evidence that will
ever exist for the live path, because the test suite cannot reach it.

While there, settle the open question: fire two `PUT`s at the same generation simultaneously. If
exactly one returns 412, Vercel's `allowOverwrite: false` is an atomic if-none-match and the guard
holds. If both return 204, it is check-then-write and the last body wins. **Answer this before P5 is
built on the assumption**, not after.

---

## 3. The work, in recommended order

### P2 — the crypto module

The next phase, and the one needing most care. `src/sync/crypto.ts`: one 256-bit channel key, AES-GCM
with a fresh random 96-bit nonce per push, PBKDF2 keybag, QR and passphrase yielding the same key.
Arc 8 §7 is the specification.

**It carries its own review gate, unaffected by the hosting decision.** Arc 8 puts it plainly:
agent-written code with passing tests is not sufficient evidence of correctness here, because
incorrect nonce or KDF handling produces code that works perfectly and is broken. So:

- A Grok worker writes it, as usual.
- A second Grok worker reviews it against named claims, as usual.
- **And then** `/security-review` runs against the module, and Tom reads the diff himself, before
  anything touches a real channel.

That third step does not exist for other work. Do not skip it because two Grok verdicts came back
clean.

Iteration count: measure on the phone, target roughly half a second, hard-code it with the
measurement in a comment.

### P5 — transport and sync cycle

`RelayProvider` with `manual` and `http` implementations; pull-merge-push; 412 retry; single-flight;
backup-before-apply via `takeAutoBackup(force)`. Arc 8 §9–10.

Two things it must carry, both learned on 14 August:

- **Surface the snapshot size in the sync panel**, and fail a push with a message naming the
  offending courses rather than a generic error. The 4.5 MB platform ceiling makes this a real
  user-facing limit, not a theoretical one.
- The residual Blob race, whatever §2.2 establishes it to be.

### Deferred, deliberately

Unchanged from 13 August, and none of it has become more urgent:

- `Card.history` / `db.reviewHistory` dual-write. The highest-risk leftover in the data layer.
- Retiring `userPerformance`.
- C1, the `useLearnSession.ts` session-load extraction. Defer unless something is about to collide.
- Renaming "backing deck".
- Any further `repository.ts` extraction — see §1.

### One small known follow-up

`src/sync/mergeSnapshots.ts` holds a **fourth** copy of the exposure id, as a local `exposureId(row)`.
Left deliberately: that module is Dexie-free by design and `mutationStamp.ts` imports Dexie, so
unifying them would drag Dexie into the pure merge path. If a later change wants one definition
everywhere, extract the one-liner into a Dexie-free module rather than importing `mutationStamp`
there. Not urgent; recorded so it is not rediscovered as a surprise.

---

## 4. Notes on running the workers

Everything from 13 August still holds. Added on 14 August:

- **Review is delegated, always.** See the Reviewing section in `CLAUDE.md`. Name the *claims to
  test*, not the files to read; say what the most important possible finding would be; demand a
  "verified clean" section; say plainly not to manufacture findings. Briefs written that way found
  real things all day. A brief saying "review this PR" would not have.
- **Briefs are not infallible.** The #69 brief asked for three private helpers to be re-exported,
  which would have widened the public API and broken the claim the PR was making. The worker ignored
  it and was right. When a worker deviates and gives a reason, weigh the reason.
- **Give each worker its own git worktree** when another holds the main tree, and symlink
  `node_modules` in. Then tell it not to switch branches. This is what makes genuine parallelism
  possible; the harness quota never was the constraint — territory was.
- **A branch is how you hand work between agents.** Worktrees share the object database, so a
  reviewer in its own tree reads `git diff master..<branch>` without checking anything out.
- **Grok routes around a broken environment rather than stopping.** Handed a worktree of the wrong
  repository, it correctly identified the real one, created its own worktree elsewhere and committed
  there. This qualifies the "Grok stops at guard rails" note in `CLAUDE.md`: it stops at *explicit
  prohibitions*, but a misconfigured environment reads to it as a problem to solve.

### LMO

Mixed-model workflows now run through `lmo` (`lmorchestrator`, 0.1.1+); see
`.claude/skills/lmo/SKILL.md` and `.claude/workflows/note-repository.js` as a worked example. It
gives a worktree per agent and an `ask()` route for blocked workers, which is why it is worth using
over hand-driven `grok` calls.

Two things to know. Its worktree is **not** a containment boundary — workers have shell access and
one has already written outside it. And `apply()` copies files into the parent tree while every
agent's worktree starts from `HEAD`, so hand work between agents on a **branch**; otherwise a later
agent sees an empty diff and reviews nothing while reporting clean.
