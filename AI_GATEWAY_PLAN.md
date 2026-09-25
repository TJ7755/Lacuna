# Built-in AI Gateway sidebar

Draft implementation plan — 22 September 2026. The prompter authorised full implementation
and a filed PR on 25 September 2026, with zero paid inference spend and a live key to follow.

Implementation started on `codex/ai-gateway-spike` on 24 September 2026. Phase 1 now has a
versioned, bounded request/event contract and a loopback-only AI SDK 7 streaming harness.
The harness requires a Gateway key, a model ID and a separate local bearer token. Its tests
use an SDK mock model. Synthetic live text and tool-call requests succeeded through
OpenRouter's free route. The deployed preview also answered a course-card count using live
local read tools and committed one card after the in-app approval. A later write reused that
course's granted write scope; rejected writes and Stop remain unverified.
The branch now has `/api/ai/` functions, an opt-in sidebar path, Electron connectivity and
server-side admission controls. Browser fixtures cover the flow; a capped, zero-credit
OpenRouter test key is configured only on the preview branch.

## Outcome

A learner enables built-in AI, opens Lacuna's existing sidebar and talks to an assistant
without configuring or keeping an external MCP client running. The assistant can explain
material, find relevant local content and propose course/card changes through existing
domain tools. Existing in-app approvals remain authoritative.

Deliver this for the web app and packaged Electron app. Keep study data local, AI optional
and the current external-client connection available. Do not add marking, Jev, automatic
grading, new scheduling behaviour, uploads, a model marketplace or a second chat interface.

## Existing foundations

- `src/ai/session/types.ts` defines the UI-facing `AiSession`, snapshots and commands.
  It currently assumes companion pairing/connection and completed assistant messages;
  hosted readiness and incremental responses need deliberate extensions.
- `src/ai/session/EnabledAiRuntime.tsx` selects local IPC on Electron and the encrypted
  relay on web. It loads lazily and registers with database replacement lifecycle handling.
- `src/components/ai/` already contains the panel, conversation, composer, approval card,
  activity and receipts. Connection copy currently depends on Electron detection rather
  than a provider capability; change that distinction without redesigning the sidebar.
- `src/ai/toolSession.ts` owns tool validation, grants, exact approvals and replay receipts,
  using `src/mcp/registry.ts` and `src/mcp/executor.ts` for domain operations.
- `src/ai/instructions.ts` provides teaching instructions, grounding rules and learner-memory
  behaviour. Reuse these; adapt companion-specific invocation wording for a hosted driver.
- `src/ai/settings.ts` currently stores AI enablement and teaching preference, not a provider.
- `vercel.json` deploys a Vite static app. A hosted inference endpoint is new server work.
  Web and Electron CSP currently allow the relay, not an arbitrary inference service.

Inspect the corresponding tests and current persistence paths before implementation.
Do not use historical plans as an implementation checklist.

## Recommended architecture

```text
Existing AI sidebar
        |
Hosted implementation of AiSession
        | HTTPS: bounded conversation, instructions and tool definitions/results
Lacuna inference service (authentication, quotas, request validation)
        |
Vercel AI Gateway -> selected model
        |
Streamed text or completed tool request
        |
Local AiToolSession -> existing approval UI -> local domain executor
        |
Bounded tool result -> next inference request -> final response
```

Use a thin Vercel Functions backend with the AI SDK for model calls. Prefer hosting under
the existing web deployment's `/api/ai/` namespace, provided deployment inspection confirms
this works with current build configuration. Electron uses the same deployed HTTPS API.
Do not migrate the frontend to another framework. Keep server modules separate from the
browser import graph and give them explicit typechecking, testing and deployment coverage.

The backend holds `AI_GATEWAY_API_KEY`; it never appears in a `VITE_*` variable, browser
bundle, desktop package or client log. Provider credentials and billing policy are server
configuration. The client cannot choose arbitrary models, endpoints or output budgets.

Keep the local session as the authority for tool execution. The server generates tool calls
but does not execute Lacuna database operations. Avoid holding a function open while a learner
considers an approval: end that inference step, resolve the tool locally and send a continuation.
Use the SDK's supported tool-call/result messages, with a small versioned transport adapter;
do not make SDK chat state a second authoritative conversation store.

## Access and cost policy

Recommended initial release: a limited beta with revocable, individually issued access
credentials and a shared server budget. This avoids introducing full user accounts just
to validate the feature. Exchange a beta credential for a scoped, expiring session token;
store only credential hashes and minimal usage records server-side. Keep device credentials
out of study backups and peer sync. Resolve web and Electron storage using existing platform
conventions; never distribute a shared application secret inside the app.

