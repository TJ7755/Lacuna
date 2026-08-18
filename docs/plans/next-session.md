# Next session plan — 18 August 2026

Written after Tom reviewed and merged PR #86. Supersedes the 15 August plan: P1 is live, P2 is
reviewed, and the Arc 8 §7 gate is closed.

Same pattern as the last sessions: Claude reads plans, writes briefs, arbitrates territory and
merges; Grok workers write every line of code **and every review**. Claude does not review diffs.

---

## 1. Where things actually stand

**On `master` as of 18 August:**

| | |
| --- | --- |
| P3 / P4 | Schema v23, tombstones, `mergeSnapshots`, manual Combine in Settings |
| P1 | Live relay at `lacuna-relay.vercel.app`; mint secret required (PR #84) |
| P2 | `src/sync/crypto.ts`, PR #86. Tom reviewed and merged it. Gate closed. |
| Safe-area | Standalone phone insets (PR #85) |

**Next is P5.** A brief already exists at `.agent-mail/p5-transport-brief.md`. Branch from current
`master`, not from `feat/sync-crypto`.

### What is verified, and what is merely tested

- **Verified by Tom:** P2. The crypto module may now be consumed.
- **Verified live:** the relay smoke path and a 25-round first-write race. Empirical, not a
  platform guarantee. Pairing is not blocked on pre-create-at-mint.
- **Tested but never run by a human:** the Combine flow, the reframed Settings section, and the
  motion changes from 13 August. Still the oldest unknown in the project.
- **Never done at all:** a real two-device merge (P9).

---

## 2. What needs Tom, not an agent

**Click through the app.** `bun run dev`, then Settings, a study session, the dashboard, the card
list. Ten minutes.

**Confirm production `RELAY_MINT_SECRET` is set** and that mint-without-secret returns 401. Agents
must not type that secret.

---

## 3. The work, in recommended order

### P5 — transport and sync cycle

`RelayProvider` with `manual` and `http` implementations; pull-merge-push; 412 retry; single-flight;
backup-before-apply via `takeAutoBackup(force)`. Reuse `manualMerge`; do not write a second apply
path. Arc 8 §9–10. Files: `src/sync/relay.ts`, `src/sync/cycle.ts`.

Two things it must carry:

- **Surface the snapshot size**, and fail a push with a message naming the offending courses. The
  4.5 MB platform ceiling is a real user-facing limit.
- **Snapshot freshness.** P2 does not provide rollback protection. P5 must either add an
  authenticated high-water mark or make that relay threat-model exclusion explicit.

Channel minting, pairing UI and `visibilitychange` / session-end hooks are not P5.

### Then P6, then P7

P6 pairing must enforce a real passphrase policy (P2 accepts any non-empty string, and
`GET /c/:id/keybag` is unauthenticated) and carry `RELAY_MINT_SECRET` alongside the relay URL.

P7 (focus pull, session-end push) may slip past September if Combine keeps doing the job.

### Deferred, deliberately

Unchanged, and none of it has become more urgent:

- `Card.history` / `db.reviewHistory` dual-write. The highest-risk leftover in the data layer.
- Retiring `userPerformance`.
- C1, the `useLearnSession.ts` session-load extraction.
- Renaming "backing deck".
- Any further `repository.ts` extraction.

### One small known follow-up

`src/sync/mergeSnapshots.ts` holds a fourth copy of the exposure id, as a local `exposureId(row)`.
Left deliberately: that module is Dexie-free and `mutationStamp.ts` imports Dexie. Not urgent.

---

## 4. Notes on running the workers

Everything from 13–15 August still holds.

- **Review is delegated, always.** Name the claims to test, say what the most important finding
  would be, demand a "verified clean" section, and say plainly not to manufacture findings.
- **Give each worker its own git worktree** when another holds the main tree, symlink
  `node_modules`, and tell it not to switch branches. Brief it to reset to the correct feature
  branch — worktrees start from `master` and will otherwise implement against a stale tree.
- **A branch is how you hand work between agents.**
- **Deploying found what reviewing could not** on the relay. Do the same for P5 and P6.
