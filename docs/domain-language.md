# Lacuna domain language

This glossary defines the canonical terms for the learning content that Cards and Questions share.
Use these terms consistently in code, product copy and documentation.

## Language

**Concept**

A stable identity for one piece of knowledge. New Concepts are course-scoped: Cards present them
for direct recall, while Questions assess Concepts through individual marking criteria or depend on
others as prerequisites. Application practice schedules a Concept independently of recall Cards.
Migrated Cards outside a Course retain compatibility-only Concepts scoped to their
legacy scheduling unit; Questions cannot target those Concepts.

_Avoid:_ atomic concept, topic, knowledge component. Use “skill” in learner-facing practice labels.

**Card**

A direct-recall presentation of one Concept. Alternate presentations may share a Concept while
retaining independent Card scheduling evidence.

_Avoid:_ Question, problem, exercise.

**Question**

An application problem, possibly with parts, which may assess several Concepts. Each attributable
marking criterion assesses exactly one Concept. Combined criteria remain evidence without creating
individual Concept grades. Legacy individual Questions retain their independent Question schedules.

_Avoid:_ Card, flashcard, Practice node.

**Question family**

A deterministic generator configuration whose resolved variants share a family identity. Each
variant is preserved in its Attempt. A finite family has a finite supply of novel presentations.

_Avoid:_ Question template, generated Card, generator script.

**Attempt**

The lifecycle evidence record for one presented Question or Question-family variant. Its
presentation receipt is immutable; the first submission and optional correction become separately
immutable when recorded, while lifecycle metadata may record answering, abandonment and a later
undo.

**Application practice**

Course-scoped practice selected for due Concepts. Evidence from correlated criteria in one Question
contributes at most one scheduling update per Concept. This schedule describes practice evidence,
not calibrated mastery across arbitrary question formats.

_Avoid:_ Card review, answer record, mutable response.
