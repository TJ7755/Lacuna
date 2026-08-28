# AI sidebar relay handoff

This is the closed operational record for the AI sidebar relay work as of 28 August 2026. Read it
before changing the relay or repeating live tests; it is not the active product work queue.

## Close-out status

- PR #101, **Fix AI relay response and terminal recovery**, merged into `master` on 28 August 2026
  as `5275266323b8cd16df68202bc3ef7dbda13fb1e6`.
- The full GitHub application, relay, AI companion, typecheck, lint, production and browser-smoke
  suite passed. Vercel deployments and CodeRabbit review also passed.
- The deployed browser gate passed on 28 August 2026. The exact evidence is recorded below.
- No implementation or verification work remains in this relay hotfix. The active product plan is
  `docs/plans/ai-sidebar.md`; domain actions, teaching instructions and durable memories are
  separate future slices and were deliberately not smuggled into this fix.

## Current product boundary

The shipped slice is an encrypted, model- and harness-agnostic chat transport between Lacuna's web
AI panel and `tooling/lacuna-ai-mcp` in a terminal task. It carries typed messages, complete replies,
cooperative Stop and disconnect events.

It cannot read Courses, Lessons, Cards, Questions, FSRS state, review history or learner memories.
It cannot create or edit Lacuna data, set exam dates or execute any other domain action.
Misconception-first is a saved device preference only; it is not injected into terminal-agent
instructions. Do not imply otherwise in UI, documentation or testing.

## What is already merged

- PR #96: initial optional desktop AI panel, encrypted pairing and chat-only MCP companion.
- PR #97: accepted browser relay requests without requiring `Content-Length`, matching Vercel.
- PR #98: exposed successful mailbox generations in `X-Lacuna-Generation` as well as `ETag`.
- PR #99: returned mailbox generations in a JSON body to avoid Vercel's empty-response header
  rewriting.
- PR #100: moved restored polling behind the committed React lifecycle and added epoch fencing so a
  disposed or replaced same-tab session cannot continue writing.
- PR #101: derived modern successful-write generations from the attempted ciphertext, added bounded
  digest-receipt recovery, distinguished stale from ambiguous outcomes and added immediate manual
  recovery from a dead terminal.

PR #100 fixed a real race. PR #101 fixed and live-verified the remaining browser failure described
below.

## PR #101 live result on 28 August

PR #101 reached commit `0d0369c` with every GitHub, relay, browser-smoke, Vercel and CodeRabbit
check green. A fresh test used immutable preview
`https://lacuna-nopqjnbss-tj7755.vercel.app` with one browser tab and terminal client
`Live verification 1`. The terminal connected, claimed one message, replied and disconnected
cleanly, but the browser showed the stale-generation wording and never rendered the reply.

Production relay logs proved this was not a stale compare-and-swap:

1. Browser mailbox PUT `200` at `1787910156761` — initial message committed.
2. Terminal mailbox PUT `200` at `1787910157843` — claim committed.
3. Browser GET terminal mailbox `200` at `1787910158223` — claim observed.
4. Browser mailbox PUT `200` at `1787910158701` — acknowledgement committed.
5. Terminal mailbox PUT `200` at `1787910158855` — reply committed.
6. Terminal mailbox PUT `200` at `1787910164408` — clean disconnect committed.

There was no `412` anywhere in the session. The first browser PUT generation was retained, proved by
the second browser PUT succeeding. The second successful response was instead unverifiable in the
browser, so polling stopped before the reply could be pulled. The shared error wording falsely said
the connection changed elsewhere and made the diagnosis more tedious than it needed to be.

## Remaining live failure before this hotfix

A corrected one-browser/one-terminal test used the fresh PR deployment
`https://lacuna-io96hwy57-tj7755.vercel.app`. The browser sent `Corrected first exchange.`. The terminal received it,
called `reply(message.runId, message.messageId, "First corrected exchange passed.")`, logged
`REPLIED`, then disconnected cleanly. The browser nevertheless showed:

