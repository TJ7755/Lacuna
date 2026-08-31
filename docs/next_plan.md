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

### v0.2.0 beta release

**Status:** in progress.

The next outcome is a real public beta, not another indefinite polish loop. Before the tag, the two
remaining trust-breaking boundaries are closed: live Card and Question exits require confirmation
and Simple sessions resume after interruption; Question authoring has complete recoverable drafts.
The release pipeline then builds Windows x64 and Linux x64 in GitHub Actions, adds a local macOS
arm64 build to the same draft, and publishes `v0.2.0` explicitly as a beta after the packaged
artefacts pass their platform checks.

### After the beta: maintainability consolidation

**Status:** ready.

The next maintenance slices, in order, are:

1. Make the full unit-test run quiet. Its assertions pass, but known React `act`, forwarded-ref,
   router-future and expected-boundary messages still bury new stderr failures.
2. Continue replacing `src/db/repository.ts` ownership clusters with directly imported persistence
   modules. Assessment persistence is the next candidate; transaction scope and rollback behaviour
   decide the seam, not a line-count quota.
3. Reassess `useLearnSession.ts` only after persistence ownership is clearer. Extract pure
   derivations or command adapters; do not split mutable session state across competing hooks.

Every slice must preserve behaviour, keep or improve the quality gates, and remove more code than it
adds where that does not damage clarity.

### Recently delivered

Optional exam dates and steady retention shipped in PR #115. Grading transparency, including the
hint-cost disclosure, shipped in PR #116. The [UX sticking-point audit](UX-STICKING-POINTS-2026-08-30.md)
remains the source for unselected product work; it is not an active implementation queue.

## Close-out queue

No manual verification debt remains. The prompter completed the real two- then three-device P9 pass
against the live sync relay on 28 August 2026 and confirmed it works. Multi-device sync P1–P9, Arc
14, the learn screen redesign and Arc 11 are delivered. Their detailed records remain in their
plans, `docs/SPEC.md`, `docs/CHANGES.md` and the historical roadmap.

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

These require a fresh product decision after the maintenance queue:

| Candidate                               | Current position                                | Decision gate                                                                   |
| --------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| Mobile reminders and PWA installation   | Scoped only                                     | Verify platform behaviour; return rate is not measurable before September 2026  |
| Progress receipts and encrypted relay   | Detailed outline only                           | Identify a real tutor/parent reporting workflow before infrastructure work      |
| Further MCP product expansion           | Delivered AI scope is deliberately bounded       | Prioritise concrete agent workflows instead of exposing every repository method |
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
