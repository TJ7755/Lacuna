# Direction C: next-session brief

Written 6 October 2026 after the visual audit on `redesign/direction-c`, checkpoint
`e0dfb147`. This records the prompter's requested follow-up; it does not authorise
implementation of every proposed interaction. The current work queue remains
[the roadmap](../next_plan.md).

## 1. Fix the expanded lesson toolbar first

The supplied screenshot shows the open lesson-name form beside enormous oval
Add practice, Add Practice Qs and Add checkpoint buttons. This remains unresolved.
`LessonView.tsx` places these controls in a flex row with default cross-axis
stretching; `Button` has a minimum height, so the taller form stretches its neighbours.

Keep closed actions at their normal height. Use a compact Add menu for the four
creation choices, then show the selected form in its own bounded area. Reuse the
existing `Menu`, `AddLessonControl`, editors and physical spring; do not create
another expansion system. Check the single-lesson and multi-lesson course views.
Use clear sentence-case labels; resolve the distinction between Practice and
Practice questions before changing names across the application.

Acceptance: sibling buttons retain their closed height throughout opening and
closing; text never scales; no clipping or horizontal page overflow at mobile
widths or enlarged text; Escape cancels and restores focus; reduced motion works.
Add a browser regression that fails on the current stretched layout and checks
intermediate animation frames as well as the settled form.

## 2. Make lesson management discoverable

Individual lesson rename, reorder and deletion already exist in
`pages/settings/LessonManagementSection.tsx`. Reuse `lessonRepository` rather
than implementing a second deletion path. Current deletion removes notes and
unassigns cards; it must not silently become card deletion.

Proposed next surface: a visible lesson actions menu on lesson headings and Path
rows, with Rename, Move up/down and Delete lesson. Right-click and the keyboard
context-menu key / Shift+F10 should open those same actions for the targeted lesson.
Keep the visible trigger available on touch devices and for discoverability.
Respect shared-course authoring locks and archived-course restrictions.

Acceptance: confirmation states the actual consequences; cancellation returns
focus; deleting the current lesson navigates to a valid course location and moves
focus deliberately; ordering, cards, notes and persistence retain existing coverage.
Investigate the existing snapshot/restore helpers before deciding whether to add Undo.

## 3. Consolidate menus and empty lesson screens

Electron already has `electron/applicationMenu.ts`; extend it only where an
existing application action belongs there. Audit visible toolbars, overflow menus
and desktop commands for consistent labels, shortcuts and enabled states. Decide
whether any web menu bar is needed after that inventory; do not add one automatically.
Custom right-click menus must not replace ordinary text/input editing menus.

Review the empty lesson shown in the screenshot: large empty Notes and Cards
panels, Manage (0), and study/practice availability. Prioritise adding the first
card, retain useful notes actions, and hide management controls that have no applicable
content. Verify existing behaviour before changing study availability.

## 4. Finish the verification left open

The previous session passed production build, project type checks, scoped lint and
targeted browser/regression checks, including 7/30/90-day activity ranges. It did
not complete the full test suite because the disk filled. The offline media-sharing
test timed out waiting for `serviceWorker.ready` before reaching sharing controls.
Free storage, rerun that test against a fresh production preview, and then finish
the relevant suite. Keep parallel browser output directories separate.

Preserve the existing uncommitted Mermaid work and unknown `debug.log`. Follow
[visual design](../spec/visual-design.md) and [accessibility](../spec/accessibility.md).
Commit tested checkpoints and push to Direction C throughout the next session.
