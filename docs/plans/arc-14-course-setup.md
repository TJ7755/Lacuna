# Arc 14, slice 1 — Course setup and assessment language

**Status:** ready to implement

**Baseline:** `master` at `ad13c0b`

**Audit:** [Lacuna UI flow catalogue](../APP-FLOWS.md)

## Outcome

A new user can create a named course, see and set its primary exam date, and arrive at the
first lesson without knowing that Lacuna internally represents the final exam as a
`CourseAssessment` record.

This is a flow repair. It does not change FSRS, assessment coverage, the course schema or the
seven-day default.

## Product decisions

1. **Lacuna remains exam-driven.** Every course has a primary exam date. An exam-optional mode
   would require new scheduling semantics and is outside this slice.
2. **The existing default remains but becomes visible.** New courses start with an exam date
   seven days after creation at 23:59 in the learner's current IANA time zone. The creation
   form shows that value and allows it to be changed before saving.
3. **Use ordinary language at the boundary.** The creation form says **Exam date**, not
   “assessment horizon” or “final assessment”. Course settings may continue to display the
   resulting **Final exam** alongside intermediate **Checkpoints**.
4. **A checkpoint is never presented as another way to set the primary exam date.** “Add
   checkpoint” means an intermediate dated assessment only.
5. **Keep creation compact.** This remains one modal, not a wizard. The form creates the
   course and its initial `Lesson 1`, then opens the course as it does today.

## Existing systems to extend

- `NewCourseForm` already owns named course creation and share-code import.
- `createCourse(name, opts)` already accepts `examDate` and `timeZone`, creates the final
  assessment atomically, and validates the instant.
- `defaultExamDate`, `getLocalTimeZone` and `DateTimePicker` already provide the required
  time-zone-aware default and control.
- The existing inline validation and toast patterns remain authoritative.

No schema migration, new repository method, new date component or parallel onboarding state is
needed. Building any of those would be redundant.

## Implementation tasks

1. Add local `examDate` and `timeZone` state to `NewCourseForm`, initialised once from
   `defaultExamDate()` and `getLocalTimeZone()` when the form mounts.
2. Add the existing `DateTimePicker` beneath Course name with the label **Exam date** and a
   short explanation that Lacuna schedules the course towards it.
3. Pass `{ examDate, timeZone }` to `createCourse`. Preserve the existing initial-lesson
   creation and navigation behaviour.
4. Validate the selected instant before starting persistence. Keep the modal open, associate
   the error with the date control, and focus the relevant control where the component contract
   allows it. Repository validation remains the final boundary.
5. Audit course settings and Help copy touched by this flow. Use **Final exam** for the primary
   assessment and **Checkpoint** for intermediate assessments; do not rename internal types.
6. Update the focused component tests, `docs/APP-FLOWS.md`, `docs/CHANGES.md` and any affected
   Help or specification text.

## Tests

Automated coverage must prove:

1. The creation form displays the seven-day, 23:59 local default.
2. Creating without changing it passes the visible `examDate` and `timeZone` to
   `createCourse` and still creates `Lesson 1`.
3. Changing the date passes the chosen instant without a time-zone shift.
4. Invalid or non-existent local times do not create a course.
5. Share-code import remains unchanged.
6. Keyboard submission does not fire while the date picker is handling its own keyboard input.

Run the focused tests first, then lint, all TypeScript targets and the complete test suite.

## Browser verification

Check the production preview at desktop and iPhone SE widths:

1. Open New course from both Dashboard and Sidebar.
2. Confirm the default exam date is visible without opening Course settings.
3. Change the date and create the course using pointer controls.
4. Repeat using the keyboard, including Escape and Enter behaviour.
5. Confirm the created course opens with `Lesson 1` and the same Final exam instant in Course
   settings.
6. Confirm the import tab still imports a share code and does not show creation-only fields.
7. Check light, dark and reduced-motion presentation.

## Success criteria

1. Course name and exam date are decided in one creation flow.
2. No hidden default is applied without being shown to the user.
3. Final exam and checkpoint wording is unambiguous on every surface touched by the change.
4. Existing imports, creation navigation and scheduling behaviour remain intact.
5. Focused and full automated checks pass, followed by the browser checks above.

## Out of scope

- Optional or undated courses.
- A multi-step onboarding wizard.
- Editing assessment placement, lesson coverage or exclusions during course creation.
- Changing the seven-day default.
- Study-entry, practice-node or broader navigation work from later Arc 14 slices.
- Any FSRS, grading, revision-allocation or schema change.
