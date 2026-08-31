# Lacuna MEMORIES.md

Durable facts about how to work in this repository, for every agent regardless of harness.

## Pull-request review uses CodeRabbit

CodeRabbit is the repository's automated reviewer; Copilot review output is irrelevant. CodeRabbit
reviews the initial pull-request head but does not re-review follow-up fixes, so address its findings
and rely on the normal CI gate before merging the updated head.

## Release publishing must whitelist packaged artefacts

electron-builder writes unpacked application directories beside installers in `release/`. A broad
`release/**` workflow upload would attach thousands of internal files and collide on basenames.
Keep the release workflow's per-platform installer, blockmap and update-metadata allowlists; macOS
artefacts join the same draft only after the Windows/Linux publisher finishes.

## The v0.2.0 desktop channel is an unsigned beta

GitHub marks `v0.2.0` as a pre-release and the application deliberately follows prereleases.
Windows NSIS and Linux AppImage auto-update; Windows portable, Linux DEB and unsigned macOS builds
update manually. Disable `allowPrerelease` when a future stable channel is introduced, and do not
claim macOS auto-update until the application is signed.

## Hash routing needs no SPA catch-all

Lacuna uses `createHashRouter`, so route paths never reach Vercel. A catch-all rewrite to
`index.html` turns a missing content-hashed asset into cacheable `200 text/html`; Workbox can then
preserve the broken response under the JavaScript URL. Missing `/assets/*` requests must stay 404,
and stale-chunk recovery must retain its one-reload guard.

## Web AI chat is not the Electron data MCP server

The optional web AI panel pairs with `tooling/lacuna-ai-mcp` through short-lived codes and two
encrypted HTTP relay mailboxes. Its five-tool companion carries chat, Stop and disconnect events
and asks the browser to execute approved domain tools. The Electron `--mcp-companion` uses local
IPC; neither surface implies the transport or trust model of the other.

## AI tool results need a real JSON wire projection

Repository records may contain own optional properties whose value is `undefined`; Cards do this
for payloads. The browser tool handler has already committed a write before the AI ledger validates
its result, so rejecting that raw record can report failure after success and make a retry duplicate
data. Keep the AI result normalisation that omits optional object fields before receipt and ledger
storage; do not weaken the validator or move validation after a reported failure.

## Relay URLs must be HTTPS outside loopback

`normaliseRelayUrl` in `src/sync/relay.ts` rejects plain HTTP for any host that is not a loopback
address (localhost, 127.0.0.0/8, ::1) because the write token travels in the Authorization header.
P6's relay-URL entry UI must explain this rule to the user rather than echoing a generic URL
error, and any fixture pointing at `http://...` for a remote relay is wrong by construction.

## Sync P2 keybags follow the relay's canonical bearer formats

The v1 crypto boundary accepts only 32 lowercase-hex channel IDs and 64 lowercase-hex characters for the relay's 32-byte write token, matching `relay/src/relay.ts`. Keybags are therefore fixed at 162 bytes, and malformed lengths must be rejected before PBKDF2; loosening either format requires an explicit wire-format decision.

## P5 relay generations are CAS, not freshness

The relay's ETag is an opaque compare-and-swap generation. `src/sync/cycle.ts` retries one stale generation but deliberately does not treat it as an authenticated monotonic clock, so P5 provides no rollback protection against replay of an older valid ciphertext. Do not present the relay as a freshness authority until a high-water-mark design is explicitly approved.

## P6 pairing QR is a short-lived display of bearer capability

`src/sync/pairing.ts` encodes the relay URL, channel id, write token and channel key in the QR; the relay mint secret is intentionally absent and is never persisted by the app. Settings reveals the QR only after an explicit action and hides it on blur or visibility loss. Do not turn the QR into a background-rendered status decoration or add the mint secret to its payload.

## Sync relay origins must be listed in the renderer CSP

Both `index.html` (web) and the `electron/main.ts` production header ship `connect-src 'self'`,
and the relay is a separate origin, so every relay fetch is refused until its origin is allowed.
The web meta policy is extended at runtime by `allowRelayConnect` (`src/sync/csp.ts`) from the
Settings sync flow; Electron's injected header is static and lists only the default relay. Do not
tighten `connect-src` back to `'self'` without restoring these origins, and keep the two static
policies in step with `DEFAULT_RELAY_URL` in `src/sync/pairing.ts`.

## Sync credentials are remembered on device by design

`SyncState.remembered` stores the unwrapped channel key and write token, restored at trigger
install. While that copy exists, an IndexedDB reader can decrypt newer peer data and write or purge
the relay channel; this is accepted for the convenience default on a trusted personal device because
the local study database is already plaintext. Lock removes the remembered copy, after which the
wrapped keybag again protects the channel key and write token without the passphrase. Do not revert
this to memory-only unlock without a product decision.

This file is not a changelog. `docs/CHANGES.md` records **what changed and why**, in chronological order, and grows forever. This file records **what is true now**, and is edited in place: when a fact stops being true, correct or delete the entry rather than appending a newer one below it. If something belongs in both, it goes in `docs/CHANGES.md` and is summarised here only if a future agent would get it wrong without being told.

