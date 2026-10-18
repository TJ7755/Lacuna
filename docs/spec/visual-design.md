# Visual and motion intent

[src/index.css](../../src/index.css), [shared UI primitives](../../src/components/ui/) and
[design-rule tests](../../src/designRules.test.ts) own tokens and mechanical conventions.
Extend these sources instead of copying palettes, fonts or component measurements into docs.

The intended character is quiet paper-and-ink study: one clear task, readable content, restrained
supporting text and deliberate feedback. Keep original authoring and repeat-entry workflows fluent.
Reducing visible chrome does not justify hiding validation, unfinished work or available actions.

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

[Specification index](../SPEC.md)
