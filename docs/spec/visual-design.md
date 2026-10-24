# Visual intent and Lacuna Flow

[Theme tokens and utilities](../../src/index.css) and
[shared UI primitives](../../src/components/ui/) own the visual conventions.
Extend these sources instead of copying palettes, fonts or component measurements into docs.

The intended character is quiet paper-and-ink study: one clear task, readable content, restrained
supporting text and deliberate feedback. Keep original authoring and repeat-entry workflows fluent.
Reducing visible chrome does not justify hiding validation, unfinished work or available actions.

## Lacuna Flow

Lacuna Flow (Flow for short) is Lacuna's interaction language: an interface that moves with your
thinking. The application remains Lacuna. Flow connects actions to results across study controls,
disclosures, navigation and feedback; it is not a glass or transparency treatment, an Apple design
system, or a reason to animate every element. Paper-and-ink reading surfaces stay calm.

Four principles govern its use:

- **Continuity:** actions visibly become their results. Preserve context across state changes;
  expand from the actual trigger, keep spatial relationships stable and return to the same origin.
  The study reveal fill becoming a grade is one expression, not a template for every surface.
- **Control:** people can hold, interrupt, reverse and override without fighting animation.
  Retarget from the presented state instead of restarting or queuing transitions. Preserve useful
  focus, native control activation and real Undo; motion must never confer authority on a verdict.
- **Responsiveness:** acknowledge input immediately and retarget transitions smoothly. Controls
  and their labels become available together. Do not wait for decoration to finish or add artificial
  delays before the next action. A held study answer resumes against its original deadline.
- **Restraint:** motion directs attention to a meaningful change. Keep reading surfaces still,
  use opaque surfaces and existing theme tokens, and avoid gratuitous bounce or repeated effects.
  Preserve reduced motion, keyboard access, contrast and performance as complete interactions.

Extend [shared timing and springs](../../src/components/ui/motion.ts),
[step transitions](../../src/components/ui/StepSwap.tsx) and
[motion preferences](../../src/state/motionSpeed.ts) rather than creating another motion framework.
[Flow study controls](../../src/pages/learn/FlowGradeControls.tsx) own the measured reveal-to-grade
liquid; its local blur fuses the control's own drops, not page backgrounds. Prefer transform and opacity for
new movement; keep measured shape changes bounded to their owning control and verify them in use.
Keep functional settings named for the choice they expose, such as motion speed.

Motion communicates continuity between a trigger and its expanded surface. It must preserve
readable text, immediate input and the selected focus target. Retargeting or reopening a retained
surface must not leave stale measurements, blocked controls or a visible full-size background.
Do not scale text or animate discrete pointer-event ownership. Reduced motion must remain a
complete, usable state, not an animation stranded at its first frame.

Layout stays within the viewport with enlarged text and long content. Touch actions remain
available without hover; keyboard actions retain visible focus. Visual simplification must retain
announced context, accessible names and explicit error/recovery choices.

Use [manual release verification](../WEBSITE_TEST_CHECKLIST.md) for physical input, screen readers,
visual quality and novice tasks. Passing style assertions or screenshots alone does not establish
smooth motion or usability.