> The AI connection changed elsewhere. Reconnect the terminal.

The draft still contained `Corrected first exchange.`. That matters: the first browser mailbox write
committed, but the client did not retain the returned generation, so its next acknowledgement reused
the old generation.

Structured production relay logs for that session, in epoch milliseconds:

1. Browser mailbox PUT `200` at `1787865594143` — initial send committed.
2. Terminal mailbox PUT `200` at `1787865595530` — terminal claim committed.
3. Browser GET terminal mailbox `200` at `1787865596464`.
4. Terminal mailbox PUT `200` at `1787865596640` — reply committed.
5. Browser GET terminal mailbox `200` at `1787865597609`.
6. Browser mailbox PUT `412` at `1787865598161` — acknowledgement used a stale generation.
7. Later browser GET/PUT attempts repeated `412`.
8. Terminal mailbox PUT `200` at `1787865605448` — clean terminal disconnect committed.

There was no second successful browser mailbox PUT. The original send's `200` therefore committed
without leaving the app with a usable generation.

An earlier test on `https://lacuna-bryq7cope-tj7755.vercel.app` paired successfully and delivered a
message, but the test script accidentally called `client.reply(message.messageId, message.runId,
...)`. The actual signature is `(runId, messageId, content)`. That terminal crash was test error, not
relay evidence. It did expose the need for a manual connected-state reset.

## Ruled out

- Terminal reply/disconnect timing is not the cause. Browser and terminal write different mailbox
  keys and have independent generations.
- The terminal sequence advances `T0 -> T1 -> T2 -> T3`; the browser sequence advances
  `B0 -> B1 -> B2 ...`. A terminal write cannot stale the browser generation.
- The browser intentionally ignores the generation returned by a terminal-mailbox pull and writes
  only its browser-mailbox generation.
- A disposable direct Bun/Node relay probe completed create, claim, first browser PUT, browser GET and
  a second PUT. The JSON generation from the first PUT exactly matched the GET generation. The relay
  store's generation algorithm therefore works outside the affected browser path.
- PR #100 removed discarded-render and stale-callback ownership races. The corrected fresh-origin
  test still failed after it merged, so another same-tab React lifecycle race is not the leading
  explanation.
- Browser automation evaluation cannot directly use page `fetch` in this environment; an evaluation
  of `typeof window.fetch` returned `undefined`. Do not burn time trying to reproduce the request that
  way.
- Browser development logs were empty for the failure.

## This branch's hotfix

`src/ai/relayClient.ts` now treats the response to a mailbox push as follows:

1. Hash the exact attempted ciphertext with SHA-256.
2. A browser-visible `200` derives the next quoted generation locally as
   `"sha256:<lowercase digest>"`; it does not depend on Vercel preserving the response body or
   generation headers.
3. Trust a validated generation header only for the legacy `204` response path.
4. If the PUT rejects or returns `5xx`, GET the same mailbox with `?digest=<digest>` and the writer
   token. The relay returns `404` before a mailbox exists, `409` while its opaque bytes differ and
   `200` once they match.
5. Browser recovery reads run at absolute 0/650/1,400 ms offsets, allow 600 ms per read and stop at
   2.2 seconds. That window includes Vercel's observed OPTIONS-plus-GET latency. The terminal keeps
   the shorter 0/250/650 ms, 250 ms/read, one-second schedule because Node has no browser preflight.
6. Never retry the PUT or trust an ordinary platform `ETag`; throw
   `RelayPushOutcomeUnknownError` when the digest receipt cannot prove the write.

