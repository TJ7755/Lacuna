# UI polish points

Source-only audit of Lacuna's motion and interaction polish. This list records definite state-transition gaps and lower-priority visual opportunities found on 30 August 2026. It does not claim that a static browser frame can prove animation quality; timing and easing still require an interactive recording when these points are implemented.

## Priority findings

### 1. Make the animation-speed setting genuinely global

**Priority:** High

Several shared components ignore the global speed multiplier: buttons and toggles use fixed springs, menus use a fixed duration, and assessment sheets use Motion defaults. Slow and Fast therefore produce an inconsistent interface.

**Evidence:** `src/components/ui/Button.tsx`, `src/components/ui/Toggle.tsx`, `src/components/ui/Menu.tsx`, `src/components/course/AssessmentDetailSheet.tsx`, `src/state/motionSpeed.ts`.

### 2. Animate inline confirmation replacement

**Priority:** High

`ConfirmInline` abruptly replaces its triggering controls. In dense rows, the controls disappear and a differently sized confirmation cluster appears, causing a layout jump. A short shared-layout crossfade or width transition would make destructive actions feel deliberate.

**Evidence:** `src/components/ui/ConfirmInline.tsx`, including its use in `src/components/notes/NoteRow.tsx`.

### 3. Smooth note expansion, collapse and edit-mode changes

**Priority:** High

Note content only fades on entry; it has no exit animation or height interpolation. Switching between the note and its editor is an immediate replacement.

**Evidence:** `src/components/notes/NoteRow.tsx`.

### 4. Give course tabs a travelling active indicator

**Priority:** Medium/high

The active course tab only changes background colour while the page itself slides sideways. A shared `layoutId` pill or underline would visually connect the tab selection to the existing directional route transition. The settings rail already establishes this pattern.

**Evidence:** `src/components/course/CourseTabs.tsx`, `src/components/ui/SectionRail.tsx`.

### 5. Animate Question editor mode swaps

**Priority:** Medium/high

Changing a fixed Question between Numeric answer and Show working instantly replaces a potentially large editor. The existing `StepSwap` component is already suited to this sort of transition.

**Evidence:** `src/pages/QuestionEditor.tsx`, `src/components/ui/StepSwap.tsx`.

### 6. Polish saving states in editors

**Priority:** Medium

The Question editor changes its primary button label from Save Question to Saving without a text transition, progress treatment or brief confirmed state. This is less polished than the Card editor's equivalent feedback.

**Evidence:** `src/pages/QuestionEditor.tsx`, `src/pages/CardEditor.tsx`.

### 7. Animate course-title editing

**Priority:** Medium

Starting a rename swaps a large display heading directly into an input and removes the edit button. At the current heading size, metric differences are conspicuous. A shared-layout transition or restrained crossfade would prevent the visual jolt.

**Evidence:** `src/components/course/CourseHeader.tsx`.

### 8. Improve heatmap hover feedback and tooltips

**Priority:** Medium

The heatmap has a staggered entrance, but individual cells are inert browser-title targets. A small scale or highlight on hover and a styled tooltip would make the data feel inspectable. Native title tooltips are slow, inconsistent and visually foreign to Lacuna.

**Evidence:** `src/components/dashboard/ReviewHeatmap.tsx`.

### 9. Animate dynamic AI-panel states

**Priority:** Medium

Opening the panel is polished, but its activity banner, connection error, connection screen, conversation, approval card and responding bar mount or disappear abruptly. These asynchronous changes need height-aware transitions.

**Evidence:** `src/components/ai/AiPanel.tsx`, `src/components/layout/AppShell.tsx`.

### 10. Strengthen upcoming-assessment pill feedback

**Priority:** Low/medium

Upcoming-assessment pills only change border and text colour. A slight lift, flag movement or pressed response would better signal that each pill opens a substantial detail sheet.

**Evidence:** `src/components/course/UpcomingAssessmentsStrip.tsx`.

### 11. Animate selected appearance controls

**Priority:** Low/medium

Theme, text-size and accent selection states snap. The accent ring in particular mounts instantly around another swatch. A travelling selection ring or pill would make the Appearance section feel like one coherent control system.

**Evidence:** `src/pages/settings/AppearanceSection.tsx`.

### 12. Add feedback to the mobile menu trigger

**Priority:** Low

The drawer is animated, but the three-line trigger remains static. Morphing it towards a close mark while opening would connect cause and effect.

