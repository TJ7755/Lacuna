# Arc 14, slice 2 — Study entry points

**Status:** delivered

**Baseline:** `master` at `df75237`

**Audit:** [Lacuna UI flow catalogue](../APP-FLOWS.md)

## Outcome

A learner has one generic Study action for each course, can deliberately choose due review,
course progression, starting the next lesson or relevant assessment revision when those alternatives exist,
and can discover cross-course due review without knowing the hidden `/learn` route.

This is an entry-flow repair. It does not change FSRS, card eligibility, curriculum progression,
practice activation, assessment coverage or revision allocation.

## Product decisions

1. **The course conductor remains authoritative.** Generic Study enters
   `/course/:courseId/study`; it does not recreate scheduling decisions in the page or dashboard.
2. **One generic course action.** Course headers show **Study**, not separate **Study now** and
   **Review due cards** actions. Course-card Study controls enter the same conductor.
3. **Alternatives are explicit only when real.** At conductor entry, an eligible due review is
   offered alongside the next curriculum step. A lesson with no due review is labelled **Study
   ahead**. Relevant assessments remain named revision alternatives.
4. **Specific path objects stay direct.** Selecting a visible manual Practice node or assessment
   continues to enter that exact flow. These are explicit objects, not duplicate generic actions.
5. **Cross-course review is visible.** The existing `/learn` route appears in the default sidebar
   as **Review today**. Existing sidebar preferences gain the new default through the current
   preference-merging behaviour.
6. **Ordinary language wins.** User-facing global-session copy says **Review today** and
   **courses**, not a bare “Today” or the retired “decks” terminology.

## Existing systems to extend

- `CourseStudyFlow` already owns generic, due-review, manual-node and assessment entry queries.
- `planNextStudyStep` and `CourseStudyFlowSnapshot` already expose the next curriculum step,
  recurring due count and applicable assessment options.
- `CoursePath`, inline `LessonView` and `CourseCard` already route to the conductor.
- `DEFAULT_NAV_ITEMS` already migrates newly-added navigation defaults into stored preferences.
- `/learn` already implements the cross-course review session.

No new route, scheduler, queue, persisted preference or study-mode abstraction is needed.

## Implementation tasks

1. Replace the paired course-header actions with one **Study** action on multi-lesson and inline
   single-lesson course surfaces.
2. Make generic conductor entry present genuine alternatives before starting a session:
   curriculum progression, starting the next lesson, due review and relevant named assessment revision.
3. Preserve direct `review=due`, `practiceNode` and `assessmentId` entry behaviour.
4. Add **Review today** to the default configurable sidebar and route it to `/learn`.
5. Align Learn header, Help, welcome and affected flow copy with the new labels.
6. Update focused tests, `docs/APP-FLOWS.md`, `docs/SPEC.md`, `docs/CHANGES.md`, the website
   checklist and the current roadmap.

## Tests

Automated coverage must prove:

1. Generic Study offers curriculum progression and due review when both are eligible.
2. A lesson is labelled **Start** when no due review competes with it.
3. Named assessment revision remains an explicit alternative.
4. Direct due-review, manual-Practice and assessment queries still enter their exact targets.
5. Course headers no longer expose a second generic due-review action.
6. New and existing sidebar preferences expose **Review today** at `/learn` without losing saved
   order or visibility.

Run focused tests first, then lint, all TypeScript targets, the build and the complete test suite.

## Browser verification

Check the production preview at desktop and iPhone SE widths:

1. Confirm Course Path, inline single-lesson courses and dashboard course cards expose one generic
   Study action.
2. Confirm generic Study presents the applicable curriculum, due-review and assessment choices.
3. Confirm direct Practice-node and assessment entry still bypasses the generic choice.
4. Confirm **Review today** is visible in the default sidebar and opens the cross-course session.
5. Confirm saved sidebar customisation gains the new item without resetting existing choices.
6. Check light, dark and reduced-motion presentation, including the outstanding reduced-motion
   course-creation check from slice 1.

## Success criteria

1. The learner never chooses between two generic course-header Study buttons.
2. Due review, course progression, starting the next lesson and named revision are distinct when they compete.
3. Manual Practice nodes and assessments retain direct, predictable entry.
4. Cross-course review is discoverable as **Review today**.
5. Scheduling and session semantics are unchanged.

## Delivery evidence

Delivered on 11 August 2026. Lint, all TypeScript targets, the production build and the full suite
of 202 test files and 1,764 tests passed. Production-browser verification passed at desktop and
iPhone SE widths in light, dark and reduced-motion presentation. It covered Course Path, inline
single-lesson and dashboard Study entry, Start, Review today, direct assessment revision and
stored-sidebar preference migration. Direct manual-Practice entry is covered by the focused
component test because the production fixture has no active manual node.

## Out of scope

- FSRS, eligibility, grading, progression or revision-model changes.
- Practice-node authoring or stored filter management.
- Course-tab and authoring-control consistency.
- Import, export, backup or recovery language.
- Removing legacy Learn routes that remain valid direct session endpoints.