Do not record what the codebase already states. Architecture, file layout, past fixes and commit history are discoverable by reading; the rules in `AGENTS.md` and `CLAUDE.md` are already injected. What belongs here is the non-obvious: things that have caught agents out before, constraints not visible from the code, and decisions whose reasoning would otherwise be lost.

Keep each entry to a heading and a few lines. State the fact, then why it matters.

---

## Vercel may omit Content-Length from browser requests

Observed on the live AI relay on 27 August 2026: a browser pairing POST reached the Vercel function
without `Content-Length`, returning 400 before pairing. The intercepted Playwright relay had hidden
this by inserting the header itself. Enforce relay body ceilings while reading the stream and treat
a declared length as an additional integrity check, not as a prerequisite for accepting a body.

## A successful Vercel mailbox write can still be ambiguous in the browser

Observed on the live AI relay on 27 August 2026: Vercel replaced or omitted the relay's `ETag` on a
`204` mailbox write, and a later browser run recorded a committed `200` whose JSON generation was
not retained by the app. A server-side `200` proves the write committed; it does not prove the
browser accepted the response. Modern `200` clients derive a synthetic SHA-256 generation from the
exact attempted ciphertext instead of trusting response metadata; Vercel's ordinary `ETag` is
trusted only for legacy `204` responses.
Observed again on 28 August: the first browser PUT was acknowledged, the second committed with `200`,
but its response was unusable and no `412` occurred. A transport-rejected, unreadable or `5xx` PUT
may have committed. Never retry it. A single immediate read-back can still return non-verifying
state after a successful `200`, even when Vercel Blob is read with `useCache: false`. Use a short,
bounded series of authenticated digest-receipt GETs and never retry the PUT. A browser-visible `200`
derives a synthetic `"sha256:<lowercase ciphertext digest>"` generation from the exact attempted
bytes. For an ambiguous write, the relay confirms only whether its current stored bytes match that
digest; the client derives the same generation without trusting response metadata. The relay
validates a later synthetic `If-Match` against current bytes and uses the store's current ETag for
the atomic write, so competing successors still fail closed. Browser receipt timing must accommodate
Vercel's cross-origin authorisation preflight; its recovery window is deliberately longer than the
terminal client's. Both writers need this rule.

## Monorepo preview deployments need the relay branch alias

Every push to a Lacuna branch creates a new immutable web preview and a new immutable relay preview.
A verification-only web build must target the relay's stable branch alias, not the immutable relay
URL from an earlier commit, or the next push quietly tests mismatched revisions. Keep production
configuration on the normal relay URL; this applies only to the live-verification branch.

## Web AI relay sessions currently support one browser tab

Same-tab session lifecycles are fenced: restored polling starts only after the owning React tree
commits, and disposal invalidates delayed poll work before it can push or persist. The persisted AI
session still has no cross-tab ownership lease, so two simultaneous Lacuna tabs can write from the
same browser-mailbox generation and one will fail closed with 412. Keep live testing to one tab until
a browser-ownership lease is added.

## The Vercel Functions body ceiling measures below 4.5 MB

The nominal request-body limit for Vercel Functions is 4,500,000 bytes, but
measured against the live relay on 18 August 2026: browser PUTs passed at
4,490,000 bytes and died at 4,495,000. The platform's rejection carries no
CORS headers, so the browser sees "Failed to fetch" and cannot read the
status; a body the platform truncates mid-flight can still reach the relay
short, which then answers 400 "length mismatch" with CORS headers — that is
the "Relay push failed with HTTP 400" the sync UI showed. Keep
`SYNC_PLATFORM_BODY_LIMIT_BYTES` below the measured boundary, not at the
nominal one.

## Browser fetch rejects a detached `this`; Node and `vi.fn` mocks cannot catch it

The WebIDL `fetch` operation throws "Failed to execute 'fetch' on 'Window':
Illegal invocation" when called with a `this` that is not the Window or
WorkerGlobalScope — for example a stored reference invoked as an object method
(`provider.fetchImpl(url)`). Node's undici `fetch` and `vi.fn<typeof fetch>()`
mocks never enforce the brand check, so such a bug passes unit tests and blows
up only in a real browser. Capture `fetch` with `.bind(globalThis)` at the
point of storing it. This shipped in P5/P6 and was only found by running the
app; the relay and sync tests cannot substitute for a browser pass.

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
`relay/` is a separate TypeScript project with `lib: ES2022`, so `{ cause }` is valid there.

## Vercel Other-framework `api/` is not Next.js routing

A file named `api/[...path].ts` matches one path segment, not a catch-all.
`/api/foo` reaches the function; `/api/foo/bar` 404s at the platform. Catch-all
`[...slug]` is a Next.js convention. For this non-framework project, send every
public path to `api/index.ts` with rewrites, or add one file per path depth.
Do not restore a bracketed catch-all filename.

## Relay ESM imports need a `.js` specifier