**Evidence:** `src/components/layout/AppShell.tsx`.

### 13. Animate Lesson Study/Author mode swaps

**Priority:** High

Notes, card summaries and full CRUD editors are replaced wholesale when the Lesson view mode changes. The height and density difference is substantial, but there is no `StepSwap` or `AnimatePresence` transition.

**Evidence:** `src/pages/LessonView.tsx`.

### 14. Animate Question answer-to-result transitions

**Priority:** High

Checking a Question replaces the answer form with results immediately. This central learning moment should be deliberate: the answer should recede, the result should enter, and the marks should settle.

**Evidence:** `src/components/questions/QuestionResponsePanel.tsx`.

### 15. Animate Numeric and Working card results

**Priority:** High

The study faces repeat the same snap independently. Numeric swaps the whole input for a result panel; Working swaps it for a potentially tall verdict list.

**Evidence:** `src/components/items/NumericStudyFace.tsx`, `src/components/items/WorkingStudyFace.tsx`.

### 16. Animate lesson reordering

**Priority:** High

Course Settings uses up/down buttons and immediately changes the array order. Rows jump past one another without preserving spatial continuity. This is a direct use case for Motion layout animation.

**Evidence:** `src/pages/settings/LessonManagementSection.tsx`.

### 17. Animate assessment creation and editing

**Priority:** Medium/high

Opening the assessment editor inserts a large form where a compact Add checkpoint button stood. Saving collapses it immediately and adds or updates a list row. None of those layout changes animate.

**Evidence:** `src/pages/settings/ExamDatesSection.tsx`.

### 18. Preserve continuity in the backup list

**Priority:** Medium

New restore points simply appear and deleted ones vanish. Because Back up now directly mutates the list beneath it, restrained entry, exit and layout movement would make the result immediately legible before the toast appears.

**Evidence:** `src/pages/settings/BackupsSection.tsx`.

### 19. Animate batch-authoring workflow tabs

**Priority:** Medium/high

Prompt and Staging review swap large, structurally unrelated panels. The footer and unsaved-close warning also appear abruptly. The dialog opening is animated, which makes its static internal state changes more conspicuous.

**Evidence:** `src/components/items/BatchAuthoringPromptDialog.tsx`.

### 20. Animate optional generation constraints

**Priority:** Medium

Enabling constraints inserts a field and simultaneously changes the notes textarea from six rows to five. Two layout changes happen in one frame.

**Evidence:** `src/components/items/BatchAuthoringPromptDialog.tsx`.

### 21. Animate annotation edit and delete states

**Priority:** Medium

Action buttons disappear, then a textarea or confirmation row appears below. Saving collapses the row just as abruptly. These need height-aware state transitions rather than decorative movement.

**Evidence:** `src/components/notes/AnnotatedNoteContent.tsx`.

### 22. Animate staging-review card state changes

**Priority:** Medium/high

Accept and reject controls, duplicate warnings, validation errors, revision forms and the full editor mount independently. A single action can therefore change several areas of a card at once without continuity.

**Evidence:** `src/components/items/ItemStagingReview.tsx`.

### 23. Animate merge-review expansion content

**Priority:** Medium

The chevron rotates, but the content snaps between a two-line preview and full Markdown sections. Animating the indicator while teleporting the panel beneath it is only half a transition.

**Evidence:** `src/components/import/MergeReviewPanel.tsx`.

### 24. Add spatial feedback to occlusion-region editing

**Priority:** Medium

Region rows appear and disappear instantly; selecting one abruptly replaces the inspector underneath; changing its role inserts or removes dependent fields immediately. Since the canvas is spatial by nature, the sidebar should preserve that continuity.

**Evidence:** `src/components/occlusion/OcclusionRegionPane.tsx`.

## Recommended implementation order

1. Study answer-to-result transitions: points 14 and 15.
2. Global motion-speed consistency: point 1.
3. Lesson list reordering: point 16.
4. Lesson Study/Author switching: point 13.
5. Shared inline confirmations: point 2.
6. Note and annotation expansion and editing: points 3 and 21.
7. Batch-authoring and staging-review state changes: points 19, 20 and 22.
8. Course-tab active indicator: point 4.

These are repeated or central interactions. Decorative improvements such as heatmap hover effects and the mobile menu morph should wait until the larger content transitions are coherent.
