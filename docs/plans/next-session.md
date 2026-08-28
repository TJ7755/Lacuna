# Next session plan — 18 August 2026

> **Historical session record.** All sync phases P1–P9 are now delivered. Tom completed and
> confirmed the live two- then three-device P9 pass on 28 August 2026. See `docs/next_plan.md` for
> the current work queue; the remaining text records the state before P6 began.

Written after Tom reviewed and merged PR #86. Supersedes the 15 August plan: P1 is live, P2 is
reviewed, and the Arc 8 §7 gate is closed. PR #87 delivered P5 later the same day, so the next
session is P6.

Same pattern as the last sessions: Claude reads plans, writes briefs, arbitrates territory and
merges; Grok workers write every line of code **and every review**. Claude does not review diffs.

---

## 1. Where things actually stand

**On `master` as of 18 August (after PR #87):**

| | |
| --- | --- |
| P3 / P4 | Schema v23, tombstones, `mergeSnapshots`, manual Combine in Settings |
| P1 | Live relay at `lacuna-relay.vercel.app`; mint secret required (PR #84) |
| P2 | `src/sync/crypto.ts`, PR #86. Tom reviewed and merged it. Gate closed. |
| P5 | Relay transport and sync cycle, PR #87. Size-gated, 412 retry, single-flight. |
| Safe-area | Standalone phone insets (PR #85) |

**Next is P6.** Pairing UI on top of the shipped transport. Branch from `master` once PR #87
merges, not from `feat/sync-p5-transport`.

### What is verified, and what is merely tested

- **Verified by Tom:** P2. The crypto module may now be consumed.
- **Verified live:** the relay smoke path and a 25-round first-write race. Empirical, not a
  platform guarantee. Pairing is not blocked on pre-create-at-mint.
- **Tested but never run by a human:** the Combine flow, the reframed Settings section, and the
  motion changes from 13 August. Still the oldest unknown in the project.
- **Not yet done at the time of writing:** a real two-device merge (P9). Completed 28 August 2026.

---

## 2. What needs Tom, not an agent

**Click through the app.** `bun run dev`, then Settings, a study session, the dashboard, the card
list. Ten minutes.

**Confirm production `RELAY_MINT_SECRET` is set** and that mint-without-secret returns 401. Agents
must not type that secret.

---

## 3. The work, in recommended order

### P5 — transport and sync cycle (shipped in PR #87)

`RelayProvider` with `manual` and `http` implementations; pull-merge-push; 412 retry; single-flight;
backup-before-apply via `takeAutoBackup(force)`. Reuse `manualMerge`; do not write a second apply
path. Arc 8 §9–10. Files: `src/sync/relay.ts`, `src/sync/cycle.ts`.

Both carry-overs landed: pushes fail with a message naming the offending courses against the
4.5 MB platform ceiling, and the lack of rollback protection is an explicit relay threat-model
exclusion. Plain HTTP is refused outside loopback because the write token rides in the
Authorization header.

### Then P6, then P7

P6 pairing is next: Settings section, QR display and scan, passphrase entry, unpair, delete
channel, last-sync and error surface. It must enforce a real passphrase policy (P2 accepts any
non-empty string, and `GET /c/:id/keybag` is unauthenticated), carry `RELAY_MINT_SECRET`
alongside the relay URL, and surface the HTTPS-only relay rule when a URL is typed.

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