`tooling/lacuna-ai-mcp/src/relayTransport.ts` applies the corresponding digest-receipt recovery rule
to terminal-mailbox writes. `relay/src/aiRelay.ts` allows each writer to request a digest receipt for
its own opaque mailbox while retaining the existing peer-read and writer-only PUT boundaries. On a
subsequent synthetic `If-Match`, the relay verifies that the current bytes have the supplied digest,
then uses that read's native store ETag for the actual compare-and-swap. If a committed store write
omits its ETag, the relay re-reads and adopts the generation only when the stored ciphertext still
matches; an ETag-less read fails closed rather than risking an overwrite of a concurrent successor.
A real `412` now reports that another Lacuna tab or window changed the connection; an ambiguous
outcome that still cannot be verified says the relay may have accepted the update. Both require
reconnection, clear terminal client state, and no longer lie about why.

`src/ai/session/relay.ts` also makes reset recovery synchronous from the UI's perspective. Reset:

- invalidates the current polling epoch and detaches its queued mutations;
- clears local credentials and publishes `disconnected` before waiting for remote revocation;
- stops the claimed user item;
- restores the queued follow-up first, otherwise the existing draft, otherwise the active claimed
  prompt into the composer;
- preserves an already-reduced terminal reply when its browser acknowledgement is ambiguous;
- persists the exact attempted outgoing text when its own write outcome is ambiguous, without
  claiming that text entered the transcript;
- prevents old pair/send/Stop/poll work from committing after reset.

`src/components/ai/AiPanel.tsx` exposes an accessible `Disconnect terminal` action while connected.
It does not replace the existing Stop or Close controls.

Regression coverage is in:

- `src/ai/relayClient.test.ts` — JSON success, header fallbacks, bounded read scheduling, hung-read
  abortion, synthetic generations, Vercel preflight latency and unknown successful outcomes.
- `tests/e2e/ai-terminal.spec.ts` — commits a browser PUT, strips its response body and custom
  generation header, then proves the locally derived synthetic generation advances the next write
  without trusting response metadata or retrying the ciphertext. Unit tests cover digest receipts.
- `relay/tests/aiRelay.test.ts` — writer and peer read capabilities remain distinct from writer-only
  PUT access; synthetic digest generations advance through native store CAS; mismatches and races
  fail without overwriting concurrent successors; missing write ETags reconcile safely.
- `relay/tests/relay.test.ts` — the existing sync relay follows the same race-safe missing-write-ETag
  rule and fails closed on an ETag-less read.
- `tooling/lacuna-ai-mcp/src/relayTransport.test.ts` — symmetric bounded terminal writer read-back,
  stale first reads, hung-read abortion, server-error reconciliation and reconnect-required stale
  generations.
- `src/ai/session/relay.messages.test.ts` — unknown acknowledgements preserve already-reduced replies,
  while claimed disconnects recover the prompt without a stale retry.
- `src/ai/session/relay.test.ts` — reset before slow revocation, epoch invalidation, exact attempted
  draft persistence and replacement-send draft clearing.
- `src/components/ai/AiPanel.test.tsx` — connected Disconnect action without Stop/Close side effects.
- `tests/e2e/ai-terminal.spec.ts` — complete dead-terminal replacement, resend, reply, draft clearing
  and post-disconnect transcript retention through the intercepted relay.

## Known limitations

- Multiple same-origin browser tabs still have no ownership lease. Two active tabs can write the same
  persisted browser-mailbox generation; one will correctly fail closed with `412`.
- A browser PUT already in flight cannot be cancelled merely by invalidating the session epoch. Epoch
  fencing prevents its result being committed locally.
- A terminal process that crashes cannot send a disconnect event. The new manual Disconnect control
  is the recovery path; there is no heartbeat or automatic liveness timeout.
- The `quiet` connection variant exists in the interface but is not currently entered by this relay
  adapter.
- A relay session expires after 24 hours. The current polling path treats an absent expired mailbox
  like no event rather than presenting a dedicated expiry state.
- Conversation and connection state are device-local. The chat transcript is not the planned durable
  learner-memory system.

## Final live verification on 28 August 2026