Before public access, explicitly choose an enrolment/identity policy. CORS, an installation
ID or an IP address alone is not authentication. Beta access is a proposed rollout choice,
not a requirement for creating or using ordinary offline Lacuna data.

Enforce request size, input/output token limits, turn-step limits, per-credential rate limits,
concurrent-run limits and a global spend ceiling on the server. Quota reservations must be
atomic across function instances and account for in-flight calls; reconcile actual usage and
expire abandoned reservations. Reuse suitable deployed infrastructure only after inspection;
do not implement budgets with process-local counters. Add a Gateway key budget as a second
limit, plus an operator kill switch. Treat budget exhaustion as a normal unavailable state.

Select one default model and one fallback by testing actual Lacuna conversations and tool use.
Prefer inexpensive or free options when they pass. Require streaming and reliable tool calling,
and check provider data handling, availability and pricing at selection time. A reasoning model
can be used, but constrain its output/reasoning budget. Do not display raw reasoning traces.

Free promotions are not a durable service budget. The Gateway's monthly credit allowance is
separate from models whose input and output prices are genuinely zero. Recheck the live Gateway
catalogue before each route selection; do not assume an OpenRouter `:free` model exists on
Gateway. OpenRouter's own `openrouter/free` route is an optional fallback. Restrict automatic
fallback to the approved model list
and cost ceiling, and only retry before visible output or reconcile a failed step explicitly.
Never replay an entire tool-bearing turn blindly after a provider failure.

## Conversation, data and tool semantics

1. Create a local conversation/run ID when the learner sends a message. Admit one active run
   per conversation; preserve the existing queued-follow-up behaviour.
2. Send a bounded history and the shared teaching instructions. Retrieve relevant local data
   through existing bounded tools rather than exporting the database. Preserve course/global
   memory scope and avoid putting study content in telemetry.
3. Stream into one assistant item with an explicit in-progress/completed/interrupted state.
   Batch UI updates and persist at bounded checkpoints rather than on every token. Preserve
   tool-call/result associations when trimming history; never truncate JSON midway.
4. Execute only a fully assembled, schema-valid tool call. Pass it through `AiToolSession`
   with a stable run/call identity; use the existing grants, approval digests and receipts.
   A model-supplied claim that an operation was approved has no authority.
5. For approval-required calls, pause continuation and show the existing approval card.
   Revalidate the run and exact inputs after approval. Return rejection or the actual local
   result to the model, and show only committed operations as successful receipts.
6. Stop aborts the request where possible and invalidates subsequent chunks, calls and replies
   locally. An already committed write remains committed; cancellation must not claim rollback.
7. Retry must distinguish inference from local mutations. Reuse a completed tool receipt only
   for the same validated call; reconcile interrupted work before generating another mutation.
8. Closing the panel may preserve the active run under current lifecycle conventions. Disabling
   AI, switching provider or replacing the database must dispose/invalidate its runtime and
   block late effects. Reload marks an unfinished run interrupted; do not silently restart it.
9. Establish ownership for hosted conversations across browser tabs, using an explicit lease
   or lock with recovery. The existing web companion has no cross-tab ownership guarantee;
   do not copy that gap into hosted execution or refactor unrelated transports to solve it.

Keep the existing external client's transcript and data semantics intact. Define hosted
transcript persistence alongside current stores, with migration only if required; never add
another independent transcript database. Document whether a provider switch starts a fresh
conversation, and do not forward an old conversation to a different provider automatically.

Hosted inference sends selected content in plaintext to the backend/model over TLS. This is
different from the opaque encrypted relay. Explain that briefly on first enablement, and
document provider retention separately from local transcript persistence. Do not promise
end-to-end encryption to the model or zero retention without provider evidence.

## Sidebar and settings

- Add a provider preference for built-in AI versus the existing external client. Preserve
  existing users' external-client setting through migration; keep AI disabled by default.
- Make setup and connection actions capability-driven. Built-in mode shows availability,
  authentication and quota states, without companion pairing instructions.
- Keep the composer, source links, Markdown rendering, approvals, activity and receipts.
  Add incremental text and a clear interrupted response state using existing visual tokens.
- Retain Stop, retry and follow-up behaviour. Handle offline, expired access, quota exhaustion,
  provider errors and reconnects with brief actionable copy and preserved drafts.
- Follow `docs/frontend-design.md`, keyboard/focus conventions, reduced motion and existing
  responsive layout. Avoid announcing every streamed token to screen readers.
- Keep the hosted stack behind existing lazy AI boundaries so disabled AI does not increase
  first-paint work or break cached offline study.

## Implementation sequence

### 1. Contracts and bounded inference spike

Inspect current server/deployment infrastructure, session persistence and test conventions.
Define the hosted request/event schema, version compatibility, identifiers, limits and error
types. Select an SDK version compatible with this repository and verify the model supports
real tool calls. Prove a streamed response through the backend in a disposable environment.
The spike uses no new product surface and does not expose an unauthenticated public proxy.

