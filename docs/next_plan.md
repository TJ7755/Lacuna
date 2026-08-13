# Lacuna roadmap

Reviewed 11 August 2026.

This file is the current decision surface: what is active, what follows it, and what is
deliberately parked. Detailed specifications, implementation diaries and completed arcs do
not belong here.

The former 14-arc roadmap is preserved in
[the historical roadmap](archive/roadmap-2026-08-11.md). References in older code and
documentation to an Arc or numbered section of the former `next_plan.md` refer to that
archive.

## Now

### Arc 14 — Flow simplification

**Status:** delivered.

Course setup, study entry points, practice authoring, lesson navigation, creation controls,
sharing/recovery language, archive management, destructive confirmations, shortcut conflicts,
and release automation now follow one coherent product model.

The delivered implementation specifications are
[course setup](plans/arc-14-course-setup.md),
[study entry points](plans/arc-14-study-entry-points.md), and
[the remaining flow repairs](plans/arc-14-remaining-slices.md).

Arc 14 has no remaining slices.

### Learn screen redesign

**Status:** delivered.

The implementation plan is
[the learn screen redesign](plans/learn-screen-redesign.md): the study card view, its overloaded
header and swipe-to-grade safety, ahead of phone-primary use from the 2026–27 academic year.
Evidence for each fault was gathered in a browser pass on 12 August 2026 and is recorded in
that plan.

No verification debt remains. All three follow-ups are delivered; the last of them, an
unconditional study control above the fold on the dashboard, landed on 12 August 2026.

## Close-out queue

No Arc 14 verification debt remains. Lines mode, image occlusion, the two-install classroom merge,
and Electron MCP connection/grant/consent states were verified on 11 August 2026. Evidence and the
limits of no-vision browser automation are recorded in `docs/WEBSITE_TEST_CHECKLIST.md`.

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

## Next

### Multi-device sync — P3 in progress

**Status:** in progress.

Approved 13 August 2026. The execution plan is
[sync-implementation.html](plans/sync-implementation.html). P3 (schema v23, timestamps,
tombstones, backup version 10) is the authorised increment. P4 (pure merge module) is the
automatic successor and is not yet sliced. The relay remains gated on a hosting decision;
Electron starts unconfigured.

The paused Course/Deck boundary maintenance pass is documented in
[course-domain-boundary-follow-ups.md](course-domain-boundary-follow-ups.md). Schema v22 has
removed the hidden Deck and Folder stores; that pass is not an active product arc.

## Later candidates

These require a fresh product decision after the current sync increment:

| Candidate                               | Current position                                      | Decision gate                                                                                       |
| --------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Encrypted relay (sync P1/P2/P5–P7)      | Designed; not authorised                              | Confirm operation and maintenance cost; you host one Vercel Blob instance for yourself              |
| Mobile reminders and PWA installation   | Scoped only                                           | Verify platform behaviour; return rate is not measurable before September 2026                      |
| Progress receipts and encrypted relay   | Detailed outline only                                 | Identify a real tutor/parent reporting workflow before infrastructure work                          |
| Expanded MCP product surface            | Foundation delivered; broad action inventory proposed | Prioritise concrete agent workflows instead of exposing every repository method                     |
| Item-family and generated-practice work | Research direction                                    | Prove authored mark-scheme demand and define stable skill identity first                            |
| Prediction calibration harness          | Considered 12 August 2026 and deferred; no data       | A real corpus cannot exist before September 2026; see below                                         |

### Calibration harness — deferred, not rejected

`docs/scientific-assessment.md` §5 names calibration measurement as the highest-value scientific
step. It was considered on 12 August 2026 and deferred, because there is no real review corpus to
measure: a harness built now would produce its first genuine answer no earlier than the 2026–27
academic year, which fails roadmap rule 6. See Deployment status above.

Deferring costs nothing. `ReviewLog.retrievabilityAtReview` is already an honest ex-ante prediction
and is included in full backups, so reviews recorded today remain fully analysable later. The gate is
a real corpus — roughly a thousand reviews, enough to populate short-interval horizon bins — not any
engineering prerequisite.

Two findings worth carrying forward are recorded in `MEMORIES.md`: the missing FSRS weight-set
provenance on review logs, and the fact that `tooling/short-term-memory/` is not a precedent for
this work. Two methodological questions remain unanswered and should be settled before building
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
