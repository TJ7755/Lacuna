# Visual intent and Lacuna Flow

[Theme tokens and utilities](../../apps/web/src/index.css) and
[shared UI primitives](../../apps/web/src/components/ui/) own the visual conventions.
Extend these sources instead of copying palettes, fonts or component measurements into docs.

The intended character is quiet paper-and-ink study: one clear task, readable content, restrained
supporting text and deliberate feedback. Keep original authoring and repeat-entry workflows fluent.
Reducing visible chrome does not justify hiding validation, unfinished work or available actions.

Learner-facing language describes the task and the evidence in plain words. Use “skill” in practice
views; keep precise authoring terms in editors and the domain model. Recall forecasts describe
predicted recall, not exam marks. Simpler wording must preserve the meaning of the measure.

## Lacuna Flow

Lacuna Flow is the interaction language, not a separate product or visual theme.
Actions should visibly become their results while retaining spatial context. People must be
able to interrupt, reverse and override transitions. Acknowledge input immediately; never
queue input behind decoration. Keep reading surfaces still and use existing theme tokens.

Extend [shared timing and springs](../../apps/web/src/components/ui/motion.ts),
[step transitions](../../apps/web/src/components/ui/StepSwap.tsx) and
[motion preferences](../../apps/web/src/state/motionSpeed.ts) rather than creating another motion framework.
Keep functional settings named for the choice they expose, such as motion speed.

Retarget interrupted surfaces from their presented state. Preserve readable text, immediate
input, useful focus and reduced motion; do not scale text or animate pointer-event ownership.
[Accessibility constraints](accessibility.md) apply throughout.

Use [manual release verification](../WEBSITE_TEST_CHECKLIST.md) for physical input, screen readers,
visual quality and novice tasks. Passing style assertions or screenshots alone does not establish
smooth motion or usability.
