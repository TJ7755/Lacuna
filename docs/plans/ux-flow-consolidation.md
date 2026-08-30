# UX flow consolidation

**Status:** in progress

**Baseline:** `master` at `f282a9c`

**Audit:** [Lacuna UX map](../UX-MAP.html) ([machine-readable register](../UX-MAP.json))

## Outcome

Repair the audit's concrete contradictions without treating all fourteen recommendations as an
implementation backlog. The resulting product has honest import/search labels, one authoring-mode
decision beside course content, task-oriented settings, progressive disclosure for scheduler
internals, path-native checkpoint and Manual practice authoring, and explicit confirmation before
a restore point is removed from Lacuna.

This plan does not merge Questions into the course conductor, build a single data-transfer flow, or
replace working contextual authoring controls with an extra modal.

## Product decisions

1. **Import links name and reach the real job.** A course import opens the existing course-import
   flow. Card-file import is presented only after a course context exists; onboarding does not send
   a labelled import action to an unrelated Settings landing page.
2. **Quick search and Search content are different surfaces.** The compact overlay is Quick search;
   the full page is Search content. Neither is described as a command surface unless it executes
   commands.
3. **Study and Author are workspace modes.** The course-owned persisted mode remains authoritative,
   but its single user-facing decision sits beside course/lesson content. Course Settings does not
   duplicate that choice.
4. **Add content stays contextual.** Existing direct shortcuts remain where they save a step. Their
   container and language are made consistent; no universal chooser is inserted before every
   authoring action.
5. **Path objects are authored on the path.** Checkpoints and Manual practice nodes can be created
   and edited where their placement is visible. Detailed scheduling and coverage continue to reuse
   the existing editors rather than acquiring a second model.
6. **Settings are grouped by user job.** Ordinary study behaviour appears before implementation
   details. FSRS parameters and optimisation are disclosed deliberately as Advanced scheduling,
   preserving stored values and deep links.
7. **Restore-point deletion is explicit.** Existing snapshot-and-Undo flows remain unchanged.
   Deleting an Automatic backup from Lacuna requires confirmation. Folder-mirrored backup files are
   outside that deletion and remain available for manual import.

## Verification order

After all implementation and documentation changes are complete:

1. run one consolidated browser pass across desktop and narrow widths;
2. fix browser failures and repeat only the affected browser scenarios;
3. then run focused regression tests, lint, all TypeScript targets, the production build and the
   complete automated suite.

This ordering is deliberate: later UI changes must not invalidate an earlier browser pass, and the
ordinary test suite must not be repeatedly rerun while browser-visible failures remain.