The fresh immutable deployment `https://lacuna-9r5g2s96g-tj7755.vercel.app` completed two clean
connect/send/reply/disconnect cycles in one browser tab. Drafts cleared, both replies rendered and
the transcript remained visible. The same tab also recovered from a terminal that claimed a prompt
and exited without disconnecting: manual Disconnect restored the prompt, replacement pairing
succeeded, resend cleared the draft and the replacement reply rendered.

That deployment exposed one late warning after the final clean disconnect. Relay timings showed the
PUT committed with `200`, then digest receipt reads returned `409`, `200`, `200`; each browser fetch
was aborted because its 250 ms allowance was shorter than Vercel's OPTIONS-plus-GET latency. After
the browser recovery window was corrected, immutable deployment
`https://lacuna-ag59l1ojc-tj7755.vercel.app` passed the final exchange and disconnect check: reply
rendered, draft cleared, transcript remained, reconnect returned and no warning appeared after the
2.2-second recovery deadline.

The machine exhausted the intended 10-pairings/hour limit during repeated live testing. The final
verification therefore used a temporary limit of 100 on `codex/ai-relay-live-verify` only. That
change affected session creation, not mailbox or acknowledgement behaviour, and was reverted in
commit `3dcdcbf` immediately after the gate. The PR and production limit remain 10. Vercel
Authentication was restored afterwards and verified as `Require Log In` with Standard Protection.

The deferred automated gate then passed. The first full application run completed 287/288 files and
2,422/2,423 tests; its only failure was the recovery fake-timer test still advancing the obsolete
250 ms schedule. After fixing that test, the affected browser relay suite passed 29/29. Relay passed
58/58 with typecheck and lint; the AI companion passed 32/32 with typecheck, lint and build; the AI
Playwright file passed 5/5; web and Electron typecheck, application lint, changed-file formatting and
`git diff --check` passed. The E2E build retained the repository's existing chunk-size warnings.

Close-out: PR #101 was reviewed, its full CI suite passed and it merged. Do not reopen this slice to
add domain actions, memory sync or misconception-first instructions; those belong to the active AI
sidebar plan.

## Completion criteria

- Passed: web and Electron typecheck, application/relay/AI-companion lint, changed-file formatting,
  `git diff --check`, relay tests, AI companion tests and AI Playwright E2E.
- Passed after its isolated timing fix: browser relay client tests 29/29. The original full run's
  other 2,422 tests passed.
- Passed: a fresh deployed origin completed two connect/send/reply/disconnect cycles in one browser
  tab.
- Passed: killing a claimed terminal and using manual Disconnect immediately recovered the prompt
  and permitted re-pairing.
- Passed: no `412` or ambiguous-outcome alert appeared in the final single-tab scenarios.
- Passed: PR review, complete GitHub checks and merge into `master` as `5275266`.

## Useful files

- `src/ai/relayClient.ts` — browser HTTP relay boundary and generation parsing.
- `src/ai/session/relay.ts` — browser session state, polling, mailbox writes and reset semantics.
- `src/components/ai/AiPanel.tsx` — panel connection controls and error presentation.
- `src/ai/relayProtocol.ts` — encrypted mailbox protocol schemas.
- `tooling/lacuna-ai-mcp/src/client.ts` — terminal state machine; note the reply argument order.
- `tooling/lacuna-ai-mcp/src/relayTransport.ts` — terminal HTTP relay boundary.
- `relay/src/aiRelay.ts` and `relay/src/relay.ts` — server routing and mailbox responses.
- `docs/plans/ai-sidebar.md` — broader plan and deferred domain-action/memory phases.

## Cleanup and scope discipline

Close any isolated browser test tab when finished. AI remains disabled by default on the public
deployment; tonight's tests enabled it only on unique preview origins. Do not modify the public alias
merely to test this branch.

Do not start course/Card access, actions, memory sync or misconception-first injection inside this
hotfix. Those are separate product slices and need their own protocol, approval and test work.
