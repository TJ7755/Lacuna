# Lacuna roadmap

Reviewed 31 August 2026.

This file is the current decision surface: what is active, what follows it, and what is
deliberately parked. Detailed specifications, implementation diaries and completed arcs do
not belong here.

The former 14-arc roadmap is preserved in
[the historical roadmap](archive/roadmap-2026-08-11.md). References in older code and
documentation to an Arc or numbered section of the former `next_plan.md` refer to that
archive.

## Now

### Optional exam dates and steady retention

**Status:** ready.

QW-7 in the [UX sticking-point audit](UX-STICKING-POINTS-2026-08-30.md) is the remaining essential
quick win. Course creation currently invents an exam seven days away when the learner has none. The
next slice must make that choice explicit: either a dated exam objective or steady long-term
retention. This is a scheduling, assessment and persistence contract, not permission to make the
date input nullable and hope the rest of the application develops telepathy.

The implementation must preserve backup, share, sync and existing-database behaviour and prove the
new scheduling semantics at their public boundaries. This work takes precedence while the database
still contains no irreplaceable study history.

### Grading transparency

**Status:** proposed.

EH-1 and IM-2 follow QW-7. The learner should see the inferred grade and resulting interval after an
answer, receive one concise disclosure that response time affects silent grading, and see the cost
of a hint when requesting it. The grading algorithm itself does not change.

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
