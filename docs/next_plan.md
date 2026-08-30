# Lacuna roadmap

Reviewed 30 August 2026.

This file is the current decision surface: what is active, what follows it, and what is
deliberately parked. Detailed specifications, implementation diaries and completed arcs do
not belong here.

The former 14-arc roadmap is preserved in
[the historical roadmap](archive/roadmap-2026-08-11.md). References in older code and
documentation to an Arc or numbered section of the former `next_plan.md` refer to that
archive.

## Now

### UX flow consolidation

**Status:** delivered.

The implementation plan is [UX flow consolidation](plans/ux-flow-consolidation.md), grounded in the
[UX map](UX-MAP.html). It repairs the audit's concrete contradictions: honest import and search
entry points, one Study/Author decision beside course content, path-native authoring, task-oriented
Settings, deliberate disclosure of scheduling internals, and confirmation before deleting a restore
point from Lacuna. The consolidated desktop and narrow-width browser gate passed first, followed by
the focused regressions, merge-base red-to-green proof, lint, all TypeScript targets, production
build, 2,582 unit tests and 15 web end-to-end scenarios.

### AI sidebar — final verification

**Status:** delivered.

The implementation plan is [the AI sidebar prototype](plans/ai-sidebar.md). PRs #96–#101 delivered
the optional desktop panel, encrypted relay pairing, chat-only terminal companion, cooperative Stop,
reload continuity and recovery from ambiguous relay writes or a dead terminal. PR #101 merged on
28 August 2026 as `5275266`; its full GitHub check suite and deployed-browser gate passed.

The completed implementation extends that transport through authored-content tools, a per-message
`teaching-v1` instruction bundle, durable learner-correctable memories, and coordinated data
replacement. Memories are bounded, inspectable, correctable, included in full backup and encrypted
peer sync, and exposed to AI only through explicit global or Course scope. Peer and recovery
application preserve the connected AI session; successful full replacement revokes and clears its
device-local state.

Browser scenarios 4 and 6 passed on 28 August 2026. The teaching run stored an uncertain
misconception after approval, confronted it with a failed prediction, resolved it from learner
evidence and tested transfer. The lifecycle run preserved the terminal and transcript across a
focus-triggered peer deletion, marked the stale Course receipt **Unavailable**, then proved that a
full backup replacement disconnected and cleared the AI session.

Lacuna remains model- and harness-agnostic. This is a terminal MCP integration, not an embedded LLM
provider or permission to add model credentials to the app.

## Close-out queue

No verification debt remains. The prompter completed the real two- then three-device P9 pass against
the live sync relay on 28 August 2026 and confirmed it works. Multi-device sync P1–P9 is delivered.
Arc 14, the learn screen redesign and Arc 11 are also delivered. Their detailed records remain in
their plans, `docs/SPEC.md`, `docs/CHANGES.md` and the historical roadmap.

## Deployment status

Recorded 12 August 2026. Lacuna is not yet in real use: the prompter revises with other tools, and
this summer's work is to polish Lacuna for genuine use from the start of the 2026–27 academic year.
There is currently no irreplaceable study data in the database.

This sequences the work below, and both consequences are easy to get backwards.

Work touching data integrity — destructive schema migrations, storage cutovers, and backup, restore
and merge behaviour — is safest now, and that window closes permanently once a term of real revision
history exists. Prefer it to work that can be done at any time.

Work whose payoff is measured in observed usage cannot report before September 2026. Do not schedule
a usage experiment as though it can return an answer this summer, and do not treat an empty review
corpus as a problem to be engineered around.

## Later candidates

These require a fresh product decision after the current AI sidebar plan:

| Candidate                               | Current position                                | Decision gate                                                                   |
| --------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| Mobile reminders and PWA installation   | Scoped only                                     | Verify platform behaviour; return rate is not measurable before September 2026  |
| Progress receipts and encrypted relay   | Detailed outline only                           | Identify a real tutor/parent reporting workflow before infrastructure work      |
| Further MCP product expansion           | Current AI plan is deliberately bounded         | Prioritise concrete agent workflows instead of exposing every repository method |
| Item-family and generated-practice work | Research direction                              | Prove authored mark-scheme demand and define stable skill identity first        |
| Prediction calibration harness          | Considered 12 August 2026 and deferred; no data | A real corpus cannot exist before September 2026; see below                     |

### Calibration harness — deferred, not rejected

`docs/scientific-assessment.md` §5 names calibration measurement as the highest-value scientific
step. It was considered on 12 August 2026 and deferred, because there is no real review corpus to
measure: a harness built now would produce its first genuine answer no earlier than the 2026–27
academic year, which fails roadmap rule 6. See Deployment status above.

Deferring costs nothing. `ReviewLog.retrievabilityAtReview` is already an honest ex-ante prediction
and is included in full backups, so reviews recorded today remain fully analysable later. The gate is
a real corpus — roughly a thousand reviews, enough to populate short-interval horizon bins — not any
engineering prerequisite.

Two findings worth carrying forward are recorded in `MEMORIES.md`: review logs now carry a short
fingerprint of the FSRS `w` array that produced the prediction, and `tooling/short-term-memory/`
is not a precedent for a Lacuna-data harness. Two methodological questions remain unanswered and should be settled before building
anything: whether a scheduler can be validly evaluated on review data whose timing it chose, and
whether long-horizon exam-day projection is measurable at all from observed intervals.

## Parked

Arc 11 is formally delivered. Its deferred ideas are new proposals, not unfinished Arc 11 work.

- Accounts, a Lacuna-hosted cloud service and live collaboration.
- Streamable HTTP MCP transport and a standalone `npx lacuna-mcp` package.
- OCR for image occlusion and waveform trimming for audio.
- Scaffold items, tuple answers, cursor-aware fraction entry, structure-aware equation editing,
  optimal scheme-line matching and LLM grading.
- Experimental prototypes listed in the historical roadmap appendix unless separately approved.

## Roadmap rules

1. `docs/next_plan.md` stays below roughly 200 lines.
2. Completed behaviour moves to `docs/SPEC.md`; user-visible changes move to
   `docs/CHANGES.md`; historical rationale stays in the archive or Git history.
3. One product implementation plan is active at a time.
4. Status is one of **proposed**, **ready**, **in progress**, **blocked** or **delivered**.
5. A delivered plan records only remaining manual verification here. It does not retain its
   task-by-task implementation diary in the current roadmap.
6. New infrastructure requires a named user workflow and an explicit maintenance decision.
