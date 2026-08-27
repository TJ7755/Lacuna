# AI sidebar handoff

This is the operational context for the AI sidebar relay work as of 27 August 2026. Read this before
changing the code or repeating live tests.

## Start here

- Working branch: `codex/ai-relay-response-recovery-hotfix`.
- Base: `master` at `2b4fdb2960f22b9f2666a2e78854fd85028659be`, the merge of PR #100.
- This branch fixes the remaining live-browser failure discovered after PR #100 and adds manual
  recovery from a dead terminal.
- The branch should be pushed as a normal PR but left unmerged tonight. The prompter explicitly said
  not to wait for CI, CodeRabbit or Vercel checks; those are tomorrow's work.
- Do not call the slice browser-verified until the fresh deployed-origin procedure below passes.

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

PR #100 fixed a real race. It did not fix the remaining live-browser failure described below.

## Remaining live failure before this hotfix

A corrected one-browser/one-terminal test used the fresh PR deployment
`https://lacuna-io96hwy57-tj7755.vercel.app` and pairing code
`96EG-EXHZ-MYWJ-PEY3-SA7S`. The browser sent `Corrected first exchange.`. The terminal received it,
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

`src/ai/relayClient.ts` now treats the response to a successful mailbox push as follows:

1. For `200`, prefer a schema-valid JSON `generation`.
2. If the JSON is missing, empty, malformed or invalid, use a validated
   `X-Lacuna-Generation` header.
3. Trust a validated `ETag` only for a legacy `204`; Vercel can rewrite ordinary `ETag` values on
   modern responses.
4. If the PUT rejects or no generation is trustworthy, throw `RelayPushOutcomeUnknownError`.

An unknown successful outcome is unsafe because the write may have committed. The session therefore
fails closed immediately and never retries the previous generation. This deliberately favours a
reconnect over duplicate or stale writes.

`src/ai/session/relay.ts` also makes reset recovery synchronous from the UI's perspective. Reset:

- invalidates the current polling epoch and detaches its queued mutations;
- clears local credentials and publishes `disconnected` before waiting for remote revocation;
- stops the claimed user item;
- restores the queued follow-up first, otherwise the existing draft, otherwise the active claimed
  prompt into the composer;
- prevents old pair/send/Stop/poll work from committing after reset.

`src/components/ai/AiPanel.tsx` exposes an accessible `Disconnect terminal` action while connected.
It does not replace the existing Stop or Close controls.

Regression coverage is in:

- `src/ai/relayClient.test.ts` — JSON success, header fallbacks and unknown successful outcomes.
- `src/ai/session/relay.messages.test.ts` — unknown outcomes disconnect without a stale retry.
- `src/ai/session/relay.test.ts` — reset before slow revocation, epoch invalidation and draft recovery.
- `src/components/ai/AiPanel.test.tsx` — connected Disconnect action without Stop/Close side effects.

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

## Tomorrow's verification procedure

1. Check out and pull `codex/ai-relay-response-recovery-hotfix`, then inspect the PR, CI and
   CodeRabbit results. Fix concrete failures only; do not widen the slice.
2. Wait for the PR's Vercel preview deployment.
3. Use a fresh, unique deployment origin. Do not reuse the public alias or an old preview because
   local storage and service-worker state would contaminate the result.
4. In Settings, enable AI, open the panel and choose `Connect terminal`.
5. Build the companion if necessary with `bun run build:ai-mcp`.
6. Connect the terminal with the pairing code. For a direct Bun smoke test from the repository root,
   replace `PAIRING_CODE` and run:

   ```sh
   bun -e 'import { TerminalAiClient } from "./tooling/lacuna-ai-mcp/src/client.ts"; import { HttpTerminalRelayTransport } from "./tooling/lacuna-ai-mcp/src/relayTransport.ts"; const client = new TerminalAiClient({ transport: new HttpTerminalRelayTransport() }); await client.connect("PAIRING_CODE", undefined, { name: "Live test" }); console.log("CONNECTED"); const message = await client.waitForMessage(25000); console.log("MESSAGE", message); if (message.type !== "message") throw new Error("No message received"); await client.reply(message.runId, message.messageId, "Live exchange passed."); console.log("REPLIED"); await new Promise((resolve) => setTimeout(resolve, 5000)); await client.disconnect(); console.log("DISCONNECTED");'
   ```

7. Send a first browser message. Assert the browser transcript receives `Live exchange passed.`, the
   user message is completed, its text does not remain as a recovered draft, and no stale-generation
   alert appears.
8. Assert the clean terminal disconnect changes the browser to disconnected while retaining the
   transcript.
9. Pair again in the same tab and complete a second message/reply exchange. This checks same-tab
   session replacement, not cross-tab ownership.
10. Pair once more, send a prompt, let the terminal claim it, then kill the terminal without calling
    disconnect. Use `Disconnect terminal` in the panel. Assert the UI resets immediately, the claimed
    prompt returns to the composer, and a new terminal can pair successfully.
11. Merge only after both exchanges and dead-terminal recovery pass on the fresh deployed origin.

If the first exchange still fails, collect the exact deployment URL, pairing/session identifier,
browser-visible state, terminal output and relay request sequence before changing code. A `200`
server log alone is not evidence that the browser accepted the response.

## Completion criteria

- `bun run typecheck` passes, including web and Electron projects.
- Focused AI relay/session/panel tests pass without weakened assertions.
- Focused ESLint, Prettier check and `git diff --check` pass.
- A fresh deployed origin completes two connect/send/reply/disconnect cycles in one browser tab.
- Killing a claimed terminal and using manual Disconnect immediately recovers the prompt and permits
  re-pairing.
- No `412` stale-generation alert appears during those single-tab scenarios.
- Only then merge the PR.

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