`relay/package.json` has `"type": "module"`. Vercel compiles each `.ts` file in
place and Node's ESM resolver requires an extension on relative imports.
`'../src/relay'` fails at module load; `'../src/relay.js'` is the specifier
TypeScript expects to emit. Vitest resolves the extensionless form, so tests
cannot catch this unless `relay/tsconfig.json` stays on `NodeNext`.

## Vercel Blob can hold a blob with no ETag; never serve or accept an empty generation

Observed live on 18 August 2026: a channel's state blob had real content but
no etag in its Vercel Blob metadata, so the relay served `ETag: ""`. The app
stored that quoted-empty `""` as its generation (a naive `trim() === ''` guard
misses it) and the next push sent `If-Match: ""`, which the relay rejects as
"invalid if-match" — "Relay push failed with HTTP 400" on every sync after the
first. The relay must not hand out an empty ETag. On an ETag-less read it fails
closed; an unconditional rewrite could overwrite a concurrent successor. If
only a successful write response omitted its ETag, the relay re-reads and
accepts the generation when the stored bytes still match exactly. Keep the
app's generation guard treating `""` as absent.

## Prefer the relay's real generation over a synthetic digest after a successful write

Observed live on 28 August 2026: deriving a digest generation after every successful mailbox write
made the next write perform a Vercel Blob read-after-write check. That read can return stale bytes,
causing a false `412` against the same writer. Use the generation returned in the successful JSON
body or exposed header first. Synthetic digest generations are recovery for damaged or ambiguous
acknowledgements, not the normal path.

## Live Blob `allowOverwrite: false` was measured, not guaranteed

On 15 August 2026, 25 concurrent first-write rounds against production
(`lacuna-relay.vercel.app`, store `lacuna-sync`, region `lhr1`) produced
exactly one 204 per round and no silent clobber. Pairing (P6) is not
blocked on pre-creating zero-byte slots at mint. The evidence is
empirical, not a platform guarantee: re-measure if Blob behaviour
changes, or if a multi-writer scenario beyond two devices is ever
contemplated. Do not reopen that hole from first principles, and do not
implement pre-create-at-mint to close it.

## Root CI covers `relay/` only via the `relay` job

Root `typecheck` / `lint` / `test` still ignore `relay/`. The `relay` job
in `.github/workflows/ci.yml` runs those scripts inside `relay/` against
its own lockfile. A green root check on a relay change is not a relay
pass. That job catches a missing `.js` import specifier; it does not
catch Vercel Other-framework routing.

## Active Course/Lesson sessions read scheduling config through the target projection

`useLearnSession` must feed Course/Lesson FSRS contexts from `schedulingUnits`, including inherited
limits and goals; `Course` remains the source for path and assessment semantics. Keep a read-side
fallback for databases whose projection is absent, and do not apply this cutover to legacy global
Deck sessions.

## The Deck/Folder stores are gone; the legacy types are not

Schema v22 set `decks` and `folders` to `null`, and no production code reads them. Global Today now
reads `db.schedulingUnits`. Pre-v22 backup files and v1 share codes are refused. `LegacyDeckRecord`
and `LegacyFolder` remain solely for the Dexie `version(1)`–`version(21)` chain (Dexie replays it
for every existing database), the snapshot builder in `schema.ts`, and test fixtures. Do not delete
those types, and do not collapse or edit that chain.

Much of what still reads as Deck is a name rather than a mechanism: `backingDecks.ts` no longer
talks to a store, and `findBackingDeck` is an alias of `getSchedulingUnit`. Do not add new `Deck`
names; do not spend a day renaming the old ones.

## Card history is hydrated, never persisted

Schema v26 stores Cards with `history: []`; the Card-table hooks enforce this even for direct
writes. Canonical `reviewHistory` rows are the evidence, and read interfaces hydrate runtime Cards.
When adapting legacy inline history, derive canonical rows before writing the Card because a write
hook may clear the supplied object's array. Projection code must also treat a missing or non-array
legacy `history` value as empty rather than dereferencing it.

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
moved above the fold — while `next_plan.md` still recorded the plan itself as _ready_.

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

## Stable AI call retries must fence stale same-call responses

The browser mailbox can still contain the pre-approval response when the terminal republishes an
approved tool call with the same `callId`. Accept a matching response only after the browser's
`terminalRevisionSeen` reaches the revision containing that retry, or the stale approval response
will win immediately.

## Replacement exclusion covers snapshot, merge and import

AI writes enter through `ReplacementLifecycle.admitWrite`. Peer and recovery operations must hold
the exclusive lifecycle across candidate snapshotting and merging as well as the final import;
fencing only `importBackup()` leaves a race where a write can land after the candidate snapshot.
Manual replacement invalidates the AI session before draining work, while peer and recovery
application preserve it.

## Use a throwaway worktree, never stashes, to test a baseline

The prompter keeps long-lived stashes from unrelated branches in this repository, so `git stash`
runs can pop or conflict with stashes that are not the agent's own, and an interrupted run leaves
the working tree half-stashed. To compare behaviour against a merge-base, use
`git worktree add /tmp/<name> <ref>` with a symlinked `node_modules` instead, then
`git worktree remove`. Verify `git status` after any stash-like operation before continuing.
