# Lacuna specification

Delivered behaviour at the development head after **v0.2.9 beta** (release verified
20 September 2026). The [roadmap](next_plan.md) tracks remaining work; [changes](CHANGES.md)
records release history. Historical plans do not override these contracts.

Lacuna is a local-first, exam-driven FSRS-6 application organised into courses, lessons,
notes and recall Cards. Questions have independent evidence and scheduling. Core study data
lives in IndexedDB; optional sync and external web AI use the relay. Built-in AI sends selected
content through the web deployment to a hosted model; local tools and approvals stay on the device.
Legacy Deck/Folder types support
historical migrations, while current scheduling uses scheduling units.

Read the section relevant to the change, alongside the [domain glossary](domain-language.md).
Section numbers are retained for existing references. The historical v0.0.2/v0.0.3 notes
previously duplicated here remain in the [changelog](CHANGES.md).

| Section | Contract |
| --- | --- |
| 1 | [Guiding principles](spec/principles.md) |
| 2 | [Technology stack](spec/technology.md) |
| 3 | [Visual design](spec/visual-design.md) |
| 4 | [App layout and navigation](spec/navigation.md) |
| 5 | [Data model](spec/data-model.md) |
| 6 | [FSRS engine](spec/fsrs.md) |
| 7 | [Forward simulation](spec/forward-simulation.md) |
| 8 | [Exam objective](spec/exam-objective.md) |
| 9 | [Eligibility and study pools](spec/eligibility.md) |
| 10 | [Learn mode](spec/learn-mode.md) |
| 11 | [Cards and authoring](spec/cards.md) |
| 12 | [Courses and card management](spec/course-management.md) |
| 13 | [Import, export and backups](spec/portability.md) |
| 14 | [Search and analytics](spec/analytics.md) |
| 15 | [Settings](spec/settings.md) |
| 16 | [Persistence and resilience](spec/resilience.md) |
| 17 | [Accessibility](spec/accessibility.md) |
| 18 | [Keyboard shortcuts](spec/keyboard-shortcuts.md) |
| 19 | [Electron desktop](spec/desktop.md) |