### 2. Backend and admission controls

Implement token validation, durable quota admission, bounded model requests, streaming,
timeouts, cancellation, safe errors and minimal usage reporting. Configure default/fallback
models and maximum spend server-side. Test expiry, revocation, concurrent quota reservations,
oversized requests, model override attempts, provider failure and deployment timeout behaviour.

### 3. Hosted session and local tool loop

Add the hosted `AiSession` implementation and transport adapter under `src/ai/`. Extend only
the shared types that hosted readiness and streaming require. Wire provider selection into
`EnabledAiRuntime`, preserving replacement participation and lazy loading. Reuse the tool
session and instruction builder, with tests for full read/write/approval continuations.
Extract distinct responsibilities into modules rather than enlarging current session files.

### 4. Sidebar integration and desktop connectivity

Update settings and connection presentation, streaming messages and recovery states. Configure
the exact service origin in web/Electron policy and deployment CORS. Packaged Electron origins
may differ from web origins: verify the actual request path and authentication, rather than
broadly accepting origins or treating CORS as access control. Test the packaged runtime on
the managed-device network as well as browser development.

### 5. Verification, documentation and limited rollout

Complete the checks below, document service operation and enable the limited beta only after
the deployment-specific access and spend decisions are resolved. Retain a server-side disable
switch and a client path back to the external companion. Rollback must preserve study data,
drafts and existing receipts; it must not require reversing a database migration.

## Required evidence

Every behaviour change needs an automated regression that fails on the merge-base and passes
on the proposed head, without weakened assertions. Use a disposable worktree for baseline
evidence. Include:

- Streamed text updates one message; completion and interrupted state survive the specified
  persistence lifecycle; late chunks after Stop are ignored.
- A local read returns grounded information; a write waits for approval; denied or altered
  input cannot execute; an accepted write produces exactly one mutation and receipt.
- Duplicate delivery/retry, parallel tool requests, cancellation during approval and a provider
  failure after a committed write cannot repeat mutations or claim unperformed work.
- Disable, provider switch, reload, cross-tab contention and full replacement block stale effects.
- Invalid/expired access, quota exhaustion and provider/network failures preserve the draft
  and leave normal study available. Concurrent requests cannot overspend admitted allowances.
- Existing local IPC and relay session tests remain green; old settings retain their provider.
- No server credentials appear in built web assets, logs or packaged desktop output.

Run focused unit/component/backend tests, applicable typechecks and lint, then the production
build. Add browser end-to-end coverage and packaged Electron coverage for the hosted flow.
Validate cold offline Cards reload and AI-disabled loading boundaries. Visually inspect the
existing sidebar in light/dark modes, narrow layouts, keyboard use and long streamed replies.

Finally perform a controlled live-model smoke test: a grounded answer, a read, an approved
write, a rejected write and Stop. Record model/provider, latency, token cost and receipts;
transport fixtures alone do not establish that a real model completes the workflow. Use
disposable study data and a capped test credential.

Update `docs/SPEC.md` and the relevant spec pages, `docs/desktop.md`, README and
`docs/CHANGES.md` when implementation lands. Add durable operational lessons to `MEMORIES.md`
only when actually learned. This draft itself needs no application changelog entry.

## Decisions and deployment checks

- Confirm limited-beta credential enrolment, issuance/revocation and the eventual public
  access policy; no full account system is assumed by this plan.
- The maintainer chose zero paid inference spend and delegated usage caps. Current defaults are
  50 steps per learner per day, 600 per month and 1,000 globally per day. Model calls use only
  pinned free routes; a Gateway credit allowance does not authorise paid routes.
- Confirm durable quota store and secrets against the existing Vercel web project. Pinned
  OpenRouter Nemotron Ultra and Gemma 4 free models, OpenRouter's free router,
  Gateway free and Gemini free-tier routes are configured in that order, subject to their
  specific free-usage checks. Confirm their actual tool-call behaviour with a live key.
- Confirm the selected providers' retention/training policy and corresponding enablement copy.

These decisions do not block implementing and reviewing local contracts or tests, but paid
credentials, live model calls and deployment must stay within explicitly authorised limits.

## Primary references

Checked while drafting; recheck the installed SDK and live service configuration before coding.

- [AI Gateway pricing](https://vercel.com/docs/ai-gateway/pricing)
- [AI Gateway authentication](https://vercel.com/docs/ai-gateway/authentication-and-byok)
- [Gateway key budgets](https://vercel.com/changelog/budgets-for-api-keys-on-ai-gateway)
- [AI SDK tool calls and approvals](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [AI SDK streaming](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text)
