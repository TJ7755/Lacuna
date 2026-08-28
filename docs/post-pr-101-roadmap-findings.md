# Post-PR #101 roadmap findings

**Date:** 28 August 2026

**Question:** After PR #101, what should happen next, and does that mean completing the AI/LLM
integration plan?

**Scope:** Local Git history, current planning documents, source and tests, plus the repository's
GitHub PR metadata. GitHub records PR #101 as merged into `master` at 13:15:50 UTC on 28 August 2026
as merge commit `5275266323b8cd16df68202bc3ef7dbda13fb1e6`. The local checkout was subsequently
fast-forwarded to that commit.

## Conclusion

Yes: the substantive product work already in progress is the AI sidebar plan, and PR #101 did not
finish it. PR #101 closed the live relay reliability and dead-terminal recovery slice. The current
product remains an encrypted chat transport which cannot read or mutate Lacuna learning data, use
the misconception-first preference as an instruction, or maintain learner memories
([`HANDOFF.md:16-25`](../HANDOFF.md#current-product-boundary),
[`docs/plans/ai-sidebar.md:18-21`](plans/ai-sidebar.md#outcome)).

The short close-out identified by this review was completed on 28 August 2026:

1. the roadmap and handoff now record the PR #101 merge and name the AI plan as the one active
   product plan;
2. the prompter completed and confirmed the P9 live two-/three-device sync pass; and
3. the next approved implementation work is therefore the AI plan, beginning with domain-tool
   execution, permissions and receipts, then teaching instructions and durable memories.

This closes the only recorded manual data-integrity gate before memory work depends on peer sync. It
also obeys the roadmap rule that only one product implementation plan is active at a time
([`docs/next_plan.md`](next_plan.md#roadmap-rules)).

## Evidence

### PR #101 is merged and is a transport close-out

GitHub records [PR #101, **Fix AI relay response and terminal recovery**](https://github.com/TJ7755/Lacuna/pull/101)
as merged, with no other open pull requests or issues at the time of this review. Its complete
post-merge check suite passed: application tests, typecheck, lint, relay, AI companion, production,
browser smoke, Vercel deployments and CodeRabbit review.

The PR branch is the twelve commits after the PR #100 merge `2b4fdb2`, ending at `99332ba` (`Close
live AI relay verification`). Its diff is confined to relay acknowledgement/recovery, AI-session
reset behaviour, dead-terminal disconnection, tests and supporting documentation; it does not add
domain actions, instructions or memory persistence. The recorded live gate passed two browser
exchange cycles, terminal replacement and the automated relay/companion/Playwright checks
([`HANDOFF.md:194-221`](../HANDOFF.md#final-live-verification-on-28-august-2026)).

The handoff's remaining instruction was only review/CI and merge, which the prompter says has now
happened ([`HANDOFF.md:223-237`](../HANDOFF.md#completion-criteria)). There is therefore no remaining
PR #101 implementation slice.

### The broader AI plan is explicitly unfinished

The newer plan, written on 27 August, marks itself **in progress** and says encrypted pairing/chat is
delivered while domain actions, teaching instructions and durable memories remain future work
([`docs/plans/ai-sidebar.md:1-4`](plans/ai-sidebar.md#ai-sidebar--one-week-usable-prototype)). Its
acceptance target still lacks scenarios 3, 4 and 6: real repository actions with approval/receipts,
misconception-first teaching with memories, and sync-safe durable memory behaviour
([`docs/plans/ai-sidebar.md:43-60`](plans/ai-sidebar.md#remaining-prototype-acceptance-target)).

This is not merely stale prose. The terminal companion currently registers exactly four chat
transport tools — `connect`, `wait_for_message`, `reply` and `disconnect`
([`tooling/lacuna-ai-mcp/src/server.ts:39-100`](../tooling/lacuna-ai-mcp/src/server.ts)). The existing
domain `TOOL_REGISTRY` is substantial but separate
([`src/mcp/registry.ts:41-52`](../src/mcp/registry.ts)); the plan explicitly says the delivered
companion does not call it and requires one shared, transport-neutral executor for the future web
path ([`docs/plans/ai-sidebar.md:221-240`](plans/ai-sidebar.md#planned-shared-tool-execution)).

The protocol already contains forward-looking action receipt and approval shapes
([`src/ai/protocol.ts:318-375`](../src/ai/protocol.ts)), but the plan correctly labels current approval
rendering as fixture-only and the activity capsule as undelivered
([`docs/plans/ai-sidebar.md:378-405`](plans/ai-sidebar.md#ui-and-interaction-specification)). No
`AgentMemory` store, memory tools or schema-v25 implementation exists; the plan lists those modules
under **Planned modules** ([`docs/plans/ai-sidebar.md:429-465`](plans/ai-sidebar.md#implementation-surfaces)).

### The roadmap contradiction was reconciled

Before this close-out, `docs/next_plan.md` had last been reviewed on 20 August, a week before the AI
plan was written. It said P9 manual sync verification was next and that no other arc was in flight
([`docs/next_plan.md:1-6`](next_plan.md#lacuna-roadmap),
[`docs/next_plan.md`](next_plan.md)). The AI plan dated 27 August explicitly said it was in progress.
The roadmap and handoff now record PR #101 and P9 as complete and the AI sidebar as the single active
plan.

`HANDOFF.md` now preserves the relay investigation as a closed operational record rather than
claiming PR #101 remains open.

## Recommended remaining AI slices

1. **Domain actions and trust:** extract the shared executor, extend the relay/session protocol for
   tool calls, enforce scope/write grants and one-shot destructive approval, render genuine action
   receipts, and prove Stop/replay boundaries. This corresponds to the plan's Day 4–5 work
   ([`docs/plans/ai-sidebar.md:533-561`](plans/ai-sidebar.md#day-4--integration-and-high-value-actions)).
2. **Teaching and memory:** add the versioned instruction bundle, misconception-first routing,
   `AgentMemory` schema/repository/tools/inspector, backup, merge, tombstones and sync. This is the
   plan's Day 6 work and planned memory model
   ([`docs/plans/ai-sidebar.md:244-340`](plans/ai-sidebar.md#planned-memory-model--not-implemented),
   [`docs/plans/ai-sidebar.md:563-572`](plans/ai-sidebar.md#day-6--teaching-and-memory)).
3. **Continuity and final acceptance:** activity/Stop capsule, narrow-screen active-run continuity,
   disable/replacement/sync lifecycle, scenarios 3/4/6, full browser matrix and final reviews
   ([`docs/plans/ai-sidebar.md:574-640`](plans/ai-sidebar.md#day-7--browser-quality-gate-and-review)).

Do not call this “just finishing the LLM integration”. The transport is done; the remaining work is
the dangerous half: repository writes, consent, durable learner state and cross-device convergence.
It should be sliced and reviewed accordingly.
