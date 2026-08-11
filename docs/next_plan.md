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

### Arc 14, slice 1 — Course setup and assessment language

**Status:** in progress.

Make the first real course setup coherent: collect the course name and primary exam date in
one flow, show the existing seven-day default instead of silently inventing it, and distinguish
the final exam from intermediate checkpoints.

The active implementation specification is
[Arc 14 — Course setup and assessment language](plans/arc-14-course-setup.md).

This is the only active product implementation plan. New roadmap work should not start until
the slice is delivered and its browser checks pass.

## Close-out queue

These are verification debts for delivered work, not feature arcs. Complete them alongside
or immediately after the active slice:

1. Run lines mode end to end with a real script scene.
2. Run image occlusion end to end with a real labelled diagram.
3. Run the classroom re-import merge on two isolated installations.
4. Visually verify MCP connection, grant and consent states in Electron.

Failures are fixed with focused regression coverage. Passing checks are recorded in the
relevant release evidence; they do not acquire another essay here.

## Next

After Arc 14 slice 1, continue the flow-simplification work identified by
[the UI flow catalogue](APP-FLOWS.md), in this order:

1. **Study entry points** — one primary Study action; explicit due review, lesson progression,
   study-ahead, manual-practice and assessment-revision alternatives; decide whether global
   Today is visible or removed.
2. **Practice-node management** — visible path authoring, one coherent editing model, and clear
   automatic/manual terminology.
3. **Course navigation and authoring consistency** — course tabs from lesson views and stable
   card, sequence, occlusion, linking and import controls.
4. **Import, export and recovery language** — distinguish sharing, backup, card import, APKG,
   batch staging, archive, deletion and replacement before the user commits data.
5. **Consolidation and release verification** — execute the maintenance and production-browser
   work formerly described by Arc 13, then close the release checklist.

Only the next slice receives a detailed implementation plan. Later slices remain outcomes until
the preceding slice exposes the actual code and product constraints.

## Later candidates

These require a fresh product decision after flow simplification and release verification:

| Candidate | Current position | Decision gate |
| --- | --- | --- |
| Multi-device sync | Designed, not approved for implementation | Confirm encrypted relay operation and maintenance cost; use [the Arc 8 design](arc8-sync-plan.html) |
| Mobile reminders and PWA installation | Scoped only | Verify platform behaviour and whether reminders materially improve return rate |
| Progress receipts and encrypted relay | Detailed outline only | Identify a real tutor/parent reporting workflow before infrastructure work |
| Expanded MCP product surface | Foundation delivered; broad action inventory proposed | Prioritise concrete agent workflows instead of exposing every repository method |
| Item-family and generated-practice work | Research direction | Prove authored mark-scheme demand and define stable skill identity first |

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
